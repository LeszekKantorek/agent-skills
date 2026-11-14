import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { makeReport, markdown, csv, diagnosticText } from '../scripts/public-report.mjs';

// Decode the table syntax emitted by the renderer, including escaped pipes.
function mdCells(line) {
  const cells = []; let part = '';
  for (let i = 1; i < line.length; i++) {
    if (line[i] === '\\' && i + 1 < line.length) { part += line[i] + line[++i]; continue; }
    if (line[i] === '|') { cells.push(part.trim()); part = ''; } else part += line[i];
  }
  return cells.map(s => s.replace(/\\([\\`*_\[\]()|!~#+.\-])/g, '$1')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code))).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
}
function csvCells(line) {
  const cells = []; let value = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && quoted && line[i + 1] === '"') { value += '"'; i++; }
    else if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) { cells.push(value); value = ''; }
    else value += ch;
  }
  assert.equal(quoted, false); cells.push(value); return cells;
}
function fixture(name = '  a\n\\n\r\t\x00\x7f\x85\u2028\u2029|,"`<&amp;  ') {
  const fileId = path.join(process.cwd(), 'a\n\\n\t\x01|,`&.js');
  const source = 'function x(){\r\n  return 1;\r\n}';
  const record = { id: 'id', fileId, name, rootRange: { startIndex: 0, endIndex: source.length, startPosition: { row: 0, column: 0 }, endPosition: { row: 2, column: 1 } }, metrics: { cognitive: 2, cyclomatic: 3, statements: 4 }, byRow: new Map([[2, { cognitive: 2, cyclomatic: 3, statements: 4 }]]) };
  return { functions: [record], files: [{ fileId, analyzed: true, functionDiscoveryComplete: true }], diagnostics: [{ owner: 'id', fileId, code: 'E\n\\n', message: '"|`<&\t\x01', category: 'parse' }], sources: new Map([[fileId, { source }]]), presentation: new Map([[fileId, { comments: [], lineAnnotations: [{ contentEndIndex: 13, endIndex: 13 }, { contentEndIndex: 26, endIndex: 26 }, { contentEndIndex: source.length, endIndex: source.length }] }]]), hasErrors: true, functionDiscoveryComplete: true };
}
test('all representations consume the same once-normalized values', () => {
  const aggregate = fixture();
  const prepared = makeReport(aggregate, '  a\n');
  const json = JSON.parse(JSON.stringify(prepared.report));
  const expectedName = String.raw`  a\n\\n\r\t\u0000\u007F\u0085\u2028\u2029|,"` + '`<&amp;  ';
  assert.equal(json.functions[0].name, expectedName);
  assert.deepEqual(json.functions[0].metrics, { cognitive_complexity: 2, cyclomatic_complexity: 3, statement_count: 4 });
  assert.equal(json.diagnostics[0].error, String.raw`E\n\\n: "|` + '`<&' + String.raw`\t\u0001`);
  assert.equal(json.diagnostics[0].name, expectedName);
  assert.equal(json.files[0].fileId, aggregate.files[0].fileId.replaceAll('\\', '\\\\').replaceAll('\n', String.raw`\n`).replaceAll('\t', String.raw`\t`).replaceAll('\x01', String.raw`\u0001`));
  const md = markdown(prepared.report, prepared.selected, aggregate);
  const cells = mdCells(md.split('\n').find(line => line.startsWith('| ') && line.includes('a\\')));
  assert.deepEqual(cells.slice(0, 2), [expectedName, json.functions[0].location]);
  const csvLine = csv(prepared.report).split('\n')[4];
  assert.deepEqual(csvCells(csvLine).slice(0, 2), [expectedName, json.functions[0].location]);
  const explain = markdown(prepared.report, prepared.selected, aggregate, true);
  const header = explain.split('\n').find(line => line.startsWith('## '));
  const [name, location] = header.slice(3).split(' — ');
  assert.deepEqual(mdCells(`| ${name} | ${location} |`).slice(0, 2), [expectedName, json.functions[0].location]);
  assert.ok(explain.includes('function x(){ // Cognitive: 0; Cyclomatic: 0; Statements: 0\r\n  return 1; // Cognitive: +2; Cyclomatic: +3; Statements: +4\r\n}'));
  assert.equal(diagnosticText(prepared.report), `${json.diagnostics[0].location}: ${json.diagnostics[0].error} (${expectedName})`);
  assert.equal(markdown(prepared.report, prepared.selected, aggregate), md);
  assert.equal(csv(prepared.report).split('\n')[4], csvLine);
  assert.equal(makeReport(aggregate, String.raw`  a\n`).report.functions.length, 0);
});
test('Markdown preserves empty, whitespace, literal entities, and backslashes next to pipes', () => {
  for (const name of ['', ' ', '  ', ' &#32; ', '\u00a0\u2002 a\u202fb \u2002\u202f', '\u00a0\u2002\u202f', String.raw`\|`, String.raw`\\|tail`, String.raw`a|\|b`]) {
    const aggregate = fixture(name); const result = makeReport(aggregate);
    const line = markdown(result.report, result.selected, aggregate).split('\n')[8];
    assert.equal(mdCells(line)[0], name.replaceAll('\\', '\\\\'));
  }
});
test('explain heading uses one raw delimiter even when either field contains it', () => {
  const aggregate = fixture('name — part & #8212;');
  const original = aggregate.functions[0];
  const fileId = 'path — part.js';
  original.fileId = fileId;
  aggregate.sources.set(fileId, aggregate.sources.values().next().value);
  aggregate.presentation.set(fileId, aggregate.presentation.values().next().value);
  const result = makeReport(aggregate);
  const heading = markdown(result.report, result.selected, aggregate, true).split('\n').find(line => line.startsWith('## '));
  const parts = heading.slice(3).split(' — ');
  assert.equal(parts.length, 2);
  assert.deepEqual(mdCells(`| ${parts[0]} | ${parts[1]} |`).slice(0, 2), [result.report.functions[0].name, result.report.functions[0].location]);
});
test('diagnostic paths cannot begin a nested Markdown block', () => {
  for (const fileId of ['- bad.js', '+ bad.js', '1. bad.js', '23) bad.js', '* bad.js', '> bad.js', '# bad.js', '` bad.js', '~ bad.js', '    bad.js']) {
    const aggregate = fixture();
    aggregate.diagnostics = [{ owner: null, fileId, code: 'E', message: 'problem', category: 'parse' }];
    const result = makeReport(aggregate);
    for (const explain of [false, true]) {
      const line = markdown(result.report, result.selected, aggregate, explain).split('\n').find(line => line.startsWith('- '));
      assert.equal(mdCells(`| ${line.slice(2)} |`)[0], `${result.report.diagnostics[0].location}: E: problem`);
      assert.doesNotMatch(line, /^- (?:[-+*] |\d+[.)] )/);
    }
  }
});
test('diagnostics sort by normalized path, error, name and retain duplicates', () => {
  const base = fixture('z');
  const diagnostics = ['\n', '\\n', '\n'].map(message => ({ owner: 'id', code: '', message, category: 'parse' }));
  const result = makeReport({ ...base, diagnostics });
  assert.deepEqual(result.report.diagnostics.map(d => d.error), [String.raw`\\n`, String.raw`\n`, String.raw`\n`]);
  const first = { ...base.functions[0], id: 'first', name: '\n', fileId: 'x\n' };
  const second = { ...base.functions[0], id: 'second', name: '\\n', fileId: 'x\\n' };
  const ds = [first, second].map(f => ({ owner: f.id, code: 'same', message: '', category: 'parse' }));
  const out = makeReport({ ...base, functions: [first, second], diagnostics: ds });
  assert.deepEqual(out.report.diagnostics.map(d => d.name), [String.raw`\\n`, String.raw`\n`]);
});
test('normalizes the entire control range and diagnostics that abort publication', () => {
  const controls = Array.from({ length: 32 }, (_, i) => String.fromCharCode(i)).join('')
    + Array.from({ length: 33 }, (_, i) => String.fromCharCode(i + 0x7f)).join('') + '\u2028\u2029';
  const expected = [...controls].map(c => ({ '\r': String.raw`\r`, '\n': String.raw`\n`, '\t': String.raw`\t` })[c]
    ?? `\\u${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`).join('');
  const input = fixture(controls);
  assert.equal(makeReport(input).report.functions[0].name, expected);
  input.diagnostics.push({ owner: 'id', code: 'fatal\n\\n', message: controls, category: 'internal' });
  assert.throws(() => makeReport(input), error => {
    assert.ok(error.message.includes(String.raw`fatal\n\\n: ` + expected));
    assert.ok(error.message.includes(` (${expected})`));
    return true;
  });
});

test('ownerless file diagnostics normalize their path exactly once', () => {
  const input = fixture();
  const fileId = 'file\t\\literal\n.js';
  input.diagnostics = [{fileId, owner: null, code: 'E', message: 'bad', category: 'parse'}];
  input.sources.set(fileId, {source: '😺\r\n\t1'});
  const {report, selected} = makeReport(input, 'missing');
  assert.deepEqual(report.diagnostics, [{error: 'E: bad', name: null, location: String.raw`file\t\\literal\n.js:0:0:6`}]);
  assert.match(markdown(report, selected, input), /file\\\\t/);
  assert.equal(diagnosticText(report), `${report.diagnostics[0].location}: E: bad`);
});

test('Markdown and explain put the sole application version on its own line', () => {
  const input = fixture('simple');
  // A source literal mentioning a version is content, not report metadata.
  const source = input.sources.get(input.functions[0].fileId);
  const replacement = 'return \"Rules version: 2.0\";';
  source.source = source.source.replace('return 1;', replacement);
  const delta = replacement.length - 'return 1;'.length;
  input.functions[0].rootRange.endIndex += delta;
  const lines = input.presentation.get(input.functions[0].fileId).lineAnnotations;
  for (const line of lines.slice(1)) { line.contentEndIndex += delta; line.endIndex += delta; }
  const {report, selected} = makeReport(input);
  for (const explain of [false, true]) {
    const output = markdown(report, selected, input, explain);
    if (explain) assert.ok(output.includes('Rules version: 2.0'));
    const metadata = output.split(/\n(?=## |\| Name |### )/)[0];
    const versionLines = metadata.split('\n').filter(line => /version\s*:/i.test(line));
    assert.deepEqual(versionLines, [`Version: ${report.version}`]);
  }
});
