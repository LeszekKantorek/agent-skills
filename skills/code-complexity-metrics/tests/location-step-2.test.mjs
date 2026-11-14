import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink, link, lstat, readlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeReport } from '../scripts/public-report.mjs';
const script = fileURLToPath(new URL('../scripts/measure.mjs', import.meta.url));
const run = (cwd, args, nodeArgs = []) => spawnSync(process.execPath, [...nodeArgs, script, ...args], { cwd, encoding: 'utf8' });
const rec = (id, row, column, length, name = id) => ({ id, name, fileId: path.resolve('a.js'), rootRange: { startIndex: row * 100 + column, endIndex: row * 100 + column + length, startPosition: { row: row - 1, column: column - 1 } }, metrics: { cognitive: 0, cyclomatic: 1, statements: 0 } });
const diag = (owner, code, fileId = path.resolve('a.js')) => ({ owner, code, message: 'problem', fileId, category: 'parse' });
test('projects and sorts diagnostics numerically before filtering, with file lengths', () => {
  const functions = [rec('ten',10,1,2), rec('two',2,10,3), rec('short',2,2,1)];
  const diagnostics = [diag('ten','z'),diag('two','x'),diag('short','b'),diag('short','a'),diag(null,'file'),diag(null,'missing',path.resolve('b.js'))];
  const input = { functions, diagnostics, sources: new Map([[path.resolve('a.js'), { source: '😀' }]]), files: [], hasErrors: true, functionDiscoveryComplete: false };
  const report = makeReport(input, 'no-match').report;
  assert.deepEqual(report.functions, []);
  assert.deepEqual(Object.keys(makeReport(input).report.functions[0]), ['name','location','metrics']);
  assert.deepEqual(report.diagnostics, [
    { error:'file: problem',name:null,location:'a.js:0:0:2' },
    { error:'a: problem',name:'short',location:'a.js:2:2:1' },
    { error:'b: problem',name:'short',location:'a.js:2:2:1' },
    { error:'x: problem',name:'two',location:'a.js:2:10:3' },
    { error:'z: problem',name:'ten',location:'a.js:10:1:2' },
    { error:'missing: problem',name:null,location:'b.js:0:0:null' },
  ]);
  assert.deepEqual(makeReport({ ...input, diagnostics: [...diagnostics].reverse(), functions: [...functions].reverse() }, 'no-match').report, report);
  const mixed = [...diagnostics, { ...diag(null,'READ_ERROR'), category:'input' }, { ...diag(null,'GLOBAL',null), category:'internal' }];
  assert.throws(() => makeReport({ ...input, diagnostics: mixed }, 'no-match'), error => {
    assert.match(error.message, /a\.js:2:2:1: a: problem \(short\)/);
    assert.match(error.message, /a\.js:0:0:2: READ_ERROR: problem/);
    assert.match(error.message, /(?:^|\n)GLOBAL: problem(?:\n|$)/);
    assert.doesNotMatch(error.message, /<global>|null:0:0/);
    return true;
  });
});
test('computes each outer location once even for multiple filtered diagnostics', () => {
 const outer = rec('owner',2,3,7,'outer');
 const original = outer.rootRange;
 let reads = 0;
 Object.defineProperty(outer, 'rootRange', { get() { reads++; return original; } });
 const input = { functions: [outer], diagnostics: [diag('owner','a'), diag('owner','b')],
  sources: new Map(), files: [], hasErrors: true, functionDiscoveryComplete: false };
 const result = makeReport(input, 'unmatched');
 assert.equal(reads, 1); // location is prepared once for this record
 assert.deepEqual(result.report.diagnostics.map(d => [d.name,d.location]), [['outer','a.js:2:3:7'],['outer','a.js:2:3:7']]);
});
test('breaks diagnostic ties by numeric length, then name, with null length last', () => {
 // Synthetic coordinates deliberately share the file-level 0:0 position, so
 // the public comparator is exercised across numeric and unknown lengths.
 const functions = [rec('z',0,0,10,'zeta'), rec('a',0,0,10,'alpha'), rec('n',0,0,10,null), rec('s',0,0,2,'short')];
 const diagnostics = [diag(null,'same'), diag('z','same'), diag('a','same'), diag('n','same'), diag('s','same')];
 const input = { functions, diagnostics, sources: new Map(), files: [], hasErrors: true, functionDiscoveryComplete: false };
 const expected = [
  { error:'same: problem', name:'short', location:'a.js:0:0:2' },
  { error:'same: problem', name:null, location:'a.js:0:0:10' },
  { error:'same: problem', name:'alpha', location:'a.js:0:0:10' },
  { error:'same: problem', name:'zeta', location:'a.js:0:0:10' },
  { error:'same: problem', name:null, location:'a.js:0:0:null' },
 ];
 assert.deepEqual(makeReport(input).report.diagnostics, expected);
 assert.deepEqual(makeReport({ ...input, diagnostics: [...diagnostics].reverse() }).report.diagnostics, expected);
});
test('CLI preserves partial output and refuses publication on errors', async () => {
 const dir = await mkdtemp(path.join(os.tmpdir(),'location-step2-'));
 try {
  await writeFile(path.join(dir,'good.js'),'function good(){}');
  await writeFile(path.join(dir,'bad.js'),'function bad( {');
  await writeFile(path.join(dir,'other.xyz'),'unknown');
  const unsupported = run(dir,['--path','other.xyz']);
  assert.equal(unsupported.status,1);
  assert.deepEqual(JSON.parse(unsupported.stdout).diagnostics, [{error:'UNSUPPORTED_LANGUAGE: Unsupported language',name:null,location:'other.xyz:0:0:null'}]);
  const absentUnsupported = run(dir,['--path','absent.xyz']);
  assert.equal(absentUnsupported.status,1); assert.equal(absentUnsupported.stdout,''); assert.match(absentUnsupported.stderr,/READ_ERROR/);
  await writeFile(path.join(dir,'nested.js'),'function outer(){ function nested(){ const x = ; } }');
  const mixed = run(dir,['--path','nested.js','--path','missing.js','--path','other.xyz']);
  assert.equal(mixed.status,1); assert.equal(mixed.stdout,'');
  assert.match(mixed.stderr,/nested\.js:1:1:52: javascript-parse-error:.*\(outer\)/);
  assert.match(mixed.stderr,/missing\.js:0:0:null: READ_ERROR/);
  assert.match(mixed.stderr,/other\.xyz:0:0:null: UNSUPPORTED_LANGUAGE/);
  const partial = run(dir,['--path','good.js','--path','bad.js']);
  assert.equal(partial.status,1); assert.equal(JSON.parse(partial.stdout).functions[0].name,'good');
  const csv = run(dir,['--path','bad.js','--format','csv']);
  assert.equal(csv.status,1); assert.match(csv.stdout,/Name,Location/); assert.notEqual(csv.stderr,'');
  for (const glob of ['missing/[z-a]', 'unknown-*/[z-a]', '[z-a]/../good.js', 'missing/[z-a]/../../good.js', '{[z-a],valid}/../good.js', `${dir}/[z-a]/../good.js`, ...(process.platform === 'win32' ? [String.raw`[z-a]\..\good.js`, String.raw`missing\[z-a]\..\..\good.js`] : [])]) {
   for (const target of ['glob-existing.json','glob-missing.json']) {
    if (target.includes('existing')) await writeFile(path.join(dir,target),'untouched');
    const r = run(dir,['--path','good.js','--path',glob,'--output',target]);
    assert.equal(r.status,1); assert.equal(r.stdout,''); assert.match(r.stderr,/INPUT_GLOB_ERROR/);
    if (target.includes('existing')) assert.equal(await readFile(path.join(dir,target),'utf8'),'untouched');
    else await assert.rejects(readFile(path.join(dir,target)), {code:'ENOENT'});
   }
  }
  const emptyGlob = run(dir,['--path','missing/*.js']);
  assert.equal(emptyGlob.status,0); assert.deepEqual(JSON.parse(emptyGlob.stdout).functions, []);
  const validGlob = run(dir,['--path','good.*']);
  assert.equal(validGlob.status,0); assert.equal(validGlob.stderr,'');
  assert.deepEqual(JSON.parse(validGlob.stdout).functions.map(item => item.name), ['good']);
  for (const target of ['existing.json','missing.json']) {
   if (target.startsWith('existing')) await writeFile(path.join(dir,target),'untouched');
   for (const bad of ['bad.js','missing.js','[z-a]']) {
    const r = run(dir,['--path','good.js','--path',bad,'--output',target]);
    assert.equal(r.status,1, bad); assert.equal(r.stdout,''); assert.notEqual(r.stderr,'');
    if (target.startsWith('existing')) assert.equal(await readFile(path.join(dir,target),'utf8'),'untouched');
    else await assert.rejects(readFile(path.join(dir,target)), { code:'ENOENT' });
   }
  }
 } finally { await rm(dir,{recursive:true,force:true}); }
});
test('CLI treats wildcard characters in cwd literally', async () => {
 const dir = await mkdtemp(path.join(os.tmpdir(),'cwd-glob-'));
 try {
  await writeFile(path.join(dir,'parent.js'),'function parent(){}');
  for (const name of ['case[z-a]', 'case[abc]', ...(process.platform === 'win32' ? [] : ['case*?', 'case\\literal'])]) {
   const cwd = path.join(dir,name);
   await mkdir(cwd);
   await writeFile(path.join(cwd,'f.js'),'function f(){}');
   for (const pattern of ['*.js','./*.js','f.js','nested/../*.js']) {
    const result = run(cwd,['--path',pattern]);
    assert.equal(result.status,0, `${name}, ${pattern}: ${result.stderr}`);
    assert.deepEqual(JSON.parse(result.stdout).functions.map(item => item.name), ['f']);
   }
   const parent = run(cwd,['--path','../*.js']);
   assert.equal(parent.status,0, parent.stderr);
   assert.deepEqual(JSON.parse(parent.stdout).functions.map(item => item.name), ['parent']);
   const bad = run(cwd,['--path','[z-a]/../f.js']);
   assert.equal(bad.status,1); assert.equal(bad.stdout,''); assert.match(bad.stderr,/INPUT_GLOB_ERROR/);
  }
 } finally { await rm(dir,{recursive:true,force:true}); }
});
test('relative output symlinks follow intermediate directory symlinks before dot-dot', { skip: process.platform === 'win32' }, async () => {
 const dir = await mkdtemp(path.join(os.tmpdir(),'location-links-'));
 try {
  const work = path.join(dir,'work'), other = path.join(dir,'other'), sub = path.join(other,'sub');
  await mkdir(work); await mkdir(other); await mkdir(sub);
  await writeFile(path.join(work,'a.js'),'function f(){}');
  await writeFile(path.join(work,'report.json'),'wrong destination');
  await symlink(sub,path.join(work,'alias'));
  await symlink('../report.json',path.join(sub,'out'));
  for (const existing of [true, false]) {
   if (existing) await writeFile(path.join(other,'report.json'),'old destination');
   else await rm(path.join(other,'report.json'));
   const result = run(work,['--path','a.js','--output','alias/out']);
   assert.equal(result.status,0,result.stderr); assert.equal(result.stdout,'');
   assert.equal(JSON.parse(await readFile(path.join(other,'report.json'),'utf8')).functions[0].name,'f');
   assert.equal(await readFile(path.join(work,'report.json'),'utf8'),'wrong destination');
   assert.equal((await lstat(path.join(work,'alias'))).isSymbolicLink(),true);
   assert.equal(await readlink(path.join(work,'alias')),sub);
   assert.equal((await lstat(path.join(sub,'out'))).isSymbolicLink(),true);
   assert.equal(await readlink(path.join(sub,'out')),'../report.json');
  }
  await symlink('../source.js',path.join(sub,'input-alias'));
  await writeFile(path.join(other,'source.js'),'function source(){}');
  const alias = run(work,['--path',path.join(other,'source.js'),'--output','alias/input-alias']);
  assert.equal(alias.status,1);
  assert.equal(await readFile(path.join(other,'source.js'),'utf8'),'function source(){}');
  assert.equal((await lstat(path.join(sub,'input-alias'))).isSymbolicLink(),true);
  const targetDir = path.join(other,'target'), inner = path.join(targetDir,'inner');
  await mkdir(targetDir); await mkdir(inner);
  await symlink(inner,path.join(sub,'jump'));
  await symlink('jump/../second.json',path.join(sub,'indirect'));
  await writeFile(path.join(sub,'second.json'),'wrong second destination');
  const indirect = run(work,['--path','a.js','--output','alias/indirect']);
  assert.equal(indirect.status,0,indirect.stderr);
  assert.equal(JSON.parse(await readFile(path.join(targetDir,'second.json'),'utf8')).functions[0].name,'f');
  assert.equal(await readFile(path.join(sub,'second.json'),'utf8'),'wrong second destination');
  assert.equal(await readlink(path.join(sub,'jump')),inner);
  assert.equal(await readlink(path.join(sub,'indirect')),'jump/../second.json');
 } finally { await rm(dir,{recursive:true,force:true}); }
});
test('CLI resolves drive-relative output against the drive working directory', { skip: process.platform !== 'win32' }, async t => {
 const dir = await mkdtemp(path.join(os.tmpdir(),'location-drive-'));
 try {
  if (!/^[a-z]:/i.test(dir)) { t.skip('Temporary directory has no drive letter'); return; }
  await writeFile(path.join(dir,'a.js'),'function f(){}');
  const output = `${path.parse(dir).root.slice(0,2)}report.json`;
  const result = run(dir,['--path','a.js','--output',output]);
  assert.equal(result.status,0,result.stderr); assert.equal(result.stdout,'');
  assert.equal(JSON.parse(await readFile(path.join(dir,'report.json'),'utf8')).functions[0].name,'f');
 } finally { await rm(dir,{recursive:true,force:true}); }
});
test('CLI rejects missing output paths ending in a separator', { skip: process.platform === 'win32' }, async () => {
 const dir = await mkdtemp(path.join(os.tmpdir(),'location-trailing-'));
 try {
  await writeFile(path.join(dir,'a.js'),'function f(){}');
  const direct = run(dir,['--path','a.js','--output','report.json/']);
  assert.equal(direct.status,1); assert.equal(direct.stdout,'');
  await assert.rejects(lstat(path.join(dir,'report.json')),{code:'ENOENT'});
  await symlink('report.json/',path.join(dir,'out'));
  const linked = run(dir,['--path','a.js','--output','out']);
  assert.equal(linked.status,1); assert.equal(linked.stdout,'');
  await assert.rejects(lstat(path.join(dir,'report.json')),{code:'ENOENT'});
  assert.equal((await lstat(path.join(dir,'out'))).isSymbolicLink(),true);
  assert.equal(await readlink(path.join(dir,'out')),'report.json/');
 } finally { await rm(dir,{recursive:true,force:true}); }
});
test('atomic output preserves links, rejects aliases and cleans up a failed write', async t => {
 const dir = await mkdtemp(path.join(os.tmpdir(),'location-step2-'));
 try {
  await writeFile(path.join(dir,'a.js'),'function f(){}');
  const longTarget = 'x'.repeat(215) + '.json';
  await writeFile(path.join(dir,longTarget),'old bytes');
  const longResult = run(dir,['--path','a.js','--output',longTarget]);
  assert.equal(longResult.status,0, longResult.stderr); assert.equal(longResult.stdout,'');
  assert.equal((await readdir(dir)).some(name => name.endsWith('.tmp')),false);
  assert.equal(JSON.parse(await readFile(path.join(dir,longTarget),'utf8')).functions[0].name,'f');
  const direct = run(dir,['--path','a.js','--output','a.js']);
  assert.equal(direct.status,1); assert.equal(await readFile(path.join(dir,'a.js'),'utf8'),'function f(){}');
  try {
   await symlink(path.join(dir,'a.js'),path.join(dir,'alias.js'));
   assert.equal(run(dir,['--path','a.js','--output','alias.js']).status,1);
   await writeFile(path.join(dir,'out.json'),'old');
   await symlink(path.join(dir,'out.json'),path.join(dir,'out-link.json'));
   assert.equal(run(dir,['--path','a.js','--output','out-link.json']).status,0);
   assert.equal(JSON.parse(await readFile(path.join(dir,'out-link.json'),'utf8')).functions[0].name,'f');
   assert.equal((await import('node:fs/promises')).lstat && (await (await import('node:fs/promises')).lstat(path.join(dir,'out-link.json'))).isSymbolicLink(),true);
  } catch (error) { if (!['EPERM','EACCES'].includes(error.code)) throw error; t.diagnostic('Symbolic links unavailable: ' + error.code); }
  try { await link(path.join(dir,'a.js'),path.join(dir,'hard.js')); assert.equal(run(dir,['--path','a.js','--output','hard.js']).status,1); }
  catch (error) { if (!['EPERM','EACCES'].includes(error.code)) throw error; t.diagnostic('Hard links unavailable: ' + error.code); }
  const preload = path.join(dir,'fail.mjs');
  await writeFile(preload, `import fs from 'node:fs'; import { syncBuiltinESMExports } from 'node:module'; fs.promises.rename = async () => { throw Error('forced rename failure'); }; syncBuiltinESMExports();`);
  const collision = path.join(dir, '.ccm-fixed.tmp');
  await writeFile(collision, 'other process');
  const collisionPreload = path.join(dir, 'collision.mjs');
  await writeFile(collisionPreload, `import crypto from 'node:crypto'; import { syncBuiltinESMExports } from 'node:module'; crypto.randomUUID = () => 'fixed'; syncBuiltinESMExports();`);
  const collisionResult = run(dir,['--path','a.js','--output','collision.json'],['--import',pathToFileURL(collisionPreload).href]);
  assert.equal(collisionResult.status,1);
  assert.equal(await readFile(collision,'utf8'),'other process');
  await rm(collision);
  const writePreload = path.join(dir, 'write-fail.mjs');
  await writeFile(writePreload, `import fs from 'node:fs'; import { syncBuiltinESMExports } from 'node:module'; const original = fs.promises.open; fs.promises.open = async (...args) => { const handle = await original(...args); handle.writeFile = async () => { throw Error('forced write failure'); }; return handle; }; syncBuiltinESMExports();`);
  for (const target of ['write-existing.json','write-missing.json']) {
   if (target.includes('existing')) await writeFile(path.join(dir,target),'old bytes');
   const result = run(dir,['--path','a.js','--output',target],['--import',pathToFileURL(writePreload).href]);
   assert.equal(result.status,1); assert.match(result.stderr,/forced write failure/);
   if (target.includes('existing')) assert.equal(await readFile(path.join(dir,target),'utf8'),'old bytes');
   else await assert.rejects(readFile(path.join(dir,target)),{code:'ENOENT'});
   assert.equal((await readdir(dir)).some(name => name.endsWith('.tmp')),false);
  }
  for (const target of ['existing.json','missing.json']) {
   if (target.startsWith('existing')) await writeFile(path.join(dir,target),'old bytes');
   const r = run(dir,['--path','a.js','--output',target],['--import',pathToFileURL(preload).href]);
   assert.equal(r.status,1); assert.match(r.stderr,/forced rename failure/); assert.equal(r.stdout,'');
   if (target.startsWith('existing')) assert.equal(await readFile(path.join(dir,target),'utf8'),'old bytes');
   else await assert.rejects(readFile(path.join(dir,target)),{code:'ENOENT'});
   assert.equal((await readdir(dir)).some(name => name.endsWith('.tmp')),false);
  }
 } finally { await rm(dir,{recursive:true,force:true}); }
});
