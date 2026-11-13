const KEYS = ['cognitive', 'cyclomatic', 'statements'];
const zero = () => ({cognitive: 0, cyclomatic: 0, statements: 0});
const add = (to, from) => { for (const k of KEYS) to[k] += from[k]; };
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
  return d && typeof d.code === 'string' && typeof d.message === 'string' && ['input','parse','unsupported','internal'].includes(d.category) && d.fileId === fileId && (d.owner === null || (typeof d.owner === 'string' && (!owners || owners.has(d.owner)))) && Array.isArray(d.affectedMetrics) && d.affectedMetrics.every(k=>KEYS.includes(k)) && typeof d.affectsFunctionDiscovery === 'boolean' && ((d.range === null && allowsUnlocated) || (source !== null && (starts ? exactRange(d.range,source.length,starts) : plausibleDiagnosticRange(d.range,source,rows))));
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
  if (!analysis || !Array.isArray(analysis.functions) || !(analysis.ownerByNode instanceof Map) || !Array.isArray(analysis.diagnostics)) throw Error('Invalid analysis contract');
  const starts=presentationStarts(analysis.presentation,source);
  if (!starts) throw Error('Invalid presentation');
  const records = new Map();
  for (const f of analysis.functions) {
    let identity; try { identity=JSON.parse(f.id); } catch { throw Error('Invalid function ID'); }
    if (!Array.isArray(identity) || identity.length!==2 || identity[0]!==fileId || !Number.isSafeInteger(identity[1]) || identity[1]<0 || JSON.stringify(identity)!==f.id || records.has(f.id) || !(typeof f.name==='string' || f.name===null) || !f.root) throw Error('Invalid or duplicate function');
    records.set(f.id, {id:f.id,name:f.name,root:f.root,knownScore:zero(),byRow:new Map()});
  }
  const seen=new Set(), stack=[analysis.tree], rows=analysis.presentation.lineAnnotations.length;
  while (stack.length) {
    const n=stack.pop();
    if (!n || typeof n!=='object' || seen.has(n)) throw Error('Tree contains a cycle, shared node or invalid node');
    seen.add(n);
    if (typeof n.type!=='string' || !(n.field===null || typeof n.field==='string') || typeof n.isNamed!=='boolean') throw Error('Invalid node shape');
    if (['subtreeScore','analyzed','ownScore','sourceRange'].some(key=>Object.hasOwn(n,key))) throw Error('Invalid node shape');
    if (!analysis.ownerByNode.has(n)) throw Error('Missing owner entry');
    const owner=analysis.ownerByNode.get(n);
    if (owner!==null && (typeof owner!=='string' || !records.has(owner))) throw Error('Unknown owner');
    if (!Array.isArray(n.children) || !n.score || !KEYS.every(k=>Number.isSafeInteger(n.score[k]) && n.score[k]>=0) || !exactRange(n,source.length,starts)) throw Error('Invalid node score, children or range');
    if (owner!==null && KEYS.some(k=>n.score[k]!==0)) {
      const record=records.get(owner), row=n.startPosition.row+1;
      add(record.knownScore,n.score);
      if (!record.byRow.has(row)) record.byRow.set(row,zero());
      add(record.byRow.get(row),n.score);
    }
    for (let i=n.children.length-1;i>=0;i--) stack.push(n.children[i]);
  }
  if (analysis.ownerByNode.size!==seen.size) throw Error('Owner map contains nodes outside the tree');
  for (const r of records.values()) if (!seen.has(r.root) || analysis.ownerByNode.get(r.root)!==r.id) throw Error('Function root is missing or has wrong owner');
  if (!analysis.diagnostics.every(d=>validDiagnostic(d,fileId,source,rows,records,starts))) throw Error('Invalid analysis diagnostic');
  return [...records.values()].map(({root,...r})=>({...r,rootRange:range(root),metrics:{...r.knownScore}}));
}

