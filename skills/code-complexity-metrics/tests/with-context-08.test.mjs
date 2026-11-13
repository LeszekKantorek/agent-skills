import test from 'node:test';import assert from 'node:assert/strict';import {parse} from '../scripts/parser.mjs';import {analyze} from '../scripts/analyzers/javascript/analyze.mjs';
const walk=n=>[n,...n.children.flatMap(walk)];
test('J08-with-restores-cognitive-context',async()=>{
 const source='function f(){if(a){with(load()){if(b){work();}} if(c){}} if(d){}}';const parser=await parse(source,'javascript');
 try{
  assert.equal(parser.tree.rootNode.hasError,false);const p=analyze(parser.tree,source,'js');assert.equal(p.functions.length,1);assert.deepEqual(p.diagnostics,[]);
  const owner=p.functions[0].id,nodes=walk(p.tree).filter(n=>p.ownerByNode.get(n)===owner),ifs=nodes.filter(n=>n.type==='if_statement'),withNode=nodes.find(n=>n.type==='with_statement');
  assert.deepEqual(ifs.map(n=>n.score.cognitive),[1,2,2,1]);assert.deepEqual(withNode.score,{cognitive:0,cyclomatic:0,statements:1});
  assert.equal(withNode.children.find(n=>n.field==='body').score.statements,0);
  assert.deepEqual(['cognitive','cyclomatic','statements'].map(k=>nodes.reduce((sum,n)=>sum+n.score[k],0)),[6,5,7]);
 }finally{parser.dispose()}
});

test('J08-with-header-retains-cognitive-depth',async()=>{
 const source='function f(){if(top){with(flag?a():b()){if(inner) work();} if(sibling) done();}}';
 const parser=await parse(source,'javascript');
 try {
  assert.equal(parser.tree.rootNode.hasError,false);
  const p=analyze(parser.tree,source,'js');
  assert.equal(p.functions.length,1);
  assert.deepEqual(p.diagnostics,[]);
  const owner=p.functions[0].id;
  const nodes=walk(p.tree).filter(n=>p.ownerByNode.get(n)===owner);
  const ifs=nodes.filter(n=>n.type==='if_statement');
  const withNode=nodes.find(n=>n.type==='with_statement');
  const ternary=nodes.find(n=>n.type==='ternary_expression');
  assert.deepEqual(ifs.map(n=>n.score),[
   {cognitive:1,cyclomatic:1,statements:1},
   {cognitive:2,cyclomatic:1,statements:1},
   {cognitive:2,cyclomatic:1,statements:1},
  ]);
  assert.deepEqual(withNode.score,{cognitive:0,cyclomatic:0,statements:1});
  assert.deepEqual(ternary.score,{cognitive:2,cyclomatic:1,statements:1});
  assert.deepEqual(['cognitive','cyclomatic','statements'].map(k=>nodes.reduce((sum,n)=>sum+n.score[k],0)),[7,5,11]);
 }finally{parser.dispose()}
});
