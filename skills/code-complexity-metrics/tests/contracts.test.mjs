import test from 'node:test';
import assert from 'node:assert/strict';
import {createAnalyzeNode, outerId} from '../scripts/analyzers/contracts.mjs';
import {analyzerFor} from '../scripts/analyzers/registry.mjs';
import {rustAnalyzer} from '../scripts/analyzers/rust/analyze.mjs';
import {javascriptAnalyzer} from '../scripts/analyzers/javascript/analyze.mjs';

const node = overrides => createAnalyzeNode({type: 'identifier', isNamed: true, startPosition: {row: 0, column: 0}, endPosition: {row: 0, column: 1}, startIndex: 0, endIndex: 1, ...overrides});

test('contract: nodes own positions, ordered children and independent local scores', () => {
  const position = {row: 1, column: 2}, first = node({field: 'name'}), second = node({type: '=', isNamed: false});
  const end = {row: 1, column: 5}, children = [first, second];
  const parent = node({startPosition: position, endPosition: end, children});
  position.row = 7; end.column = 9; children.reverse();
  assert.deepEqual(parent.startPosition, {row: 1, column: 2});
  assert.deepEqual(parent.endPosition, {row: 1, column: 5});
  assert.equal(parent.children[0], first); assert.equal(parent.children[1], second);
  assert.deepEqual(parent.score, {cognitive: 0, cyclomatic: 0, statements: 0});
  Object.assign(first.score, {cognitive: 1, cyclomatic: 2, statements: 3});
  assert.deepEqual(parent.score, {cognitive: 0, cyclomatic: 0, statements: 0});
  assert.deepEqual(second.score, {cognitive: 0, cyclomatic: 0, statements: 0});
  assert.deepEqual(Object.keys(parent).sort(), ['children','endIndex','endPosition','field','isNamed','score','startIndex','startPosition','type'].sort());
  assert.equal(first.field, 'name'); assert.equal(second.isNamed, false);
});

test('contract: outer IDs encode the pair without collisions and compare by value', () => {
  assert.equal(outerId('C:\\a:1', 2), outerId('C:\\a:1', 2));
  assert.notEqual(outerId('C:\\a:1', 2), outerId('C:\\a', 12));
  assert.notEqual(outerId('C:\\a:1', 2), outerId('C:\\a:1', 3));
  assert.throws(() => outerId('f', -1), TypeError);
});

test('contract: registry chooses a language analyzer once and rejects unsupported languages', () => {
  assert.equal(analyzerFor('rust'), rustAnalyzer);
  assert.equal(analyzerFor('javascript'), javascriptAnalyzer);
  assert.throws(() => analyzerFor('unknown'), /Unsupported language/);
  for (const analyzer of [rustAnalyzer, javascriptAnalyzer]) {
    assert.equal(typeof analyzer.prepare, 'function'); assert.equal(typeof analyzer.analyze, 'function');
    assert.throws(() => analyzer.prepare({}, '', 'file'), /not implemented yet|Expected a parsed (Rust|JavaScript) tree/);
    assert.throws(() => analyzer.analyze({}, '', 'file'), /not implemented yet|Expected a parsed (Rust|JavaScript) tree/);
  }
});

test('parser exposes Q2 computed name separately from parameters and body in both environments', async () => {
  const {parse} = await import('../scripts/parser.mjs');
  for (const source of ['function outer(){ return { [key()]() {} }; }', 'const o = { [key()]() {} };']) {
    const parsed = await parse(source, 'javascript');
    try {
      const find = n => n.type === 'method_definition' ? n : n.namedChildren.map(find).find(Boolean);
      const method = find(parsed.tree.rootNode);
      assert.equal(method.childForFieldName('name').type, 'computed_property_name');
      assert.equal(method.childForFieldName('name').namedChildren[0].type, 'call_expression');
      assert.equal(method.childForFieldName('parameters').type, 'formal_parameters');
      assert.equal(method.childForFieldName('body').type, 'statement_block');
    } finally { parsed.dispose(); }
  }
});

test('parser positions use UTF-16 across a supplementary character and CRLF', async () => {
  const {parse} = await import('../scripts/parser.mjs');
  const source = '// 😀\r\n\t"😀"; function f(){ x("😀"); }';
  const parsed = await parse(source, 'javascript');
  try {
    const fn = parsed.tree.rootNode.namedChildren.find(n => n.type === 'function_declaration');
    const find = n => n.type === 'call_expression' ? n : n.namedChildren.map(find).find(Boolean);
    const call = find(fn);
    assert.equal(fn.startIndex, 14); assert.equal(fn.endIndex, 38);
    assert.deepEqual(fn.startPosition, {row: 1, column: 7});
    assert.deepEqual(fn.endPosition, {row: 1, column: 31});
    assert.equal(call.startIndex, 28); assert.equal(call.endIndex, 35);
    assert.deepEqual(call.startPosition, {row: 1, column: 21});
    assert.deepEqual(call.endPosition, {row: 1, column: 28});
  } finally { parsed.dispose(); }
});



