const scoreKeys = ['cognitive'];
const diagnosticMetrics = new Set([...scoreKeys, 'halstead']);
const zero = () => ({cognitive: 0});
const add = (to, from) => { for (const k of scoreKeys) to[k] += from[k]; };
const range = n => ({startIndex: n.startIndex, endIndex: n.endIndex, startPosition: {...n.startPosition}, endPosition: {...n.endPosition}});
const validPosition = p => p && Number.isSafeInteger(p.row) && p.row >= 0 && Number.isSafeInteger(p.column) && p.column >= 0;
function validRange(r, length, rows) {
  return r && Number.isSafeInteger(r.startIndex) && Number.isSafeInteger(r.endIndex) && r.startIndex >= 0 && r.startIndex <= r.endIndex && r.endIndex <= length && validPosition(r.startPosition) && validPosition(r.endPosition) && r.startPosition.row < rows && r.endPosition.row < rows && r.startPosition.column <= r.startIndex && r.endPosition.column <= r.endIndex && (r.startPosition.row < r.endPosition.row || (r.startPosition.row === r.endPosition.row && r.startPosition.column <= r.endPosition.column && r.endPosition.column-r.startPosition.column===r.endIndex-r.startIndex));
}
function presentationStarts(p, source) {
  if (!p || !Array.isArray(p.comments) || !Array.isArray(p.unsafeCommentRanges) || !Array.isArray(p.lineAnnotations) || !p.lineAnnotations.length) return null;
  const starts=[], lines=p.lineAnnotations;
  let start=0;
  for (let row=0; row<lines.length; row++) {
    const line=lines[row], end=line?.contentEndIndex;
    if (!line || line.row!==row || !Number.isSafeInteger(end) || end<start || end>source.length || !(line.endIndex===null || line.endIndex===end) || source.slice(start,end).includes('\n')) return null;
    starts.push(start);
    if (row===lines.length-1) { if (end!==source.length) return null; }
    else {
      if (end>=source.length || !'\r\n\u2028\u2029'.includes(source[end]) || (source[end]==='\n' && end>0 && source[end-1]==='\r')) return null;
      start=end+(source[end]==='\r' && source[end+1]==='\n' ? 2 : 1);
    }
  }
  if (![...p.comments,...p.unsafeCommentRanges].every(r=>exactRange(r,source.length,starts))) return null;
  return starts;
}
function exactRange(r, length, starts) {
  if (!validRange(r,length,starts.length)) return false;
  return ['start','end'].every(key=>{
    const position=r[`${key}Position`], index=r[`${key}Index`], row=position.row;
    return index===starts[row]+position.column && (row+1===starts.length ? index<=length : index<starts[row+1]);
  });
}
function plausibleDiagnosticRange(r, source, rows) {
  if (!validRange(r,source.length,rows)) return false;
  const endpoints=['start','end'].map(key => {
    const index=r[`${key}Index`], {row,column}=r[`${key}Position`], lineStart=index-column;
    return {index,row,lineStart};
  });
  function countFits(start,end,count, anchoredEnd) {
    let minimum=0, maximum=0;
    for (const m of source.slice(start,end).matchAll(/\r\n|[\r\n\u2028\u2029]/g)) {
      maximum++; if (m[0].includes('\n')) minimum++;
    }
    // A claimed line start makes its immediately preceding optional separator
    // mandatory. LF and CRLF already contribute to the minimum.
    if (anchoredEnd && end>start && '\r\u2028\u2029'.includes(source[end-1])) minimum++;
    return count>=minimum && count<=maximum;
  }
  for (const {index,row,lineStart} of endpoints) {
    if (row===0 ? lineStart!==0 : lineStart<=0 || !'\r\n\u2028\u2029'.includes(source[lineStart-1]) || (source[lineStart-1]==='\r' && source[lineStart]==='\n')) return false;
    if (source.slice(lineStart,index).includes('\n') || !countFits(0,lineStart,row,row>0)) return false;
  }
  const [a,b]=endpoints;
  if (a.lineStart>b.lineStart || (a.lineStart===b.lineStart && a.row!==b.row)) return false;
  // A new line cannot begin at or before a position still on the old line.
  // Only separators at or after that position may establish later rows.
  return a.lineStart===b.lineStart || (b.lineStart>a.index && countFits(a.index,b.lineStart,b.row-a.row,true));
}
function validDiagnostic(d, fileId, source, rows, owners = null, starts = null) {
  const allowsUnlocated = d && (d.category === 'input' || d.category === 'internal' ||
    (d.category === 'unsupported' && d.code === 'UNSUPPORTED_LANGUAGE' && source === null && d.owner === null));
  return d && typeof d.code === 'string' && typeof d.message === 'string' && ['input','parse','unsupported','internal'].includes(d.category) && d.fileId === fileId && (d.owner === null || (typeof d.owner === 'string' && (!owners || owners.has(d.owner)))) && Array.isArray(d.affectedMetrics) && d.affectedMetrics.every(k=>diagnosticMetrics.has(k)) && typeof d.affectsFunctionDiscovery === 'boolean' && ((d.range === null && allowsUnlocated) || (source !== null && (starts ? exactRange(d.range,source.length,starts) : plausibleDiagnosticRange(d.range,source,rows))));
}
// Semantic identity ignores property order at every level, while respecting
// multiplicity within each producer's own list.
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
function diagnosticKey(d) { return canonical({...d, affectedMetrics: [...d.affectedMetrics].sort()}); }
function collect(analysis, fileId, source) {
  const invalidAnalysis = !analysis || !Array.isArray(analysis.functions)
    || !(analysis.ownerByNode instanceof Map) || !Array.isArray(analysis.diagnostics)
    || !Array.isArray(analysis.halsteadOccurrences);
  if (invalidAnalysis) throw Error('Invalid analysis contract');

  const starts = presentationStarts(analysis.presentation, source);
  if (!starts) throw Error('Invalid presentation');

  const records = createFunctionRecords(analysis.functions, fileId);
  const tree = analysis.tree;
  const rows = analysis.presentation.lineAnnotations.length;
  const ownerByNode = analysis.ownerByNode;
  const seen = collectTreeScores(tree, ownerByNode, records, source.length, starts);
  validateFunctionRoots(ownerByNode, seen, records);
  collectHalsteadOccurrences(analysis.halsteadOccurrences, ownerByNode, records, source, starts);

  if (!analysis.diagnostics.every(d => validDiagnostic(d, fileId, source, rows, records, starts))) {
    throw Error('Invalid analysis diagnostic');
  }
  return [...records.values()].map(({root, ...record}) => ({
    ...record, rootRange: range(root), metrics: {...record.knownScore},
  }));
}

