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
const slice = (s,n) => s.slice(n.startIndex,n.endIndex);

test('M16 and general expression lists preserve independent contributions', async () => {
  // M16: .local/code-complexity-metrics-plan/inwentaryzacja-makr-msfs2024.json, src/providers/simconnect/native.rs:1144:25.
  for (const [args, expected] of [
    ['0; size', [0,1,1]], ['a; b', [0,1,1]], ['Vec::new(); b', [0,1,2]],
    ['good(); func()', [0,1,3]], ['first(); second(); third()', [0,1,4]],
    ['first(), second(), third()', [0,1,4]], ['a; ready && limit()', [1,2,2]],
    ['f(a, b); g()', [0,1,3]],
  ]) for (const [name,open,close] of [['vec','[',']'],['unknown','(',')'],['m','{','}']]) {
    const source = `// 😀\r\nfn f(){${name}!${open}${args}${close};}`, p = await run(source);
    assert.deepEqual(p.diagnostics, [], source); assert.deepEqual(score(p), expected, source);
    const macro = walk(p.tree).find(n => n.type === 'macro_invocation');
    assert.equal(macro.score.statements, 1);
    const children = macro.children.filter(n => n.field === 'argument');
    assert.equal(children.length, args.startsWith('first()') ? 3 : 2);
    for (const n of children) { assert.equal(p.ownerByNode.get(n), p.functions[0].id); assert.equal(n.startIndex, source.indexOf(slice(source,n))); assert.equal(n.startPosition.column, n.startIndex - source.lastIndexOf('\n',n.startIndex-1)-1); }
  }
});

test('attribute values reject metavariables, while token arguments remain opaque', async () => {
  for (const separator of [';', ',']) for (const attribute of ['#[doc = $x]', '#[dummy = f($x)]']) for (const args of [`${attribute} f()${separator} g()`, `f()${separator} ${attribute} g()`]) {
    const fragment = `probe!(${args})`, source = `fn f(){${fragment};}`, p = await run(source);
    assert.deepEqual(p.diagnostics.map(d => [d.code, slice(source,d.range)]), [['rust-unsupported-macro-arguments', fragment]], fragment);
    assert.ok(!walk(p.tree).some(n => n.field === 'argument'), fragment);
  }
  for (const separator of [';', ',']) for (const args of [`#[dummy($x)] f()${separator} g()`, `f()${separator} #[dummy($x)] g()`]) {
    const p = await run(`fn f(){probe!(${args});}`);
    assert.deepEqual(p.diagnostics, [], args);
    assert.deepEqual(score(p), [0,1,3], args);
  }
});

test('written calls and logical operators retain their own ranges and nesting', async () => {
  const source = 'fn f(){ if outer { m![good(); ready && limit()]; } }';
  const p = await run(source), nodes = walk(p.tree), macro = nodes.find(n => n.type === 'macro_invocation');
  assert.deepEqual(p.diagnostics, []);
  assert.deepEqual(score(p), [2,3,4]);
  assert.deepEqual(macro.children.filter(n => n.field === 'argument').map(n => slice(source,n)), ['good()', 'ready && limit()']);
  assert.deepEqual(nodes.filter(n => n.type === 'call_expression').map(n => [slice(source,n), n.score.statements]), [['good()', 1], ['limit()', 1]]);
  const and = nodes.find(n => n.type === '&&');
  assert.deepEqual(and.score, {cognitive: 1, cyclomatic: 1, statements: 0});
  assert.ok(!nodes.some(n => n.type === ';' && n.startIndex === source.indexOf(';')));
});

test('complete validation keeps blocks, nested token trees, contexts and rejects mixed lists', async () => {
  for (const [fragment, expected] of [
    ['m!({first(); second();})', [0,1,4]],
    ['m!([0; size]; f(a,b))', [0,1,2]],
    ['m!(|a, b| a + b; g())', [0,1,3]],
    ['m!(a && b; c && d)', [2,3,1]],
    ['m!(inner!(a; b); g())', [0,1,3]],
  ]) { const p = await run(`fn f(){${fragment};}`); assert.deepEqual(p.diagnostics, [], fragment); assert.deepEqual(score(p), expected, fragment); }
  for (const fragment of ['m!(a; => b)', 'm!(a;)', 'm!(;b)', 'm!(a;;b)', 'm!(a,b;c)', 'm!(a;b,c)', 'm!(a,;b)', 'm!(a;b,)', 'm!(v, A {..}; x)', 'm!({"x": f()}; g())']) {
    const p = await run(`fn f(){${fragment};}`); assert.ok(p.diagnostics.length, fragment); assert.equal(walk(p.tree).filter(n => n.field === 'argument').length, 0, fragment);
  }
});

test('metavariables are not expressions outside definitions or nested macro token trees', async () => {
  for (const fragment of ['m!(f(); $x)', 'm!(f(), $x)', 'm!($x)', 'm!(f($x); g())', 'm!($x + f())', 'm!({"a": f($x)})', 'm!($x, A {..})', 'm!(f(), A {..} if $x)', 'm!(v, A { x: const { $x }, .. })']) {
    const source = `fn f(){${fragment};}`, p = await run(source);
    assert.deepEqual(p.diagnostics.map(d => [d.code, slice(source,d.range)]), [['rust-unsupported-macro-arguments', fragment]], fragment);
    assert.ok(!walk(p.tree).some(n => ['argument', 'pattern', 'guard'].includes(n.field)), fragment);
  }
  for (const fragment of ['m!("$x"; g())', 'm!({macro_rules! t { ($x:expr) => {$x}; } f()}; g())']) {
    const p = await run(`fn f(){${fragment};}`);
    assert.deepEqual(p.diagnostics, [], fragment);
    assert.equal(walk(p.tree).filter(n => n.field === 'argument').length, 2, fragment);
  }
  for (const fragment of ['m!(f(); inner!($x))', 'm!({"a": inner!($x)})', 'm!(f(), A {..} if inner!($x))']) {
    const source = `fn f(){${fragment};}`, p = await run(source);
    assert.deepEqual(p.diagnostics.map(d => [d.code, slice(source,d.range)]), [['rust-unsupported-macro-arguments', 'inner!($x)']], fragment);
    assert.ok(walk(p.tree).some(n => n.type === 'macro_invocation' && slice(source,n) === 'inner!($x)'), fragment);
  }
});

test('semicolon list points appear on original lines in CLI explain', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'metric-semicolon-'));
  try {
    await writeFile(path.join(dir, 'input.rs'), 'fn f(){\n m![good();\n ready && limit()];\n}');
    const cli = fileURLToPath(new URL('../scripts/measure.mjs', import.meta.url));
    const invoke = (...args) => spawnSync(process.execPath, [cli, '--path', 'input.rs', ...args], {cwd:dir, encoding:'utf8'});
    const result = invoke(); assert.equal(result.status,0); assert.deepEqual(Object.values(JSON.parse(result.stdout).functions[0].metrics), [1,2,3]);
    const explain = invoke('--explain'); assert.equal(explain.status,0); assert.match(explain.stdout, /ready && limit\(\).*Cognitive: \+1; Cyclomatic: \+1; Statements: \+1/);
  } finally { await rm(dir, {recursive:true, force:true}); }
});
