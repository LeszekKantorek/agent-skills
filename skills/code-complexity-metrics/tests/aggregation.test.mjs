import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregate} from '../scripts/aggregation.mjs';
import {createAnalyzeNode as node, outerId} from '../scripts/analyzers/contracts.mjs';
import {parse} from '../scripts/parser.mjs';
import {analyzerFor} from '../scripts/analyzers/registry.mjs';
const score=(c=0,y=0,s=0)=>({cognitive:c,cyclomatic:y,statements:s});
function n(row, points=score(), children=[]) {const v=node({type:'anything',isNamed:true,startPosition:{row,column:0},endPosition:{row,column:1},startIndex:row*2,endIndex:row*2+1,children});v.score=points;return v;}
const diagnostic=(fileId,owner,affectedMetrics=[],affectsFunctionDiscovery=false)=>({code:'X',category:'unsupported',message:'x',fileId,range:fileId===null?null:{startIndex:0,endIndex:1,startPosition:{row:0,column:0},endPosition:{row:0,column:1}},owner,affectedMetrics,affectsFunctionDiscovery});
function manual(fileId='a') {
 const a=outerId(fileId,0),b=outerId(fileId,1),c=outerId(fileId,2);
 const cross=n(2,score(0,0,2)), rootA=n(0,score(0,1,0),[cross]), outside=n(2,score(1,0,3)), container=n(1,score(),[outside]), rootB=n(3), rootC=n(4), tree=n(0,score(),[rootA,container,rootB,rootC]);
 const ownerByNode=new Map([[tree,null],[rootA,a],[cross,b],[container,null],[outside,a],[rootB,b],[rootC,c]]);
 return {fileId,source:{fileId,source:'x\nx\nx\nx\nx\nx'},diagnostics:[],analysis:{tree,functions:[{id:a,name:'same',root:rootA},{id:b,name:'same',root:rootB},{id:c,name:'free',root:rootC}],ownerByNode,diagnostics:[],presentation:{comments:[],unsafeCommentRanges:[],lineAnnotations:Array.from({length:6},(_,row)=>({row,contentEndIndex:row*2+1,endIndex:row*2+1}))}}};
}
test('ownership, row sums, partial metrics and discovery are independent',()=>{
 const f=manual(), [a,b,c]=f.analysis.functions.map(x=>x.id), d=diagnostic(f.fileId,a,['cognitive']), e=diagnostic(f.fileId,b,['statements']), x=diagnostic(f.fileId,null,[],true);
 f.diagnostics=[d];f.analysis.diagnostics=[d,e,x]; const r=aggregate([f,manual('b')]);
 assert.equal(r.functions.length,6); assert.deepEqual(r.functions[0].knownScore,score(1,1,3));assert.deepEqual(r.functions[0].metrics,{...score(1,1,3),cognitive:null});assert.deepEqual(r.functions[0].byRow.get(3),score(1,0,3));assert.deepEqual(r.functions[1].knownScore,score(0,0,2)); assert.equal(r.functions[1].metrics.statements,null); assert.deepEqual(r.functions[2].metrics,score());assert.equal(r.diagnostics.length,3);assert.equal(r.files[0].functionDiscoveryComplete,false);assert.equal(r.files[1].functionDiscoveryComplete,true);assert.equal(r.functionDiscoveryComplete,false); assert.equal(r.sources.get('a'),f.source);assert.equal(r.presentation.get('a'),f.analysis.presentation);assert.notEqual(a,b);assert.notEqual(b,c);
});
test('invalid tree rejects the whole file, other files survive',()=>{
 for(const mutate of [f=>f.analysis.ownerByNode.delete(f.analysis.tree),f=>f.analysis.ownerByNode.set(f.analysis.tree,'missing'),f=>f.analysis.tree.children.push(f.analysis.tree),f=>f.analysis.ownerByNode.set({},null),f=>f.analysis.functions[0].root=f.analysis.tree]) {
  const f=manual();mutate(f);const r=aggregate([f,manual('ok')]);assert.equal(r.files[0].analyzed,false);assert.equal(r.files[0].functionDiscoveryComplete,false);assert.equal(r.functions.length,3);assert.equal(r.diagnostics[0].category,'internal');
 }
});
test('failed file, owner-null diagnostics and global discovery',()=>{
 const d={...diagnostic('bad',null,[],true),category:'input',range:null}, global={...diagnostic(null,null,[],true),category:'input'};
 const r=aggregate([{fileId:'bad',source:null,analysis:null,diagnostics:[d]},manual('ok')],[global]);assert.equal(r.functions.length,3);assert.equal(r.diagnostics.length,2);assert.deepEqual(r.diagnostics[0],d);assert.equal(r.hasErrors,true);assert.equal(r.functionDiscoveryComplete,false);assert.equal(r.files[1].functionDiscoveryComplete,true);
});
async function actual(source,lang,id) {const p=await parse(source,lang);let analysis;try{analysis=analyzerFor(lang).analyze(p.tree,source,id)}finally{p.dispose()}return {fileId:id,source:{fileId:id,source},analysis,diagnostics:[]};}
const all=n=>[n,...n.children.flatMap(all)];
test('multiline calls preserve local score, original rows and sums after disposal',async()=>{
 for(const [lang,source,expected] of [['javascript','function f() {\n  make()\n    .first()\n    .second();\n}',[[1,score(0,1,0)],[2,score(0,0,3)]]],['rust','fn f() {\n    assert_eq!(\n        make()\n            .first()\n            .second(),\n        expected\n    );\n}',[[1,score(0,1,0)],[2,score(0,0,1)],[3,score(0,0,3)]]]]) {
  const f=await actual(source,lang,lang), nodes=all(f.analysis.tree), calls=nodes.filter(n=>n.type==='call_expression');assert.equal(calls.length,3);assert.deepEqual(calls.map(n=>[n.startPosition.row,n.score.statements]),Array(3).fill([lang==='rust'?2:1,1]));
  const r=aggregate([f]), fn=r.functions[0];assert.deepEqual([...fn.byRow],expected);assert.deepEqual(fn.metrics,score(0,1,lang==='rust'?4:3));for(const k of Object.keys(score())) assert.equal([...fn.byRow.values()].reduce((v,s)=>v+s[k],0),fn.metrics[k]);
 }
});
test('module and function DSL diagnostics do not poison independent function',async()=>{
 for(const source of ['unknown! { fn hidden() {} => custom } fn good(){a();}','fn bad(){unknown!(a; b);} fn good(){a();}']) {
  const f=await actual(source,'rust','dsl'), r=aggregate([f]);const good=r.functions.find(x=>x.name==='good');assert.deepEqual(good.metrics,score(0,1,1));assert.ok(r.diagnostics.length);assert.ok(!r.functions.some(x=>x.name==='hidden'));
  if(source.startsWith('unknown')) assert.equal(r.functionDiscoveryComplete,false);else {const bad=r.functions.find(x=>x.name==='bad');assert.deepEqual(bad.metrics,{cognitive:null,cyclomatic:null,statements:null});assert.ok(bad.knownScore.statements>=1);}
 }
});




