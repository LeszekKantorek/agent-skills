import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../scripts/parser.mjs';
import {analyze as rust} from '../scripts/analyzers/rust/analyze.mjs';
import {analyze as javascript} from '../scripts/analyzers/javascript/analyze.mjs';
const walk=n=>[n,...n.children.flatMap(walk)];
async function check(language,source,expected,callCount,id) {
 const parser=await parse(source,language);
 try {
  assert.equal(parser.tree.rootNode.hasError,false);
  const p=(language==='rust'?rust:javascript)(parser.tree,source,`pair.${language}`);
  assert.equal(p.functions.length,1);assert.deepEqual(p.diagnostics,[]);
  const fn=p.functions[0], nodes=walk(p.tree).filter(n=>p.ownerByNode.get(n)===fn.id);
  assert.deepEqual(['cognitive','cyclomatic','statements'].map(k=>nodes.reduce((sum,n)=>sum+n.score[k],0)),expected);
  assert.equal(fn.root.score.cyclomatic,1);
  assert.equal(fn.root.score.cognitive,0);
  assert.equal(fn.root.score.statements,0);
  const calls=nodes.filter(n=>n.type==='call_expression');
  assert.equal(calls.length,callCount);
  assert.deepEqual(calls.map(n=>n.score.statements),Array(callCount).fill(1));
  assert.ok(calls.every(n=>n.score.cognitive===0 && n.score.cyclomatic===0));
  if (id==='if-chain') {
   const controls=nodes.filter(n=>['if_expression','if_statement'].includes(n.type));
   assert.equal(controls.length,2);
   assert.deepEqual(controls.map(n=>n.score),Array(2).fill({cognitive:1,cyclomatic:1,statements:1}));
   const elses=nodes.filter(n=>n.type==='else_clause' && n.score.cognitive===1);
   assert.equal(elses.length,1);
   assert.deepEqual(elses[0].score,{cognitive:1,cyclomatic:0,statements:0});
  }
  if (id==='loop') {
   const controls=nodes.filter(n=>['for_expression','for_in_statement'].includes(n.type));
   assert.equal(controls.length,1);
   assert.deepEqual(controls[0].score,{cognitive:1,cyclomatic:1,statements:1});
  }
  for (const n of nodes.filter(n=>n!==fn.root && ['function_item','function_declaration'].includes(n.type))) {
   assert.equal(n.score.cyclomatic,0,'nested declaration has no base');
   assert.equal(n.score.cognitive,0,'nested declaration adds no Cognitive point');
   assert.equal(n.score.statements,1,'standalone nested declaration counts once');
  }
 } finally {parser.dispose()}
}
// Each expectation follows the written operations, independently in both languages.
const cases=[
 // No written operation; exactly one outer base.
 ['empty','fn f(){}','function f(){}',[0,1,0],0],
 // Two calls, no decision or result operation (semicolon discards Rust result).
 ['chain','fn f(){a().b();}','function f(){a().b();}',[0,1,2],2],
 // Two conditions and one else: cognitive 1+1+1, cyclomatic 1+2;
 // two if operations and three calls are statements.
 ['if-chain','fn f(){if a{x();}else if b{y();}else{z();}}','function f(){if(a){x();}else if(b){y();}else{z();}}',[3,3,5],3],
 // One for and binding plus call; outer base and one loop decision.
 ['loop','fn f(){for x in xs{consume(x);}}','function f(){for(const x of xs){consume(x);}}',[1,2,3],1],
 // Nested declaration, call; no nested-function cyclomatic base.
 ['nested-function','fn f(){fn inner(){save();}}','function f(){function inner(){save();}}',[0,1,2],1],
 // Explicit return and one call; no Rust implicit-result point.
 ['return-call','fn f(){return save();}','function f(){return save();}',[0,1,2],1]
];
for(const [id,rs,js,expected,calls] of cases) test(`P08-${id}`,async()=>{
 await check('rust',rs,expected,calls,id);
 await check('javascript',js,expected,calls,id);
});
