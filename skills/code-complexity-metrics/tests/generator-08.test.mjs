import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {parse} from '../scripts/parser.mjs';
import {analyze as rust} from '../scripts/analyzers/rust/analyze.mjs';
import {analyze as javascript} from '../scripts/analyzers/javascript/analyze.mjs';

// Independent anchors: one outer contains all written calls and no Cognitive points.
const seed = 0x8c0ffee;
const depths = [1, 2, 4, 8, 16];
const walk = n => [n, ...n.children.flatMap(walk)];
const expected = depth => ({
  cognitive: 0, calls: depth, callScores: Array(depth).fill(0),
});

function sourceFor(language, shape, depth) {
  // Fixed seed controls harmless whitespace; no context or value role changes.
  let state = seed;
  const space = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state & 1 ? ' ' : '';
  };
  let expression = shape === 'chain' ? 'start()' : 'x';
  for (let i = shape === 'chain' ? 1 : 0; i < depth; i++) {
    expression = shape === 'chain' ? `${expression}.${space()}next()` : `call(${space()}${expression})`;
  }
  return `${language === 'rust' ? 'fn' : 'function'} f(){${expression};}`;
}

async function inspect(language, shape, depth) {
  const source = sourceFor(language, shape, depth);
  let parsed;
  try {
    parsed = await parse(source, language);
    const p = (language === 'rust' ? rust : javascript)(parsed.tree, source, 'generator');
    if (!Array.isArray(p.functions) || !Array.isArray(p.diagnostics) || !(p.ownerByNode instanceof Map)) {
      throw new TypeError('invalid analyzer result');
    }
    const fn = p.functions[0];
    const nodes = walk(p.tree).filter(n => p.ownerByNode.get(n) === fn?.id);
    const actual = nodes.reduce((sum, n) => sum + n.score.cognitive, 0);
    // Inspect calls under the outer independently of the owner map, so a missing owner cannot hide a call.
    const calls = fn ? walk(fn.root).filter(n => n.type === 'call_expression') : [];
    return {
      source, parseError: parsed.tree.rootNode.hasError, functions: p.functions.length,
      diagnostics: p.diagnostics, actual, calls: calls.length,
      callScores: calls.map(n => n.score.cognitive),
      callOwners: calls.map(n => p.ownerByNode.get(n) === fn.id),
    };
  } catch (error) {
    return {source, error: `${error.name}: ${error.message}`};
  } finally {
    parsed?.dispose();
  }
}

// Include the side of a relation, the score delta and exact local deviations in the identity.
// A smaller candidate is accepted only when it preserves every part of this discrepancy.
function discrepancy(result, depth) {
  if (result.error) return {error: result.error};
  return {
    parseError: result.parseError, functions: result.functions,
    diagnostics: result.diagnostics.map(d => d.code),
    delta: result.actual - expected(depth).cognitive,
    callDelta: result.calls - depth,
    badCalls: result.callScores.flatMap((value, index) => value === 0 ? [] : [[index, value]]),
    wrongOwners: result.callOwners.flatMap((value, index) => value ? [] : [index]),
  };
}
function isCorrect(result, depth) {
  const d = discrepancy(result, depth);
  return !d.error && !d.parseError && d.functions === 1 && d.diagnostics.length === 0 &&
    d.delta === 0 && d.callDelta === 0 && d.badCalls.length === 0 && d.wrongOwners.length === 0;
}
async function evaluate(language, shape, depth, relation) {
  const primary = await inspect(language, shape, depth);
  const transformed = relation ? await inspect(language, shape, depth + 1) : null;
  const difference = transformed && !primary.error && !transformed.error
    ? transformed.actual - primary.actual : null;
  return {depth, primary, transformed, difference};
}
function signature(result) {
  return JSON.stringify({
    primary: discrepancy(result.primary, result.depth),
    transformed: result.transformed ? discrepancy(result.transformed, result.depth + 1) : null,
    difference: result.difference,
  });
}
function passes(result) {
  return isCorrect(result.primary, result.depth) &&
    (!result.transformed || (isCorrect(result.transformed, result.depth + 1) &&
      result.difference === 0));
}
async function recordFailure(id, language, shape, original, relation, testContext) {
  const originalSignature = signature(original);
  let reduced = original;
  for (let candidate = 1; candidate < original.depth; candidate++) {
    const trial = await evaluate(language, shape, candidate, relation);
    if (signature(trial) === originalSignature) { reduced = trial; break; }
  }
  const artifact = {
    seed, language, shape, testId: id, original, reduced,
    expected: Object.fromEntries([['original', original], ['reduced', reduced]].map(([key, value]) => [key, {
      primary: expected(value.depth),
      transformed: relation ? expected(value.depth + 1) : null,
      difference: relation ? 0 : null,
      parseError: false, functions: 1, diagnostics: [], allCallOwners: true,
    }])),
    discrepancy: JSON.parse(originalSignature),
    reducedDiscrepancy: JSON.parse(signature(reduced)),
    reproduce: `node --test --test-name-pattern="^${id}$" skills/code-complexity-metrics/tests/generator-08.test.mjs`,
  };
  const content = JSON.stringify(artifact, null, 2);
  // A missing or unwritable evidence directory must never replace the behavioral assertion.
  try {
    const dir = process.env.G08_ARTIFACT_DIR || fileURLToPath(new URL('../../../.local/code-complexity-metrics-evidence/', import.meta.url));
    await mkdir(dir, {recursive: true});
    await writeFile(path.join(dir, `${id}-failure.json`), content);
  } catch (error) {
    testContext.diagnostic(`Could not save generator artifact (${error.message}); artifact follows:\n${content}`);
  }
}
function assertVariant(result, depth, label) {
  assert.equal(result.error, undefined, `${label}: analysis succeeds`);
  assert.equal(result.parseError, false, `${label}: accepted parse`);
  assert.equal(result.functions, 1, `${label}: one outer`);
  assert.deepEqual(result.diagnostics, [], `${label}: complete metrics`);
  assert.equal(result.actual, expected(depth).cognitive, `${label}: independent metric anchors`);
  assert.equal(result.calls, depth, `${label}: all written calls retained`);
  assert.deepEqual(result.callOwners, Array(depth).fill(true), `${label}: call ownership`);
  assert.deepEqual(result.callScores, expected(depth).callScores, `${label}: local call contributions`);
}

for (const language of ['rust', 'javascript']) for (const shape of ['chain', 'nested']) for (const depth of depths) {
  const id = `G08-${language}-${shape}-${depth}`;
  test(id, async t => {
    const result = await evaluate(language, shape, depth, false);
    if (!passes(result)) await recordFailure(id, language, shape, result, false, t);
    assertVariant(result.primary, depth, 'primary');
  });
}

// Adding one call preserves the Cognitive score and the caller’s owner.
for (const language of ['rust', 'javascript']) for (const shape of ['chain', 'nested']) {
  const id = `G08-relation-${language}-${shape}`;
  test(id, async t => {
    for (const depth of depths) {
      const result = await evaluate(language, shape, depth, true);
      if (!passes(result)) await recordFailure(id, language, shape, result, true, t);
      assertVariant(result.primary, depth, `primary depth ${depth}`);
      assertVariant(result.transformed, depth + 1, `transformed depth ${depth + 1}`);
      assert.equal(result.difference, 0, `metric difference at depth ${depth}`);
      assert.equal(result.transformed.calls - result.primary.calls, 1, `call difference at depth ${depth}`);
    }
  });
}
