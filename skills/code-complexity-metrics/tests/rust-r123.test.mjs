import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../scripts/parser.mjs';
import {analyze} from '../scripts/analyzers/rust/analyze.mjs';
const walk=n=>[n,...n.children.flatMap(walk)];
async function run(s){const p=await parse(s,'rust'); try{return analyze(p.tree,s,'file');}finally{p.dispose();}}
const score=n=>n.score.cognitive;
const sum=nodes=>nodes.reduce((sum,n)=>sum+n.score.cognitive,0);

test('R123-01: declarations and tail literals keep their source rows and owners',async()=>{
 for(const s of ['fn f(){\nextern crate core;\n}', 'fn f(){\nextern crate core as c;\nwork();\n}', 'fn f(){\nextern crate core;\n;\n}', 'fn f(){\n{ extern crate core; }\n}']){
  const p=await run(s), nodes=walk(p.tree), declaration=nodes.find(n=>n.type==='extern_crate_declaration');
  assert.deepEqual(p.diagnostics,[]); assert.equal(score(declaration),0,s);
  assert.equal(p.ownerByNode.get(declaration),p.functions[0].id); assert.equal(declaration.startPosition.row,1);
  assert.equal(s.slice(declaration.startIndex,declaration.endIndex).startsWith('extern crate'),true);
 }
 const tail=await run('fn f()->i32{\n42\n}'); const literal=walk(tail.tree).find(n=>n.type==='integer_literal');
 assert.equal(score(literal),0); assert.equal(literal.startPosition.row,1); assert.equal(tail.ownerByNode.get(literal),tail.functions[0].id);
});

test('R123-02: attributed macro arguments retain roles, children, owner and explain positions',async()=>{
 const s='fn f(){\n m!(#[cfg(all())] (a() && b()), #[allow(unused)] c(),);\n}';
 const p=await run(s), nodes=walk(p.tree), macro=nodes.find(n=>n.type==='macro_invocation'), args=macro.children.filter(n=>n.field==='argument');
 assert.deepEqual(p.diagnostics,[]); assert.deepEqual(args.map(n=>s.slice(n.startIndex,n.endIndex)),['(a() && b())','c()']);
 assert.equal(macro.children.filter(n=>n.type==='attribute_item').length,2);
 assert.equal(new Set(nodes).size,nodes.length); assert.equal(p.ownerByNode.size,nodes.length);
 const op=nodes.find(n=>n.type==='&&'), calls=nodes.filter(n=>n.type==='call_expression');
 assert.equal(score(op),1); assert.deepEqual(calls.map(score),[0,0,0]);
 for(const n of [macro,...args,op,...calls]) {assert.equal(p.ownerByNode.get(n),p.functions[0].id); assert.equal(n.startPosition.row,1); assert.equal(s.slice(n.startIndex,n.endIndex).length,n.endIndex-n.startIndex);}
 assert.equal(op.startIndex,s.indexOf('&&')); assert.equal(s.slice(op.startIndex,op.endIndex),'&&');
 assert.equal(sum(nodes.filter(n=>n.startPosition.row===1)),1);
});

test('R123-02: a cfg attribute does not filter a complete expression',async()=>{
 const s='fn f(){\n m!(#[cfg(any())] /* note */ #[allow(unused)] (a() && b()));\n}', p=await run(s), nodes=walk(p.tree);
 const macro=nodes.find(n=>n.type==='macro_invocation'), arg=macro.children.find(n=>n.field==='argument'), op=nodes.find(n=>n.type==='&&');
 assert.deepEqual(p.diagnostics,[]); assert.equal(macro.children.filter(n=>n.type==='attribute_item').length,2);
 assert.equal(macro.children.filter(n=>n.type==='block_comment').length,1); assert.equal(p.presentation.comments.length,1);
 assert.equal(s.slice(arg.startIndex,arg.endIndex),'(a() && b())'); assert.equal(score(op),1);
 assert.equal(sum(nodes),1); assert.equal(sum(nodes.filter(n=>n.startPosition.row===1)),1);
 assert.equal(p.ownerByNode.get(op),p.functions[0].id); assert.equal(op.startIndex,s.indexOf('&&'));
});

test('R123-02: attributed module closure is discovered; incomplete lists remain unsupported',async()=>{
 const s='m!(#[cfg(all())] (|| {}));\nfn good(){}', p=await run(s), nodes=walk(p.tree), macro=nodes.find(n=>n.type==='macro_invocation'), closure=nodes.find(n=>n.type==='closure_expression');
 assert.deepEqual(p.diagnostics,[]); assert.deepEqual(p.functions.map(f=>f.name),[null,'good']);
 assert.deepEqual(p.functions.map(f=>f.id),['["file",0]','["file",1]']);
 assert.equal(p.ownerByNode.get(macro),null); assert.equal(p.ownerByNode.get(closure),p.functions[0].id);
 assert.equal(score(closure),0); assert.equal(closure.startPosition.row,0); assert.equal(p.functions[1].root.startPosition.row,1);
 for(const content of ['#[cfg(all())]','a, #[cfg(all())]','a; => b']) {const q=await run(`fn f(){m!(${content});}`); assert.ok(q.diagnostics.some(d=>d.code==='rust-unsupported-macro-arguments')); assert.equal(walk(q.tree).find(n=>n.type==='macro_invocation').children.filter(n=>n.field==='argument').length,0);}
});
