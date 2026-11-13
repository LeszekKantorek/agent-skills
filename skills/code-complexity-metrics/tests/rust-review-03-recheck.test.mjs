import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../scripts/parser.mjs';
import {analyze} from '../scripts/analyzers/rust/analyze.mjs';
const walk=n=>[n,...n.children.flatMap(walk)];
async function run(source){const parsed=await parse(source,'rust');try{return analyze(parsed.tree,source,'file')}finally{parsed.dispose()}}
const score=(p,id=p.functions[0].id)=>walk(p.tree).filter(n=>p.ownerByNode.get(n)===id).reduce((a,n)=>a.map((v,i)=>v+Object.values(n.score)[i]),[0,0,0]);
for(const [name,source,expected] of [
 ['R1 block result',"fn f()->i32 {'done: {break 'done 42;}}",[1,1,3]],
 ['R1 block initializer',"fn f()->i32 {let x='done: {break 'done 42;}; x}",[1,1,5]],
 ['R1 call result',"fn f()->i32 {'done: {break 'done value();}}",[1,1,4]],
 ['R2 iterator', 'fn f()->i32 {loop {for _ in {if true {break 42;} [0]} {}}}',[5,4,8]],
 ['R2 iterator shadow',"fn f()->i32 {'l: loop {'l: for _ in {if true {break 'l 42;} [0]} {}}}",[6,4,8]],
 ['R2 raw label',"fn f()->i32 {'r#dest: loop {break 'dest 42;}}",[2,2,3]],
 ['R2 NFC label',"fn f()->i32 {'é: loop {break 'e\u0301 42;}}",[2,2,3]],
 ['R3 async',"fn f(){'out: loop {async {break 'out 42;};break;}}",[2,2,4]],
 ['R3 const block',"fn f(){'out: loop {const {break 'out 42;};break;}}",[2,2,4]],
 ['R3 const item',"fn f(){'out: loop {const X: ()={break 'out 42;};break;}}",[2,2,5]],
 ['R3 closure',"fn f(){'out: loop {let c=||{break 'out 42;};break;}}",[2,2,4]],
 ['R3 function',"fn f(){'out: loop {fn nested(){break 'out 42;}break;}}",[2,2,4]],
]) test(name,async()=>{const p=await run(source);assert.deepEqual(score(p),expected);});
test('R1 terminal value and explain position',async()=>{
 const source="fn f()->i32 {\n 'done: {\n break 'done value();\n }\n}", p=await run(source), nodes=walk(p.tree), call=nodes.find(n=>n.type==='call_expression'), jump=nodes.find(n=>n.type==='break_expression'), block=nodes.find(n=>n.type==='block' && n.children.some(c=>c.type==='label'));
 assert.deepEqual(score(p),[1,1,4]); assert.equal(call.score.statements,2); assert.equal(call.startPosition.row,2); assert.equal(jump.score.statements,1); assert.equal(block.score.statements,1); assert.ok([call,jump,block].every(n=>p.ownerByNode.get(n)===p.functions[0].id));
});
test('R1 selection forwards block break value',async()=>{const p=await run("fn f()->i32 {'x: {break 'x if a {1}else{2};}}"), nodes=walk(p.tree); assert.deepEqual(score(p),[3,2,5]); assert.deepEqual(nodes.filter(n=>n.type==='integer_literal').map(n=>n.score.statements),[1,1]);});
test('R2 inner labeled block shadows loop target',async()=>{const p=await run("fn f(){'x: loop {'x: {break 'x 42;} break;}}"), nodes=walk(p.tree), loop=nodes.find(n=>n.type==='loop_expression'), value=nodes.find(n=>n.type==='integer_literal'); assert.equal(loop.score.statements,1); assert.equal(value.score.statements,1);});
test('R2 iterator result is on enclosing loop',async()=>{const p=await run('fn f()->i32 {\n loop {for _ in {if true {break 42;} [0]} {}}\n}'), nodes=walk(p.tree), loop=nodes.find(n=>n.type==='loop_expression'), jump=nodes.find(n=>n.type==='break_expression'), value=nodes.find(n=>n.type==='integer_literal'); assert.equal(loop.score.statements,2); assert.equal(loop.startPosition.row,1); assert.equal(value.score.statements,0); assert.equal(jump.score.statements,1); assert.ok([loop,jump,value].every(n=>p.ownerByNode.get(n)===p.functions[0].id));});
test('R3 barrier applies to nested functions and retains local jumps',async()=>{for(const body of ["async {break 'out 42;};", "const {break 'out 42;};", "const X: ()={break 'out 42;};", "let c=||{break 'out 42;};", "fn inner(){break 'out 42;}"]){const p=await run(`fn f(){'out: loop {${body} break;}}`), nodes=walk(p.tree), loop=nodes.find(n=>n.type==='loop_expression'), jumps=nodes.filter(n=>n.type==='break_expression'); assert.equal(loop.score.statements,1,body); assert.deepEqual(jumps.map(n=>n.score.statements),[1,1],body); assert.ok(jumps.every(n=>p.ownerByNode.get(n)===p.functions[0].id));}});
for(const [name,source] of [
 ['R4 match','const F: fn() = match p {\n _ => || { if a {} },\n};'],
 ['R4 grouped','const F: fn() = match p {\n _ => (|| { if a {} }),\n};'],
 ['R4 block','const F: fn() = {\n || {if a{}}\n};'],
]) test(name,async()=>{const p=await run(source), root=p.functions[0].root;assert.deepEqual(score(p),[1,2,1]);assert.equal(root.score.statements,0);assert.equal(p.tree.score.statements,0);const nodes=walk(p.tree);const block=nodes.find(n=>n.type==='block' && p.ownerByNode.get(n)===null);const match=nodes.find(n=>n.type==='match_expression');if(block) assert.equal(block.score.statements,1);if(match) assert.equal(match.score.statements,1);assert.ok(nodes.filter(n=>n.type==='parenthesized_expression').every(n=>n.score.statements===0));});
