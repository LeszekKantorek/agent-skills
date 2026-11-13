import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../scripts/parser.mjs';
import {analyze} from '../scripts/analyzers/javascript/analyze.mjs';
import {prepare} from '../scripts/analyzers/javascript/analyze-ast.mjs';
import {aggregate} from '../scripts/aggregation.mjs';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const cli = fileURLToPath(new URL('../scripts/measure.mjs', import.meta.url));
const walk = node => [node, ...node.children.flatMap(walk)];
const cases = [
  ['instance', 'class C { handler = () => work(); }', 'handler', '() => work()', [0,1,2]],
  ['static', 'class C { static handler = () => work(); }', 'handler', '() => work()', [0,1,2]],
  ['private', 'class C { #handler = () => work(); }', '#handler', '() => work()', [0,1,2]],
  ['private-static', 'class C { static #handler = () => work(); }', '#handler', '() => work()', [0,1,2]],
  ['number', 'class C { 123 = () => work(); }', null, '() => work()', [0,1,2]],
  ['string', 'class C { "handler" = () => work(); }', null, '() => work()', [0,1,2]],
  ['computed', 'class C { [key()] = () => work(); }', null, '() => work()', [0,1,2]],
  ['named', 'class C { handler = function named(){work();}; }', 'named', 'function named(){work();}', [0,1,1]],
  ['anonymous-function', 'class C { handler = function(){work();}; }', 'handler', 'function(){work();}', [0,1,1]],
  ['generator', 'class C { using = function*(){work();}; }', 'using', 'function*(){work();}', [0,1,1]],
  ['indirect', 'class C { handler = wrap(() => work()); }', null, '() => work()', [0,1,2]],
  ['object', 'const obj = { handler: () => work() };', null, '() => work()', [0,1,2]],
  ['method', 'class C { handler(){work();} }', 'handler', 'handler(){work();}', [0,1,1]],
];

for (const [label, source, expectedName, fragment, expected] of cases) {
  test(`R19 field names ${label}: prepare, owner, scores and CLI filter`, async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'metrics19-name-'));
    try {
      const file = path.join(dir, 'input.js');
      writeFileSync(file, source);
      const parsed = await parse(source, 'javascript');
      let prepared, analysis;
      try {
        assert.equal(parsed.tree.rootNode.hasError, false);
        prepared = prepare(parsed.tree, source, file);
        analysis = analyze(parsed.tree, source, file);
      } finally {
        parsed.dispose();
      }
      assert.deepEqual(prepared.diagnostics, []);
      assert.equal(prepared.functions.length, 1);
      const fn = prepared.functions[0];
      const start = source.indexOf(fragment), end = start + fragment.length;
      const id = JSON.stringify([file, 0]);
      assert.equal(fn.name, expectedName);
      assert.equal(fn.id, id);
      assert.equal(fn.root.startIndex, start);
      assert.equal(fn.root.endIndex, end);
      assert.deepEqual(fn.root.startPosition, {row: 0, column: start});
      assert.deepEqual(fn.root.endPosition, {row: 0, column: end});
      const nodes = walk(prepared.tree);
      assert.ok(nodes.every(node => Object.values(node.score).every(value => value === 0)));
      assert.equal(prepared.ownerByNode.get(fn.root), id);

      const scored = analysis.functions[0];
      assert.equal(scored.name, expectedName);
      assert.equal(scored.id, id);
      assert.deepEqual(scored.root.score, {cognitive: 0, cyclomatic: 1, statements: 0});
      const call = walk(scored.root).find(node => node.type === 'call_expression');
      assert.equal(analysis.ownerByNode.get(call), id);
      assert.deepEqual(call.score, {cognitive: 0, cyclomatic: 0, statements: expected[2]});
      const result = aggregate([{fileId: file, source: {fileId: file, source}, analysis, diagnostics: []}]);
      assert.deepEqual(result.diagnostics, []);
      assert.deepEqual(Object.values(result.functions[0].metrics), expected);
      assert.deepEqual(Object.values(result.functions[0].byRow.get(1)), expected);

      const run = (...args) => spawnSync(process.execPath, [cli, '--path', file, ...args], {cwd: dir, encoding: 'utf8'});
      const json = run(), selected = run('--filter', expectedName ?? 'handler'), explain = run('--explain');
      for (const output of [json, selected, explain]) {
        assert.equal(output.status, 0, output.stderr);
        assert.equal(output.stderr, '');
      }
      const report = JSON.parse(json.stdout), filtered = JSON.parse(selected.stdout);
      assert.equal(report.functions.length, 1);
      assert.equal(report.functions[0].id, id);
      assert.equal(report.functions[0].name, expectedName);
      assert.deepEqual(Object.values(report.functions[0].metrics), expected);
      assert.equal(report.functions[0].range.startIndex, start);
      assert.equal(report.functions[0].range.endIndex, end);
      assert.equal(filtered.functions.length, expectedName === null ? 0 : 1);
      if (expectedName !== null) assert.equal(filtered.functions[0].id, id);
      assert.ok(explain.stdout.includes(fragment));
      assert.match(explain.stdout, new RegExp(`Cyclomatic: \\+1; Statements: \\+${expected[2]}`));
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });
}

