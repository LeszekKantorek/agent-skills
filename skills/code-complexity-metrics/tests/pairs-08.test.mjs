import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../scripts/parser.mjs';
import {analyze as rust} from '../scripts/analyzers/rust/analyze.mjs';
import {analyze as javascript} from '../scripts/analyzers/javascript/analyze.mjs';
const walk=n=>[n,...n.children.flatMap(walk)];
async function check(language,source,expected,callCount,id) {
 const parser=await parse(source,language);
 try {
  assert.equal(parser.tree.rootNode.hasError,false);
  const p=(language==='rust'?rust:javascript)(parser.tree,source,`pair.${language}`);
  assert.equal(p.functions.length,1);assert.deepEqual(p.diagnostics,[]);
  const fn=p.functions[0], nodes=walk(p.tree).filter(n=>p.ownerByNode.get(n)===fn.id);
  assert.equal(nodes.reduce((sum,n)=>sum+n.score.cognitive,0),expected);

  assert.equal(fn.root.score.cognitive,0);

  const calls=nodes.filter(n=>n.type==='call_expression');
  assert.equal(calls.length,callCount);

  assert.ok(calls.every(n=>n.score.cognitive===0));
  if (id==='if-chain') {
   const controls=nodes.filter(n=>['if_expression','if_statement'].includes(n.type));
   assert.equal(controls.length,2);
   assert.deepEqual(controls.map(n=>n.score),Array(2).fill({cognitive:1}));
   const elses=nodes.filter(n=>n.type==='else_clause' && n.score.cognitive===1);
   assert.equal(elses.length,1);
   assert.deepEqual(elses[0].score,{cognitive:1});
  }
  if (id==='loop') {
   const controls=nodes.filter(n=>['for_expression','for_in_statement'].includes(n.type));
   assert.equal(controls.length,1);
   assert.deepEqual(controls[0].score,{cognitive:1});
  }
  for (const n of nodes.filter(n=>n!==fn.root && ['function_item','function_declaration'].includes(n.type))) {

   assert.equal(n.score.cognitive,0,'nested declaration adds no Cognitive point');

  }
 } finally {parser.dispose()}
}
// Compare Cognitive points and call ownership in equivalent functions.
const cases=[
 ['empty','fn f(){}','function f(){}',0,0],
 ['chain','fn f(){a().b();}','function f(){a().b();}',0,2],
 // Two conditions and one else contribute one point each.
 ['if-chain','fn f(){if a{x();}else if b{y();}else{z();}}','function f(){if(a){x();}else if(b){y();}else{z();}}',3,3],
 ['loop','fn f(){for x in xs{consume(x);}}','function f(){for(const x of xs){consume(x);}}',1,1],
 ['nested-function','fn f(){fn inner(){save();}}','function f(){function inner(){save();}}',0,1],
 ['return-call','fn f(){return save();}','function f(){return save();}',0,1]
];
for(const [id,rs,js,expected,calls] of cases) test(`P08-${id}`,async()=>{
 await check('rust',rs,expected,calls,id);
 await check('javascript',js,expected,calls,id);
});
