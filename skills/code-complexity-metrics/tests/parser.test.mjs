import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../scripts/parser.mjs';
import { analyzerFor } from '../scripts/analyzers/registry.mjs';

test('finds only outer functions and preserves anonymous names', async () => {
  for (const [language, source, names] of [
    ['javascript', 'function outer(){function inner(){} const x = () => 1;} const save = () => {}; const load = function named() {}; export default () => {};', ['outer', 'save', 'named', null]],
    ['rust', 'fn outer(){fn inner(){} let a = || 1;} fn next(){}', ['outer', 'next']],
  ]) {
    const parsed = await parse(source, language);
    try {
      assert.equal(parsed.tree.rootNode.hasError, false);
      const prepared = analyzerFor(language).prepare(parsed.tree, source, 'fixture');
      assert.deepEqual(prepared.functions.map(fn => fn.name), names);
      assert.deepEqual(prepared.diagnostics, []);
    } finally { parsed.dispose(); }
  }
});
test('parser signals invalid source', async () => {
  const parsed = await parse('function good() {} function ( {', 'javascript');
  try { assert.equal(parsed.tree.rootNode.hasError, true); } finally { parsed.dispose(); }
});
