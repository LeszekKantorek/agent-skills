import { readFile, open, stat, realpath } from 'node:fs/promises';
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

async function writeSafely(target, files, content) {
  if (target === '') throw Error('Output path is empty');
  const destinationPath = await prospectivePath(target);
  for (const file of files) {
    if (normalized(file) === normalized(target) || await prospectivePath(file) === destinationPath) {
      throw Error('Output aliases an input file');
    }
  }
  // The opened object is also compared by identity before any truncation.
  let handle;
  try { handle = await open(target, 'r+'); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    handle = await open(target, 'wx+');
  }
  try {
    const destination = await handle.stat({ bigint: true });
    if (!destination.isFile()) throw Error('Output is not a regular file');
    for (const file of files) {
      let source;
      try { source = await stat(file, { bigint: true }); }
      catch (error) {
        if (error.code === 'ENOENT' || error.code === 'ENOTDIR') continue;
        throw Error(`Cannot establish input identity: ${error.message}`);
      }
      if (source.ino === 0n || destination.ino === 0n) throw Error('Cannot establish file identity');
      if (source.dev === destination.dev && source.ino === destination.ino) throw Error('Output aliases an input file');
    }
    await handle.truncate(0);
    await handle.writeFile(content);
  } finally { await handle.close(); }
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
      results.push({ fileId, source: null, analysis: null, diagnostics: [diagnostic('UNSUPPORTED_LANGUAGE', 'unsupported', 'Unsupported language', fileId)] });
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
  const output = options.explain || options.format === 'markdown' ? markdown(report, selected, aggregateResult, options.explain)
    : options.format === 'csv' ? csv(report) : JSON.stringify(report, null, 2) + '\n';
  if (options.format === 'csv' && !options.explain && report.diagnostics.length) process.stderr.write(diagnosticText(report) + '\n');
  if (options.output !== undefined) await writeSafely(options.output, files, output);
  else process.stdout.write(output);
  if (report.summary.has_errors) process.exitCode = 1;
}
main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