function createFunctionRecords(functions, fileId) {
  const records = new Map();
  for (const f of functions) {
    let identity;
    try {
      identity = JSON.parse(f.id);
    } catch {
      throw Error('Invalid function ID');
    }
    const invalidOrDuplicate = !Array.isArray(identity) || identity.length !== 2
      || identity[0] !== fileId || !Number.isSafeInteger(identity[1]) || identity[1] < 0
      || JSON.stringify(identity) !== f.id || records.has(f.id)
      || !(typeof f.name === 'string' || f.name === null) || !f.root;
    if (invalidOrDuplicate) throw Error('Invalid or duplicate function');

    records.set(f.id, {
      id: f.id, name: f.name, root: f.root, knownScore: zero(), byRow: new Map(), halsteadOccurrences: [],
    });
  }
  return records;
}

function collectTreeScores(tree, ownerByNode, records, sourceLength, starts) {
  const seen = new Set();
  const stack = [tree];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object' || seen.has(node)) {
      throw Error('Tree contains a cycle, shared node or invalid node');
    }
    seen.add(node);

    const owner = validateScoredNode(node, ownerByNode, records, sourceLength, starts);
    if (owner !== null && scoreKeys.some(key => node.score[key] !== 0)) {
      addNodeScore(records.get(owner), node);
    }
    for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]);
  }
  return seen;
}

function validateScoredNode(node, ownerByNode, records, sourceLength, starts) {
  const invalidShape = typeof node.type !== 'string'
    || !(node.field === null || typeof node.field === 'string')
    || typeof node.isNamed !== 'boolean'
    || ['subtreeScore', 'analyzed', 'ownScore', 'sourceRange'].some(key => Object.hasOwn(node, key));
  if (invalidShape) throw Error('Invalid node shape');

  if (!ownerByNode.has(node)) throw Error('Missing owner entry');
  const owner = ownerByNode.get(node);
  if (owner !== null && (typeof owner !== 'string' || !records.has(owner))) throw Error('Unknown owner');

  const invalidData = !Array.isArray(node.children) || !node.score
    || !scoreKeys.every(key => Number.isSafeInteger(node.score[key]) && node.score[key] >= 0)
    || !exactRange(node, sourceLength, starts);
  if (invalidData) throw Error('Invalid node score, children or range');
  return owner;
}

