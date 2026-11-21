import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../scripts/parser.mjs';
import {analyze} from '../scripts/analyzers/javascript/analyze.mjs';
const walk=n=>[n,...n.children.flatMap(walk)];
// Wrapper and field are separate expression contexts. An initializer's '=' is not an assignment.
const cases=[
 ['public-empty','a;',0,0],
 ['private-empty','#a;',0,0],
 ['static-public-empty','static a;',0,0],
 ['static-private-empty','static #a;',0,0],
 ['call','a=load();',0,1],
 ['selection','a=c?one():two();',1,2],
 ['function','a=()=>{work();};',0,1]
];
for(const [id,field,expected,calls] of cases) test(`F08-${id}`,async()=>{
 const source=`function f(){(class {${field}});}`,parser=await parse(source,'javascript');
 try {
  assert.equal(parser.tree.rootNode.hasError,false);const p=analyze(parser.tree,source,'field');
  assert.equal(p.functions.length,1);assert.deepEqual(p.diagnostics,[]);
  const owner=p.functions[0].id,nodes=walk(p.tree).filter(n=>p.ownerByNode.get(n)===owner);
  const fields=nodes.filter(n=>n.type==='field_definition');assert.equal(fields.length,1);
  assert.deepEqual(fields[0].score,{cognitive:0});
  const wrapper=nodes.find(n=>n.type==='expression_statement');assert.ok(wrapper);
  const cs=nodes.filter(n=>n.type==='call_expression');assert.equal(cs.length,calls);
  assert.ok(cs.every(n=>n.score.cognitive===0));
  if(id==='selection') {
   const choice=nodes.find(n=>n.type==='ternary_expression');
   assert.deepEqual(choice.score,{cognitive:1});
   assert.equal(cs.length,2);
  }
  if(id==='function') assert.equal(nodes.filter(n=>n.type==='arrow_function').length,1);
  assert.ok(nodes.filter(n=>['=',';'].includes(n.type)).every(n=>n.score.cognitive===0));
  assert.equal(nodes.reduce((sum,n)=>sum+n.score.cognitive,0),expected);
 } finally {parser.dispose()}
});
