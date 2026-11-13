import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../scripts/parser.mjs';
import {analyze} from '../scripts/analyzers/rust/analyze.mjs';
const walk=n=>[n,...n.children.flatMap(walk)];
// Result boundaries and written operations are counted independently.
const cases=[
 ['tail-constant','fn f()->i32{42}',[['integer_literal',1]]],
 ['tail-call','fn f()->i32{calculate()}',[['call_expression',2]]],
 ['if-calls','fn f(){if check(){save();}}',[['if_expression',1],['call_expression',1],['call_expression',1]]],
 ['extra-block','fn f(){{}}',[['block',1]]],
 ['no-block-result','fn f(){{work();}}',[['block',1],['call_expression',1]]],
 ['selection','fn f()->i32{if a{1}else{2}}',[['if_expression',1],['integer_literal',1],['integer_literal',1]]],
 ['tail-match','fn f()->i32{match a{true=>1,false=>2}}',[['match_expression',1],['integer_literal',1],['integer_literal',1]]],
 ['selection-init','fn f(){let x=if a{1}else{2};}',[['let_declaration',1],['if_expression',1],['integer_literal',1],['integer_literal',1]]]
];
for(const [id,source,expected] of cases) test(`S08-rust-result-${id}`,async()=>{
 const q=await parse(source,'rust');try{
  assert.equal(q.tree.rootNode.hasError,false);const p=analyze(q.tree,source,'r');
  assert.equal(p.functions.length,1);assert.deepEqual(p.diagnostics,[]);
  const owner=p.functions[0].id,nodes=walk(p.tree).filter(n=>p.ownerByNode.get(n)===owner);
  assert.deepEqual(nodes.filter(n=>n.score.statements).map(n=>[n.type,n.score.statements]),expected);
  assert.equal(nodes.reduce((sum,n)=>sum+n.score.statements,0),expected.reduce((sum,[,n])=>sum+n,0));
 }finally{q.dispose()}
});
