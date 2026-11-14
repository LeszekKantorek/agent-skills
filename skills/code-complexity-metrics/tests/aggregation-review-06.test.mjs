import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregate} from '../scripts/aggregation.mjs';
import {outerId} from '../scripts/analyzers/contracts.mjs';
import {parse} from '../scripts/parser.mjs';
import {analyzerFor} from '../scripts/analyzers/registry.mjs';
const score=(c=0,y=0,s=0)=>({cognitive:c,cyclomatic:y,statements:s});
async function file(source='function f(){}', lang='javascript', id='C:/f.js') {const p=await parse(source,lang);try{return {fileId:id,source:{fileId:id,source},analysis:analyzerFor(lang).analyze(p.tree,source,id),diagnostics:[]}}finally{p.dispose()}}
const diag=(id,owner,discovery=false)=>({code:'X',category:'parse',message:'problem',fileId:id,range:{startIndex:0,endIndex:1,startPosition:{row:0,column:0},endPosition:{row:0,column:1}},owner,affectedMetrics:['statements'],affectsFunctionDiscovery:discovery});
const reorder=o=>Object.fromEntries(Object.entries(o).reverse().map(([k,v])=>[k,v && !Array.isArray(v) && typeof v==='object' ? reorder(v) : v]));
test('R06-01 semantic merge retains multiplicity and distinct owners',async()=>{
 const f=await file('function f(){} function g(){}'), [a,b]=f.analysis.functions.map(f=>f.id), d=diag(f.fileId,a), other=diag(f.fileId,b);f.diagnostics=[d];f.analysis.diagnostics=[reorder(d),reorder(d),other];const r=aggregate([f]);assert.equal(r.diagnostics.length,3);assert.equal(r.diagnostics.filter(x=>x.owner===a).length,2);assert.equal(r.functions[0].metrics.statements,0);assert.equal(r.functions[1].metrics.statements,0);assert.equal(r.functionDiscoveryComplete,true);
});
test('R06-02 malformed diagnostics reject only their file',async()=>{
 for(const mutate of [f=>delete f.analysis.diagnostics[0].affectedMetrics,f=>f.analysis.diagnostics={},f=>f.analysis.diagnostics[0].owner='missing',f=>f.analysis.diagnostics[0].fileId='C:/other.js']) {
  const f=await file(), ok=await file('function good(){a();}','javascript','C:/ok.js');f.diagnostics=[diag(f.fileId,null)];f.analysis.diagnostics=[diag(f.fileId,f.analysis.functions[0].id)];mutate(f);const r=aggregate([f,ok]);assert.equal(r.files[0].analyzed,false);assert.equal(r.functions.length,1);assert.equal(r.functions[0].name,'good');assert.deepEqual(r.functions[0].metrics,score(0,1,1));assert.ok(r.diagnostics.some(d=>d.code==='INVALID_ANALYSIS_CONTRACT'));assert.ok(r.diagnostics.some(d=>d.code==='X' && d.owner===null));
 }
 const f=await file();f.analysis=null;const r=aggregate([f]);assert.equal(r.files[0].analyzed,false);assert.equal(r.diagnostics[0].category,'internal');
});
test('R06-03 and R06-04 reject invalid ID, range, source and presentation atomically',async()=>{
 const mutations=[f=>{const a=f.analysis.functions[0], old=a.id; a.id=outerId('C:/other.js',0);for(const [n,v] of f.analysis.ownerByNode) if(v===old)f.analysis.ownerByNode.set(n,a.id)},f=>f.analysis.functions[0].root.startPosition={row:2,column:0},f=>f.analysis.functions[0].root.endIndex++,f=>delete f.analysis.presentation,f=>f.analysis.presentation={comments:[],unsafeCommentRanges:[],lineAnnotations:[]},f=>f.source=null,f=>f.source.fileId='C:/other.js',f=>f.source.source='',f=>f.analysis.ownerByNode.delete([...f.analysis.ownerByNode.keys()].at(-1))];
 for(const mutate of mutations){const f=await file(), ok=await file('function good(){}','javascript','C:/ok.js');mutate(f);const r=aggregate([f,ok]);assert.equal(r.files[0].analyzed,false);assert.equal(r.files[0].functionDiscoveryComplete,false);assert.equal(r.functions.length,1);assert.equal(r.functions[0].name,'good');assert.ok(r.diagnostics.some(d=>d.category==='internal'));}
 const f=await file();assert.equal(aggregate([f]).files[0].analyzed,true);
});
test('global discovery and empty functions retain presentation',async()=>{
 for(const discovery of [false,true]) {const d={...diag(null,null,discovery),category:'input',range:null};for(const inputs of [[],[await file()]]){const r=aggregate(inputs,[d]);assert.equal(r.functionDiscoveryComplete,!discovery);assert.equal(r.hasErrors,true);}}
 const f=await file('let a=1;');f.analysis.diagnostics.push(diag(f.fileId,null));const r=aggregate([f]);assert.equal(r.functions.length,0);assert.equal(r.sources.get(f.fileId),f.source);assert.equal(r.presentation.get(f.fileId),f.analysis.presentation);assert.equal(r.diagnostics.length,1);
});
test('R06-05 Rust recovered outer receives parse diagnostic; sibling remains complete',async()=>{
 const f=await file('(fn a(){} fn b(){x();});\nfn good(){a();}','rust','C:/f.rs'), r=aggregate([f]);const b=r.functions.find(x=>x.name==='b'), good=r.functions.find(x=>x.name==='good');assert.ok(b);assert.deepEqual(b.knownScore,score(0,1,1));assert.deepEqual(b.metrics,{cognitive:0,cyclomatic:0,statements:0});assert.deepEqual(b.byRow.get(1),score());assert.deepEqual(good.metrics,score(0,1,1));assert.deepEqual(good.byRow.get(2),score(0,1,1));assert.ok(r.diagnostics.some(d=>d.owner===b.id && d.range.startIndex===1 && d.range.endIndex===22));assert.ok(r.diagnostics.some(d=>d.owner===null));assert.equal(r.functionDiscoveryComplete,false);
 const independent=aggregate([await file('(x; fn good(){a();}','rust','C:/x.rs')]);assert.deepEqual(independent.functions.find(x=>x.name==='good').metrics,score());
});
test('R06-06 bounded JS token error keeps discovery; recovered arrows do not',async()=>{
 const f=await file('function f(){let x = = 1;} function good(){}'), r=aggregate([f]);assert.equal(r.functionDiscoveryComplete,true);assert.deepEqual(r.functions[0].knownScore,score(0,1,1));assert.deepEqual(r.functions[0].metrics,{cognitive:0,cyclomatic:0,statements:0});assert.deepEqual(r.functions[1].metrics,score());assert.equal(r.diagnostics[0].affectsFunctionDiscovery,false);
 const arrows=aggregate([await file('(a=()=>x(),b=()=>y()};\nfunction good(){a();}')]);assert.equal(arrows.functionDiscoveryComplete,false);assert.equal(arrows.functions.filter(x=>x.error!==null).length,2);
});

