import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../scripts/parser.mjs';
import {analyzerFor} from '../scripts/analyzers/registry.mjs';
import {aggregate} from '../scripts/aggregation.mjs';
import {csv, makeReport, markdown} from '../scripts/public-report.mjs';
import {explainRow} from './explain-rows.mjs';

async function analyzedFile(source, language) {
  const fileId = language === 'rust' ? 'input.rs' : 'input.js';
  const parsed = await parse(source, language);
  try {
    const analysis = analyzerFor(language).analyze(parsed.tree, source, fileId);
    return {fileId, source: {fileId, source}, analysis, diagnostics: []};
  } finally {
    parsed.dispose();
  }
}

async function measure(source, language) {
  const file = await analyzedFile(source, language);
  const result = aggregate([file]);
  return {file, result, ...makeReport(result)};
}

const byLocation = (a, b) => a.range.startIndex - b.range.startIndex || a.range.endIndex - b.range.endIndex;
const keys = occurrences => [...occurrences].sort(byLocation).map(event => event.key);

const manualCases = [
  {
    name: 'calculate', language: 'javascript',
    source: 'function calculate(price) {\n  const total = price + 2;\n  return send(total);\n}',
    ops: ['const', '=', '+', 'return', 'call'], operands: ['total', 'price', '2', 'send', 'total'],
    counts: {n1: 5, n2: 5, eta1: 5, eta2: 4}, volume: 10 * Math.log2(9), display: '31.70',
    callFragment: 'return send(total);',
  },
  {
    name: 'start', language: 'javascript',
    source: 'function start(ready) {\n  const check = () => {\n    if (!ready) return;\n    ping();\n  };\n  check();\n}',
    ops: ['const', '=', '=>', 'if', '!', 'return', 'call', 'call'], operands: ['check', 'ready', 'ping', 'check'],
    counts: {n1: 8, n2: 4, eta1: 7, eta2: 3}, volume: 12 * Math.log2(10), display: '39.86',
    callFragment: 'ping();',
  },
  {
    name: 'calculate', language: 'rust',
    source: 'fn calculate(price: i32) -> i32 {\n  let total = price + 2;\n  return send(total);\n}',
    ops: ['let', '=', '+', 'return', 'call'], operands: ['total', 'price', '2', 'send', 'total'],
    counts: {n1: 5, n2: 5, eta1: 5, eta2: 4}, volume: 10 * Math.log2(9), display: '31.70',
    callFragment: 'return send(total);',
  },
  {
    name: 'start', language: 'rust',
    source: 'fn start(ready: bool) {\n  let check = || {\n    if !ready { return; }\n    ping();\n  };\n  check();\n}',
    ops: ['let', '=', '=>', 'if', '!', 'return', 'call', 'call'], operands: ['check', 'ready', 'ping', 'check'],
    counts: {n1: 8, n2: 4, eta1: 7, eta2: 3}, volume: 12 * Math.log2(10), display: '39.86',
    callFragment: 'ping();',
  },
];

for (const {name, language, source, ops, operands, counts, volume, display, callFragment} of manualCases) {
  test('Halstead matches the manual ' + language + ' ' + name + ' tally', async () => {
    const {report, selected, result} = await measure(source, language);
    assert.deepEqual(report.diagnostics, []);
    assert.deepEqual(report.functions.map(fn => fn.name), [name]);
    const [fn] = report.functions;
    assert.deepEqual(fn.halstead_counts, counts);
    assert.equal(fn.metrics.halstead_volume, volume);
    const {halsteadOccurrences} = selected[0];
    assert.deepEqual(keys(halsteadOccurrences.filter(e => e.category === 'operator')), ops);
    assert.deepEqual(keys(halsteadOccurrences.filter(e => e.category === 'operand')), operands);
    const explain = markdown(report, selected, result, true);
    assert.ok(explain.includes('Halstead Volume: ' + display));
    assert.equal(explain.match(/Halstead Volume:/g).length, 1);
    const rows = explain.split(/\r?\n/u).map(explainRow).filter(Boolean);
    const call = rows.find(row => row.fragment.trim() === callFragment);
    assert.equal(call?.cognitive, 0);
    assert.deepEqual(call?.halstead, name === 'start' ? [1, 1, 1, 1] : [2, 2, 2, 1]);
    if (name === 'start') {
      assert.deepEqual(rows.find(row => row.fragment.trim() === 'check();')?.halstead, [1, 1, 0, 0]);
    }
    assert.doesNotMatch(explain, /Halstead category/);
  });
}

