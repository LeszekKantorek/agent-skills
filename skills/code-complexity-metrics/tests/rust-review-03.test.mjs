import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../scripts/parser.mjs';
import {analyze,prepare} from '../scripts/analyzers/rust/analyze.mjs';
const walk=n=>[n,...n.children.flatMap(walk)];
async function run(s){const p=await parse(s,'rust'); try{return analyze(p.tree,s,'file')} finally{p.dispose()}}
function total(p,id=p.functions[0].id){return walk(p.tree).filter(n=>p.ownerByNode.get(n)===id).reduce((a,n)=>a.map((v,i)=>v+Object.values(n.score)[i]),[0,0,0])}
const cases=[
 ['R03-02 guard','fn f(){while a{match x { A if (if p {a}else{b}) => {}, _=>{}}}}',[6,5,5]],
 ['R03-03 empties','fn f(){;;;}',[0,1,3]],
 ['R03-03 comment','fn f(){if a {} /* c */ ;}',[1,2,1]],
 ['R03-03 line comment','fn f(){if a {} // c\n ;}',[1,2,1]],
 ['R03-03 async','fn f(){async {work();};}',[0,1,2]],
 ['R03-03 unsafe','fn f(){unsafe {work();};}',[0,1,2]],
 ['R03-03 const','fn f(){const {42};}',[0,1,2]],
 ['R03-03 extra empties','fn f(){a(b());;;}',[0,1,4]],
 ["R03-04 label","fn f(){'lbl: {}}",[0,1,1]],
 ['R03-04 try','fn f(){try { work()? }}',[0,1,3]],
];
for(const [name,s,expected] of cases) test(name,async()=>assert.deepEqual(total(await run(s)),expected));
test('R03-01 module branches and owner depth',async()=>{const p=await run('const CHOICE: fn() = if p { fn a(){if q{}} a } else { fn b(){if r{}} b };'); assert.deepEqual(p.functions.map(f=>total(p,f.id)),[[1,2,1],[1,2,1]]);});
test('R03-06 module result outside closure owner',async()=>{const p=await run('const F: fn() = { || { if a{} } };'); assert.deepEqual(total(p),[1,2,1]); const c=p.functions[0].root; assert.equal(c.score.statements,0);});
test('R03-02 guard context differs from arm body',async()=>{
 const p=await run('fn f(){while a {match x { A if (if p {a}else{b}) => {if q {}}, _=>{} }}}');
 const ifs=walk(p.tree).filter(n=>n.type==='if_expression');
 assert.deepEqual(ifs.map(n=>n.score.cognitive),[2,3]); assert.ok(ifs.every(n=>p.ownerByNode.get(n)===p.functions[0].id));
});
test('R03-06 nested closure result remains in its outer',async()=>{
 const p=await run('fn f(){let x={|| {if a{}}};}'), nodes=walk(p.tree), closure=nodes.find(n=>n.type==='closure_expression');
 assert.equal(closure.score.statements,1); assert.equal(p.ownerByNode.get(closure),p.functions[0].id); assert.deepEqual(total(p),[2,2,4]);
});
for(const [name,s,type,control,controlExpected] of [
 ['for pattern','fn f(){for\n (a,b) in xs {}}','tuple_pattern','for_expression',1],
 ['if-let pattern','fn f(){if let\n Some(x)=foo() {}}','tuple_struct_pattern','let_condition',0],
]) test(`R03-05 ${name}`,async()=>{const p=await run(s), ns=walk(p.tree), pattern=ns.find(n=>n.type===type && n.field==='pattern'); assert.equal(ns.find(n=>n.type===control).score.statements,controlExpected); assert.equal(pattern.score.statements,1); assert.equal(pattern.startPosition.row,1);});
test('R03-09 module declarators have local score',async()=>{const p=await run('const X:i32=load(); static Y:i32=0; fn f(){}'); const ns=walk(p.tree).filter(n=>['const_item','static_item'].includes(n.type)); assert.deepEqual(ns.map(n=>n.score.statements),[1,1]); assert.ok(ns.every(n=>p.ownerByNode.get(n)===null));});
test('R03-08 let-else traverses declaration and known children',async()=>{
 const p=await run('fn f(){let Some(x)=load() else {if a {recover(); return;}};}'), ns=walk(p.tree);
 const decl=ns.find(n=>n.type==='let_declaration'), call=ns.filter(n=>n.type==='call_expression'), branch=ns.find(n=>n.type==='if_expression'), ret=ns.find(n=>n.type==='return_expression');
 assert.equal(decl.score.statements,2); assert.deepEqual(call.map(n=>n.score.statements),[1,1]);
 assert.equal(branch.score.cyclomatic,1); assert.equal(branch.score.statements,1); assert.equal(ret.score.statements,1);
 assert.ok([decl,...call,branch,ret].every(n=>p.ownerByNode.get(n)===p.functions[0].id));
});
for(const [name,s,expected] of [
 ['returned loop', 'fn f()->i32 {loop {break 42;}}', [1,2,3]],
 ['initializer loop', 'fn f(){let x=loop {break 42;};}', [1,2,3]],
 ['discarded loop', 'fn f(){loop {break 42;};}', [1,2,2]],
 ['loop without value', 'fn f(){loop {break;}}', [1,2,2]],
 ['labeled outer break', "fn f()->i32 {'outer: loop {loop {break 'outer 42;}}}", [4,3,4]],
 ['nested loop break stays inner', 'fn f(){loop {loop {break 42;}; break;}}', [3,3,4]],
 ['nested closure break boundary', 'fn f(){loop {let c=||{loop {break 42;}}; break;}}', [4,3,6]],
]) test(`loop result: ${name}`,async()=>assert.deepEqual(total(await run(s)),expected));
