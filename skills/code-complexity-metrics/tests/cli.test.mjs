import {explainRow} from './explain-rows.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
const script=fileURLToPath(new URL('../scripts/measure.mjs',import.meta.url));
const run=(cwd,...args)=>spawnSync(process.execPath,[script,...args],{cwd,encoding:'utf8'});
test('CLI preserves broken files and filters outer after analysis',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'metrics-'));
 try {
  await writeFile(path.join(dir,'good.js'),'function one(){if(x){save();}} function two(){}');
  await writeFile(path.join(dir,'bad.rs'),'fn good() {} fn bad( {');
  await writeFile(path.join(dir,'other.xyz'),'x');
  const r=run(dir,'--path','good.js','--path','bad.rs','--path','other.xyz','--filter','one');
  assert.equal(r.status,1); const report=JSON.parse(r.stdout);
  assert.deepEqual(report.summary,{files:3,functions_found:3,functions_presented:1,function_discovery_complete:false,has_errors:true});
  assert.deepEqual(Object.keys(report.functions[0]),['name','location','metrics','halstead_counts','call_graph','error']);
  assert.equal(report.functions[0].location,'good.js:1:1:30');
  assert.equal(report.functions[0].metrics.cognitive_complexity,1);
  assert.equal('analyzed_files' in report,false);
 } finally {await rm(dir,{recursive:true,force:true})}
});
test('explain forces markdown and output writes JSON',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'metrics-'));
 try {
  await writeFile(path.join(dir,'a.js'),'function f(){ // original\n if(x){save();}\n}');
  const r=run(dir,'--path','a.js','--format','json','--explain');
  assert.equal(r.status,0); assert.match(r.stdout,/```javascript/); assert.doesNotMatch(r.stdout,/original/);
  assert.match(r.stdout,/Cognitive: 1/);
  const w=run(dir,'--path','a.js','--format','json','--output','result.json');
  assert.equal(w.status,0); assert.equal(w.stdout,'');
  assert.equal(JSON.parse(await readFile(path.join(dir,'result.json'),'utf8')).functions[0].name,'f');
 } finally {await rm(dir,{recursive:true,force:true})}
});
test('CSV format writes filtered metrics and explain still produces Markdown',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'metrics-'));
 try {
  await writeFile(path.join(dir,'a,b.js'),'function process(){save();} function other(){}');
  const r=run(dir,'--path','a,b.js','--format','csv','--filter','proc','--output','report.csv');
  assert.equal(r.status,0);assert.equal(r.stdout,'');
  const csv=await readFile(path.join(dir,'report.csv'),'utf8');
  assert.match(csv,/^# Code Complexity Metrics\n# Files: 1 · Functions: 1 of 2\n/);
  assert.match(csv,/Name,Location,Cognitive,Halstead Volume,Fan-In,Fan-Out,Instability,Error\nprocess,"a,b\.js:1:1:27",0,2\.00,0,1,1\.00,None\n$/);
  const explained=run(dir,'--path','a,b.js','--format','csv','--explain');
  assert.equal(explained.status,0);assert.match(explained.stdout,/Files: 1; functions found: 2; functions presented: 2;/);assert.match(explained.stdout,/```javascript/);
 } finally {await rm(dir,{recursive:true,force:true})}
});
test('explain increments sum to reported metrics, including operator lines',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'metrics-'));
 try {
  await writeFile(path.join(dir,'a.js'),'function process(a){\n if(a){\n  const inner=()=>{\n   if(ready()){save();}\n  };\n }\n}');
  const r=run(dir,'--path','a.js','--explain'); assert.equal(r.status,0);
  assert.match(r.stdout,/Cognitive: 4/);
  const json=run(dir,'--path','a.js'); assert.equal(json.status,0);
  const {halstead_counts}=JSON.parse(json.stdout).functions[0];
  const body=r.stdout.split('```javascript\n')[1].split('\n```')[0];
  let total=0;
  const halstead=[0,0,0,0];
  for(const line of body.split('\n').slice(1)) {
   const annotation=explainRow(line);
   assert.ok(annotation,line);
   total+=annotation.cognitive;
   for (let i=0;i<halstead.length;i++) halstead[i]+=annotation.halstead[i];
  }
  assert.equal(total,4);
  assert.deepEqual(halstead,[halstead_counts.n1,halstead_counts.n2,halstead_counts.eta1,halstead_counts.eta2]);
 } finally {await rm(dir,{recursive:true,force:true})}
});
test('explain shows increments for an outer inside template interpolation',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'metrics-'));
 try {
  await writeFile(path.join(dir,'a.js'),'const x = `start\n${() => {\n if(a) {}\n}}\nend`;');
  const r=run(dir,'--path','a.js','--explain'); assert.equal(r.status,0);
  assert.match(r.stdout,/if\(a\) \{\}/);assert.match(r.stdout,/Wiersz 3: Cognitive: \+1/);
 } finally {await rm(dir,{recursive:true,force:true})}
});
test('scoring comments remain outside multiline literals',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'metrics-'));
 try {
  await writeFile(path.join(dir,'a.js'),'function f(){\n const s = `first\nsecond\nlast`;\n return s;\n}');
  const r=run(dir,'--path','a.js','--explain');assert.equal(r.status,0);
  assert.match(r.stdout,/`first\nsecond\nlast`; +\| +0 +\|/);
  assert.match(r.stdout,/Wiersz 2:/);assert.match(r.stdout,/Wiersz 3:/);
 } finally {await rm(dir,{recursive:true,force:true})}
});
test('filter matches prefixes, preserves every matching outer and does not hide errors',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'metrics-'));
 try {
  await writeFile(path.join(dir,'a.js'),Array.from({length:12},()=>'{ function process(){} }').join('\n')+'\nfunction Process(){}');
  await writeFile(path.join(dir,'bad.js'),'function ok(){} function broken( {');
  const r=run(dir,'--path','a.js','--path','bad.js','--filter','process|process');
  assert.equal(r.status,1); const report=JSON.parse(r.stdout);
  assert.equal(report.summary.functions_found,14);assert.equal(report.summary.functions_presented,12);
  assert.ok(report.functions.every(f=>f.name==='process'));
  assert.deepEqual(report.functions.map(f=>Number(f.location.split(':').at(-3))),Array.from({length:12},(_,i)=>i+1));
  assert.equal('analyzed_files' in report,false);
 } finally {await rm(dir,{recursive:true,force:true})}
});
test('filter selects name prefixes and presents only their files in JSON and Markdown',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'metrics-'));
 try {
  await writeFile(path.join(dir,'a.js'),'function process(){} function processExtra(){} function Process(){}');
  await writeFile(path.join(dir,'b.js'),'function save(){}');
  await writeFile(path.join(dir,'c.js'),'function other(){}');
  const args=['--path','*.js','--filter','proc|sav'];
  const json=run(dir,...args,'--format','json'); assert.equal(json.status,0);
  const report=JSON.parse(json.stdout);
  assert.deepEqual(report.functions.map(f=>f.name),['process','processExtra','save']);
  assert.deepEqual([...new Set(report.functions.map(f=>f.location.split(':').slice(0,-3).join(':')))],['a.js','b.js']);
  assert.deepEqual(report.summary,{files:3,functions_found:5,functions_presented:3,function_discovery_complete:true,has_errors:false});
  for(const mode of [['--format','markdown'],['--explain']]) {
   const md=run(dir,...args,...mode); assert.equal(md.status,0);
   assert.match(md.stdout,/a\.js/); assert.match(md.stdout,/b\.js/); assert.doesNotMatch(md.stdout,/c\.js/);
  }
  const none=JSON.parse(run(dir,'--path','*.js','--filter','missing').stdout);
  assert.equal('analyzed_files' in none,false); assert.deepEqual(none.functions,[]);
  assert.deepEqual(none.summary,{files:3,functions_found:5,functions_presented:0,function_discovery_complete:true,has_errors:false});
 } finally {await rm(dir,{recursive:true,force:true})}
});
test('empty input and malformed arguments use expected exit codes',()=>{
 const empty=run(os.tmpdir());assert.equal(empty.status,0);assert.deepEqual(JSON.parse(empty.stdout).summary,{files:0,functions_found:0,functions_presented:0,function_discovery_complete:true,has_errors:false});
 const csv=run(os.tmpdir(),'--format','csv');
 assert.equal(csv.status,0,csv.stderr);
 assert.deepEqual(csv.stdout.split('\n').slice(1),['# Files: 0 · Functions: 0','# Version: 20261122.0.0','Name,Location,Cognitive,Halstead Volume,Fan-In,Fan-Out,Instability,Error','']);
 const md=run(os.tmpdir(),'--format','markdown');
 assert.equal(md.status,0,md.stderr);
 assert.match(md.stdout,/^Files: 0 · Functions: 0$/m);
 assert.match(md.stdout,/^\| Name \| Location \| Cognitive \| Halstead Volume \| Fan-In \| Fan-Out \| Instability \| Error \|$/m);
 assert.equal(run(os.tmpdir(),'--path').status,1);assert.equal(run(os.tmpdir(),'--format','xml').status,1);
});
test('missing literal file aborts publication alongside valid files',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'metrics-'));
 try {
  await writeFile(path.join(dir,'a.js'),'function a(){}');await writeFile(path.join(dir,'z.rs'),'fn z(){}');
  const r=run(dir,'--path','a.js','--path','missing.rs','--path','z.rs');
  assert.equal(r.status,1); assert.equal(JSON.parse(r.stdout).functions.length,2); assert.match(r.stderr,/missing\.rs/);
 } finally {await rm(dir,{recursive:true,force:true})}
});
test('UC-14 public CLI compares equivalent Rust and JS with manual expectations',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'metrics-'));
 try {
  await writeFile(path.join(dir,'a.js'),'function f(){if(a){const g=()=>{if(b){if(c){work();}}};}}');
  await writeFile(path.join(dir,'b.rs'),'fn f(){if a {let g=||{if b {if c {work();}}};}}');
  const r=run(dir,'--path','*.js','--path','*.rs','--format','json');assert.equal(r.status,0);
  const report=JSON.parse(r.stdout); assert.deepEqual(report.summary,{files:2,functions_found:2,functions_presented:2,function_discovery_complete:true,has_errors:false});
  for(const item of report.functions) assert.equal(item.metrics.cognitive_complexity,8);
 } finally {await rm(dir,{recursive:true,force:true})}
});
test('UC-15 assigns logical operators to their lines and sums increments',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'metrics-'));
 try {
  await writeFile(path.join(dir,'a.js'),'function f(){\n return a &&\n b ||\n c;\n}');
  const r=run(dir,'--path','a.js','--explain','--format','json');assert.equal(r.status,0);
  const rows=r.stdout.split('\n').map(explainRow).filter(Boolean);
  assert.deepEqual(rows.slice(1,3), [
   {fragment:' return a &&',cognitive:1,halstead:[2,1,2,1],fanOut:0,error:undefined},
   {fragment:' b ||',cognitive:1,halstead:[1,1,1,1],fanOut:0,error:undefined},
  ]);
  assert.match(r.stdout,/Cognitive: 2/);
 } finally {await rm(dir,{recursive:true,force:true})}
});
test('UC-09/16 JSON and Markdown present the same selected names and totals',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'metrics-'));
 try {
  await writeFile(path.join(dir,'a.js'),'function process(){save();} const save=()=>{}; export default ()=>{};');
  const json=run(dir,'--path','a.js','--filter','process|save','--format','json');
  const md=run(dir,'--path','a.js','--filter','process|save','--format','markdown');
  assert.equal(json.status,0);assert.equal(md.status,0);const report=JSON.parse(json.stdout);
  assert.deepEqual(report.summary,{files:1,functions_found:3,functions_presented:2,function_discovery_complete:true,has_errors:false});
  assert.deepEqual(report.functions.map(f=>f.name),['process','save']);
  assert.match(md.stdout,/^Files: 1 · Functions: 2 of 3$/m);
  assert.match(md.stdout,/^\| Name \| Location \| Cognitive \| Halstead Volume \| Fan-In \| Fan-Out \| Instability \| Error \|$/m);
  assert.match(md.stdout,/^\| process \| a\.js:1:1:27 \| 0 \| 2\.00 \| 0 \| 1 \| 1\.00 \| None \|$/m);
  assert.match(md.stdout,/^\| save \| a\.js:[^|]+\| 0 \| 0\.00 \| 1 \| 0 \| 0\.00 \| None \|$/m);
  assert.doesNotMatch(md.stdout,/Analyzed files:/);
  const none=run(dir,'--path','a.js','--filter','null');assert.equal(JSON.parse(none.stdout).summary.functions_presented,0);
 } finally {await rm(dir,{recursive:true,force:true})}
});
test('UC-15 removes comments while preserving literals, Unicode and CRLF',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'metrics-'));
 try {
  await writeFile(path.join(dir,'a.js'),'function f(){\r\n const s="ż // literal"; /* remove me */\r\n const r=/\\/\\//; // remove me too\r\n return s;\r\n}');
  const r=run(dir,'--path','a.js','--explain');assert.equal(r.status,0);
  assert.match(r.stdout,/ż \/\/ literal/);assert.match(r.stdout,/\/\\\/\\\/\//);assert.doesNotMatch(r.stdout,/remove me/);
  assert.match(r.stdout,/Cognitive: 0/);
 } finally {await rm(dir,{recursive:true,force:true})}
});
