import path from 'node:path';
import { readFileSync } from 'node:fs';

const applicationVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const compare = (a, b) => a === b ? 0 : a === null ? -1 : b === null ? 1 : a < b ? -1 : 1;

// Encode the original characters in one pass; renderers must not repeat it.
const publicText = value => value === null ? null : value.replace(/[\\\x00-\x1f\x7f-\x9f\u2028\u2029]/g, char => {
  if (char === '\\') return '\\\\';
  if (char === '\r') return '\\r';
  if (char === '\n') return '\\n';
  if (char === '\t') return '\\t';
  return `\\u${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
});

function displayPath(fileId) {
  if (!path.isAbsolute(fileId)) return fileId;
  // Only strip namespace prefixes whose ordinary Windows equivalents are known.
  function ordinaryWindowsPath(value) {
    return value.replace(/^\\\\\?\\UNC\\([^\\]+)\\([^\\]+)(?=\\|$)/i, '\\\\$1\\$2')
      .replace(/^\\\\\?\\([a-z]:\\)/i, '$1');
  }
  let cwd = process.cwd();
  if (path.sep === '\\') {
    fileId = ordinaryWindowsPath(fileId);
    cwd = ordinaryWindowsPath(cwd);
    if (/^\\\\[?.]\\/.test(fileId) || /^\\\\[?.]\\/.test(cwd)) return fileId.replaceAll('\\', '/');
  }
  const differentWindowsRoot = path.sep === '\\'
    && path.parse(cwd).root.replace(/\\+$/, '').toLowerCase() !== path.parse(fileId).root.replace(/\\+$/, '').toLowerCase();
  const displayed = differentWindowsRoot ? fileId : path.relative(cwd, fileId);
  return path.sep === '\\' ? displayed.replaceAll('\\', '/') : displayed;
}
const errorText = diagnostic => [diagnostic.code, diagnostic.message].filter(Boolean).join(': ');
const globalDiagnosticText = diagnostic => publicText(errorText(diagnostic));
function compareDiagnostics(a, b) {
  return compare(a.path, b.path) || a.row - b.row || a.column - b.column
    || (a.length === null ? b.length === null ? 0 : 1 : b.length === null ? -1 : a.length - b.length)
    || compare(a.error, b.error) || compare(a.name, b.name);
}

function callPosition(fileId, node) {
  const {row, column} = node.startPosition;
  return publicText(`${displayPath(fileId)}:${row + 1}:${column + 1}`);
}

function publicCallGraph({callGraph: graph, fileId: reportFile}) {
  const callers = graph.callerSites.map(({caller, fileId, node}) => ({
    name: publicText(caller.label),
    location: `${callPosition(fileId, node)}:${node.endIndex - node.startIndex}`,
  }));
  const unresolvedCalls = graph.outgoing.filter(site => site.reason).map(site => ({
    location: callPosition(reportFile, site.node),
    call: publicText(site.calleeText ?? null),
    reasons: [publicText(site.reason)],
  }));
  return {
    fan_in: {callers_count: callers.length, callers},
    fan_out: {unresolved_count: unresolvedCalls.length, unresolved_calls: unresolvedCalls},
  };
}

export function makeReport(aggregate, filter) {
  const ordered = [...aggregate.functions].sort((a, b) =>
    compare(a.fileId, b.fileId) || a.rootRange.startIndex - b.rootRange.startIndex || compare(a.id, b.id));
  const locations = new Map(ordered.map(record => {
    const path = publicText(displayPath(record.fileId));
    const range = record.rootRange;
    const row = range.startPosition.row + 1;
    const column = range.startPosition.column + 1;
    const length = range.endIndex - range.startIndex;
    return [record.id, { path, row, column, length, name: publicText(record.name),
      location: `${path}:${row}:${column}:${length}` }];
  }));
  const functionLocationsById = new Map([...locations].map(([id, { name, location }]) => [id, { name, location }]));
  const prefixes = filter === undefined ? null : filter.split('|');
  const selected = ordered.filter(record => !prefixes || record.name !== null && prefixes.some(prefix => record.name.startsWith(prefix)));
  const diagnostics = aggregate.diagnostics.map(diagnostic => {
    const outer = locations.get(diagnostic.owner);
    if (outer) return { ...outer, error: publicText(errorText(diagnostic)) };
    if (diagnostic.fileId === null) return { path: null, row: 0, column: 0, length: null, location: null, name: null, error: publicText(errorText(diagnostic)) };
    const path = publicText(displayPath(diagnostic.fileId));
    const length = aggregate.sources.get(diagnostic.fileId)?.source?.length ?? null;
    return { path, row: 0, column: 0, length, location: `${path}:0:0:${length}`, name: null, error: publicText(errorText(diagnostic)) };
  }).sort(compareDiagnostics);
  const publicDiagnostics = diagnostics.filter(d => d.location !== null).map(({ error, name, location }) => ({ error, name, location }));
  const functions = selected.map(record => {
    const {volume, ...counts} = record.halstead;
    const graph = record.callGraph;
    const graphMetrics = graph && {...graph.metrics, instability: graph.metrics.instability ?? 'NaN'};
    return {
      ...functionLocationsById.get(record.id),
      metrics: {cognitive_complexity: record.metrics.cognitive, halstead_volume: volume, ...graphMetrics},
      halstead_counts: counts,
      ...(graph && {call_graph: publicCallGraph(record)}),
      error: record.error ? publicText(errorText(record.error)) : null,
    };
  });
  return {
    report: {
      version: publicText(applicationVersion),
      summary: {
        files: aggregate.files.length,
        functions_found: ordered.length,
        functions_presented: selected.length,
        function_discovery_complete: aggregate.functionDiscoveryComplete,
        has_errors: aggregate.hasErrors,
      },
      files: [...aggregate.files].sort((a, b) => compare(a.fileId, b.fileId))
        .map(file => ({ ...file, fileId: publicText(file.fileId) })),
      functions,
      diagnostics: publicDiagnostics,
    },
    selected,
    functionLocationsById,
  };
}
const label = value => value === null ? 'null (niepełna analiza)' : String(value);
const cell = value => String(value)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replace(/[\\`*_\[\]()|!~#]/g, '\\$&')
  .replace(/^\s+|\s+$/gu, whitespace => [...whitespace].map(char => `&#${char.codePointAt(0)};`).join(''));
function functionNameCell(value) {
  // Underscores between letters or digits cannot delimit Markdown emphasis.
  return cell(value).replace(/(?<=[\p{L}\p{N}])(?:\\_)+(?=[\p{L}\p{N}])/gu,
    underscores => underscores.replaceAll('\\', ''));
}
const headerCell = (value, encode = cell) => encode(value).replaceAll('—', '&#8212;');
// A diagnostic is itself a list item; protect its first text from becoming a
// nested list marker when a relative file path begins with Markdown syntax.
const diagnosticLocation = value => cell(value).replace(/^([-+])/, '\\$1').replace(/^(\d+)\./, '$1\\.');
function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
function explainSummary({summary}) {
  return `Files: ${summary.files}; functions found: ${summary.functions_found}; functions presented: ${summary.functions_presented}; function discovery complete: ${summary.function_discovery_complete}; has errors: ${summary.has_errors}`;
}

function compactSummary({summary}) {
  const {files, functions_found: found, functions_presented: shown} = summary;
  const functions = shown === found ? String(found) : `${shown} of ${found}`;
  const parts = [`Files: ${files}`, `Functions: ${functions}`];
  if (!summary.function_discovery_complete) parts.push('Function discovery: incomplete');
  if (summary.has_errors) parts.push('Analysis errors');
  return parts.join(' · ');
}

function version(report) {
  return `Version: ${report.version}`;
}
export function diagnosticText(report) {
  return report.diagnostics.map(diagnostic =>
    `${diagnostic.location}: ${diagnostic.error}${diagnostic.name === null ? '' : ` (${diagnostic.name})`}`).join('\n');
}

const metricColumns = ['Name', 'Location', 'Cognitive', 'Halstead Volume'];
const graphColumns = ['Fan-In', 'Fan-Out', 'Instability'];

function graphValues(record) {
  const {fan_in: fanIn, fan_out: fanOut, instability} = record.metrics;
  const display = typeof instability === 'number' ? instability.toFixed(2) : instability;
  return [fanIn, fanOut, display];
}

function summaryTable(report, encodeText = String, encodeName = encodeText) {
  // Empty reports still have the full metric columns.
  const hasGraph = report.functions.length === 0 || report.functions.some(record => record.call_graph);
  const columns = [...metricColumns, ...(hasGraph ? graphColumns : []), 'Error'];
  const rows = report.functions.map(record => {
    const {cognitive_complexity: cognitive, halstead_volume: volume} = record.metrics;
    return [encodeName(record.name ?? '(anonymous)'), encodeText(record.location), label(cognitive),
      volume.toFixed(2), ...(hasGraph ? graphValues(record) : []), encodeText(record.error ?? 'None')];
  });
  return {columns, rows};
}

export function csv(report) {
  const {columns, rows} = summaryTable(report);
  const lines = ['# Code Complexity Metrics', `# ${compactSummary(report)}`, `# ${version(report)}`, columns.join(',')];
  for (const values of rows) lines.push(values.map(csvCell).join(','));
  return lines.join('\n') + '\n';
}

function halsteadDeltasByRow(occurrences) {
  const rows = new Map();
  const operators = new Set(), operands = new Set();
  // Credit distinct items to their first retained source row.
  const ordered = occurrences.toSorted((left, right) => left.range.startIndex - right.range.startIndex);
  for (const {category, kind, key, range} of ordered) {
    const row = range.startPosition.row + 1;
    if (!rows.has(row)) rows.set(row, {n1: 0, n2: 0, eta1: 0, eta2: 0});
    const delta = rows.get(row);
    if (category === 'operator') {
      delta.n1++;
      if (!operators.has(key)) delta.eta1++;
      operators.add(key);
    } else {
      delta.n2++;
      const operand = JSON.stringify([kind, key]);
      if (!operands.has(operand)) delta.eta2++;
      operands.add(operand);
    }
  }
  return rows;
}

const explainColumns = ['Cognitive', 'Halstead N1', 'Halstead N2', 'Halstead Eta1', 'Halstead Eta2'];
const deltaText = value => value > 0 ? `+${value}` : '0';

function fragmentWidth(text) {
  let width = 0;
  for (let i = 0; i < text.length; i++) width += text[i] === '\t' ? 8 - width % 8 : 1;
  return width;
}

function renderExplainTable(entries, columns) {
  const label = 'Fragment';
  let width = label.length;
  for (const {fragment, values} of entries) {
    if (values) width = Math.max(width, Math.min(fragmentWidth(fragment), 120));
  }
  function format(fragment, values) {
    const padded = fragment + ' '.repeat(Math.max(0, width - fragmentWidth(fragment)));
    return padded + ' | ' + values.map((value, index) => value.padStart(columns[index].length)).join(' | ');
  }
  const header = format(label, columns);
  const body = entries.map(({fragment, values, error, separator}) =>
    (values ? format(fragment, values) + error : fragment) + separator).join('');
  return header + '\n' + body;
}

function renderExplain(record, aggregate) {
  const source = aggregate.sources.get(record.fileId).source;
  const presentation = aggregate.presentation.get(record.fileId);
  const halsteadRows = halsteadDeltasByRow(record.halsteadOccurrences);
  const fanOutRows = record.callGraph?.fanOutByRow;
  const columns = fanOutRows ? [...explainColumns, 'Fan-Out'] : explainColumns;
  const chars = source.split('');
  for (const comment of presentation.comments) {
    for (let index = comment.startIndex; index < comment.endIndex; index++) {
      if (!'\r\n\u2028\u2029'.includes(chars[index])) chars[index] = ' ';
    }
  }
  // Boundaries are supplied by the analyzer; keep original separators verbatim.
  let start = 0;
  const lines = [], separators = [];
  for (const line of presentation.lineAnnotations) {
    lines.push(chars.slice(start, line.contentEndIndex).join(''));
    const end = line.contentEndIndex;
    const next = end + (source[end] === '\r' && source[end + 1] === '\n' ? 2 : end < source.length ? 1 : 0);
    separators.push(source.slice(end, next));
    start = next;
  }
  const rows = new Set();
  for (let row = record.rootRange.startPosition.row + 1; row <= record.rootRange.endPosition.row + 1; row++) rows.add(row);
  for (const row of record.byRow.keys()) rows.add(row);
  for (const row of halsteadRows.keys()) rows.add(row);
  for (const row of fanOutRows?.keys() ?? []) rows.add(row);
  for (const row of record.errorRows?.keys() ?? []) rows.add(row);
  const groups = [];
  for (const row of [...rows].sort((a, b) => a - b)) {
    const last = groups.at(-1);
    if (last && row === last.at(-1) + 1) last.push(row);
    else groups.push([row]);
  }
  function rowValues(row) {
    const points = record.byRow.get(row)?.cognitive ?? 0;
    const incomplete = record.metrics.cognitive === null;
    const cognitive = incomplete && !points ? '—' : deltaText(points);
    const delta = halsteadRows.get(row);
    const values = [cognitive, ...['n1', 'n2', 'eta1', 'eta2'].map(key => deltaText(delta?.[key] ?? 0))];
    if (fanOutRows) values.push(deltaText(fanOutRows.get(row) ?? 0));
    return values;
  }
  function rowError(row) {
    const errors = record.errorRows?.get(row);
    return errors ? ` // error: ${errors.map(d => publicText(errorText(d))).join('; ')}` : '';
  }
  let output = '';
  for (const group of groups) {
    const entries = group.map((row, index) => ({
      fragment: lines[row - 1],
      values: presentation.lineAnnotations[row - 1].endIndex === null ? null : rowValues(row),
      error: rowError(row),
      separator: index < group.length - 1 ? separators[row - 1] : '',
    }));
    const content = renderExplainTable(entries, columns);
    let longest = 0;
    for (const match of content.matchAll(/`+/g)) longest = Math.max(longest, match[0].length);
    const fence = '`'.repeat(Math.max(3, longest + 1));
    const language = record.fileId.endsWith('.rs') ? 'rust' : 'javascript';
    output += `${fence}${language}\n${content}\n${fence}\n\n`;
    for (const [index, row] of group.entries()) {
      const {values, error} = entries[index];
      if (!values) {
        const cells = rowValues(row).map((value, column) => `${columns[column]}: ${value}`);
        output += `Wiersz ${row}: ${cells.join(' | ')}${error}\n\n`;
      }
    }
  }
  return output;
}

function explainGraphSummary(record) {
  const [fanIn, fanOut, instability] = graphValues(record);
  return `Fan-In: ${fanIn} | Fan-Out: ${fanOut}\nInstability: ${instability}\n\n`;
}

function explainCallGraph(publicRecord) {
  const {fan_in: incoming, fan_out: outgoing} = publicRecord.call_graph;
  const lines = ['**Call graph**', '', `- Fan-In · confirmed callers: ${incoming.callers_count}`];
  for (const {name, location} of incoming.callers) {
    lines.push(`  - ${cell(location)} · ${functionNameCell(name)}`);
  }
  lines.push(`- Fan-Out · unresolved calls: ${outgoing.unresolved_count}`);
  for (const {location, call, reasons} of outgoing.unresolved_calls) {
    const details = call === null ? reasons : [call, ...reasons];
    lines.push(`  - ${cell(location)} · ${details.map(cell).join(' · ')}`);
  }
  return lines.join('\n') + '\n\n';
}

export function markdown(report, selected, aggregate, explain = false) {
  const summary = explain ? explainSummary(report) : compactSummary(report);
  let output = `# Code Complexity Metrics\n\n${summary}\n\n${version(report)}\n\n`;
  if (!explain) {
    const {columns, rows} = summaryTable(report, cell, functionNameCell);
    const alignment = columns.map((column, index) => index < 2 || column === 'Error' ? '---' : '---:');
    output += `| ${columns.join(' | ')} |\n| ${alignment.join(' | ')} |\n`;
    for (const values of rows) output += `| ${values.join(' | ')} |\n`;
    return output + '\n';
  }

  for (let index = 0; index < selected.length; index++) {
    const record = report.functions[index];
    const sourceRecord = selected[index];
    const {n1, n2, eta1, eta2} = record.halstead_counts;
    output += `## ${headerCell(record.name ?? '(anonymous)', functionNameCell)} — ${headerCell(record.location)}\n`;
    output += `Cognitive: ${label(record.metrics.cognitive_complexity)}\n`;
    output += `Halstead Volume: ${record.metrics.halstead_volume.toFixed(2)} (N1 = ${n1}, N2 = ${n2}, Eta1 = ${eta1}, Eta2 = ${eta2})\n`;
    output += record.call_graph ? explainGraphSummary(record) : '\n';
    output += renderExplain(sourceRecord, aggregate);
    if (record.call_graph) output += explainCallGraph(record);
  }
  if (report.diagnostics.length) {
    output += `## Diagnostics\n\n${report.diagnostics.map(diagnostic =>
      `- ${diagnosticLocation(diagnostic.location)}: ${cell(diagnostic.error)}${diagnostic.name === null ? '' : ` (${functionNameCell(diagnostic.name)})`}`).join('\n')}\n`;
  }
  return output;
}

export { globalDiagnosticText };
