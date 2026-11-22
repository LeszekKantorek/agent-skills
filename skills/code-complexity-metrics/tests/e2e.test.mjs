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
const run=(...args)=>spawnSync(process.execPath,[script,...args],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});
const hash=async file=>createHash('sha256').update(await readFile(file)).digest('hex');
test('pinned clone: deterministic output, manual examples, output file and unchanged sources',async t=>{
 const rev=spawnSync('git',['-C',clone,'rev-parse','HEAD'],{encoding:'utf8'});
 if(rev.status!==0 || rev.stdout.trim()!=='3e8fd243938e80083e6629fe53d72591b2f1bbba') {t.skip('Pinned local clone unavailable');return}
 const targets=['web/helpers.js','web/telemetry/validation.js','src/http/sse.rs'];
 const before=await Promise.all(targets.map(f=>hash(path.join(clone,f))));
 const args=targets.flatMap(f=>['--path',path.join(clone,f)]);
 const a=run(...args), b=run(...args); assert.equal(a.status,0);assert.equal(b.status,0);assert.equal(a.stdout,b.stdout);
 const report=JSON.parse(a.stdout);
 // events: if at closure depth +2, else +1, nested match +3.
 const expected={clamp:0,svgElement:1,setAttributes:1,validHeading:2,events:6};
 for(const [name,expectedScore] of Object.entries(expected)) {
  const m=report.functions.find(f=>f.name===name)?.metrics;
  assert.equal(m?.cognitive_complexity,expectedScore,name);
 }
 // return Math.max(min, Math.min(max, value))
 const clamp=report.functions.find(f=>f.name==='clamp');
 assert.deepEqual(clamp.halstead_counts,{n1:5,n2:7,eta1:3,eta2:4});
 assert.equal(clamp.metrics.halstead_volume,12*Math.log2(7));
 // The local definition and the written DOM member both contribute to Fan-Out.
 const svg=report.functions.find(f=>f.name==='svgElement');
 const setAttributes=report.functions.find(f=>f.name==='setAttributes');
 assert.equal(svg.metrics.fan_in,24);
 assert.equal(svg.call_graph.fan_in.callers_count,24);
 assert.equal(svg.call_graph.fan_in.callers.length,24);
 assert.equal(svg.metrics.fan_out,2);
 assert.equal(svg.metrics.instability,2/26);
 assert.deepEqual(svg.call_graph.fan_out,{
  unresolved_count: 1,
  unresolved_calls: [{
   location: svg.location.replace(/:\d+:\d+:\d+$/u, ':6:19'),
   call: 'document.createElementNS',
   reasons: ['dynamic-member'],
  }],
 });
 // Callers in the rest of the checkout count even though only three files appear in the report.
 assert.equal(setAttributes.metrics.fan_in,22);
 assert.equal('call_graph' in report.summary,false);
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
 const a=run(...args),b=run(...args);assert.equal(a.status,0);assert.equal(b.status,0);assert.equal(a.stdout,b.stdout);
 const report=JSON.parse(a.stdout);
 const owner=report.functions.find(f=>f.name==='native_owners_cannot_cross_threads_or_be_shared');
 assert.ok(owner); assert.equal(owner.error,null); assert.equal(owner.metrics.cognitive_complexity,0);
 assert.ok(!report.diagnostics.some(d=>d.name==='native_owners_cannot_cross_threads_or_be_shared'));
 assert.equal(report.summary.files,68);assert.equal(paths.filter(f=>f.endsWith('.rs')).length,34);assert.equal(paths.filter(f=>f.endsWith('.js')).length,34);
 assert.equal('analyzed_files' in report,false);
 assert.deepEqual(await Promise.all(paths.map(hash)),before);
});