function addNodeScore(record, node) {
  const row = node.startPosition.row + 1;
  add(record.knownScore, node.score);
  if (!record.byRow.has(row)) record.byRow.set(row, zero());
  add(record.byRow.get(row), node.score);
}

function validateFunctionRoots(ownerByNode, seen, records) {
  if (ownerByNode.size !== seen.size) throw Error('Owner map contains nodes outside the tree');
  for (const record of records.values()) {
    if (!seen.has(record.root) || ownerByNode.get(record.root) !== record.id) {
      throw Error('Function root is missing or has wrong owner');
    }
  }
}

function collectHalsteadOccurrences(occurrences, ownerByNode, records, source, starts) {
  for (const occurrence of occurrences) {
    if (!occurrence || typeof occurrence !== 'object') throw Error('Invalid Halstead occurrence');
    const {node, category, key, kind, range: location} = occurrence;
    const record = records.get(ownerByNode.get(node));
    if (!record || !exactRange(location, source.length, starts)
        || location.startIndex < node.startIndex || location.endIndex > node.endIndex
        || location.startIndex === location.endIndex || typeof key !== 'string' || !key) {
      throw Error('Invalid Halstead occurrence');
    }
    const validCategory = category === 'operator' && kind === undefined
      || category === 'operand' && typeof kind === 'string' && kind.length > 0
        && key === source.slice(location.startIndex, location.endIndex);
    if (!validCategory) throw Error('Invalid Halstead occurrence');
    record.halsteadOccurrences.push({category, key, kind, range: location});
  }
}

function physicalRows(r) {
  const first = r.startPosition.row + 1;
  const last = r.endIndex === r.startIndex ? first
    : r.endPosition.row + 1 - (r.endPosition.column === 0 ? 1 : 0);
  return {first, last};
}

function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareDiagnostics(a, b) {
  return compareText(a.code, b.code) || compareText(a.message, b.message);
}

export function aggregate(fileResults, globalDiagnostics = []) {
  const result = {
    files: [], functions: [], diagnostics: [], functionDiscoveryComplete: true,
    hasErrors: false, sources: new Map(), presentation: new Map(),
  };
  for (const file of fileResults) aggregateFile(file, result);
  appendGlobalDiagnostics(globalDiagnostics, result);
  result.hasErrors = result.diagnostics.length > 0;
  return result;
}

function aggregateFile(file, result) {
  const sourceValid = file.source && file.source.fileId === file.fileId
    && typeof file.source.source === 'string';
  if (sourceValid) result.sources.set(file.fileId, file.source);
  const source = sourceValid ? file.source.source : null;

  // Diagnostics can survive rejected presentation. Use a language-neutral row bound.
  const fileDiagnostics = Array.isArray(file.diagnostics) ? file.diagnostics : [];
  const rows = source === null ? 0 : 1 + [...source.matchAll(/\r\n|[\r\n\u2028\u2029]/g)].length;
  const starts = sourceValid ? presentationStarts(file.analysis?.presentation, source) : null;
  const diagnostics = fileDiagnostics.filter(d => validDiagnostic(d, file.fileId, source, rows, null, starts));
  const invalidFileDiagnostic = diagnostics.length !== fileDiagnostics.length || !Array.isArray(file.diagnostics);
  const fileDiagnosticError = invalidFileDiagnostic ? 'Invalid file diagnostic' : null;

  const {records, analyzed, error} = readAnalysis(file, source, diagnostics, result.presentation, fileDiagnosticError);
  mergeAnalysisDiagnostics(file, source, rows, starts, diagnostics);
  if (error) diagnostics.push(invalidContractDiagnostic(file.fileId, String(error)));
  for (const record of records) record.fileId = file.fileId;
  const {located, masks} = indexDiagnosticRows(diagnostics);
  for (const record of records) projectRecord(record, diagnostics, located, masks);

  const functionDiscoveryComplete = analyzed && !diagnostics.some(d => d.affectsFunctionDiscovery);
  result.files.push({fileId: file.fileId, analyzed, functionDiscoveryComplete});
  result.functions.push(...records);
  result.diagnostics.push(...diagnostics);
  result.functionDiscoveryComplete &&= functionDiscoveryComplete;
}

