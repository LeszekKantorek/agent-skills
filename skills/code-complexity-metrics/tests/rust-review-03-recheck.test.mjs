import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../scripts/parser.mjs';
import {analyze} from '../scripts/analyzers/rust/analyze.mjs';
const walk=n=>[n,...n.children.flatMap(walk)];
async function run(source){const parsed=await parse(source,'rust');try{return analyze(parsed.tree,source,'file')}finally{parsed.dispose()}}
const score=(p,id=p.functions[0].id)=>walk(p.tree).filter(n=>p.ownerByNode.get(n)===id).reduce((sum,n)=>sum+n.score.cognitive,0);
for(const [name,source,expected] of [
 ['R1 block result',"fn f()->i32 {'done: {break 'done 42;}}",1],
 ['R1 block initializer',"fn f()->i32 {let x='done: {break 'done 42;}; x}",1],
 ['R1 call result',"fn f()->i32 {'done: {break 'done value();}}",1],
 ['R2 iterator', 'fn f()->i32 {loop {for _ in {if true {break 42;} [0]} {}}}',5],
 ['R2 iterator shadow',"fn f()->i32 {'l: loop {'l: for _ in {if true {break 'l 42;} [0]} {}}}",6],
 ['R2 raw label',"fn f()->i32 {'r#dest: loop {break 'dest 42;}}",2],
 ['R2 NFC label',"fn f()->i32 {'é: loop {break 'e\u0301 42;}}",2],
 ['R3 async',"fn f(){'out: loop {async {break 'out 42;};break;}}",2],
 ['R3 const block',"fn f(){'out: loop {const {break 'out 42;};break;}}",2],
 ['R3 const item',"fn f(){'out: loop {const X: ()={break 'out 42;};break;}}",2],
 ['R3 closure',"fn f(){'out: loop {let c=||{break 'out 42;};break;}}",2],
 ['R3 function',"fn f(){'out: loop {fn nested(){break 'out 42;}break;}}",2],
]) test(name,async()=>{const p=await run(source);assert.equal(score(p),expected);});
test('R1 labeled break and call preserve position and owner',async()=>{
 const source="fn f()->i32 {\n 'done: {\n break 'done value();\n }\n}", p=await run(source), nodes=walk(p.tree), call=nodes.find(n=>n.type==='call_expression'), jump=nodes.find(n=>n.type==='break_expression'), block=nodes.find(n=>n.type==='block' && n.children.some(c=>c.type==='label'));
 assert.equal(score(p),1); assert.equal(call.startPosition.row,2); assert.equal(jump.score.cognitive,1); assert.ok([call,jump,block].every(n=>p.ownerByNode.get(n)===p.functions[0].id));
});
test('R1 selection and labeled break both contribute Cognitive points',async()=>{const p=await run("fn f()->i32 {'x: {break 'x if a {1}else{2};}}"), nodes=walk(p.tree); assert.equal(score(p),3); assert.equal(nodes.filter(n=>n.type==='integer_literal').length,2);});
test('R2 labeled block retains its value and Cognitive jump',async()=>{const p=await run("fn f(){'x: loop {'x: {break 'x 42;} break;}}"), nodes=walk(p.tree), jump=nodes.find(n=>n.type==='break_expression'), value=nodes.find(n=>n.type==='integer_literal'); assert.equal(jump.score.cognitive,1); assert.equal(p.ownerByNode.get(value),p.functions[0].id);});
test('R2 iterator nodes preserve owner and rows',async()=>{const p=await run('fn f()->i32 {\n loop {for _ in {if true {break 42;} [0]} {}}\n}'), nodes=walk(p.tree), loop=nodes.find(n=>n.type==='loop_expression'), jump=nodes.find(n=>n.type==='break_expression'), value=nodes.find(n=>n.type==='integer_literal'); assert.equal(loop.startPosition.row,1); assert.ok([loop,jump,value].every(n=>p.ownerByNode.get(n)===p.functions[0].id));});
test('R3 nested functions retain both jumps and their owner',async()=>{for(const body of ["async {break 'out 42;};", "const {break 'out 42;};", "const X: ()={break 'out 42;};", "let c=||{break 'out 42;};", "fn inner(){break 'out 42;}"]){const p=await run(`fn f(){'out: loop {${body} break;}}`), nodes=walk(p.tree), jumps=nodes.filter(n=>n.type==='break_expression'); assert.deepEqual(jumps.map(n=>n.score.cognitive),[1,0],body); assert.ok(jumps.every(n=>p.ownerByNode.get(n)===p.functions[0].id));}});
for(const [name,source] of [
 ['R4 match','const F: fn() = match p {\n _ => || { if a {} },\n};'],
 ['R4 grouped','const F: fn() = match p {\n _ => (|| { if a {} }),\n};'],
 ['R4 block','const F: fn() = {\n || {if a{}}\n};'],
]) test(name,async()=>{const p=await run(source), root=p.functions[0].root;assert.equal(score(p),1);assert.equal(root.score.cognitive,0);const branch=walk(root).find(n=>n.type==='if_expression');assert.equal(p.ownerByNode.get(branch),p.functions[0].id);});
