import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../scripts/parser.mjs';
import {analyze} from '../scripts/analyzers/javascript/analyze.mjs';
const walk=n=>[n,...n.children.flatMap(walk)];
// try/finally and optional/nullish add zero; ternary uses the enclosing depth.
const cases=[
 ['try-finally','function f(){try {if(a){}} finally {if(b){}}}',2,[['try_statement',[0]],['finally_clause',[0]],['if_statement',[1,1]]]],
 ['optional','function f(){return a?.b;}',0,[['optional_chain',[0]]]],
 ['nullish','function f(){return (a && b) ?? (c && d);}',2,[['??',[0]],['&&',[1,1]]]],
 ['header','function f(){if(a?b:c){}}',2,[['if_statement',[1]],['ternary_expression',[1]]]],
 ['body','function f(){if(a){use(b?c:a);}}',3,[['if_statement',[1]],['ternary_expression',[2]],['call_expression',[0]]]]
];
for(const [id,source,expected,checks] of cases) test(`J08-cognitive-${id}`,async()=>{
 const q=await parse(source,'javascript');try {
  assert.equal(q.tree.rootNode.hasError,false);const p=analyze(q.tree,source,'js');
  assert.equal(p.functions.length,1);assert.deepEqual(p.diagnostics,[]);
  const owner=p.functions[0].id,nodes=walk(p.tree).filter(n=>p.ownerByNode.get(n)===owner);
  for(const [type,values] of checks) assert.deepEqual(nodes.filter(n=>n.type===type).map(n=>n.score.cognitive),values,type);
  assert.equal(nodes.reduce((sum,n)=>sum+n.score.cognitive,0),expected);
 }finally{q.dispose()}
});
