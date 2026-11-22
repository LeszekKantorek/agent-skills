import { readFile, open, stat, lstat, realpath, readlink, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { inputFiles, languageFor } from './input-files.mjs';
import { projectFilesForReports } from './project-files.mjs';
import { parse } from './parser.mjs';
import { outerId } from './analyzers/contracts.mjs';
import { analyzerFor } from './analyzers/registry.mjs';
import { aggregate } from './aggregation.mjs';
import { buildCallGraph } from './call-graph.mjs';
import { makeReport, markdown, csv, diagnosticText, globalDiagnosticText } from './public-report.mjs';

function argumentsOf(args) {
  const options = { paths: [], format: 'json', explain: false };
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === '--explain') { options.explain = true; continue; }
    if (!['--path', '--format', '--output', '--filter'].includes(key) || i + 1 === args.length || args[i + 1].startsWith('--')) throw Error('Invalid arguments');
    const value = args[++i];
    if (key === '--path') options.paths.push(value);
    else options[key.slice(2)] = value;
  }
  if (!['json', 'markdown', 'csv'].includes(options.format)) throw Error('Invalid format');
  return options;
}
const diagnostic = (code, category, message, fileId = null) => ({ code, category, message: String(message), fileId, range: null, owner: null, affectedMetrics: [], affectsFunctionDiscovery: true });
const normalized = file => {
  const absolute = path.resolve(file);
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
};

// Resolve each existing component, including dangling symbolic links, before
// comparing paths that may not exist yet. Keep link targets' dot segments until
// their preceding components have been followed.
async function prospectivePath(file) {
  const absolute = path.resolve(file);
  const split = value => process.platform === 'win32' ? value.split(/[\\/]+/) : value.split(/\/+/);
  let root = path.parse(absolute).root;
  let current = root, parts = split(absolute.slice(root.length)), links = 0;
  while (parts.length) {
    const part = parts.shift();
    if (!part || part === '.') continue;
    if (part === '..') { current = path.dirname(current); continue; }
    const candidate = path.join(current, part);
    let info;
    try { info = await lstat(candidate); }
    catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error; }
    if (!info?.isSymbolicLink()) { current = candidate; continue; }
    if (++links > 40) throw Error('Too many symbolic links in input path');
    const link = await readlink(candidate);
    if (path.isAbsolute(link)) { root = path.parse(link).root; current = root; parts.unshift(...split(link.slice(root.length))); }
    else parts.unshift(...split(link));
  }
  return normalized(current);
}