test('R06-R1 preserves valid parse independently of rejected presentation',async()=>{
 for(const duplicate of [false,true]) {
  const f=await file('function f(){\nlet x = = 1;\n}'), id=f.analysis.functions[0].id, original=f.analysis.diagnostics[0];
  assert.deepEqual(original.range,{startIndex:20,endIndex:21,startPosition:{row:1,column:6},endPosition:{row:1,column:7}});
  f.analysis.presentation.lineAnnotations.length=1;if(duplicate) f.diagnostics.push(reorder(original));
  const ok=await file('function good(){a();}','javascript','C:/ok.js'), r=aggregate([f,ok]);
  assert.equal(r.files[0].analyzed,false);assert.equal(r.functions.length,1);assert.deepEqual(r.functions[0].metrics,score(0,1,1));assert.equal(r.sources.get(f.fileId),f.source);assert.equal(r.diagnostics.length,2);const parse=r.diagnostics.find(d=>d.category==='parse');assert.equal(parse.owner,id);assert.deepEqual(parse.range,original.range);assert.equal(r.diagnostics.filter(d=>d.category==='internal').length,1);
 }
 const f=await file('function f(){\nlet x = = 1;\n}');f.analysis.presentation.lineAnnotations.length=1;f.analysis.diagnostics[0].range.startPosition.row=999;const r=aggregate([f]);assert.equal(r.diagnostics.length,1);assert.equal(r.diagnostics[0].category,'internal');
});
test('R06-R2 annotation offsets are real line ends or null',async()=>{
 for(const end of [-1,0,13]) {const f=await file();f.analysis.presentation.lineAnnotations[0].endIndex=end;const r=aggregate([f]);assert.equal(r.files[0].analyzed,false);assert.equal(r.functions.length,0);assert.equal(r.diagnostics[0].category,'internal');}
 for(const [lang,source,id] of [['javascript','\nfunction f(){const s=`a\r\nb\rc\nd\u2028e\u2029f`;a();}\n','C:/s.js'],['rust','\r\nfn f(){let x = r#"😀\r\ntext"#; a();}\r\n','C:/s.rs']]) {
  const f=await file(source,lang,id), r=aggregate([f]);assert.equal(r.files[0].analyzed,true);assert.equal(r.sources.get(id),f.source);assert.equal(r.presentation.get(id),f.analysis.presentation);assert.equal(f.analysis.presentation.lineAnnotations[0].endIndex,0);assert.equal(f.analysis.presentation.lineAnnotations.at(-1).endIndex,source.length);assert.ok(f.analysis.presentation.lineAnnotations.some(x=>x.endIndex===null));
 }
 const f=await file('\r\nfunction f(){}');f.analysis.presentation.lineAnnotations[0].endIndex=1;assert.equal(aggregate([f]).files[0].analyzed,false);
});
test('R06-R3 structural delimiter breaks local error witness',async()=>{
 const f=await file('function f(){let x = } function b(){x()}; } function good(){a()}'), r=aggregate([f]), bad=r.functions.find(x=>x.name==='f'), good=r.functions.find(x=>x.name==='good');assert.deepEqual(bad.knownScore,score(0,1,2));assert.deepEqual(bad.metrics,{cognitive:0,cyclomatic:0,statements:0});assert.deepEqual(bad.byRow.get(1),score());assert.deepEqual(good.metrics,score());assert.equal(r.functionDiscoveryComplete,false);assert.equal(r.files[0].functionDiscoveryComplete,false);assert.ok(r.diagnostics.some(d=>d.owner===bad.id && d.range.startIndex===21 && d.range.endIndex===22 && d.affectsFunctionDiscovery));assert.ok(!r.functions.some(x=>x.name==='b'));
 const local=aggregate([await file('function f(){let x = = 1;} function good(){}')]);assert.equal(local.functionDiscoveryComplete,true);
});

