import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../scripts/parser.mjs';
import {analyze} from '../scripts/analyzers/rust/analyze.mjs';
const walk=n=>[n,...n.children.flatMap(walk)];
// Propagation, binding and macros add zero; nested controls add 1+depth.
const cases=[
 ['propagation','fn f(){load()?;}',0,[['try_expression',[0]]]],
 ['binding','fn f(){if let Some(x)=item{}}',1,[['if_expression',[1]],['let_condition',[0]]]],
 ['macro','fn f(){hello!();}',0,[['macro_invocation',[0]]]],
 ['definition','fn f(){macro_rules! x{()=>{if b{}}}}',0,[['macro_definition',[0]]]],
 ['match','fn f(){match x {1=>first(),2=>second(),_=>third()};}',1,[['match_expression',[1]]]],
 ['match-if','fn f(){match x {1=>{if ready{}},_=>{}}}',3,[['match_expression',[1]],['if_expression',[2]]]],
 ['loop-if','fn f(){loop{if ready{}}}',3,[['loop_expression',[1]],['if_expression',[2]]]],
 ['labeled',"fn f(){'outer: loop{if ready{break 'outer;}}}",4,[['loop_expression',[1]],['if_expression',[2]],['break_expression',[1]]]]
];
for(const [id,source,expected,checks] of cases) test(`R08-cognitive-${id}`,async()=>{
 const q=await parse(source,'rust');try{
  assert.equal(q.tree.rootNode.hasError,false);const p=analyze(q.tree,source,'r');
  assert.equal(p.functions.length,1);assert.deepEqual(p.diagnostics,[]);
  const owner=p.functions[0].id,nodes=walk(p.tree).filter(n=>p.ownerByNode.get(n)===owner);
  for(const [type,values] of checks) assert.deepEqual(nodes.filter(n=>n.type===type).map(n=>n.score.cognitive),values,type);
  assert.equal(nodes.reduce((sum,n)=>sum+n.score.cognitive,0),expected);
 }finally{q.dispose()}
});
