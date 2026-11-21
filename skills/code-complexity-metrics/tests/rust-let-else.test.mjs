import test from 'node:test'; import assert from 'node:assert/strict';
import {parse} from '../scripts/parser.mjs'; import {analyze} from '../scripts/analyzers/rust/analyze.mjs';
const walk=n=>[n,...n.children.flatMap(walk)];
async function run(source){const p=await parse(source,'rust'); try{return analyze(p.tree,source,'file')}finally{p.dispose()}}
function total(p){return walk(p.tree).filter(n=>p.ownerByNode.get(n)===p.functions[0].id).reduce((sum,n)=>sum+n.score.cognitive,0);}
for(const [name,source,expected] of [
 ['empty failure','fn f(){let Some(x)=item else {};}',1],
 ['explicit return','fn f(){let Some(x)=load() else {return;};}',1],
 ['failure call no result','fn f(){let Some(x)=item else {abort()};}',1],
 ['nested if in failure','fn f(){let Some(x)=load() else {if a {return;}};}',3],
 ['condition in initializer','fn f(){let Some(x)=load(a&&b) else {return;};}',2],
 ['nested depth','fn f(){if a {let Some(x)=load() else {if b{return;}};}}',6],
 ['explicit extra block','fn f(){let Some(x)=item else {{work();} return;};}',1],
 ['else with both calls','fn f(){let Some(x)=load() else {recover(); return;};}',1],
 ['plain declaration','fn f(){let Some(x)=load();}',0],
 ['if-let comparison','fn f(){if let Some(x)=item {}}',1],
 ['while-let comparison','fn f(){while let Some(x)=item {}}',1],
 ['match guard comparison','fn f(){match x {A if ready => {}, _=>{}}}',1],
 ['macro argument','fn f(){m!({let Some(x)=item else {abort()};});}',1],
 ['selection initializer','fn f(){let Some(x)=if c {one()}else{two()} else {return;};}',3],
]) test(`let-else: ${name}`,async()=>{const p=await run(source);assert.deepEqual(p.diagnostics,[]);assert.equal(total(p),expected);});
test('let-else: local roles and original lines',async()=>{const s='fn f(){\n let Some(x)=load()\n else {\n if a {return;}\n };\n}',p=await run(s), ns=walk(p.tree), decl=ns.find(n=>n.type==='let_declaration'), block=decl.children.find(n=>n.field==='alternative'), branch=ns.find(n=>n.type==='if_expression'), call=ns.find(n=>n.type==='call_expression'); assert.deepEqual(decl.score,{cognitive:1});assert.equal(branch.score.cognitive,2);assert.equal(decl.startPosition.row,1);assert.equal(branch.startPosition.row,3);assert.ok([decl,block,branch,call].every(n=>p.ownerByNode.get(n)===p.functions[0].id));});
