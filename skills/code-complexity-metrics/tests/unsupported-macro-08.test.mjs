import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../scripts/parser.mjs';
import {analyze} from '../scripts/analyzers/rust/analyze.mjs';
import {aggregate} from '../scripts/aggregation.mjs';
import {makeReport, markdown} from '../scripts/public-report.mjs';
const walk = node => [node, ...node.children.flatMap(walk)];

test('E08 unsupported macro preserves known local explain and null metrics', async () => {
  const source = 'fn bad(){unknown!(a; b);}\nfn good(){a();}';
  const fileId = 'negative.rs';
  const parser = await parse(source, 'rust');
  let analysis;
  try {
    assert.equal(parser.tree.rootNode.hasError, false);
    analysis = analyze(parser.tree, source, fileId);
  } finally {
    parser.dispose();
  }
  assert.deepEqual(analysis.functions.map(fn => fn.name), ['bad', 'good']);
  const [bad, good] = analysis.functions;
  const macro = walk(analysis.tree).find(node => node.type === 'macro_invocation');
  assert.deepEqual(macro.score, {cognitive: 0, cyclomatic: 0, statements: 1});
  assert.equal(analysis.ownerByNode.get(macro), bad.id);
  assert.equal(analysis.diagnostics[0].owner, bad.id);
  assert.deepEqual(analysis.diagnostics[0].affectedMetrics, ['cognitive', 'cyclomatic', 'statements']);

  const aggregateResult = aggregate([{fileId, source: {fileId, source}, analysis, diagnostics: []}]);
  const [badResult, goodResult] = aggregateResult.functions;
  assert.deepEqual(badResult.knownScore, {cognitive: 0, cyclomatic: 1, statements: 1});
  assert.deepEqual(badResult.byRow.get(1), badResult.knownScore);
  assert.deepEqual(badResult.metrics, {cognitive: null, cyclomatic: null, statements: null});
  assert.equal(goodResult.id, good.id);
  assert.deepEqual(goodResult.metrics, {cognitive: 0, cyclomatic: 1, statements: 1});
  const {report, selected} = makeReport(aggregateResult);
  const explain = markdown(report, selected, aggregateResult, true);
  assert.ok(explain.includes('fn bad(){unknown!(a; b);} // Cognitive: brak znanego wkładu; Cyclomatic: +1 (częściowe); Statements: +1 (częściowe)'));
  assert.match(explain, /rust-unsupported-macro-arguments/);
});
