import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../scripts/parser.mjs';
import {analyze as rust} from '../scripts/analyzers/rust/analyze.mjs';
import {analyze as javascript} from '../scripts/analyzers/javascript/analyze.mjs';
const walk=n=>[n,...n.children.flatMap(walk)];
// Each if contributes one point plus its nesting depth.
const cases=[
 ['flat','fn f(){if a{} if b{} if c{}}','function f(){if(a){} if(b){} if(c){}}',3,[1,1,1]],
 ['nested','fn f(){if a{if b{if c{}}}}','function f(){if(a){if(b){if(c){}}}}',6,[1,2,3]],
 ['closure','fn f(){if a{let x=||{if b{if c{}}};}}','function f(){if(a){const x=()=>{if(b){if(c){}}};}}',8,[1,3,4]]
];
for(const [id,rs,js,expected,local] of cases) for(const [language,source] of [['rust',rs],['javascript',js]]) {
 test(`C08-${language}-${id}`,async()=>{
  const q=await parse(source,language);try{
   assert.equal(q.tree.rootNode.hasError,false);const p=(language==='rust'?rust:javascript)(q.tree,source,'c');
   assert.equal(p.functions.length,1);assert.deepEqual(p.diagnostics,[]);
   const owner=p.functions[0].id,nodes=walk(p.tree).filter(n=>p.ownerByNode.get(n)===owner);
   const ifs=nodes.filter(n=>['if_expression','if_statement'].includes(n.type));
   assert.deepEqual(ifs.map(n=>n.score.cognitive),local);

   assert.equal(nodes.reduce((sum,n)=>sum+n.score.cognitive,0),expected);
  }finally{q.dispose()}
 });
}
