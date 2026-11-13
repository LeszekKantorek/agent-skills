import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../scripts/parser.mjs';
import {analyze as rust} from '../scripts/analyzers/rust/analyze.mjs';
import {analyze as javascript} from '../scripts/analyzers/javascript/analyze.mjs';
const walk=n=>[n,...n.children.flatMap(walk)];
// Cognitive: first operator and every change; negation starts a new sequence.
// Cyclomatic: each operator is a decision, independently of Cognitive.
const cases=[
 ['and','a && b && c',[1,0]],
 ['or','a || b || c',[1,0]],
 ['change','a && b || c',[1,1]],
 ['or-and-or','a || b && c || d',[1,1,1]],
 ['and-or-and','a && b || c && d',[1,1,1]],
 ['group','(a && b) && c',[1,0]],
 ['negation','a && !(b && c)',[1,1]]
];
for(const language of ['rust','javascript']) for(const [id,expression,cognitive] of cases) {
 test(`L08-${language}-${id}`,async()=>{
  const source=`${language==='rust'?'fn':'function'} f(){${expression};}`;
  const parser=await parse(source,language);
  try {
   assert.equal(parser.tree.rootNode.hasError,false);
   const p=(language==='rust'?rust:javascript)(parser.tree,source,'logic');
   assert.deepEqual(p.diagnostics,[]);assert.equal(p.functions.length,1);
   const owner=p.functions[0].id;
   const operators=walk(p.tree).filter(n=>['&&','||'].includes(n.type)).sort((a,b)=>a.startIndex-b.startIndex);
   assert.equal(operators.length,cognitive.length);
   assert.deepEqual(operators.map(n=>n.score.cognitive),cognitive);
   assert.deepEqual(operators.map(n=>n.score.cyclomatic),Array(cognitive.length).fill(1));
   assert.ok(operators.every(n=>p.ownerByNode.get(n)===owner));
   assert.equal(p.functions[0].root.score.cyclomatic,1);
   const nodes=walk(p.tree).filter(n=>p.ownerByNode.get(n)===owner);
   assert.equal(nodes.reduce((sum,n)=>sum+n.score.cognitive,0),cognitive.reduce((a,b)=>a+b,0));
   assert.equal(nodes.reduce((sum,n)=>sum+n.score.cyclomatic,0),1+cognitive.length);
  } finally {parser.dispose()}
 });
}
for(const [language,source] of [
 ['rust','fn f(){a&&b; c&&d; take(e&&f,g&&h); let x=||{i&&j;};}'],
 ['javascript','function f(){a&&b; c&&d; take(e&&f,g&&h); const x=()=>{i&&j;};}']
]) test(`L08-${language}-separate-contexts`,async()=>{
 const parser=await parse(source,language);try{
  assert.equal(parser.tree.rootNode.hasError,false);const p=(language==='rust'?rust:javascript)(parser.tree,source,'logic');
  assert.equal(p.functions.length,1);assert.deepEqual(p.diagnostics,[]);const owner=p.functions[0].id;
  const nodes=walk(p.tree).filter(n=>p.ownerByNode.get(n)===owner),ops=nodes.filter(n=>n.type==='&&').sort((a,b)=>a.startIndex-b.startIndex);
  assert.deepEqual(ops.map(n=>[n.score.cognitive,n.score.cyclomatic]),Array(5).fill([1,1]));
  assert.equal(nodes.reduce((s,n)=>s+n.score.cognitive,0),5);assert.equal(nodes.reduce((s,n)=>s+n.score.cyclomatic,0),6);
 }finally{parser.dispose()}
});
