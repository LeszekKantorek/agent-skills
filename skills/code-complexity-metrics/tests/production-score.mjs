import assert from 'node:assert/strict';
import {parse} from '../scripts/parser.mjs';
import {analyzerFor} from '../scripts/analyzers/registry.mjs';
import {aggregate} from '../scripts/aggregation.mjs';
export async function productionCognitive(source, language) {
 const p = await parse(source, language);
 try {
  assert.equal(p.tree.rootNode.hasError, false, source);
  const fileId = 'fixture';
  const analysis = analyzerFor(language).analyze(p.tree, source, fileId);
  const result = aggregate([{fileId, source: {fileId, source}, analysis, diagnostics: []}]);
  assert.equal(result.functions.length, 1, source);
  assert.equal(result.diagnostics.length, 0, source);
  return result.functions[0].metrics.cognitive;
 } finally { p.dispose(); }
}