function readAnalysis(file, source, diagnostics, presentation, error) {
  let records = [], analyzed = false;
  if (file.analysis) {
    try {
      if (source === null || error) throw Error(error || 'Missing or inconsistent source');
      records = collect(file.analysis, file.fileId, source);
      const ids = new Set(records.map(record => record.id));
      if (!diagnostics.every(d => d.owner === null || ids.has(d.owner))) throw Error('Unknown diagnostic owner');
      analyzed = true;
      presentation.set(file.fileId, file.analysis.presentation);
    } catch (e) {
      records = [];
      error = e.message;
    }
  } else if (!diagnostics.length && !error) {
    error = 'Missing analysis without diagnostic';
  }
  return {records, analyzed, error};
}

function mergeAnalysisDiagnostics(file, source, rows, starts, diagnostics) {
  // Keep valid entries even if another part of the analysis was rejected.
  const owners = Array.isArray(file.analysis?.functions)
    ? new Set(file.analysis.functions.map(f => f?.id))
    : null;
  const analysisDiagnostics = Array.isArray(file.analysis?.diagnostics)
    ? file.analysis.diagnostics.filter(d => validDiagnostic(d, file.fileId, source, rows, owners, starts))
    : [];
  const remaining = diagnostics.map(diagnosticKey);
  for (const diagnostic of analysisDiagnostics) {
    const matchingFileDiagnostic = remaining.indexOf(diagnosticKey(diagnostic));
    if (matchingFileDiagnostic < 0) diagnostics.push(diagnostic);
    else remaining.splice(matchingFileDiagnostic, 1);
  }
}

function indexDiagnosticRows(diagnostics) {
  const masks = new Map();
  const located = diagnostics.filter(d => d.range).sort((a, b) =>
    a.range.startIndex - b.range.startIndex || compareDiagnostics(a, b));
  for (const diagnostic of located) {
    const {first, last} = physicalRows(diagnostic.range);
    for (let row = first; row <= last; row++) {
      if (!masks.has(row)) masks.set(row, []);
      masks.get(row).push(diagnostic);
    }
  }
  return {located, masks};
}

function projectRecord(record, diagnostics, located, masks) {
  const {first, last} = physicalRows(record.rootRange);
  const touched = new Set();
  record.errorRows = new Map();
  for (const [row, rowDiagnostics] of masks) {
    const hasScore = record.byRow.has(row);
    const overlaps = hasScore || (row >= first && row <= last);
    if (overlaps) for (const diagnostic of rowDiagnostics) touched.add(diagnostic);
    if (overlaps || rowDiagnostics.some(d => d.owner === record.id)) {
      record.errorRows.set(row, rowDiagnostics);
    }
    if (hasScore) record.byRow.set(row, zero());
  }
  const relevant = located.filter(d => d.owner === record.id || touched.has(d));
  const unlocated = diagnostics.filter(d => !d.range && d.owner === record.id).sort(compareDiagnostics);
  record.error = relevant[0] ?? unlocated[0] ?? null;
  record.metrics = zero();
  for (const score of record.byRow.values()) add(record.metrics, score);
  record.halsteadOccurrences = record.halsteadOccurrences.filter(event => !masks.has(event.range.startPosition.row + 1));
  record.halstead = summarizeHalstead(record.halsteadOccurrences);
}

function summarizeHalstead(occurrences) {
  const operators = new Set(), operands = new Set();
  let n1 = 0, n2 = 0;
  for (const {category, key, kind} of occurrences) {
    if (category === 'operator') {
      n1++;
      operators.add(key);
    } else {
      n2++;
      operands.add(JSON.stringify([kind, key]));
    }
  }
  const eta1 = operators.size, eta2 = operands.size;
  const vocabulary = eta1 + eta2;
  const volume = vocabulary <= 1 ? 0 : (n1 + n2) * Math.log2(vocabulary);
  return {volume, n1, n2, eta1, eta2};
}

function invalidContractDiagnostic(fileId, message) {
  return {
    code: 'INVALID_ANALYSIS_CONTRACT', category: 'internal', message, fileId,
    range: null, owner: null, affectedMetrics: [], affectsFunctionDiscovery: true,
  };
}

function appendGlobalDiagnostics(globalDiagnostics, result) {
  const globals = Array.isArray(globalDiagnostics) ? globalDiagnostics : [null];
  for (const d of globals) {
    const valid = d && ['input', 'internal'].includes(d.category) && d.owner === null && d.range === null
      && validDiagnostic(d, null, null, 0);
    const diagnostic = valid ? d : invalidContractDiagnostic(null, 'Invalid global diagnostic');
    result.diagnostics.push(diagnostic);
    if (diagnostic.affectsFunctionDiscovery) result.functionDiscoveryComplete = false;
  }
}
