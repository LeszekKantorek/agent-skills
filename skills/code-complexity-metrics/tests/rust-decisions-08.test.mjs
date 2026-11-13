import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../scripts/parser.mjs';
import {analyze} from '../scripts/analyzers/rust/analyze.mjs';
const walk=n=>[n,...n.children.flatMap(walk)];
// Written outer base is 1; only the control nodes or arms listed add decisions.
const cases=[
 ['if-let','fn f(){if let Some(x)=item{}}',2,'if_expression',[1],'let_condition'],
 ['while-let','fn f(){while let Some(x)=item{}}',2,'while_expression',[1],'let_condition'],
 ['for-pattern','fn f(){for (x,y) in pairs{}}',2,'for_expression',[1],'tuple_pattern'],
 ['guard','fn f(){match x {A if ready => {},_=>{}}}',3,'match_arm',[1,1],'match_pattern'],
 ['guard-logical','fn f(){match x {A if a&&b => {},_=>{}}}',4,'match_arm',[1,1],'match_pattern'],
 ['match-total','fn f(){match x {1=>first(),2=>second(),_=>third()};}',4,'match_arm',[1,1,1],'match_expression'],
 ['propagation','fn f(){load()?;}',1,'try_expression',[0],'try_expression'],
 ['macro','fn f(){hello!();}',1,'macro_invocation',[0],'macro_invocation'],
 ['macro-square','fn f(){hello![a&&b];}',2,'macro_invocation',[0],'macro_invocation'],
 ['macro-braces','fn f(){hello!{a&&b};}',2,'macro_invocation',[0],'macro_invocation'],
 ['macro-definition','fn f(){macro_rules! x{()=>{if b{}}}}',1,'macro_definition',[0],'macro_definition']
];
for(const [id,source,expected,type,local,zero] of cases) test(`R08-decision-${id}`,async()=>{
 const q=await parse(source,'rust');try {
  assert.equal(q.tree.rootNode.hasError,false);const p=analyze(q.tree,source,'r');
  assert.equal(p.functions.length,1);assert.deepEqual(p.diagnostics,[]);
  const owner=p.functions[0].id,nodes=walk(p.tree).filter(n=>p.ownerByNode.get(n)===owner);
  assert.deepEqual(nodes.filter(n=>n.type===type).map(n=>n.score.cyclomatic),local);
  assert.ok(nodes.filter(n=>n.type===zero).length>0);
  assert.ok(nodes.filter(n=>n.type===zero).every(n=>n.score.cyclomatic===0));
  if(['guard-logical','macro-square','macro-braces'].includes(id)) assert.deepEqual(nodes.filter(n=>n.type==='&&').map(n=>n.score.cyclomatic),[1]);
  assert.equal(p.functions[0].root.score.cyclomatic,1);
  assert.equal(nodes.reduce((sum,n)=>sum+n.score.cyclomatic,0),expected);
 }finally{q.dispose()}
});
