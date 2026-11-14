import {fileURLToPath} from 'node:url';
import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,writeFile,readFile,symlink,rm} from 'node:fs/promises';import path from 'node:path';import {spawnSync} from 'node:child_process';
const cli=fileURLToPath(new URL('../scripts/measure.mjs',import.meta.url)),base=fileURLToPath(new URL('../../../.local/code-complexity-metrics-evidence/',import.meta.url));
test('symbolic alias in either input/output direction preserves exact bytes',async()=>{const dir=await mkdtemp(path.join(base,'step07-alias-'));try{const file=path.join(dir,'original.js'),alias=path.join(dir,'alias.js'),bytes=Buffer.from('function f(){return "😀";}\r\n');await writeFile(file,bytes);await symlink(file,alias,'file');for(const [input,output] of [[file,alias],[alias,file]]){const result=spawnSync(process.execPath,[cli,'--path',input,'--output',output],{encoding:'utf8'});assert.equal(result.status,1,result.stderr);assert.deepEqual(await readFile(file),bytes);assert.deepEqual(await readFile(alias),bytes)}}finally{await rm(dir,{recursive:true,force:true})}});

test('dangling input links and directory links cannot become partial report destinations',async t=>{
 const dir=await mkdtemp(path.join(base,'step07-dangling-'));
 try {
  const good=path.join(dir,'good.js'), alias=path.join(dir,'input.js'), target=path.join(dir,'gap.js');
  await writeFile(good,'function good(){}');
  try { await symlink('gap.js',alias,'file'); } catch(e) { if(['EPERM','EACCES'].includes(e.code)) { t.skip('symbolic links unavailable'); return; } throw e; }
  const run=(input,output)=>spawnSync(process.execPath,[cli,'--path',good,'--path',input,'--output',output],{encoding:'utf8'});
  let r=run(alias,target); assert.equal(r.status,1); assert.match(r.stderr,/READ_ERROR/); assert.match(r.stderr,/aliases an input/); await assert.rejects(readFile(target),{code:'ENOENT'});
  const {mkdir}=await import('node:fs/promises'); await mkdir(path.join(dir,'real')); await symlink('real',path.join(dir,'linked'),'dir');
  await symlink('../gap.js',path.join(dir,'real','nested.js'),'file');
  r=run(path.join(dir,'linked','nested.js'),target); assert.equal(r.status,1); assert.match(r.stderr,/aliases an input/); await assert.rejects(readFile(target),{code:'ENOENT'});
  r=run(alias,path.join(dir,'report.json')); assert.equal(r.status,1); assert.equal(JSON.parse(await readFile(path.join(dir,'report.json'),'utf8')).functions[0].name,'good');
 } finally { await rm(dir,{recursive:true,force:true}); }
});
