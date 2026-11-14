import path from 'node:path';
import { readFileSync } from 'node:fs';

const applicationVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const compare = (a, b) => a === b ? 0 : a === null ? -1 : b === null ? 1 : a < b ? -1 : 1;
const metricOrder = ['cognitive', 'cyclomatic', 'statements'];
const metricLabels = ['Cognitive', 'Cyclomatic', 'Statements'];

// Encode the original characters in one pass; renderers must not repeat it.
const publicText = value => value === null ? null : value.replace(/[\\\x00-\x1f\x7f-\x9f\u2028\u2029]/g, char => {
  if (char === '\\') return '\\\\';
  if (char === '\r') return '\\r';
  if (char === '\n') return '\\n';
  if (char === '\t') return '\\t';
  return `\\u${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
});

function publicMetrics(metrics) {
  return {
    cognitive_complexity: metrics.cognitive,
    cyclomatic_complexity: metrics.cyclomatic,
    statement_count: metrics.statements,
  };
}
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
function compareDiagnostics(a, b) {
  return compare(a.path, b.path) || a.row - b.row || a.column - b.column
    || (a.length === null ? b.length === null ? 0 : 1 : b.length === null ? -1 : a.length - b.length)
    || compare(a.error, b.error) || compare(a.name, b.name);
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
  if (aggregate.diagnostics.some(d => d.category === 'input' || d.category === 'internal')) {
    throw Error(diagnostics.map(({ location, error, name }) =>
      `${location === null ? '' : `${location}: `}${error}${name === null ? '' : ` (${name})`}`).join('\n'));
  }
  const publicDiagnostics = diagnostics.map(({ error, name, location }) => ({ error, name, location }));
  const functions = selected.map(record => ({
    name: functionLocationsById.get(record.id).name,
    location: functionLocationsById.get(record.id).location,
    metrics: publicMetrics(record.metrics),
  }));
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
const headerCell = value => cell(value).replaceAll('—', '&#8212;');
// A diagnostic is itself a list item; protect its first text from becoming a
// nested list marker when a relative file path begins with Markdown syntax.
const diagnosticLocation = value => cell(value).replace(/^([-+])/, '\\$1').replace(/^(\d+)\./, '$1\\.');
function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
function meta(report) {
  const summary = report.summary;
  return `Files: ${summary.files}; functions found: ${summary.functions_found}; functions presented: ${summary.functions_presented}; function discovery complete: ${summary.function_discovery_complete}; has errors: ${summary.has_errors}`;
}
function version(report) {
  return `Version: ${report.version}`;
}
export function diagnosticText(report) {
  return report.diagnostics.map(diagnostic =>
    `${diagnostic.location}: ${diagnostic.error}${diagnostic.name === null ? '' : ` (${diagnostic.name})`}`).join('\n');
}
export function csv(report) {
  const lines = ['# Code Complexity Metrics', `# ${meta(report)}`, `# ${version(report)}`,
    'Name,Location,Cognitive,Cyclomatic,Statements'];
  for (const record of report.functions) {
    const metrics = Object.values(record.metrics).map(value => value === null ? 'null' : value);
    lines.push([record.name ?? '', record.location, ...metrics].map(csvCell).join(','));
  }
  return lines.join('\n') + '\n';
}
function renderExplain(record, aggregate) {
  const source = aggregate.sources.get(record.fileId).source;
  const presentation = aggregate.presentation.get(record.fileId);
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
  const groups = [];
  for (const row of [...rows].sort((a, b) => a - b)) {
    const last = groups.at(-1);
    if (last && row === last.at(-1) + 1) last.push(row);
    else groups.push([row]);
  }
  function annotation(row) {
    const points = record.byRow.get(row);
    return metricOrder.map((key, index) => {
      const incomplete = record.metrics[key] === null;
      const value = incomplete && !points?.[key] ? 'brak znanego wkładu' : points?.[key] ?? 0;
      const display = typeof value === 'number' && value > 0 ? `+${value}` : value;
      return `${metricLabels[index]}: ${display}${incomplete && points?.[key] ? ' (częściowe)' : ''}`;
    }).join('; ');
  }
  let output = '';
  for (const group of groups) {
    const content = group.map((row, index) => {
      const inline = presentation.lineAnnotations[row - 1].endIndex === null ? '' : ` // ${annotation(row)}`;
      return lines[row - 1] + inline + (index < group.length - 1 ? separators[row - 1] : '');
    }).join('');
    let longest = 0;
    for (const match of content.matchAll(/`+/g)) longest = Math.max(longest, match[0].length);
    const fence = '`'.repeat(Math.max(3, longest + 1));
    const language = record.fileId.endsWith('.rs') ? 'rust' : 'javascript';
    output += `Wiersze ${group[0]}–${group.at(-1)}:\n\n${fence}${language}\n${content}\n${fence}\n\n`;
    for (const row of group) {
      if (presentation.lineAnnotations[row - 1].endIndex === null) output += `Wiersz ${row}: ${annotation(row)}\n\n`;
    }
  }
  return output;
}
export function markdown(report, selected, aggregate, explain = false) {
  let output = `# Code Complexity Metrics\n\n${meta(report)}\n\n${version(report)}\n\n`;
  if (explain) {
    for (let index = 0; index < selected.length; index++) {
      const record = report.functions[index];
      output += `## ${headerCell(record.name ?? '(anonymous)')} — ${headerCell(record.location)}\n\n`;
      output += `Cognitive: ${label(record.metrics.cognitive_complexity)}; Cyclomatic: ${label(record.metrics.cyclomatic_complexity)}; Statements: ${label(record.metrics.statement_count)}\n\n`;
      output += renderExplain(selected[index], aggregate);
    }
  } else {
    output += '| Name | Location | Cognitive | Cyclomatic | Statements |\n| --- | --- | ---: | ---: | ---: |\n';
    for (const record of report.functions) {
      output += `| ${cell(record.name ?? '(anonymous)')} | ${cell(record.location)} | ${label(record.metrics.cognitive_complexity)} | ${label(record.metrics.cyclomatic_complexity)} | ${label(record.metrics.statement_count)} |\n`;
    }
    output += '\n';
  }
  if (report.diagnostics.length) {
    output += `## Diagnostics\n\n${report.diagnostics.map(diagnostic =>
      `- ${diagnosticLocation(diagnostic.location)}: ${cell(diagnostic.error)}${diagnostic.name === null ? '' : ` (${cell(diagnostic.name)})`}`).join('\n')}\n`;
  }
  return output;
}