export function aggregate(fileResults, globalDiagnostics=[]) {
  const result={files:[],functions:[],diagnostics:[],functionDiscoveryComplete:true,hasErrors:false,sources:new Map(),presentation:new Map()};
  for (const file of fileResults) {
    let records=[], analyzed=false, error=null;
    const sourceValid=file.source && file.source.fileId===file.fileId && typeof file.source.source==='string';
    if (sourceValid) result.sources.set(file.fileId,file.source);
    const length=sourceValid ? file.source.source.length : null;
    // File-level diagnostics are independent of Prepared and survive its rejection.
    const fileDiagnostics=Array.isArray(file.diagnostics) ? file.diagnostics : [];
    // Diagnostic validity must not depend on presentation, which itself may
    // be the reason for rejecting Prepared. Use a language-neutral upper bound.
    const rows=length===null ? 0 : 1 + [...file.source.source.matchAll(/\r\n|[\r\n\u2028\u2029]/g)].length;

    const starts=sourceValid ? presentationStarts(file.analysis?.presentation,file.source.source) : null;
    const diagnostics=fileDiagnostics.filter(d=>validDiagnostic(d,file.fileId,sourceValid ? file.source.source : null,rows,null,starts));
    if (diagnostics.length!==fileDiagnostics.length || !Array.isArray(file.diagnostics)) error='Invalid file diagnostic';
    if (file.analysis) {
      try {
        if (!sourceValid || error) throw Error(error || 'Missing or inconsistent source');
        records=collect(file.analysis,file.fileId,file.source.source);
        const ids=new Set(records.map(r=>r.id));
        if (!diagnostics.every(d=>d.owner===null || ids.has(d.owner))) throw Error('Unknown diagnostic owner');
        analyzed=true;
        result.presentation.set(file.fileId,file.analysis.presentation);
      } catch (e) { records=[]; error=e.message; }
    } else if (!diagnostics.length && !error) error='Missing analysis without diagnostic';
    // Preserve valid analysis diagnostics even if another part of Prepared is
    // invalid; never publish malformed entries or partially computed records.
    const owners=Array.isArray(file.analysis?.functions) ? new Set(file.analysis.functions.map(f=>f?.id)) : null;
    const analysisDiagnostics=Array.isArray(file.analysis?.diagnostics) ? file.analysis.diagnostics.filter(d=>validDiagnostic(d,file.fileId,sourceValid ? file.source.source : null,rows,owners,starts)) : [];
    const remaining=diagnostics.map(diagnosticKey);
    for (const d of analysisDiagnostics) { const key=diagnosticKey(d), i=remaining.indexOf(key); if (i<0) diagnostics.push(d); else remaining.splice(i,1); }
    if (error) diagnostics.push({code:'INVALID_ANALYSIS_CONTRACT',category:'internal',message:String(error),fileId:file.fileId,range:null,owner:null,affectedMetrics:[],affectsFunctionDiscovery:true});
    for (const r of records) r.fileId=file.fileId;
    const byId=new Map(records.map(r=>[r.id,r]));
    for (const d of diagnostics) { const record=byId.get(d.owner); if(record) for(const k of d.affectedMetrics) record.metrics[k]=null; }
    const functionDiscoveryComplete=analyzed && !diagnostics.some(d=>d.affectsFunctionDiscovery);
    result.files.push({fileId:file.fileId,analyzed,functionDiscoveryComplete}); result.functions.push(...records); result.diagnostics.push(...diagnostics); result.functionDiscoveryComplete &&=functionDiscoveryComplete;
  }
  const globals = Array.isArray(globalDiagnostics) ? globalDiagnostics : [null];
  for (const d of globals) {
    const valid = d && ['input','internal'].includes(d.category) && d.owner===null && d.range===null &&
      validDiagnostic(d,null,null,0);
    const diagnostic = valid ? d : {code:'INVALID_ANALYSIS_CONTRACT',category:'internal',message:'Invalid global diagnostic',fileId:null,range:null,owner:null,affectedMetrics:[],affectsFunctionDiscovery:true};
    result.diagnostics.push(diagnostic);
    if (diagnostic.affectsFunctionDiscovery) result.functionDiscoveryComplete=false;
  }
  result.hasErrors=result.diagnostics.length>0;
  return result;
}


