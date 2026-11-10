import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,writeFile,readFile,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
const skill=fileURLToPath(new URL('../',import.meta.url));
test('clean copy runs twice with network calls blocked and no installation',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'metrics-offline-'));
 try {
  await cp(skill,path.join(dir,'skill'),{recursive:true});
  await writeFile(path.join(dir,'input.rs'),'fn f(){if a {save();}}');
  await writeFile(path.join(dir,'offline.mjs'),"import net from 'node:net'; import http from 'node:http'; import https from 'node:https'; net.connect=net.createConnection=()=>{throw Error('network blocked')};http.request=https.request=()=>{throw Error('network blocked')};globalThis.fetch=()=>{throw Error('network blocked')};");
  const args=['--import','./offline.mjs','./skill/scripts/measure.mjs','--path','input.rs'];
  const first=spawnSync(process.execPath,args,{cwd:dir,encoding:'utf8'});
  const second=spawnSync(process.execPath,args,{cwd:dir,encoding:'utf8'});
  assert.equal(first.status,0);assert.equal(second.status,0);assert.equal(first.stdout,second.stdout);
  const metrics=JSON.parse(first.stdout).functions[0].metrics;
  assert.deepEqual(metrics,{cognitive_complexity:1,statement_count:2,cyclomatic_complexity:2});
  await rm(path.join(dir,'skill','vendor','tree-sitter','tree-sitter-rust.wasm'));
  const missing=spawnSync(process.execPath,args,{cwd:dir,encoding:'utf8'});
  assert.equal(missing.status,1);
 } finally {await rm(dir,{recursive:true,force:true})}
});
