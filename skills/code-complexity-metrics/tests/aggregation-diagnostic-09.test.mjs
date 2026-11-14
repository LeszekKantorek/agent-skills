import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregate} from '../scripts/aggregation.mjs';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const range={startIndex:0,endIndex:1,startPosition:{row:0,column:0},endPosition:{row:0,column:1}};
function input(fileId) {
 const id=JSON.stringify([fileId,0]),root={type:'function_declaration',field:null,isNamed:true,...range,children:[],score:{cognitive:0,cyclomatic:1,statements:0}};
 const valid={code:'KNOWN',category:'parse',message:'known',fileId,range,owner:id,affectedMetrics:[],affectsFunctionDiscovery:false};
 return {fileId,source:{fileId,source:'f'},diagnostics:[],analysis:{tree:root,functions:[{id,name:'f',root}],ownerByNode:new Map([[root,id]]),diagnostics:[valid],presentation:{comments:[],unsafeCommentRanges:[],lineAnnotations:[{row:0,contentEndIndex:1,endIndex:1}]}}};
}
for(const category of ['parse','unsupported']) for(const producer of ['analysis','file']) test(`R09 diagnostic ${category} ${producer} requires source range`,()=>{
 for(const [suppliedRange,validRange] of [[null,false],[range,true],[{...range,endIndex:2},false]]) {
  const bad=input('C:/bad.js'),good=input('C:/good.js');good.analysis.diagnostics=[];
  const existing=bad.analysis.diagnostics[0], d={...existing,code:'TEST',category,range:suppliedRange,affectedMetrics:['statements']};
  (producer==='file'?bad:bad.analysis).diagnostics.push(d);
  const r=aggregate([bad,good]);
  assert.equal(r.files[0].analyzed,validRange);assert.equal(r.files[0].functionDiscoveryComplete,validRange);
  assert.equal(r.files[1].analyzed,true);assert.equal(r.files[1].functionDiscoveryComplete,true);
  assert.deepEqual(r.functions.map(f=>f.fileId),validRange?[bad.fileId,good.fileId]:[good.fileId]);
  assert.deepEqual(r.functions.at(-1).metrics,{cognitive:0,cyclomatic:1,statements:0});
  assert.deepEqual(r.diagnostics.find(x=>x.code==='KNOWN'),existing);
  assert.equal(r.diagnostics.some(x=>x.code==='TEST'),validRange);
  assert.equal(r.diagnostics.some(x=>x.code==='INVALID_ANALYSIS_CONTRACT'),!validRange);
  if(validRange) assert.deepEqual(r.functions[0].metrics,{cognitive:0,cyclomatic:0,statements:0});
 }
});
test('R09 unsupported extension retains input diagnostic without source range',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'metrics09-unsupported-'));
 try {const file=path.join(dir,'input.xyz');writeFileSync(file,'data');const cli=fileURLToPath(new URL('../scripts/measure.mjs',import.meta.url));const r=spawnSync(process.execPath,[cli,'--path',file],{encoding:'utf8'});assert.equal(r.status,1);assert.match(r.stderr,/UNSUPPORTED_LANGUAGE/);const report=JSON.parse(r.stdout);assert.deepEqual(report.diagnostics.map(d=>[d.error.split(':')[0],d.name,d.location]),[['UNSUPPORTED_LANGUAGE',null,path.relative(process.cwd(),file).replaceAll('\\','/')+':0:0:null']]);assert.equal(report.files[0].analyzed,false);assert.equal(report.summary.function_discovery_complete,false)} finally {rmSync(dir,{recursive:true,force:true})}
});

test('R09 malformed global diagnostics preserve valid global and independent file',()=>{
 const valid={code:'GLOBAL',category:'input',message:'global',fileId:null,range:null,owner:null,affectedMetrics:[],affectsFunctionDiscovery:false};
 const invalid=[null,{...valid,fileId:'x'},{...valid,owner:'x'},{...valid,range},{...valid,category:'parse'},{...valid,affectedMetrics:['unknown']}];
 for(const bad of invalid){const good=input('C:/good.js');good.analysis.diagnostics=[];const r=aggregate([good],[valid,bad]);assert.deepEqual(r.files,[{fileId:good.fileId,analyzed:true,functionDiscoveryComplete:true}]);assert.deepEqual(r.functions[0].metrics,{cognitive:0,cyclomatic:1,statements:0});assert.deepEqual(r.diagnostics[0],valid);assert.deepEqual(r.diagnostics[1],{code:'INVALID_ANALYSIS_CONTRACT',category:'internal',message:'Invalid global diagnostic',fileId:null,range:null,owner:null,affectedMetrics:[],affectsFunctionDiscovery:true});assert.equal(r.functionDiscoveryComplete,false);assert.equal(r.hasErrors,true)}
 const good=input('C:/good.js');good.analysis.diagnostics=[];
 const wrongContainer=aggregate([good],valid);
 assert.deepEqual(wrongContainer.functions[0].metrics,{cognitive:0,cyclomatic:1,statements:0});
 assert.deepEqual(wrongContainer.diagnostics,[{code:'INVALID_ANALYSIS_CONTRACT',category:'internal',message:'Invalid global diagnostic',fileId:null,range:null,owner:null,affectedMetrics:[],affectsFunctionDiscovery:true}]);
 assert.equal(wrongContainer.functionDiscoveryComplete,false);
});
