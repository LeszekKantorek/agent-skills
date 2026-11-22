import {realpathSync, statSync} from 'node:fs';
import path from 'node:path';
import {languageFor} from './input-files.mjs';
import {CallGraphReason as Reason} from './call-graph-reasons.mjs';
import {javascriptCalls} from './analyzers/javascript/call-graph.mjs';
import {rustCalls} from './analyzers/rust/call-graph.mjs';
import {spelling} from './analyzers/call-graph-syntax.mjs';

function canonical(file) {
  return process.platform === 'win32' ? file.toLowerCase() : file;
}

function physicalPath(file) {
  try { return realpathSync(file); }
  catch { return null; }
}

function fileExists(file) {
  try { return statSync(file).isFile(); }
  catch { return false; }
}

function indexFiles(aggregate, results) {
  const analyzed = new Set(aggregate.files.filter(file => file.analyzed).map(file => file.fileId));
  const files = [];
  const byPath = new Map();
  const identities = new Map();
  for (const {fileId, source, analysis} of results) {
    const language = languageFor(fileId);
    if (!language || !analyzed.has(fileId)) continue;
    const physical = physicalPath(fileId) ?? fileId;
    const identity = canonical(physical);
    const file = {fileId, physical, identity, language, source: source.source, analysis};
    files.push(file);
    byPath.set(canonical(fileId), file);
    identities.set(identity, file);
  }
  function probe(filePath, language) {
    const name = canonical(filePath);
    const chosen = byPath.get(name) ?? identities.get(name);
    if (chosen) return {file: chosen.language === language ? chosen : null, exists: true};
    const physical = physicalPath(filePath);
    const file = physical === null ? null : identities.get(canonical(physical));
    const exists = physical !== null && fileExists(physical);
    return {file: file?.language === language ? file : null, exists};
  }
  const probeCache = new Map();
  return {
    files: files.sort((a, b) => compare(a.fileId, b.fileId)),
    probe(filePath, language) {
      const absolute = path.resolve(filePath);
      const key = JSON.stringify([canonical(absolute), language]);
      if (!probeCache.has(key)) probeCache.set(key, probe(absolute, language));
      return probeCache.get(key);
    },
  };
}

const compare = (a, b) => a === b ? 0 : a < b ? -1 : 1;
const compareSites = (a, b) => compare(a.file.fileId, b.file.fileId) || a.node.startIndex - b.node.startIndex ||
  a.node.endIndex - b.node.endIndex || compare(a.caller?.id ?? '', b.caller?.id ?? '');

function indexDiagnostics(diagnostics) {
  const byFile = new Map();
  const rows = new Map();
  const affectedLanguages = new Set();
  let globalGap = false;
  for (const diagnostic of diagnostics) {
    const {fileId, range} = diagnostic;
    if (fileId === null) globalGap = true;
    else {
      affectedLanguages.add(languageFor(fileId));
      if (!byFile.has(fileId)) byFile.set(fileId, []);
      byFile.get(fileId).push(diagnostic);
      if (range) {
        if (!rows.has(fileId)) rows.set(fileId, new Set());
        const last = range.endPosition.row - Number(range.startIndex !== range.endIndex && range.endPosition.column === 0);
        for (let row = range.startPosition.row; row <= last; row++) rows.get(fileId).add(row);
      }
    }
  }
  return {
    rowDamaged: (fileId, node) => rows.get(fileId)?.has(node.startPosition.row) ?? false,
    definitionDamaged({fileId, node, anchor, kind}) {
      const start = anchor?.startIndex ?? node.startIndex;
      const end = anchor?.endIndex ?? start + 1;
      return byFile.get(fileId)?.some(({range, owner, category}) => {
        // A written macro path can be scored even when its argument syntax is opaque.
        if (kind === 'macro' && category !== 'parse') return false;
        if (!range) return owner === null;
        const point = range.startIndex === range.endIndex;
        return range.startIndex < end && (point ? range.endIndex >= start : range.endIndex > start);
      }) ?? false;
    },
    gapInLanguage: language => globalGap || affectedLanguages.has(language),
  };
}

