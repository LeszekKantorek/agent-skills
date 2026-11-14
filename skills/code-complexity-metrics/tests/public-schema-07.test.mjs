import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, cp, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const schema = JSON.parse(await readFile(new URL('../references/report-schema.json', import.meta.url), 'utf8'));
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
function valid(s, v) {
  if (s.anyOf && !s.anyOf.some(branch => valid(branch, v))) return false;
  if (s.enum && !s.enum.includes(v)) return false;
  const types = Array.isArray(s.type) ? s.type : [s.type];
  if (s.type && !types.some(t => t === 'null' ? v === null : t === 'array' ? Array.isArray(v) : t === 'object' ? v !== null && typeof v === 'object' && !Array.isArray(v) : t === 'integer' ? Number.isInteger(v) : typeof v === t)) return false;
  if (typeof v === 'string' && ((s.pattern && !new RegExp(s.pattern).test(v)) || (s.minLength !== undefined && [...v].length < s.minLength))) return false;
  if (typeof v === 'number' && s.minimum !== undefined && v < s.minimum) return false;
  if (Array.isArray(v)) return (!s.uniqueItems || new Set(v).size === v.length) && (!s.items || v.every(x => valid(s.items, x)));
  if (v !== null && typeof v === 'object') {
    if ((s.required ?? []).some(k => !Object.hasOwn(v, k))) return false;
    if (s.additionalProperties === false && Object.keys(v).some(k => !Object.hasOwn(s.properties, k))) return false;
    return Object.entries(s.properties ?? {}).every(([k, sub]) => !Object.hasOwn(v, k) || valid(sub, v[k]));
  }
  return true;
}
const complete = { version: '1.0.0', summary: { files: 1, functions_found: 1, functions_presented: 1, function_discovery_complete: true, has_errors: false }, files: [{ fileId: '/x.js', analyzed: true, functionDiscoveryComplete: true }], functions: [{ name: 'f', location: 'x.js:1:1:2', metrics: { cognitive_complexity: 0, cyclomatic_complexity: 1, statement_count: 2 } }], diagnostics: [{ error: 'X: x', name: 'f', location: 'x.js:1:1:2' }] };
test('schema closes all report objects and validates required fields and types', () => {
  const empty = structuredClone(complete); empty.summary = { files: 0, functions_found: 0, functions_presented: 0, function_discovery_complete: true, has_errors: false }; empty.files = []; empty.functions = []; empty.diagnostics = [];
  const partial = structuredClone(complete); partial.functions[0].metrics.statement_count = null; partial.functions[0].name = null; partial.diagnostics[0] = { error: 'X', name: null, location: 'x.js:0:0:null' }; partial.summary.has_errors = true;
  for (const report of [empty, complete, partial]) assert.ok(valid(schema, report));
  let count = 0;
  function check(s, value, parts) {
    if (s.type === 'array') { if (value.length) check(s.items, value[0], [...parts, 0]); return; }
    if (s.type !== 'object') return;
    for (const key of s.required) {
      for (const mutation of ['missing', 'wrong']) {
        const copy = structuredClone(complete); let parent = copy; for (const part of parts) parent = parent[part];
        if (mutation === 'missing') delete parent[key]; else parent[key] = typeof value[key] === 'string' ? 42 : 'wrong';
        assert.equal(valid(schema, copy), false, `${mutation} ${[...parts, key].join('.')}`);
      }
      count++; check(s.properties[key], value[key], [...parts, key]);
    }
    const copy = structuredClone(complete); let parent = copy; for (const part of parts) parent = parent[part]; parent.extra = true;
    assert.equal(valid(schema, copy), false, `extra ${parts.join('.')}`);
  }
  check(schema, complete, []); assert.ok(count >= 21);
  for (const location of [':1:1:2', 'x:0:1:2', 'x:1:0:2', 'x:1:1:-1', 'x:1:1:null', 'x:1:1:2\n', 'x:1:1:2\r', 'x:1:1:2\u2028', 'x:1:1:2\u2029']) { const r = structuredClone(complete); r.functions[0].location = location; assert.equal(valid(schema, r), false, location); }
  for (const location of ['x:0:1:2', 'x:1:0:2', 'x:0:0:-1', 'x:1:1:null', ':0:0:null', 'x:0:0:null\n', 'x:0:0:1\r']) { const r = structuredClone(complete); r.diagnostics[0].location = location; assert.equal(valid(schema, r), false, location); }
  for (const location of ['x:0:0:0', 'x:0:0:null']) { const r = structuredClone(complete); r.diagnostics[0] = { error: 'X', name: null, location }; assert.ok(valid(schema, r), location); r.diagnostics[0].name = 'f'; assert.equal(valid(schema, r), false, location); }
  for (const name of ['f', null]) { const r = structuredClone(complete); r.diagnostics[0] = { error: 'X', name, location: 'C:/a:b.js:1:2:0' }; assert.ok(valid(schema, r)); }
  for (const fileId of ['/x.js', 'C:/x.js', String.raw`C:\\x.js`, String.raw`\\\\server\\share\\x.js`, '//server/share/x.js']) { const r = structuredClone(complete); r.files[0].fileId = fileId; assert.ok(valid(schema, r), fileId); }
  for (const fileId of [String.raw`C:\x.js`, String.raw`\\server\share\x.js`, '/x\ny', String.raw`/x\q`]) { const r = structuredClone(complete); r.files[0].fileId = fileId; assert.equal(valid(schema, r), false, fileId); }
  for (const fileId of [String.raw`/x\ny`, String.raw`/x\\ny`, String.raw`/x\u0085`]) { const r = structuredClone(complete); r.files[0].fileId = fileId; assert.ok(valid(schema, r), fileId); }
  for (const location of ['x\ny:1:1:2', String.raw`x\q:1:1:2`]) { const r = structuredClone(complete); r.functions[0].location = location; assert.equal(valid(schema, r), false, location); }
  const relative = structuredClone(complete); relative.files[0].fileId = 'x.js'; assert.equal(valid(schema, relative), false);
  for (const mutate of [r => { r.version = ''; }, r => { r.summary.files = -1; }, r => { r.functions[0].metrics.statement_count = -1; }]) { const r = structuredClone(complete); mutate(r); assert.equal(valid(schema, r), false); }
});
test('CLI uses module package version in all formats independently of cwd', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'schema7-'));
  try {
    await writeFile(path.join(dir, 'package.json'), JSON.stringify({ version: '9.8.7' }));
    await writeFile(path.join(dir, 'good.js'), 'function f(){if(x){work();}}');
    await writeFile(path.join(dir, 'partial.rs'), 'fn f(){unknown!(a; b);}');
    const cli = fileURLToPath(new URL('../scripts/measure.mjs', import.meta.url));
    assert.equal(pkg.version, '1.0.0'); assert.equal(lock.version, pkg.version); assert.equal(lock.packages[''].version, pkg.version);
    for (const args of [[], ['--path', 'good.js'], ['--path', 'partial.rs']]) {
      const result = spawnSync(process.execPath, [cli, ...args], { cwd: dir, encoding: 'utf8' });
      assert.ok(result.stdout, result.stderr); const report = JSON.parse(result.stdout); assert.ok(valid(schema, report), args.join(' ')); assert.equal(report.version, pkg.version);
    }
    for (const args of [['--path', 'good.js', '--format', 'markdown'], ['--path', 'good.js', '--format', 'csv'], ['--path', 'good.js', '--explain']]) {
      const result = spawnSync(process.execPath, [cli, ...args], { cwd: dir, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr); assert.equal((result.stdout.match(/Version: 1\.0\.0/g) ?? []).length, 1); assert.ok(!result.stdout.includes('9.8.7'));
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('all formats read a changed version from an isolated package', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'version-copy-'));
  try {
    const copy = path.join(dir, 'package'); const cwd = path.join(dir, 'cwd');
    await mkdir(copy); await mkdir(cwd);
    await cp(fileURLToPath(new URL('../scripts', import.meta.url)), path.join(copy, 'scripts'), { recursive: true });
    await cp(fileURLToPath(new URL('../vendor', import.meta.url)), path.join(copy, 'vendor'), { recursive: true });
    await writeFile(path.join(copy, 'package.json'), JSON.stringify({ ...pkg, version: '7.11.13' }));
    await writeFile(path.join(cwd, 'package.json'), JSON.stringify({ version: '9.8.7' }));
    await writeFile(path.join(cwd, 'good.js'), 'function f() {}');
    const cli = path.join(copy, 'scripts', 'measure.mjs');
    const run = args => { const result = spawnSync(process.execPath, [cli, '--path', 'good.js', ...args], { cwd, encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr); return result.stdout; };
    const report = JSON.parse(run([])); assert.ok(valid(schema, report)); assert.equal(report.version, '7.11.13');
    assert.deepEqual(Object.keys(report), ['version', 'summary', 'files', 'functions', 'diagnostics']);
    const summary = 'Files: 1; functions found: 1; functions presented: 1; function discovery complete: true; has errors: false';
    for (const args of [['--format', 'markdown'], ['--explain']]) {
      const lines = run(args).split('\n');
      assert.deepEqual(lines.slice(0, 6), ['# Code Complexity Metrics', '', summary, '', 'Version: 7.11.13', '']);
    }
    const lines = run(['--format', 'csv']).split('\n');
    assert.deepEqual(lines.slice(0, 4), ['# Code Complexity Metrics', `# ${summary}`, '# Version: 7.11.13', 'Name,Location,Cognitive,Cyclomatic,Statements']);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
