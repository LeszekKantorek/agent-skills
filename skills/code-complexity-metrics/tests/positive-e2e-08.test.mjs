import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {parse} from '../scripts/parser.mjs';
import {analyzerFor} from '../scripts/analyzers/registry.mjs';
import {aggregate} from '../scripts/aggregation.mjs';
import {cognitive as rustCognitive} from '../scripts/analyzers/rust/cognitive.mjs';
import {cognitive as jsCognitive} from '../scripts/analyzers/javascript/cognitive.mjs';

const cli = fileURLToPath(new URL('../scripts/measure.mjs', import.meta.url));
const walk = node => [node, ...node.children.flatMap(walk)];
const structure = tree => JSON.stringify(tree, (key, value) => key === 'score' ? undefined : value);
function checkRoles(language, tree, source) {
  const nodes = walk(tree);
  if (language === 'rust') {
    const macro = nodes.find(node => node.type === 'macro_invocation');
    const args = macro.children.filter(node => node.field === 'argument');
    assert.equal(args.length, 1);
    assert.equal(args[0].type, 'binary_expression');
    assert.equal(args[0].children.find(node => node.type === '&&').field, 'operator');
    assert.equal(args[0].children.find(node => node.type === 'call_expression').field, 'right');
    assert.equal(nodes.some(node => node.type === 'token_tree'), false);
    assert.equal(nodes.some(node => node.type === 'identifier' && source.slice(node.startIndex, node.endIndex) === '__capture'), false);
  } else {
    const declarator = nodes.find(node => node.type === 'variable_declarator');
    const constructor = declarator.children.find(node => node.type === 'new_expression');
    assert.equal(constructor.field, 'value');
    const target = constructor.children.find(node => node.field === 'constructor');
    const args = constructor.children.find(node => node.field === 'arguments');
    assert.ok(target, 'new expression preserves constructor field');
    assert.ok(args, 'new expression preserves arguments field');
    assert.equal(source.slice(target.startIndex, target.endIndex), 'Foo');
    assert.equal(args.type, 'arguments');
    const calls = args.children.filter(node => node.type === 'call_expression');
    assert.equal(calls.length, 1);
    assert.equal(source.slice(calls[0].startIndex, calls[0].endIndex), 'load()');
  }
}
const cases = [
  ['rust', 'f.rs', 'fn f(){assert!(ready && verify());}', 1],
  ['javascript', 'f.js', 'function f(){let x=new Foo(load());}', 0],
];

for (const [language, file, source, expected] of cases) {
  test(`E08-positive-${language}`, async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'metrics08-positive-'));
    try {
      const fileId = path.join(dir, file);
      await writeFile(fileId, source);
      const parser = await parse(source, language);
      let analysis;
      try {
        assert.equal(parser.tree.rootNode.hasError, false);
        const prepared = analyzerFor(language).prepare(parser.tree, source, fileId);
        const before = walk(prepared.tree);
        assert.deepEqual(prepared.diagnostics, []);
        assert.equal(prepared.functions.length, 1);
        assert.ok(before.every(node => node.score.cognitive === 0));
        checkRoles(language, prepared.tree, source);
        const shape = structure(prepared.tree);
        const scoreCognitive = language === 'rust' ? rustCognitive : jsCognitive;
        scoreCognitive(prepared);
        assert.equal(structure(prepared.tree), shape);
        analysis = analyzerFor(language).analyze(parser.tree, source, fileId);
        assert.equal(structure(analysis.tree), shape);
        assert.deepEqual(walk(analysis.tree).map(node => node.score), before.map(node => node.score));
        assert.deepEqual(walk(analysis.tree).map(node => analysis.ownerByNode.get(node)),
          before.map(node => prepared.ownerByNode.get(node)));
      } finally {
        parser.dispose();
      }

      assert.deepEqual(analysis.diagnostics, []);
      assert.equal(analysis.functions.length, 1);
      const fn = analysis.functions[0];
      const nodes = walk(analysis.tree);
      const owner = fn.id;
      assert.deepEqual(fn.root.score, {cognitive: 0});
      const localScores = language === 'rust' ? [
        ['macro_invocation', {cognitive: 0}],
        ['&&', {cognitive: 1}],
        ['call_expression', {cognitive: 0}],
      ] : [
        ['variable_declarator', {cognitive: 0}],
        ['new_expression', {cognitive: 0}],
        ['call_expression', {cognitive: 0}],
      ];
      for (const [type, score] of localScores) {
        const matches = nodes.filter(node => node.type === type);
        assert.equal(matches.length, 1);
        assert.deepEqual(matches[0].score, score);
        assert.equal(analysis.ownerByNode.get(matches[0]), owner);
        assert.equal(matches[0].startPosition.row, 0);
      }

      checkRoles(language, analysis.tree, source);

      const result = aggregate([{fileId, source: {fileId, source}, analysis, diagnostics: []}]);
      assert.equal(result.hasErrors, false);
      assert.deepEqual(result.diagnostics, []);
      assert.equal(result.functionDiscoveryComplete, true);
      assert.equal(result.functions.length, 1);
      assert.equal(result.functions[0].id, owner);
      assert.deepEqual(result.functions[0].metrics, {cognitive: expected});
      assert.equal(result.functions[0].byRow.get(1)?.cognitive ?? 0, expected);
      assert.deepEqual(result.functions[0].rootRange, {
        startIndex: 0, endIndex: source.length,
        startPosition: {row: 0, column: 0}, endPosition: {row: 0, column: source.length},
      });

      const run = (...args) => spawnSync(process.execPath, [cli, '--path', file, ...args], {
        cwd: dir, encoding: 'utf8',
      });
      for (const format of ['json', 'markdown', 'csv', 'explain']) {
        const args = format === 'explain' ? ['--explain'] : ['--format', format];
        const output = run(...args);
        assert.equal(output.status, 0, `${format}: ${output.stderr}`);
        assert.equal(output.stderr, '');
        if (format === 'json') {
          const report = JSON.parse(output.stdout);
          assert.deepEqual(report.diagnostics, []);
          assert.deepEqual(report.functions[0].metrics, {cognitive_complexity: expected});
          assert.equal(report.functions.length, 1);
          assert.equal(report.summary.has_errors, false);
          assert.equal(report.summary.function_discovery_complete, true);
        } else if (format === 'markdown') {
          const row = output.stdout.split('\n').find(line => line.startsWith('| f |'));
          assert.ok(row);
          assert.equal(row.split('|').at(-3).trim(), String(expected));
        } else if (format === 'csv') {
          const row = output.stdout.split('\n').find(line => line.startsWith('f,'));
          assert.ok(row);
          assert.equal(row.split(',').at(-2), String(expected));
        } else {
          const annotation = `${source} // Cognitive: ${expected > 0 ? "+" + expected : "0"}`;
          assert.ok(output.stdout.includes(annotation));
          assert.ok(!output.stdout.includes('niepełna analiza'));
        }
      }
    } finally {
      await rm(dir, {recursive: true, force: true});
    }
  });
}
