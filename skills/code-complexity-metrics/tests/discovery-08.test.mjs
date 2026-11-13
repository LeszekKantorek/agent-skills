import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
const cli=fileURLToPath(new URL('../scripts/measure.mjs',import.meta.url));
test('E08 module macro discovery and independent outer survive every format and empty filter',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'metrics08-'));
 try {
  const source='unknown! { fn hidden() {} => custom } fn good(){a();}';
  await writeFile(path.join(dir,'input.rs'),source);
  const run=(...args)=>spawnSync(process.execPath,[cli,'--path','input.rs',...args],{cwd:dir,encoding:'utf8'});
  const json=run();assert.equal(json.status,1,json.stderr);
  const report=JSON.parse(json.stdout);
  assert.equal(report.summary.function_discovery_complete,false);
  assert.deepEqual(report.functions.map(f=>f.name),['good']);
  assert.deepEqual(Object.values(report.functions[0].metrics),[0,1,1]);
  assert.equal(report.diagnostics.length,1);
  const d=report.diagnostics[0];
  assert.equal(d.code,'rust-unsupported-macro-arguments');assert.equal(d.owner,null);assert.equal(d.affectsFunctionDiscovery,true);
  assert.deepEqual([d.range.startIndex,d.range.endIndex],[0,37]);
  for(const args of [[],['--filter','none']]) for(const format of ['json','markdown','csv','explain']) {
   const r=run(...args,...(format==='explain'?['--explain']:['--format',format]));
   assert.equal(r.status,1,`${format} ${args}`);
   if(format==='json') {
    const j=JSON.parse(r.stdout);assert.equal(j.summary.function_discovery_complete,false);
    assert.equal(j.functions.length,args.length?0:1);assert.equal(j.diagnostics[0].owner,null);
    assert.equal(j.diagnostics[0].code,d.code);assert.equal(j.diagnostics[0].affectsFunctionDiscovery,true);
   } else assert.ok((format==='csv'?r.stderr:r.stdout).includes(d.code),`${format} diagnostic`);
  }
 } finally {await rm(dir,{recursive:true,force:true})}
});
