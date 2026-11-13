import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../scripts/parser.mjs';
import {analyze} from '../scripts/analyzers/rust/analyze.mjs';
const walk=n=>[n,...n.children.flatMap(walk)];
// Explicit operations, block boundaries, bindings and result boundaries are distinct.
const cases=[
 ['call-selection','fn f()->i32{if a{first()}else{second()}}',[['if_expression',1],['call_expression',2],['call_expression',2]]],
 ['match-init','fn f(){let x=match a{true=>1,false=>2};}',[['let_declaration',1],['match_expression',1],['integer_literal',1],['integer_literal',1]]],
 ['call-init','fn f(){let x=if a{first()}else{second()};}',[['let_declaration',1],['if_expression',1],['call_expression',2],['call_expression',2]]],
 ['async-block','fn f(){let x=async{work()};}',[['let_declaration',1],['block',1],['call_expression',2]]],
 ['nested-block','fn f()->i32{{{{1}}}}',[['block',1],['block',1],['block',1],['integer_literal',1]]],
 ['block-init','fn f(){let x={prepare();calculate()};}',[['let_declaration',1],['block',1],['call_expression',1],['call_expression',2]]],
 ['async-closure','fn f(){let c=||async{work()};}',[['let_declaration',1],['block',1],['call_expression',2]]],
 ['if-let','fn f(){if let Some(x)=item{consume(x);}}',[['if_expression',1],['tuple_struct_pattern',1],['call_expression',1]]],
 ['while-let','fn f(){while let Some(x)=next(){consume(x);}}',[['while_expression',1],['tuple_struct_pattern',1],['call_expression',1],['call_expression',1]]],
 ['for-binding','fn f(){for x in xs{consume(x);}}',[['for_expression',1],['identifier',1],['call_expression',1]]],
 ['for-destructure','fn f(){for (x,y) in pairs{}}',[['for_expression',1],['tuple_pattern',1]]],
 ['macro-argument','fn f(){m!(load());}',[['macro_invocation',1],['call_expression',1]]],
 ['macro-square','fn f(){m![load()];}',[['macro_invocation',1],['call_expression',1]]],
 ['macro-braces','fn f(){m!{load()};}',[['macro_invocation',1],['call_expression',1]]],
 ['macro-declaration','fn f(){let x=vec![];}',[['let_declaration',1],['macro_invocation',1]]],
 ['macro-return','fn f(){return vec![];}',[['return_expression',1],['macro_invocation',1]]],
 ['macro-definition','fn f(){macro_rules! a{()=>{if b{work()}}} a!();}',[['macro_definition',1],['macro_invocation',1]]]
];
for(const [id,source,expected] of cases) test(`R08-statements-${id}`,async()=>{
 const q=await parse(source,'rust');try{
  assert.equal(q.tree.rootNode.hasError,false);const p=analyze(q.tree,source,'r');
  assert.equal(p.functions.length,1);assert.deepEqual(p.diagnostics,[]);
  const owner=p.functions[0].id,nodes=walk(p.tree).filter(n=>p.ownerByNode.get(n)===owner);
  assert.deepEqual(nodes.filter(n=>n.score.statements).map(n=>[n.type,n.score.statements]),expected);
  assert.equal(nodes.reduce((sum,n)=>sum+n.score.statements,0),expected.reduce((sum,[,n])=>sum+n,0));
 }finally{q.dispose()}
});

test('R08-statements-macro-argument-all-metrics',async()=>{
 const source='fn f(){assert!(ready && verify());}',q=await parse(source,'rust');try{
  assert.equal(q.tree.rootNode.hasError,false);const p=analyze(q.tree,source,'r');assert.equal(p.functions.length,1);assert.deepEqual(p.diagnostics,[]);
  const owner=p.functions[0].id,nodes=walk(p.tree).filter(n=>p.ownerByNode.get(n)===owner);
  for(const [type,score] of [['macro_invocation',{cognitive:0,cyclomatic:0,statements:1}],['&&',{cognitive:1,cyclomatic:1,statements:0}],['call_expression',{cognitive:0,cyclomatic:0,statements:1}]]) assert.deepEqual(nodes.find(n=>n.type===type).score,score,type);
  assert.deepEqual(['cognitive','cyclomatic','statements'].map(k=>nodes.reduce((sum,n)=>sum+n.score[k],0)),[1,2,2]);
 }finally{q.dispose()}
});
