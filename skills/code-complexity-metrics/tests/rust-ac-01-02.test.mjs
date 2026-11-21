import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../scripts/parser.mjs';
import {analyze} from '../scripts/analyzers/rust/analyze.mjs';
const walk=n=>[n,...n.children.flatMap(walk)];
async function run(source){const p=await parse(source,'rust');try{return analyze(p.tree,source,'file')}finally{p.dispose()}}
const total=p=>walk(p.tree).filter(n=>p.ownerByNode.get(n)===p.functions[0].id).reduce((sum,n)=>sum+n.score.cognitive,0);
for(const [name,source,expected] of [
 ['AC-01 while labeled shadow',"fn f(){'l:loop {'l:while {break 'l 42;} {} break;}}",4],
 ['AC-01 while unlabelled',"fn f(){loop {while {break 42;} {} break;}}",3],
 ['AC-01 labeled block unlabelled',"fn f(){loop {'l:{break 42;} break;}}",1],
 ['AC-02 generic const',"fn f(){'out: loop {g::<{break 'out 42;}>(); break;}}",2],
 ['AC-02 array type length',"fn f(){'out: loop {let x: [u8; {break 'out 42;}] = []; break;}}",2],
 ['AC-02 array repeat length',"fn f(){'out: loop {let x = [0; {break 'out 42;}]; break;}}",2],
]) test(name,async()=>{const p=await run(source), nodes=walk(p.tree), loop=nodes.find(n=>n.type==='loop_expression'), jumps=nodes.filter(n=>n.type==='break_expression');assert.deepEqual(p.diagnostics,[]);assert.equal(total(p),expected); assert.ok([loop,...jumps].every(n=>p.ownerByNode.get(n)===p.functions[0].id));});
test('AC-01 visible outer label in while condition',async()=>{const p=await run("fn f()->i32 {'l:loop {while {break 'l 42;} {}}}");assert.equal(total(p),4);});
test('AC-01 labeled transfer crosses differently labeled block',async()=>{const p=await run("fn f()->i32 {'outer: loop {'inner: {break 'outer 42;}}}"), jump=walk(p.tree).find(n=>n.type==='break_expression');assert.equal(jump.score.cognitive,1);});
test('AC source positions and owner are retained',async()=>{const s="// 😀\r\nfn f(){\r\n 'out: loop {\r\n g::<{break 'out 42;}>();\r\n break;\r\n }\r\n}",p=await run(s),nodes=walk(p.tree), loop=nodes.find(n=>n.type==='loop_expression'),jump=nodes.find(n=>n.type==='break_expression');assert.equal(loop.startPosition.row,2);assert.equal(jump.startPosition.row,3);assert.equal(s.slice(jump.startIndex,jump.endIndex),"break 'out 42");assert.equal(p.ownerByNode.get(loop),p.functions[0].id);assert.equal(p.ownerByNode.get(jump),p.functions[0].id);});