test('Halstead is zero for empty, operator-only and operand-only vocabularies', async () => {
  const {report} = await measure('function empty(){} function ops(){return; return;} function operands(){a; a;}', 'javascript');
  assert.deepEqual(report.functions.map(fn => fn.halstead_counts), [
    {n1: 0, n2: 0, eta1: 0, eta2: 0},
    {n1: 2, n2: 0, eta1: 1, eta2: 0},
    {n1: 0, n2: 2, eta1: 0, eta2: 1},
  ]);
  assert.ok(report.functions.every(fn => fn.metrics.halstead_volume === 0));
});

test('Rust and JavaScript share call, index and member operators without duplicating tokens', async () => {
  for (const [language, prefix] of [['rust', 'fn'], ['javascript', 'function']]) {
    const source = prefix + ' target(){a.items[3].work(load());}';
    const {report, selected} = await measure(source, language);
    assert.deepEqual(report.diagnostics, []);
    assert.deepEqual(selected[0].halstead, {volume: 30, n1: 5, n2: 5, eta1: 3, eta2: 5});
    const events = selected[0].halsteadOccurrences.filter(e => e.category === 'operator').sort(byLocation);
    assert.deepEqual(events.map(({key, range}) => [key, source.slice(range.startIndex, range.endIndex)]), [
      ['member_access', '.'], ['index', '['], ['member_access', '.'], ['call', '('], ['call', '('],
    ]);
  }
});

test('JavaScript skips the outer method and default-parameter headers and includes nested headers', async () => {
  const source = 'const widget = { [outerKey()](p = outerDefault()) {\n'
    + '  const obj = { [innerKey()](p = innerDefault()) {\n'
    + '    const inner = (q = closureDefault()) => { function local(r = localDefault()){ return emit(r); } return local; };\n'
    + '    return inner;\n  } };\n  return obj;\n} };';
  const {report, selected} = await measure(source, 'javascript');
  assert.deepEqual(report.diagnostics, []);
  assert.deepEqual(report.functions.map(fn => fn.name), [null]);
  const tally = keys(selected[0].halsteadOccurrences);
  for (const name of ['innerKey', 'innerDefault', 'closureDefault', 'localDefault', 'emit', 'local', 'function', '=>']) {
    assert.ok(tally.includes(name), name);
  }
  assert.ok(!tally.includes('outerKey'));
  assert.ok(!tally.includes('outerDefault'));
  assert.equal(tally.filter(key => key === 'function').length, 2);
  assert.equal(tally.filter(key => key === 'call').length, 5);
  assert.equal(tally.filter(key => key === '=').length, 5);
});

test('JavaScript distinguishes words by kind and exact source spelling', async () => {
  const source = "function f(){ same; obj.same; 'same'; \"same\"; /same/; 1; 0x1; 1; 'same'; }";
  const {report, selected} = await measure(source, 'javascript');
  assert.deepEqual(report.diagnostics, []);
  assert.deepEqual(report.functions[0].halstead_counts, {n1: 1, n2: 10, eta1: 1, eta2: 7});
  const operandKeys = selected[0].halsteadOccurrences.filter(e => e.category === 'operand').sort(byLocation)
    .map(({kind, key}) => [kind, key]);
  assert.deepEqual(operandKeys, [
    ['identifier', 'same'], ['identifier', 'obj'], ['identifier', 'same'],
    ['string', "'same'"], ['string', '"same"'], ['regex', '/same/'],
    ['number', '1'], ['number', '0x1'], ['number', '1'], ['string', "'same'"],
  ]);
});

test('JavaScript classifies templates, destructuring and optional access by operation', async () => {
  const backtick = String.fromCharCode(96);
  const source = 'function f() {\r\n'
    + '  const {x: name = 1, ...rest} = obj;\r\n'
    + '  const fixed = ' + backtick + 'c\\n' + backtick + ';\r\n'
    + '  const value = tag' + backtick + 'a\\n' + '$' + '{obj?.m?.()?.[name]}b\\x41' + backtick + ';\r\n'
    + '}';
  const {report, selected, result} = await measure(source, 'javascript');
  assert.deepEqual(report.diagnostics, []);
  const occurrences = selected[0].halsteadOccurrences;
  const templates = occurrences.filter(e => e.kind?.startsWith('template')).sort(byLocation);
  assert.deepEqual(templates.map(({kind, key}) => [kind, key]), [
    ['template', backtick + 'c\\n' + backtick], ['template_chunk', 'a\\n'], ['template_chunk', 'b\\x41'],
  ]);
  assert.deepEqual(keys(occurrences.filter(e => e.category === 'operator')), [
    'const', '=', 'rest', '=', 'const', '=', 'const', '=', 'call', 'template_literal', 'member_access',
    'optional_chain', 'optional_chain', 'call', 'optional_chain', 'index',
  ]);
  const explain = markdown(report, selected, result, true);
  const row = explain.split(/\r?\n/u).map(explainRow).find(row => row?.fragment.includes('const value = tag'));
  assert.equal(row?.cognitive, 0);
  assert.deepEqual(row?.halstead, [10, 7, 5, 5]);
});