test('R06-R2 CRLF is one line break and known ends increase across null',async()=>{
 const crlf=await file('function f(){}\r\n');assert.equal(crlf.analysis.presentation.lineAnnotations.length,2);crlf.analysis.presentation.lineAnnotations.push({row:2,contentEndIndex:crlf.source.source.length,endIndex:null});let r=aggregate([crlf]);assert.equal(r.files[0].analyzed,false);assert.equal(r.functions.length,0);assert.equal(r.diagnostics[0].category,'internal');
 const cr=await file('\rfunction f(){}');assert.equal(cr.analysis.presentation.lineAnnotations.length,2);cr.analysis.presentation.lineAnnotations[0].endIndex=cr.source.source.length;r=aggregate([cr]);assert.equal(r.files[0].analyzed,false);assert.equal(r.functions.length,0);assert.equal(r.diagnostics[0].category,'internal');
 const valid=await file('\r\n\nfunction f(){const s=`x\ny`; }\n');r=aggregate([valid]);assert.equal(r.files[0].analyzed,true);assert.deepEqual(valid.analysis.presentation.lineAnnotations.slice(0,2).map(x=>x.endIndex),[0,2]);assert.ok(valid.analysis.presentation.lineAnnotations.some(x=>x.endIndex===null));
 const repeated=await file('\rfunction f(){const s=`x\ny`; }\n');const annotations=repeated.analysis.presentation.lineAnnotations;assert.ok(annotations.some(x=>x.endIndex===null));annotations[0].endIndex=annotations.at(-1).endIndex;r=aggregate([repeated]);assert.equal(r.files[0].analyzed,false);
});

test('R06-R2 separators cannot be reused across null anchors; Rust trailing CR is content',async()=>{
 const f=await file('\r\rfunction f(){}');assert.equal(f.analysis.presentation.lineAnnotations.length,3);f.analysis.presentation.lineAnnotations=[{row:0,contentEndIndex:1,endIndex:1},{row:1,contentEndIndex:1,endIndex:null},{row:2,contentEndIndex:16,endIndex:16}];const r=aggregate([f]);assert.equal(r.files[0].analyzed,false);assert.equal(r.functions.length,0);assert.equal(r.diagnostics.at(-1).category,'internal');
 const rust=await file('fn f(){}\r','rust','C:/trailing.rs');assert.equal(rust.analysis.presentation.lineAnnotations.length,1);assert.equal(rust.analysis.presentation.lineAnnotations[0].endIndex,rust.source.source.length);const rr=aggregate([rust]);assert.equal(rr.files[0].analyzed,true);assert.deepEqual(rr.functions[0].metrics,score(0,1,0));
 const good=await file('\r\rfunction f(){}');good.analysis.presentation.lineAnnotations[1].endIndex=null;assert.equal(aggregate([good]).files[0].analyzed,true);
});

for(const source of ['\rfn f(){}','\rfn f(){}\n']) {
 test(`R06-R4 known optional terminator consumes a boundary: ${JSON.stringify(source)}`,async()=>{
  const f=await file(source,'rust','C:/anchor.rs');assert.equal(aggregate([f]).files[0].analyzed,true);f.analysis.presentation.lineAnnotations[0].endIndex=0;f.analysis.presentation.lineAnnotations[0].contentEndIndex=0;
  const r=aggregate([f]);assert.equal(r.files[0].analyzed,false);assert.equal(r.functions.length,0);assert.equal(r.diagnostics.at(-1).category,'internal');
 });
}
test('R06-R4 valid multiline JS and Rust retain null annotations',async()=>{
 for(const [lang,source,id] of [['javascript','\rfunction f(){const s=`x\ny`;a();}\u2028','C:/anchor.js'],['rust','\r\nfn f(){let s = r#"x\ny"#; a();}\n','C:/anchor.rs']]) {
  const f=await file(source,lang,id);assert.ok(f.analysis.presentation.lineAnnotations.some(x=>x.endIndex===null));const r=aggregate([f]);assert.equal(r.files[0].analyzed,true);assert.equal(r.presentation.get(id),f.analysis.presentation);assert.deepEqual(r.functions[0].metrics,score(0,1,2));
 }
});


