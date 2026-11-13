import test from 'node:test';import assert from 'node:assert/strict';
import {parse} from '../scripts/parser.mjs';import {analyze as rust} from '../scripts/analyzers/rust/analyze.mjs';import {analyze as javascript} from '../scripts/analyzers/javascript/analyze.mjs';
const walk=n=>[n,...n.children.flatMap(walk)];
for(const [language,source] of [['rust','fn f(){let x=a+b;for x in xs{}}'],['javascript','function f(){let x=a+b;for(const x of xs){}}']]) test(`S08-${language}-implicit-operations`,async()=>{
 const q=await parse(source,language);try{assert.equal(q.tree.rootNode.hasError,false);const p=(language==='rust'?rust:javascript)(q.tree,source,'s');assert.deepEqual(p.diagnostics,[]);assert.equal(p.functions.length,1);
 const nodes=walk(p.tree).filter(n=>p.ownerByNode.get(n)===p.functions[0].id),binary=nodes.find(n=>n.type==='binary_expression');assert.equal(binary.score.statements,0);assert.equal(nodes.filter(n=>n.type==='call_expression').length,0);assert.equal(nodes.reduce((s,n)=>s+n.score.statements,0),3);
 }finally{q.dispose()}
});
test('S08-javascript-for-separators',async()=>{const q=await parse('function f(){for(;;){}}','javascript');try{assert.equal(q.tree.rootNode.hasError,false);const p=javascript(q.tree,'function f(){for(;;){}}','s');assert.deepEqual(p.diagnostics,[]);assert.equal(p.functions.length,1);const nodes=walk(p.tree).filter(n=>p.ownerByNode.get(n)===p.functions[0].id);assert.equal(nodes.find(n=>n.type==='for_statement').score.statements,1);assert.deepEqual(nodes.filter(n=>n.type==='empty_statement').map(n=>n.score.statements),[0,0]);assert.equal(nodes.reduce((s,n)=>s+n.score.statements,0),1)}finally{q.dispose()}});