function coverage(sites, analysisGap) {
  const occurrences = new Set();
  const reasons = new Set();
  if (analysisGap) reasons.add(Reason.analysisGap);
  for (const site of sites) {
    occurrences.add(JSON.stringify([site.fileId, site.node.startIndex, site.node.endIndex]));
    reasons.add(site.reason);
  }
  return {complete: reasons.size === 0, unresolved_calls: occurrences.size, reasons: [...reasons].sort()};
}

function append(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

function fanOutContributions(sites) {
  const destinations = new Set(), byRow = new Map();
  for (const {fanOutKey, node} of sites) {
    if (!fanOutKey || destinations.has(fanOutKey)) continue;
    destinations.add(fanOutKey);
    const row = node.startPosition.row + 1;
    byRow.set(row, (byRow.get(row) ?? 0) + 1);
  }
  return {total: destinations.size, byRow};
}

export function buildCallGraph(aggregate, results, scope = 'input_files') {
  const {files, probe} = indexFiles(aggregate, results);
  const diagnostics = indexDiagnostics(aggregate.diagnostics);
  const calls = [
    ...javascriptCalls(files.filter(file => file.language === 'javascript'), probe),
    ...rustCalls(files.filter(file => file.language === 'rust'), probe),
  ].sort(compareSites);
  const outerNodes = new Map(files.flatMap(file => file.analysis.functions.map(({id, root}) => [id, root])));
  const unresolved = [], outgoing = new Map(), incoming = new Map(), potential = new Map();
  for (const {file, node, caller, callee, resolution, writtenPath} of calls) {
    const owner = file.analysis.ownerByNode.get(node);
    let {target = null, reason = null, mayTargetInput = false} = resolution;
    const callDamaged = target?.kind !== 'macro' && diagnostics.rowDamaged(file.fileId, node);
    if (callDamaged || (target && diagnostics.definitionDamaged(target))) {
      target = null;
      reason = Reason.analysisGap;
      mayTargetInput = true;
    }
    if (reason) target = null;
    const excluded = target && target.id === caller?.id ? 'self-recursion' : null;
    let fanOutKey = excluded ? null : target?.id;
    if (writtenPath && reason !== Reason.analysisGap) {
      fanOutKey = JSON.stringify([file.language, 'written-call', writtenPath]);
    }
    const site = {fileId: file.fileId, node, caller, target, reason, excluded, fanOutKey,
      calleeText: reason ? spelling(file, callee) : null};
    if (owner !== null) append(outgoing, owner, site);
    if (reason) {
      unresolved.push(site);
      if (caller && mayTargetInput) append(potential, file.language, site);
    } else if (target && !excluded && caller && outerNodes.get(target.owner) === target.node) {
      append(incoming, target.owner, site);
    }
  }
  const incomingCoverage = new Map(['rust', 'javascript'].map(language =>
    [language, coverage(potential.get(language) ?? [], diagnostics.gapInLanguage(language))]));
  for (const record of aggregate.functions) {
    const edgesOut = outgoing.get(record.id) ?? [];
    const edgesIn = incoming.get(record.id) ?? [];
    const callerSites = new Map();
    for (const site of edgesIn) {
      if (!callerSites.has(site.caller.id)) callerSites.set(site.caller.id, site);
    }
    const fanIn = callerSites.size;
    const {total: fanOut, byRow: fanOutByRow} = fanOutContributions(edgesOut);
    const language = languageFor(record.fileId);
    record.callGraph = {
      metrics: {fan_in: fanIn, fan_out: fanOut, instability: fanIn + fanOut === 0 ? null : fanOut / (fanIn + fanOut)},
      fan_in: incomingCoverage.get(language),
      fan_out: coverage(edgesOut.filter(edge => edge.reason), Boolean(record.error)),
      fanOutByRow,
      callerSites: [...callerSites.values()],
      outgoing: edgesOut,
      incoming: edgesIn,
    };
  }
  aggregate.callGraph = {scope, ...coverage(unresolved, aggregate.diagnostics.length > 0)};
}
