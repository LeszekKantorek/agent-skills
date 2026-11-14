import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { makeReport } from '../scripts/public-report.mjs';

const metrics = { cognitive: 0, cyclomatic: 1, statements: 0 };
function record(id, fileId, name, startIndex, endIndex, row, column) {
  return { id, fileId, name, metrics, rootRange: {
    startIndex, endIndex, startPosition: { row, column }, endPosition: { row, column: column + endIndex - startIndex },
  } };
}
function aggregate(functions) {
  return { functions, diagnostics: [], files: [], functionDiscoveryComplete: true, hasErrors: false };
}

test('prepares locations for every outer before filtering and preserves selected order', () => {
  // UTF-16: the leading emoji occupies two units; the selected range has length 14.
  const source = '😀\tfunction f(){}\r\nfunction f(){}';
  const start = source.indexOf('function');
  const next = source.indexOf('function', start + 1);
  const file = path.join(process.cwd(), 'sample.js');
  const first = record('1', file, 'f', start, start + 'function f(){}'.length, 0, 3);
  const second = record('2', file, 'f', next, source.length, 1, 0);
  const hidden = record('3', file, null, source.length, source.length, 1, 14);
  const result = makeReport(aggregate([hidden, second, first]), 'f');
  assert.deepEqual(result.selected, [first, second]);
  assert.deepEqual(result.report.functions.map(item => item.location), ['sample.js:1:4:14', 'sample.js:2:1:14']);
  assert.deepEqual(result.functionLocationsById.get('1'), { name: 'f', location: 'sample.js:1:4:14' });
  assert.deepEqual(result.functionLocationsById.get('3'), { name: null, location: 'sample.js:2:15:0' });
});

test('uses native Windows paths for same-drive, different-drive and UNC locations', { skip: process.platform !== 'win32' }, () => {
  const cwdRoot = path.parse(process.cwd()).root;
  const otherDrive = cwdRoot[0].toUpperCase() === 'Z' ? 'Y:' : 'Z:';
  const files = [path.join(process.cwd(), 'nested', 'a.js'), `${otherDrive}\\dir\\b.js`, '\\\\server\\share\\c.js'];
  const locations = files.map((file, index) => makeReport(aggregate([record(String(index), file, 'f', 0, 1, 0, 0)])).report.functions[0].location);
  assert.deepEqual(locations, ['nested/a.js:1:1:1', `${otherDrive}/dir/b.js:1:1:1`, '//server/share/c.js:1:1:1']);
});

test('display paths preserve UNC share roots and POSIX literal backslashes', () => {
  // Exercise the actual private helper with path semantics and cwd supplied in isolation.
  const moduleSource = readFileSync(new URL('../scripts/public-report.mjs', import.meta.url), 'utf8');
  const helper = moduleSource.slice(moduleSource.indexOf('function displayPath('), moduleSource.indexOf('\nfunction compareDiagnostics('));
  function display(pathApi, cwd, file) {
    return runInNewContext(`${helper}\ndisplayPath(file)`, { path: pathApi, process: { cwd: () => cwd }, file });
  }
  const cwd = String.raw`\\server\share\repo`;
  assert.equal(display(path.win32, cwd, String.raw`\\server\share\repo\a.js`), 'a.js');
  assert.equal(display(path.win32, cwd, String.raw`\\server\other\a.js`), '//server/other/a.js');
  assert.equal(display(path.win32, cwd, String.raw`\\other\share\a.js`), '//other/share/a.js');
  assert.equal(display(path.win32, cwd, String.raw`\\SERVER\SHARE\repo\a.js`), 'a.js');
  assert.equal(display(path.win32, String.raw`C:\repo`, String.raw`\\?\C:\repo\a.js`), 'a.js');
  assert.equal(display(path.win32, String.raw`\\?\C:\repo`, String.raw`C:\repo\a.js`), 'a.js');
  assert.equal(display(path.win32, String.raw`C:\repo`, String.raw`\\?\D:\a.js`), 'D:/a.js');
  assert.equal(display(path.win32, cwd, String.raw`\\?\UNC\server\share\repo\a.js`), 'a.js');
  assert.equal(display(path.win32, String.raw`\\?\UNC\server\share\repo`, String.raw`\\server\share\repo\a.js`), 'a.js');
  assert.equal(display(path.win32, cwd, String.raw`\\?\UNC\server\other\a.js`), '//server/other/a.js');
  for (const root of [String.raw`\\server\share`, String.raw`\\?\UNC\server\share`]) {
    for (const suffix of ['', '\\']) {
      assert.equal(display(path.win32, root + suffix, String.raw`\\server\share\a.js`), 'a.js');
      assert.equal(display(path.win32, root + suffix, String.raw`\\?\UNC\server\share\a.js`), 'a.js');
      assert.equal(display(path.win32, root + suffix, String.raw`\\server\other\a.js`), '//server/other/a.js');
    }
  }
  assert.equal(display(path.win32, cwd, String.raw`\\?\Volume{123}\a.js`), '//?/Volume{123}/a.js');
  assert.equal(display(path.win32, cwd, String.raw`\\.\device\a.js`), '//./device/a.js');
  assert.equal(display(path.posix, '/work/repo', '/work/repo/a\\b.js'), 'a\\b.js');
});

test('CLI makes a namespaced same-drive source relative to its working directory', { skip: process.platform !== 'win32' }, async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'location-namespace-'));
  try {
    const file = path.join(dir, 'f.js');
    await writeFile(file, 'function f(){}');
    const cli = fileURLToPath(new URL('../scripts/measure.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [cli, '--path', path.toNamespacedPath(file)], { cwd: dir, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).functions[0].location, 'f.js:1:1:14');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('CLI distinguishes missing namespaced files from namespaced globs', { skip: process.platform !== 'win32' }, async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'location-namespace-'));
  try {
    await writeFile(path.join(dir, 'f.js'), 'function f(){}');
    const cli = fileURLToPath(new URL('../scripts/measure.mjs', import.meta.url));
    const run = args => spawnSync(process.execPath, [cli, ...args], { cwd: dir, encoding: 'utf8' });
    const missing = path.toNamespacedPath(path.join(dir, 'missing.js'));
    for (const target of ['existing.json', 'absent.json']) {
      if (target === 'existing.json') await writeFile(path.join(dir, target), 'old report');
      for (const inputs of [['--path', missing], ['--path', 'f.js', '--path', missing]]) {
        const result = run([...inputs, '--output', target]);
        assert.equal(result.status, 1); assert.equal(result.stdout, ''); assert.match(result.stderr, /READ_ERROR/);
        if (inputs.length > 2) assert.equal(JSON.parse(await readFile(path.join(dir, target), 'utf8')).functions[0].name,'f');
        else if (target === 'existing.json') assert.equal(await readFile(path.join(dir, target), 'utf8'), 'old report');
        else await assert.rejects(readFile(path.join(dir, target)), { code: 'ENOENT' });
      }
    }
    const matching = run(['--path', path.toNamespacedPath(path.join(dir, '*.js'))]);
    assert.equal(matching.status, 0, matching.stderr);
    assert.deepEqual(JSON.parse(matching.stdout).functions.map(item => item.name), ['f']);
    const unmatched = run(['--path', path.toNamespacedPath(path.join(dir, 'none-*.js'))]);
    assert.equal(unmatched.status, 0, unmatched.stderr);
    assert.deepEqual(JSON.parse(unmatched.stdout).functions, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
