import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {makeReport, markdown, csv, diagnosticText} from '../scripts/public-report.mjs';

// This fixture is hand-built at the renderer boundary: aggregate() is never called.
test('E08 manual AggregateResult keeps complete and partial owners across renderers and filters', () => {
  const fileId = path.resolve('manual.js');
  const source = 'function ok(){}\nfunction bad(){}';
  const split = source.indexOf('\n');
  const id = ordinal => JSON.stringify([fileId, ordinal]);
  const range = (startIndex, endIndex, row, endColumn) => ({
    startIndex, endIndex,
    startPosition: {row, column: 0}, endPosition: {row, column: endColumn},
  });
  const complete = {cognitive: 1};
  const knownPartial = {cognitive: 2};
  const partial = {cognitive: null};
  const halstead = {volume: 0, n1: 0, n2: 0, eta1: 0, eta2: 0};
  const result = {
    files: [{fileId, analyzed: true, functionDiscoveryComplete: false}],
    functions: [
      {id: id(0), fileId, name: 'ok', rootRange: range(0, split, 0, split),
        metrics: complete, knownScore: complete, byRow: new Map([[1, complete]]), halstead, halsteadOccurrences: []},
      {id: id(1), fileId, name: 'bad', rootRange: range(split + 1, source.length, 1, source.length - split - 1),
        metrics: partial, knownScore: knownPartial, byRow: new Map([[2, knownPartial]]), halstead, halsteadOccurrences: []},
    ],
    diagnostics: [
      {code: 'PARTIAL', category: 'unsupported', message: 'partial', fileId, owner: id(1),
        range: range(split + 1, source.length, 1, source.length - split - 1),
        affectedMetrics: ['cognitive'], affectsFunctionDiscovery: false},
      {code: 'GLOBAL', category: 'unsupported', message: 'discovery', fileId, owner: null,
        range: null, affectedMetrics: [], affectsFunctionDiscovery: true},
    ],
    functionDiscoveryComplete: false,
    hasErrors: true,
    sources: new Map([[fileId, {fileId, source}]]),
    presentation: new Map([[fileId, {
      comments: [], unsafeCommentRanges: [],
      lineAnnotations: [
        {row: 0, contentEndIndex: split, endIndex: split},
        {row: 1, contentEndIndex: source.length, endIndex: source.length},
      ],
    }]]),
  };

  const {report, selected} = makeReport(result);
  const json = JSON.parse(JSON.stringify(report));
  assert.equal(json.summary.functions_found, 2);
  assert.equal(json.summary.function_discovery_complete, false);
  assert.equal(json.summary.has_errors, true);
  assert.deepEqual(json.functions.map(fn => fn.metrics), [{cognitive_complexity: 1, halstead_volume: 0}, {cognitive_complexity: null, halstead_volume: 0}]);
  assert.deepEqual(json.functions.map(fn => fn.location), ['manual.js:1:1:15', 'manual.js:2:1:16']);
  assert.deepEqual(json.diagnostics.map(d => [d.error, d.name, d.location]), [['GLOBAL: discovery', null, `manual.js:0:0:${source.length}`], ['PARTIAL: partial', 'bad', 'manual.js:2:1:16']]);

  const table = markdown(report, selected, result);
  assert.match(table, /\| ok \|.*\| 1 \|/);
  assert.match(table, /\| bad \|.*\| null \(niepełna analiza\) \|/);
  assert.match(table, /Function discovery: incomplete · Analysis errors/);
  assert.doesNotMatch(table, /GLOBAL|PARTIAL/);
  const csvOutput = csv(report);
  assert.match(csvOutput, /^ok,.*:1:1:15,1,0\.00,None$/m);
  assert.match(csvOutput, /^bad,.*:2:1:16,null \(niepełna analiza\),0\.00,None$/m);
  const diagnosticOutput = diagnosticText(report);
  assert.match(diagnosticOutput, /GLOBAL/);
  assert.match(diagnosticOutput, /PARTIAL/);
  assert.match(diagnosticOutput, /:2:1:16/);

  const explain = markdown(report, selected, result, true);
  assert.match(explain, /function ok\(\)\{\} +\| +\+1 +\|/);
  assert.match(explain, /function bad\(\)\{\} +\| +\+2 +\|/);
  assert.match(explain, /GLOBAL/);
  assert.match(explain, /PARTIAL/);
  for (const [filter, expectedNames] of [['ok', ['ok']], ['bad', ['bad']], ['none', []]]) {
    const filtered = makeReport(result, filter);
    assert.deepEqual(filtered.report.functions.map(fn => fn.name), expectedNames);
    assert.equal(filtered.report.summary.functions_found, 2);
    assert.equal(filtered.report.summary.has_errors, true);
    assert.equal(filtered.report.summary.function_discovery_complete, false);
    assert.deepEqual(filtered.report.diagnostics, json.diagnostics);
    const filteredCsv = csv(filtered.report);
    const csvNames = filteredCsv.split('\n').slice(4).filter(Boolean).map(line => line.split(',')[0]);
    assert.deepEqual(csvNames, expectedNames);
    const filteredTable = markdown(filtered.report, filtered.selected, result);
    assert.equal(filteredTable.split('\n')[2],
      `Files: 1 · Functions: ${expectedNames.length} of 2 · Function discovery: incomplete · Analysis errors`);
    assert.doesNotMatch(filteredTable, /## Diagnostics|PARTIAL/);
    for (const name of ['ok', 'bad']) {
      assert.equal(filteredTable.includes(`| ${name} |`), expectedNames.includes(name));
    }
    const filteredExplain = markdown(filtered.report, filtered.selected, result, true);
    assert.match(filteredExplain, /PARTIAL/);
    if (filter === 'bad') {
      assert.match(filteredCsv, /^bad,.*:2:1:16,null \(niepełna analiza\),0\.00,None$/m);
      assert.match(filteredExplain, /Cognitive: null \(niepełna analiza\)/); assert.match(filteredExplain, /function bad\(\)\{\} +\| +\+2 +\|/);
    }
    assert.match(diagnosticText(filtered.report), /GLOBAL/);
  }
});
