import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
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
