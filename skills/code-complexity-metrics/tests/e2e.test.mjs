import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {inputFiles} from '../scripts/input-files.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const script=fileURLToPath(new URL('../scripts/measure.mjs',import.meta.url));
const clone=path.join(root,'.local','msfs2024-artificial-horizon');
const run=(...args)=>spawnSync(process.execPath,[script,...args],{cwd:root,encoding:'utf8'});
const hash=async file=>createHash('sha256').update(await readFile(file)).digest('hex');
test('pinned clone: deterministic output, manual examples, output file and unchanged sources',async t=>{
 const rev=spawnSync('git',['-C',clone,'rev-parse','HEAD'],{encoding:'utf8'});
 if(rev.status!==0 || rev.stdout.trim()!=='3e8fd243938e80083e6629fe53d72591b2f1bbba') {t.skip('Pinned local clone unavailable');return}
 const targets=['web/helpers.js','web/telemetry/validation.js','src/http/sse.rs'];
 const before=await Promise.all(targets.map(f=>hash(path.join(clone,f))));
 const args=targets.flatMap(f=>['--path',path.join(clone,f)]);
 const a=run(...args), b=run(...args); assert.equal(a.status,0);assert.equal(b.status,0);assert.equal(a.stdout,b.stdout);
 const report=JSON.parse(a.stdout);
 // Manual counts: clamp return+2 calls; svgElement 1 declaration+2 calls+if+assignment+return;
 // setAttributes loop+binding+2 calls; validHeading return+call+choice+2 branch values.
 // events: if at closure depth +2, else +1, nested match +3; base+if+2 arms.
 // Its 34 statements are 4 declarators, 1 async block, 1 if, 1 match,
 // 4 implicit returns, 1 explicit return, and 22 calls.
 const expected={clamp:[0,3,1],svgElement:[1,6,2],setAttributes:[1,4,2],validHeading:[2,5,4],events:[6,34,4]};
 for(const [name,values] of Object.entries(expected)) {
  const m=report.functions.find(f=>f.name===name)?.metrics;
  assert.deepEqual([m.cognitive_complexity,m.statement_count,m.cyclomatic_complexity],values,name);
 }
 const temp=await mkdtemp(path.join(os.tmpdir(),'metrics-e2e-'));
 try {
  const dest=path.join(temp,'report.json');const result=run(...args,'--format','json','--output',dest);
  assert.equal(result.status,0);assert.deepEqual(JSON.parse(await readFile(dest,'utf8')),report);
 } finally {await rm(temp,{recursive:true,force:true})}
 assert.deepEqual(await Promise.all(targets.map(f=>hash(path.join(clone,f)))),before);
});
test('pinned clone glob scope covers both languages and remains deterministic',async t=>{
 const rev=spawnSync('git',['-C',clone,'rev-parse','HEAD'],{encoding:'utf8'});
 if(rev.status!==0 || rev.stdout.trim()!=='3e8fd243938e80083e6629fe53d72591b2f1bbba') {t.skip('Pinned local clone unavailable');return}
 const args=['--path',path.join(clone,'**','*.rs'),'--path',path.join(clone,'**','*.js')];
 const paths=await inputFiles([path.join(clone,'**','*.rs'),path.join(clone,'**','*.js')]);
 const before=await Promise.all(paths.map(hash));
 const a=run(...args),b=run(...args);assert.equal(a.status,1);assert.equal(b.status,1);assert.equal(a.stdout,b.stdout);
 const report=JSON.parse(a.stdout);
 assert.equal(report.summary.has_errors,true);assert.equal(report.summary.function_discovery_complete,false);assert.ok(report.diagnostics.some(d=>d.code==='rust-unsupported-macro-arguments' && d.owner!==null));
 assert.equal(report.summary.files,68);assert.equal(paths.filter(f=>f.endsWith('.rs')).length,34);assert.equal(paths.filter(f=>f.endsWith('.js')).length,34);
 assert.equal('analyzed_files' in report,false);
 assert.deepEqual(await Promise.all(paths.map(hash)),before);
});
