import {lstat, readdir, realpath} from 'node:fs/promises';
import path from 'node:path';
import {languageFor} from './input-files.mjs';

const keyOf = file => process.platform === 'win32' ? file.toLowerCase() : file;
const markerNames = ['.git', 'Cargo.toml', 'package.json'];
const isMarker = entry => entry.isFile() || entry.isDirectory() || entry.isSymbolicLink();

function contains(directory, file) {
  const relative = path.relative(directory, file);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

async function existingPath(file) {
  try { return await realpath(file); }
  catch { return null; }
}

function excludedDirectory(directory, parentHasCargo) {
  const name = keyOf(directory);
  return name === '.git' || name === 'node_modules' || (name === 'target' && parentHasCargo);
}

function rootFinder(cwd) {
  const markers = new Map();
  async function exists(file) {
    try { return isMarker(await lstat(file)); }
    catch { return false; }
  }
  function markersAt(directory) {
    if (!markers.has(directory)) {
      markers.set(directory, Promise.all(markerNames.map(marker => exists(path.join(directory, marker)))));
    }
    return markers.get(directory);
  }
  return async file => {
    let fallback = path.dirname(file);
    let gitRoot, manifestRoot;
    for (let directory = fallback; ; directory = path.dirname(directory)) {
      const parent = path.dirname(directory);
      if (excludedDirectory(path.basename(directory), keyOf(path.basename(directory)) === 'target'
          && (await markersAt(parent))[1])) {
        // Markers within a dependency or build directory cannot select a project.
        gitRoot = manifestRoot = undefined;
        fallback = parent;
        continue;
      }
      const [git, cargo, npm] = await markersAt(directory);
      if (git && gitRoot === undefined) gitRoot = directory;
      if ((cargo || npm) && manifestRoot === undefined) manifestRoot = directory;
      if (directory === parent) break;
    }
    if (gitRoot) return {root: gitRoot, kind: 'git'};
    if (manifestRoot) return {root: manifestRoot, kind: 'manifest'};
    if (cwd !== path.parse(cwd).root && contains(cwd, fallback)) return {root: cwd, kind: 'cwd'};
    if (fallback === path.parse(fallback).root) return null;
    return {root: fallback, kind: 'directory'};
  };
}

async function scanProject({root, kind}) {
  const files = [], errors = [];
  const pending = [root];
  while (pending.length) {
    const directory = pending.pop();
    let entries;
    try {
      entries = await readdir(directory, {withFileTypes: true});
    } catch (error) {
      errors.push({file: directory, error});
      continue;
    }
    const markers = new Set(entries.filter(isMarker).map(entry => keyOf(entry.name)));
    const [git, cargo, npm] = markerNames.map(marker => markers.has(keyOf(marker)));
    if (directory !== root && (git || (kind !== 'git' && (cargo || npm)))) continue;
    for (const entry of entries) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (kind !== 'directory' && !excludedDirectory(entry.name, cargo)) pending.push(file);
      } else if (entry.isFile() && languageFor(file)) files.push(file);
    }
  }
  return {files: files.sort(), errors};
}

/** Find physical graph inputs in each project selected by the report. */
export async function projectFilesForReports(files, cwd) {
  const physicalCwd = await existingPath(cwd) ?? path.resolve(cwd);
  const findRoot = rootFinder(physicalCwd);
  const physicalPaths = new Map(), roots = new Map();
  for (const file of files) {
    if (!languageFor(file)) continue;
    const physical = await existingPath(file);
    if (!physical) continue;
    try { if (!(await lstat(physical)).isFile()) continue; }
    catch { continue; }
    physicalPaths.set(file, physical);
    const project = await findRoot(physical);
    if (project) roots.set(keyOf(project.root), project);
  }
  const projects = [];
  for (const identity of [...roots.keys()].sort()) {
    projects.push(await scanProject(roots.get(identity)));
  }
  return {projects, physicalPaths};
}
