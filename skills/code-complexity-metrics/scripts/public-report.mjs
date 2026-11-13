import path from 'node:path';

const compare = (a, b) => a === b ? 0 : a === null ? -1 : b === null ? 1 : a < b ? -1 : 1;
const metricOrder = ['cognitive', 'cyclomatic', 'statements'];
const metricLabels = ['Cognitive', 'Cyclomatic', 'Statements'];

function publicRange(range) {
  if (range === null) return null;
  return {
    ...range,
    startPosition: { row: range.startPosition.row + 1, column: range.startPosition.column + 1 },
    endPosition: { row: range.endPosition.row + 1, column: range.endPosition.column + 1 },
  };
}
function publicMetrics(metrics) {
  return {
    cognitive_complexity: metrics.cognitive,
    cyclomatic_complexity: metrics.cyclomatic,
    statement_count: metrics.statements,
  };
}
function displayPath(fileId) {
  return path.isAbsolute(fileId) ? path.relative(process.cwd(), fileId).replaceAll('\\', '/') : fileId;
}
function compareDiagnostics(a, b) {
  return compare(a.fileId, b.fileId)
    || compare(a.range?.startIndex ?? null, b.range?.startIndex ?? null)
    || compare(a.range?.endIndex ?? null, b.range?.endIndex ?? null)
    || compare(a.code, b.code) || compare(a.owner, b.owner)
    || compare(a.category, b.category) || compare(a.message, b.message)
    || compare(a.affectedMetrics.join(','), b.affectedMetrics.join(','))
    || compare(a.affectsFunctionDiscovery, b.affectsFunctionDiscovery);
}
export function makeReport(aggregate, filter) {
  const ordered = [...aggregate.functions].sort((a, b) =>
    compare(a.fileId, b.fileId) || a.rootRange.startIndex - b.rootRange.startIndex || compare(a.id, b.id));
  const prefixes = filter === undefined ? null : filter.split('|');
  const selected = ordered.filter(record => !prefixes || record.name !== null && prefixes.some(prefix => record.name.startsWith(prefix)));
  const diagnostics = aggregate.diagnostics.map(diagnostic => ({
    ...diagnostic,
    range: publicRange(diagnostic.range),
    affectedMetrics: metricOrder.filter(key => diagnostic.affectedMetrics.includes(key)),
  })).sort(compareDiagnostics);
  const functions = selected.map(record => ({
    id: record.id,
    fileId: record.fileId,
    range: publicRange(record.rootRange),
    location: `${displayPath(record.fileId)}:${record.rootRange.startPosition.row + 1}:${record.rootRange.startPosition.column + 1}`,
    name: record.name,
    metrics: publicMetrics(record.metrics),
  }));
  return {
    report: {
      schema_version: '2.0', rules_version: '2.0', analyzer_version: '0.1.0',
      parser: { package: '@vscode/tree-sitter-wasm', version: '0.3.1' },
      summary: {
        files: aggregate.files.length,
        functions_found: ordered.length,
        functions_presented: selected.length,
        function_discovery_complete: aggregate.functionDiscoveryComplete,
        has_errors: aggregate.hasErrors,
      },
      files: [...aggregate.files].sort((a, b) => compare(a.fileId, b.fileId)),
      functions,
      diagnostics,
    },
    selected,
  };
}
const label = value => value === null ? 'null (niepełna analiza)' : String(value);
const cell = value => String(value).replace(/[\r\n]/g, ' ')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replace(/[\\`*_\[\]()|!~#]/g, '\\$&');
function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
function meta(report) {
  const summary = report.summary;
  return `Files: ${summary.files}; functions found: ${summary.functions_found}; functions presented: ${summary.functions_presented}; function discovery complete: ${summary.function_discovery_complete}; has errors: ${summary.has_errors}`;
}
function version(report) {
  return `Schema: ${report.schema_version}; rules: ${report.rules_version}; analyzer: ${report.analyzer_version}; parser: ${report.parser.package} ${report.parser.version}`;
}
function diagnosticPosition(diagnostic) {
  const range = diagnostic.range;
  return range ? `:${range.startPosition.row}:${range.startPosition.column}–${range.endPosition.row}:${range.endPosition.column}` : '';
}
export function diagnosticText(report) {
  return report.diagnostics.map(diagnostic =>
    `${diagnostic.fileId ?? '<global>'}${diagnosticPosition(diagnostic)}: ${diagnostic.code} [${diagnostic.category}]: ${diagnostic.message} (owner: ${diagnostic.owner ?? 'null'}; metrics: ${diagnostic.affectedMetrics.join(',') || 'none'}; discovery: ${diagnostic.affectsFunctionDiscovery})`).join('\n');
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
      output += `## ${cell(record.name ?? '(anonymous)')} — ${cell(record.location)}\n\n`;
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
      `- ${cell(diagnostic.fileId ?? '<global>')}${diagnosticPosition(diagnostic)}: ${cell(diagnostic.code)} [${cell(diagnostic.category)}]: ${cell(diagnostic.message)}; owner: ${cell(diagnostic.owner ?? 'null')}; metrics: ${diagnostic.affectedMetrics.join(', ') || 'none'}; discovery: ${diagnostic.affectsFunctionDiscovery}`).join('\n')}\n`;
  }
  return output;
}
