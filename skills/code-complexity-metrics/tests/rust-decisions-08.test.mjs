import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../scripts/parser.mjs';
import {analyze} from '../scripts/analyzers/rust/analyze.mjs';
const walk=n=>[n,...n.children.flatMap(walk)];
// Control expressions and logical sequences contribute Cognitive points.
const cases=[
 ['if-let','fn f(){if let Some(x)=item{}}',1,'if_expression',[1],'let_condition'],
 ['while-let','fn f(){while let Some(x)=item{}}',1,'while_expression',[1],'let_condition'],
 ['for-pattern','fn f(){for (x,y) in pairs{}}',1,'for_expression',[1],'tuple_pattern'],
 ['guard','fn f(){match x {A if ready => {},_=>{}}}',1,'match_arm',[0,0],'match_pattern'],
 ['guard-logical','fn f(){match x {A if a&&b => {},_=>{}}}',2,'match_arm',[0,0],'match_pattern'],
 ['match-total','fn f(){match x {1=>first(),2=>second(),_=>third()};}',1,'match_arm',[0,0,0],'match_expression'],
 ['propagation','fn f(){load()?;}',0,'try_expression',[0],'try_expression'],
 ['macro','fn f(){hello!();}',0,'macro_invocation',[0],'macro_invocation'],
 ['macro-square','fn f(){hello![a&&b];}',1,'macro_invocation',[0],'macro_invocation'],
 ['macro-braces','fn f(){hello!{a&&b};}',1,'macro_invocation',[0],'macro_invocation'],
 ['macro-definition','fn f(){macro_rules! x{()=>{if b{}}}}',0,'macro_definition',[0],'macro_definition']
];
for(const [id,source,expected,type,local,zero] of cases) test(`R08-decision-${id}`,async()=>{
 const q=await parse(source,'rust');try {
  assert.equal(q.tree.rootNode.hasError,false);const p=analyze(q.tree,source,'r');
  assert.equal(p.functions.length,1);assert.deepEqual(p.diagnostics,[]);
  const owner=p.functions[0].id,nodes=walk(p.tree).filter(n=>p.ownerByNode.get(n)===owner);
  assert.deepEqual(nodes.filter(n=>n.type===type).map(n=>n.score.cognitive),local);
  assert.ok(nodes.filter(n=>n.type===zero).length>0);
  if(['guard-logical','macro-square','macro-braces'].includes(id)) assert.deepEqual(nodes.filter(n=>n.type==='&&').map(n=>n.score.cognitive),[1]);
  assert.equal(p.functions[0].root.score.cognitive,0);
  assert.equal(nodes.reduce((sum,n)=>sum+n.score.cognitive,0),expected);
 }finally{q.dispose()}
});