test('Rust keeps signed pattern literals exact and analyzes original macro arguments once', async () => {
  const source = 'fn f(n: i32) {\n'
    + '  match n { -1 | -2 => send(1), -8..=-3 => 2, _ => -1 };\n'
    + '  macro_rules! inert { () => { skip(3) } }\n'
    + '  wrapper!({"x": go(items[4].value), "y": nested!(ping())});\n'
    + '}';
  const {report, selected} = await measure(source, 'rust');
  assert.deepEqual(report.diagnostics, []);
  const occurrences = selected[0].halsteadOccurrences;
  assert.deepEqual(keys(occurrences.filter(e => e.kind === 'number')), ['-1', '-2', '1', '-8', '-3', '2', '1', '4']);
  const macroEvents = occurrences.filter(e => e.range.startPosition.row === 3);
  assert.deepEqual(keys(macroEvents), ['"x"', 'go', 'call', 'items', 'index', '4', 'member_access', 'value', '"y"', 'ping', 'call']);
  assert.ok(!keys(occurrences).includes('skip'));
  assert.deepEqual(keys(occurrences.filter(e => e.key.startsWith('unary'))), ['unary_-']);
});

test('diagnostic rows mask the occurrence anchor across functions and preserve other rows', async () => {
  const source = 'fn f(){\n  let a = r#"left\nright"#; unknown!(x; => y);\n  keep\n'
    + '    (first(), second()); unknown!(x; => y); } fn same_row(){ a(); }\nfn g(){ good(); }';
  const {file, report, selected, result} = await measure(source, 'rust');
  assert.equal(report.summary.has_errors, true);
  assert.equal(report.summary.function_discovery_complete, true);
  assert.equal(report.diagnostics.length, 2);
  assert.ok(file.analysis.halsteadOccurrences.some(e => e.key === 'call' && e.range.startPosition.row === 4));
  assert.deepEqual(selected.map(record => keys(record.halsteadOccurrences)), [
    ['let', 'a', '=', 'r#"left\nright"#', 'keep'], [], ['good', 'call'],
  ]);
  const [f, sibling, g] = report.functions;
  assert.deepEqual(f.halstead_counts, {n1: 2, n2: 3, eta1: 2, eta2: 3});
  assert.equal(f.metrics.halstead_volume, 5 * Math.log2(5));
  assert.equal(sibling.metrics.halstead_volume, 0);
  assert.ok(sibling.error);
  assert.equal(g.metrics.halstead_volume, 2);
  assert.equal(g.error, null);
  const explain = markdown(report, selected, result, true);
  assert.ok(explain.includes('Wiersz 2: Cognitive: 0 | Halstead N1: +2 | Halstead N2: +2 | Halstead Eta1: +2 | Halstead Eta2: +2'));
  const errors = explain.split(/\r?\n/u).map(explainRow).filter(row => row?.error);
  assert.ok(errors.length);
  assert.ok(errors.every(row => row.halstead.every(value => value === 0)));
  assert.deepEqual(makeReport(result, 'g').report.functions, [g]);
  assert.match(csv(report), /g,input\.rs:6:1:\d+,0,2,1,1,1,1,\n/u);
});

test('aggregation rejects out-of-range, unowned and altered Halstead occurrences', async () => {
  for (const edit of [
    event => { event.node = {...event.node}; },
    event => { event.range.startPosition.column++; },
    event => { event.key = 'different'; },
  ]) {
    const file = await analyzedFile('function f(){ x; }', 'javascript');
    edit(file.analysis.halsteadOccurrences[0]);
    const result = aggregate([file]);
    assert.deepEqual(result.functions, []);
    assert.deepEqual(result.diagnostics.map(d => d.code), ['INVALID_ANALYSIS_CONTRACT']);
  }
});
