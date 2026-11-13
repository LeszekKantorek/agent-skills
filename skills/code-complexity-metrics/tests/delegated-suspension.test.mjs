import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../scripts/parser.mjs';
import {analyze} from '../scripts/analyzers/rust/analyze.mjs';
const all=n=>[n,...n.children.flatMap(all)];
test('delegated Rust yield uses the same suspension role',async()=>{
 for(const [s,want] of [['fn f(){yield;}',1],['fn f(){yield work();}',2],['fn f(){let x = yield work();}',3]]) {
  const q=await parse(s,'rust');let p;try{p=analyze(q.tree,s,'C:/fixture.rs')}finally{q.dispose()}
  const nodes=all(p.tree), y=nodes.find(n=>n.type==='yield_expression');assert.ok(y);assert.deepEqual(y.score,{cognitive:0,cyclomatic:0,statements:1});assert.equal(p.ownerByNode.get(y),p.functions[0].id);assert.equal(y.startPosition.row,0);
  const calls=nodes.filter(n=>n.type==='call_expression');assert.equal(calls.length,s.includes('work()')?1:0);assert.ok(calls.every(n=>n.score.statements===1));
  assert.equal(nodes.reduce((sum,n)=>sum+n.score.cognitive,0),0);assert.equal(nodes.reduce((sum,n)=>sum+n.score.cyclomatic,0),1);
  assert.equal(nodes.filter(n=>p.ownerByNode.get(n)===p.functions[0].id).reduce((sum,n)=>sum+n.score.statements,0),want,s);assert.deepEqual(p.diagnostics,[]);
 }
});