async function resolveDestination(target) {
  // Keep '..' intact until the filesystem has followed preceding symlinks.
  const drive = process.platform === 'win32' && /^[a-z]:/i.test(target) && !path.isAbsolute(target) ? target.slice(0, 2) : '';
  let current = path.isAbsolute(target) ? target
    : `${drive ? path.resolve(drive) : process.cwd()}${path.sep}${target.slice(drive.length)}`;
  for (let depth = 0; depth < 40; depth++) {
    // A trailing separator requires a directory, which cannot be a report file.
    if ((process.platform === 'win32' ? /[\\/]$/ : /\/$/).test(current)) throw Error('Output is not a regular file');
    let info;
    try { info = await lstat(current); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const parent = await realpath(path.dirname(current));
    if (!info || !info.isSymbolicLink()) return path.join(parent, path.basename(current));
    const link = await readlink(current);
    current = path.isAbsolute(link) ? link : `${parent}${path.sep}${link}`;
  }
  throw Error('Too many output symbolic links');
}

async function destinationIdentity(target, files) {
  const destinationPath = await prospectivePath(target);
  let destination;
  try { destination = await stat(target, { bigint: true }); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (destination && !destination.isFile()) throw Error('Output is not a regular file');
  for (const file of files) {
    if (normalized(file) === normalized(target) || await prospectivePath(file) === destinationPath) {
      throw Error('Output aliases an input file');
    }
    let source;
    try { source = await stat(file, { bigint: true }); }
    catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') continue;
      throw Error(`Cannot establish input identity: ${error.message}`);
    }
    if (destination) {
      if (source.ino === 0n || destination.ino === 0n) throw Error('Cannot establish file identity');
      if (source.dev === destination.dev && source.ino === destination.ino) throw Error('Output aliases an input file');
    }
  }
  return destination;
}

async function writeSafely(target, files, content) {
  if (target === '') throw Error('Output path is empty');
  const destination = await resolveDestination(target);
  const initial = await destinationIdentity(destination, files);
  const temporary = path.join(path.dirname(destination), `.ccm-${randomUUID()}.tmp`);
  let handle, ownsTemporary = false;
  try {
    handle = await open(temporary, 'wx');
    ownsTemporary = true;
    if (initial) await handle.chmod(Number(initial.mode & 0o777n));
    await handle.writeFile(content);
    await handle.close();
    handle = undefined;
    if (await resolveDestination(target) !== destination) throw Error('Output changed during publication');
    const current = await destinationIdentity(destination, files);
    if (Boolean(initial) !== Boolean(current) || initial && (initial.dev !== current.dev || initial.ino !== current.ino)) {
      throw Error('Output changed during publication');
    }
    await rename(temporary, destination);
    ownsTemporary = false;
  } finally {
    try { if (handle) await handle.close(); }
    finally { if (ownsTemporary) await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  }
}

async function analyzeFile(file, reportScores) {
  const fileId = path.resolve(file);
  const language = languageFor(file);
  if (!language) {
    try {
      const info = await stat(file);
      if (!info.isFile()) throw Error('Input is not a regular file');
      return { fileId, source: null, analysis: null, diagnostics: [diagnostic('UNSUPPORTED_LANGUAGE', 'unsupported', 'Unsupported language', fileId)] };
    } catch (error) {
      return { fileId, source: null, analysis: null, diagnostics: [diagnostic('READ_ERROR', 'input', error.message, fileId)] };
    }
  }
  let source, parsed;
  try {
    source = await readFile(file, 'utf8');
    parsed = await parse(source, language);
    const analyzer = analyzerFor(language);
    const analysis = reportScores ? analyzer.analyze(parsed.tree, source, fileId)
      : analyzer.prepare(parsed.tree, source, fileId);
    return { fileId, source: { fileId, source }, analysis, diagnostics: [] };
  } catch (error) {
    return { fileId, source: source === undefined ? null : { fileId, source }, analysis: null,
      diagnostics: [diagnostic(source === undefined ? 'READ_ERROR' : 'ANALYSIS_ERROR', source === undefined ? 'input' : 'internal', error.message, fileId)] };
  } finally { parsed?.dispose(); }
}

async function attachProjectGraph(reportAggregate, reportResults, reportFiles, cwd) {
  const {projects, physicalPaths} = await projectFilesForReports(reportFiles, cwd);
  const reportsByFile = new Map(reportResults.map(result => [result.fileId, result]));
  const reportsByPath = new Map(reportResults.map(result => [normalized(result.fileId), result]));
  const filesByPath = new Map(), graphById = new Map(), reportGraphFiles = new Map();
  const projectFiles = [];
  for (const {files, errors} of projects) {
    const projectResults = [];
    for (const file of files) {
      const result = reportsByPath.get(normalized(file)) ?? await analyzeFile(file, false);
      projectResults.push(result);
      filesByPath.set(normalized(file), result);
      projectFiles.push(file);
    }
    const graphDiagnostics = errors.map(({file, error}) =>
      diagnostic('PROJECT_SCAN_ERROR', 'input', `${file}: ${error.message}`));
    const project = aggregate(projectResults, graphDiagnostics);
    buildCallGraph(project, projectResults);
    for (const record of project.functions) graphById.set(record.id, record.callGraph);
  }
  for (const {fileId} of reportAggregate.functions) {
    if (reportGraphFiles.has(fileId)) continue;
    const physical = physicalPaths.get(fileId);
    const canonical = physical && filesByPath.get(normalized(physical));
    const result = reportsByFile.get(fileId);
    if (canonical && languageFor(canonical.fileId) === languageFor(fileId)
        && canonical.source?.source === result.source.source && canonical.analysis) {
      reportGraphFiles.set(fileId, canonical.fileId);
    } else {
      // An explicitly reported source outside the scan can resolve its own calls.
      const standalone = aggregate([result]);
      buildCallGraph(standalone, [result]);
      for (const record of standalone.functions) graphById.set(record.id, record.callGraph);
      reportGraphFiles.set(fileId, fileId);
    }
  }
  for (const record of reportAggregate.functions) {
    const graphFile = reportGraphFiles.get(record.fileId);
    const [, ordinal] = JSON.parse(record.id);
    record.callGraph = graphById.get(outerId(graphFile, ordinal));
  }
  return projectFiles;
}

async function main() {
  const options = argumentsOf(process.argv.slice(2));
  const cwd = process.cwd();
  const inputErrors = [];
  const files = await inputFiles(options.paths, cwd, inputErrors);
  const results = [];
  for (const file of files) results.push(await analyzeFile(file, true));
  const globals = inputErrors.map(error => diagnostic('INPUT_GLOB_ERROR', 'input', `${error.file}: ${error.message}`));
  const aggregateResult = aggregate(results, globals);
  const hasInputFailure = aggregateResult.diagnostics.some(d => d.category === 'input' || d.category === 'internal');
  const usableInput = aggregateResult.files.some(file => file.analyzed ||
    aggregateResult.diagnostics.some(d => d.fileId === file.fileId && d.code === 'UNSUPPORTED_LANGUAGE'));
  const canPublish = !hasInputFailure || usableInput;
  const projectFiles = canPublish ? await attachProjectGraph(aggregateResult, results, files, cwd) : [];
  const { report, selected } = makeReport(aggregateResult, options.filter);
  const globalErrors = aggregateResult.diagnostics.filter(d => d.fileId === null).map(globalDiagnosticText);
  const messages = [diagnosticText(report), ...globalErrors].filter(Boolean).join('\n');
  if (messages) process.stderr.write(messages + '\n');
  if (!canPublish) {
    process.exitCode = 1;
    return;
  }
  const output = options.explain || options.format === 'markdown' ? markdown(report, selected, aggregateResult, options.explain)
    : options.format === 'csv' ? csv(report) : JSON.stringify(report, null, 2) + '\n';
  if (options.output !== undefined) await writeSafely(options.output, [...new Set([...files, ...projectFiles])], output);
  else process.stdout.write(output);
  if (report.summary.has_errors) process.exitCode = 1;
}
main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
