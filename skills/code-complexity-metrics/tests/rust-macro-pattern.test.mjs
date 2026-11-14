import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse} from '../scripts/parser.mjs';
import {analyze} from '../scripts/analyzers/rust/analyze.mjs';

const walk = n => [n, ...n.children.flatMap(walk)];
async function run(source) { const p = await parse(source, 'rust'); try { return analyze(p.tree, source, 'file'); } finally { p.dispose(); } }
const score = p => walk(p.tree).reduce((a,n) => a.map((v,i) => v + n.score[['cognitive','cyclomatic','statements'][i]]), [0,0,0]);
const slice = (source,n) => source.slice(n.startIndex,n.endIndex);

const fixtures = [
  // M04: src/http/mod.rs:325
  ['matches!(error, ServerError::Bind { .. })', [0,1,1]],
  // M15: src/providers/simconnect/native.rs:1079
  ['matches!(\n                connection.next().unwrap().unwrap().message,\n                Message::Attitude { radians: [0.25, -0.5], unit_probe, .. }\n                    if unit_probe.is_some() == unit_probes\n            )', [0,1,5]],
  // M21: src/providers/simconnect/native.rs:1594
  ['matches!(decode(&bytes).unwrap().message, Message::SystemState {string,..} if string.len()==260)', [0,1,4]],
];
for (const [fragment, expected] of fixtures) test(`pattern fixture ${fragment.slice(0,35)}`, async () => {
  for (const text of [fragment, fragment.replace('matches!', 'other!')]) {
    const source = `// 😀\r\nfn f(){${text};}`, p = await run(source), nodes = walk(p.tree), macro = nodes.find(n => n.type === 'macro_invocation');
    assert.deepEqual(p.diagnostics, []); assert.deepEqual(score(p), expected);
    assert.equal(macro.score.statements, 1);
    const children = macro.children.filter(n => ['argument','pattern','guard'].includes(n.field));
    assert.equal(children[0].field, 'argument'); assert.equal(children[1].field, 'pattern');
    assert.equal(children.length, text.includes(' if ') || text.includes('\n                    if ') ? 3 : 2);
    assert.equal(children[1].score.statements, 0);
    assert.ok(!nodes.some(n => ['match_expression','match_arm','match_pattern'].includes(n.type)));
    for (const n of children) {
      assert.equal(p.ownerByNode.get(n), p.functions[0].id);
      assert.equal(n.startIndex, source.indexOf(slice(source,n)));
      assert.equal(n.endIndex, n.startIndex + slice(source,n).length);
      assert.equal(n.startPosition.column, n.startIndex - source.lastIndexOf('\n',n.startIndex-1) - 1);
    }
  }
});
test('M21 call points and pattern roles have their own original ranges', async () => {
  const source = `// 😀\r\nfn f(){${fixtures[2][0]};}`, p = await run(source), nodes = walk(p.tree);
  const calls = nodes.filter(n => n.type === 'call_expression');
  assert.deepEqual(calls.map(n => slice(source,n)), ['decode(&bytes).unwrap()', 'decode(&bytes)', 'string.len()']);
  for (const n of calls) { assert.equal(n.score.statements, 1); assert.equal(p.ownerByNode.get(n), p.functions[0].id); }
  assert.deepEqual(nodes.filter(n => ['argument','pattern','guard'].includes(n.field)).map(n => [n.field, slice(source,n)]), [
    ['argument', 'decode(&bytes).unwrap().message'], ['pattern', 'Message::SystemState {string,..}'], ['guard', 'string.len()==260'],
  ]);
});
test('pattern profile has complete coverage, ordinary expression precedence and separate contexts', async () => {
  for (const [text, expected] of [
    ['m!(load(), A { .. } if ok() && ready())', [1,2,4]],
    ['m!(left && right, A { .. } if ok() && ready())', [2,3,3]],
    ['m!(v,A(x))', [0,1,2]],
    ['m!(load(), A { .. } | B { .. } if inner!(ok()))', [0,1,4]],
    ['m!(load(), Some(A { x, .. }) | B { y, .. } if ok())', [0,1,3]],
    ['m!(v, A { x: const { match y { B { .. } => 0, _ => 1 } }, .. } if ok())', [1,3,6]],
    ['m!(load(), A { .. } /* pattern */ if ok() /* guard */)', [0,1,3]],
  ]) { const p = await run(`fn f(){${text};}`); assert.deepEqual(p.diagnostics, [], text); assert.deepEqual(score(p), expected, text); }
  for (const text of ['m!(value, A { .. } if)', 'm!(value, A { .. } if ready() => extra())', 'm!(value, A { .. }, extra())', 'm!(value, A { .. },,)', 'm!(value, A { .. } if ready(), extra())', 'm!(v, #[cfg(x)] A {..})', 'm!(v, #[cfg(x)] A {..} if ok())', 'm!(v, const { match x { A { .. } => 0, _ => 1 } } if ok())']) {
    const p = await run(`fn f(){${text};}`); assert.ok(p.diagnostics.length, text); assert.ok(!walk(p.tree).some(n => n.field === 'pattern'), text);
  }
});
test('pattern points in CLI and explain share original lines', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'metric-pattern-'));
  try {
    await writeFile(path.join(dir, 'input.rs'), 'fn f(){\n m!(load(),\n A { .. } if\n ok() && ready());\n}');
    const cli = fileURLToPath(new URL('../scripts/measure.mjs', import.meta.url));
    const invoke = (...args) => spawnSync(process.execPath, [cli, '--path', 'input.rs', ...args], {cwd:dir, encoding:'utf8'});
    const result = invoke(); assert.equal(result.status,0); assert.deepEqual(Object.values(JSON.parse(result.stdout).functions[0].metrics), [1,2,4]);
    const explain = invoke('--explain'); assert.equal(explain.status,0); assert.match(explain.stdout, /ok\(\) && ready\(\).*Cognitive: \+1; Cyclomatic: \+1; Statements: \+2/);
  } finally { await rm(dir, {recursive:true, force:true}); }
});
