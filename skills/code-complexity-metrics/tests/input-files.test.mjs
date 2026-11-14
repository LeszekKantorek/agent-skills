import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import { inputFiles, languageFor } from '../scripts/input-files.mjs';

test('globs select only requested files and deduplicate literals', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'complexity-'));
  try {
    await mkdir(path.join(root, 'ż test'));
    await mkdir(path.join(root, '.hidden'));
    for (const name of ['a.rs', 'a.js', 'ż test/b.rs', 'ż test/generated.js', '.hidden/ignored.rs'])
      await writeFile(path.join(root, name), '');
    const relative = files => files.map(f => path.relative(root, f).replaceAll('\\', '/')).sort();
    assert.deepEqual(relative(await inputFiles(['*.rs'], root)), ['a.rs']);
    assert.deepEqual(relative(await inputFiles(['**/*.rs', 'a.rs'], root)), ['.hidden/ignored.rs', 'a.rs', 'ż test/b.rs']);
    assert.deepEqual(relative(await inputFiles(['ż test/*.js', 'missing.rs', '*.none'], root)), ['missing.rs', 'ż test/generated.js']);
    assert.equal(languageFor('a.rs'), 'rust');
    assert.equal(languageFor('a.js'), 'javascript');
    assert.equal(languageFor('a.xyz'), null);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('same Windows file with different casing is selected once', {skip: process.platform !== 'win32'}, async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'metrics-'));
 try {
  await writeFile(path.join(root,'Sample.js'),'');
  const files=await inputFiles(['Sample.js','sample.js'],root);
  assert.equal(files.length,1);
  for (const patterns of [['Sample.js','Sample.JS'],['Sample.JS','Sample.js'],['SAMPLE.JS','sample.js']]) {
   const selected=await inputFiles(patterns,root);
   assert.equal(selected.length,1);
   assert.equal(languageFor(selected[0]),'javascript');
  }
 } finally {await rm(root,{recursive:true,force:true})}
});

test('glob validation precedes resolution and missing traversal is quiet', async () => {
 const root=await mkdtemp(path.join(os.tmpdir(),'glob[-'));
 try {
  await writeFile(path.join(root,'one.js'),'');
  const errors=[];
  assert.deepEqual(await inputFiles(['*.js', 'one.js/*.js', 'missing/**/*.js', 'absent.js'],root,errors),[path.join(root,'absent.js'),path.join(root,'one.js')]);
  assert.deepEqual(errors,[]);
  const invalid='[z-a]/../*.js';
  assert.deepEqual(await inputFiles([invalid],root,errors),[]);
  assert.equal(errors.length,1); assert.equal(errors[0].file,invalid);
 } finally {await rm(root,{recursive:true,force:true});}
});
test('recursive glob terminates at symlink cycles and deduplicates aliases', async t => {
 const base=fileURLToPath(new URL('../../../.local/code-complexity-metrics-evidence/',import.meta.url));
 await mkdir(base,{recursive:true});
 const root=await mkdtemp(path.join(base,'glob-cycle-'));
 try {
  await mkdir(path.join(root,'dir')); await writeFile(path.join(root,'dir','file.js'),'');
  try { await symlink('..',path.join(root,'dir','cycle'),'dir'); }
  catch (e) { if (['EPERM','EACCES','ENOSYS'].includes(e.code)) {t.skip('symlinks unavailable'); return;} throw e; }
  const errors=[];
  assert.deepEqual(await inputFiles(['**/*.js'],root,errors),[path.join(root,'dir','file.js')]);
  const files=await inputFiles(['**/*.js','dir/file.js'],root,errors);
  assert.deepEqual(files,[path.join(root,'dir','file.js')]); assert.deepEqual(errors,[]);
 } finally {await rm(root,{recursive:true,force:true});}
});
