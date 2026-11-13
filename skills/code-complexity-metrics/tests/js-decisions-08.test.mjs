import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../scripts/parser.mjs';
import {analyze} from '../scripts/analyzers/javascript/analyze.mjs';
const walk=n=>[n,...n.children.flatMap(walk)];
const cases=[
 ['nullish','function f(){return a ?? b;}',2,'??',[1]],
 ['optional','function f(){return a?.b;}',1,'optional_chain',[0]],
 ['and-assign','function f(){a &&= b;}',1,'augmented_assignment_expression',[0]],
 ['or-assign','function f(){a ||= b;}',1,'augmented_assignment_expression',[0]],
 ['nullish-assign','function f(){a ??= b;}',1,'augmented_assignment_expression',[0]],
 ['switch','function f(){switch(x){case 1:break;case 2:break;default:break;}}',4,'branch',[1,1,1]]
];
for(const [id,source,cyclomatic,type,local] of cases) test(`J08-decision-${id}`,async()=>{
 const q=await parse(source,'javascript');
 try {
  assert.equal(q.tree.rootNode.hasError,false);const p=analyze(q.tree,source,'js');
  assert.equal(p.functions.length,1);assert.deepEqual(p.diagnostics,[]);
  const owner=p.functions[0].id,nodes=walk(p.tree).filter(n=>p.ownerByNode.get(n)===owner);
  const selected=nodes.filter(n=>type==='branch'?['switch_case','switch_default'].includes(n.type):n.type===type);
  assert.deepEqual(selected.map(n=>n.score.cyclomatic),local);
  assert.equal(p.functions[0].root.score.cyclomatic,1);
  assert.equal(nodes.reduce((sum,n)=>sum+n.score.cyclomatic,0),cyclomatic);
 } finally {q.dispose()}
});