test('R19 field in outer keeps a single owner and original local scores', async () => {
  const source = 'function outer() {\n  class C { handler = () => work(); }\n}';
  const file = 'C:/outer.js';
  const parsed = await parse(source, 'javascript');
  let analysis;
  try {
    analysis = analyze(parsed.tree, source, file);
  } finally {
    parsed.dispose();
  }
  assert.deepEqual(analysis.diagnostics, []);
  assert.equal(analysis.functions.length, 1);
  const fn = analysis.functions[0], id = JSON.stringify([file, 0]);
  assert.equal(fn.name, 'outer');
  assert.equal(fn.id, id);
  const nodes = walk(analysis.tree);
  const field = nodes.find(node => node.type === 'field_definition');
  const arrow = nodes.find(node => node.type === 'arrow_function');
  const call = nodes.find(node => node.type === 'call_expression');
  for (const node of [field, arrow, call]) {
    assert.equal(analysis.ownerByNode.get(node), id);
    assert.equal(node.startPosition.row, 1);
  }
  assert.deepEqual(field.score, {cognitive: 0, cyclomatic: 0, statements: 1});
  assert.deepEqual(arrow.score, {cognitive: 0, cyclomatic: 0, statements: 0});
  assert.deepEqual(call.score, {cognitive: 0, cyclomatic: 0, statements: 2});
  const result = aggregate([{fileId: file, source: {fileId: file, source}, analysis, diagnostics: []}]);
  assert.deepEqual(result.functions[0].metrics, {cognitive: 0, cyclomatic: 1, statements: 3});
  assert.deepEqual(result.functions[0].byRow.get(2), {cognitive: 0, cyclomatic: 0, statements: 3});

  const dir = mkdtempSync(path.join(tmpdir(), 'metrics19-nested-'));
  try {
    const inputFile = path.join(dir, 'input.js');
    writeFileSync(inputFile, source);
    const run = (...args) => spawnSync(process.execPath, [cli, '--path', inputFile, ...args], {cwd: dir, encoding: 'utf8'});
    const all = run(), filtered = run('--filter', 'handler'), explain = run('--explain');
    for (const output of [all, filtered, explain]) {
      assert.equal(output.status, 0, output.stderr);
      assert.equal(output.stderr, '');
    }
    const report = JSON.parse(all.stdout);
    assert.deepEqual(report.functions.map(fn => fn.name), ['outer']);
    assert.deepEqual(Object.values(report.functions[0].metrics), [0,1,3]);
    assert.equal(JSON.parse(filtered.stdout).functions.length, 0);
    assert.match(explain.stdout, /class C \{ handler = \(\) => work\(\); \} \/\/ Cognitive: 0; Cyclomatic: 0; Statements: \+3/);
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});
