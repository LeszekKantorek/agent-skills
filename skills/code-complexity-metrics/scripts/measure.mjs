import { readFile, open, stat, lstat, realpath, readlink, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { inputFiles, languageFor } from './input-files.mjs';
import { parse } from './parser.mjs';
import { analyzerFor } from './analyzers/registry.mjs';
import { aggregate } from './aggregation.mjs';
import { makeReport, markdown, csv, diagnosticText } from './public-report.mjs';

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

// Resolve all existing ancestors before creating a destination. This covers a
// missing input reached through a symlink to its directory, without touching it.
async function prospectivePath(file) {
  let current = path.resolve(file);
  const suffix = [];
  for (;;) {
    try { return normalized(path.join(await realpath(current), ...suffix)); }
    catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
      const parent = path.dirname(current);
      if (parent === current) throw error;
      suffix.unshift(path.basename(current));
      current = parent;
    }
  }
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

async function main() {
  const options = argumentsOf(process.argv.slice(2));
  const inputErrors = [];
  const files = await inputFiles(options.paths, process.cwd(), inputErrors);
  const results = [];
  for (const file of files) {
    const fileId = path.resolve(file);
    const language = languageFor(file);
    if (!language) {
      try {
        const info = await stat(file);
        if (!info.isFile()) throw Error('Input is not a regular file');
        results.push({ fileId, source: null, analysis: null, diagnostics: [diagnostic('UNSUPPORTED_LANGUAGE', 'unsupported', 'Unsupported language', fileId)] });
      } catch (error) {
        results.push({ fileId, source: null, analysis: null, diagnostics: [diagnostic('READ_ERROR', 'input', error.message, fileId)] });
      }
      continue;
    }
    let source, parsed;
    try {
      source = await readFile(file, 'utf8');
      parsed = await parse(source, language);
      const analysis = analyzerFor(language).analyze(parsed.tree, source, fileId);
      results.push({ fileId, source: { fileId, source }, analysis, diagnostics: [] });
    } catch (error) {
      results.push({ fileId, source: source === undefined ? null : { fileId, source }, analysis: null,
        diagnostics: [diagnostic(source === undefined ? 'READ_ERROR' : 'ANALYSIS_ERROR', source === undefined ? 'input' : 'internal', error.message, fileId)] });
    } finally { parsed?.dispose(); }
  }
  const globals = inputErrors.map(error => diagnostic('INPUT_GLOB_ERROR', 'input', `${error.file}: ${error.message}`));
  const aggregateResult = aggregate(results, globals);
  const { report, selected } = makeReport(aggregateResult, options.filter);
  if (report.summary.has_errors && options.output !== undefined) {
    if (report.diagnostics.length) process.stderr.write(diagnosticText(report) + '\n');
    process.exitCode = 1;
    return;
  }
  const output = options.explain || options.format === 'markdown' ? markdown(report, selected, aggregateResult, options.explain)
    : options.format === 'csv' ? csv(report) : JSON.stringify(report, null, 2) + '\n';
  if (options.format === 'csv' && !options.explain && report.diagnostics.length) process.stderr.write(diagnosticText(report) + '\n');
  if (options.output !== undefined) await writeSafely(options.output, files, output);
  else process.stdout.write(output);
  if (report.summary.has_errors) process.exitCode = 1;
}
main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
