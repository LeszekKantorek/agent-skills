import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../scripts/parser.mjs';
import {analyze} from '../scripts/analyzers/rust/analyze.mjs';
const walk=n=>[n,...n.children.flatMap(walk)];
async function run(source){const p=await parse(source,'rust');try{return analyze(p.tree,source,'file');}finally{p.dispose();}}
const sum=nodes=>nodes.reduce((a,n)=>a.map((v,i)=>v+n.score[['cognitive','cyclomatic','statements'][i]]),[0,0,0]);
// M14: .local/msfs2024-artificial-horizon/src/providers/simconnect/native.rs:870-876
const content=`
        static CLOSE_RESULT: Cell<i32> = const { Cell::new(0) };
        static CLOSE_CALLS: Cell<u32> = const { Cell::new(0) };
        static NEXT_RESULT: Cell<i32> = const { Cell::new(E_FAIL) };
        static NEXT_PACKET: std::cell::RefCell<Vec<u8>> = const { std::cell::RefCell::new(Vec::new()) };
        static ADD_FIELDS: std::cell::RefCell<Vec<(String, String)>> = const { std::cell::RefCell::new(Vec::new()) };
    `;
test('M14 full declarations in module and outer retain original locations and ordinary scoring',async()=>{
 for(const name of ['thread_local','renamed']) for(const outer of [false,true]) {
  const macro=`${name}! {${content}}`, source=`// 😀\r\n${outer?'fn f(){\n':''}${macro}\n${outer?'}\n':''}fn g(){}`;
  const p=await run(source), m=walk(p.tree).find(n=>n.type==='macro_invocation'), items=m.children.filter(n=>n.field==='declaration');
  assert.deepEqual(p.diagnostics,[]); assert.equal(items.length,5); assert.deepEqual(items.map(n=>n.type),Array(5).fill('static_item'));
  assert.equal(items.map(n=>source.slice(n.startIndex,n.endIndex)).join('\n'),content.trim().split('\n').map(x=>x.trim()).join('\n'));
  assert.equal(walk(m).filter(n=>n.type==='call_expression').length,7);
  for(const n of items) assert.equal(p.ownerByNode.get(n),outer?p.functions[0].id:null);
  assert.deepEqual(p.functions.map(f=>f.name),outer?['f','g']:['g']);
  // Macro + 5 declarators + 5 blocks + 7 calls + 5 block results.
  assert.deepEqual(sum(walk(m)),[0,0,23+(outer?1:0)]);
 }
});
test('declaration list recurses into expressions, types and closures',async()=>{
 const source='fn f(){ m!{ const A: [u8; size()] = const { if ready && check() { load() } else { other() } }; static mut B: fn() -> i32 = || value(); } }';
 const p=await run(source), m=walk(p.tree).find(n=>n.type==='macro_invocation'); assert.deepEqual(p.diagnostics,[]);
 assert.deepEqual(m.children.filter(n=>n.field==='declaration').map(n=>n.type),['const_item','static_item']);
 assert.equal(walk(m).find(n=>n.type==='closure_expression') && p.functions.length,1);
 for(const name of ['size()','check()','load()','other()','value()']) assert.ok(walk(m).some(n=>n.type==='call_expression' && source.slice(n.startIndex,n.endIndex)===name),name);
 assert.ok(sum(walk(m))[0]>0);
 const q=await run('m!{static C: fn() = || call();}\nfn g(){}'); assert.deepEqual(q.diagnostics,[]); assert.deepEqual(q.functions.map(f=>f.name),['C','g']);
});
test('incomplete, mixed, template and metavariable lists are rejected atomically',async()=>{
 for(const content of ['static A:T=load(); static B:T=;', 'static A:T=load(); expr()', 'static A:T=load(); fn other(){}', 'static A:T;', 'static $name:T=load();', 'static A:T=$value;', 'static A:T=load(); #[cfg(test)]', 'static A:T=load(); ,']) {
  for(const outer of [false,true]) {const p=await run(`${outer?'fn f(){':''}m!{${content}}${outer?'}':''}\nfn g(){}`); const m=walk(p.tree).find(n=>n.type==='macro_invocation'); assert.ok(p.diagnostics.length,content); assert.equal(m.children.filter(n=>n.field==='declaration').length,0,content); assert.equal(p.diagnostics[0].affectsFunctionDiscovery,!outer,content);}
 }
});
test('single declaration contributes a declarator without a synthetic wrapper',async()=>{
 const p=await run('fn f(){m!{static X: T = load();};}'); assert.deepEqual(p.diagnostics,[]);
 const m=walk(p.tree).find(n=>n.type==='macro_invocation'); assert.deepEqual(sum(walk(m)),[0,0,3]);
 const q=await run('m!{static X:T=nested!($value);}\nfn g(){}'); assert.equal(q.diagnostics.length,1); assert.equal(q.diagnostics[0].affectsFunctionDiscovery,true);
});
test('doc comments have the same list position requirements as attributes',async()=>{
 for(const doc of ['/// docs\n','/** docs */']) {
  const source=`m!{${doc} /* ordinary */ static X:fn()=|| load(); // ordinary\n}\nfn g(){}`;
  const p=await run(source); assert.deepEqual(p.diagnostics,[],doc); assert.deepEqual(p.functions.map(f=>f.name),['X','g']);
 }
 for(const suffix of ['/// dangling\n','/** dangling */','#[doc="dangling"]']) {
  const p=await run(`m!{static X:fn()=|| load(); ${suffix}}\nfn g(){}`); assert.ok(p.diagnostics.length,suffix);
  const m=walk(p.tree).find(n=>n.type==='macro_invocation'); assert.equal(m.children.filter(n=>n.field==='declaration').length,0); assert.equal(p.diagnostics[0].affectsFunctionDiscovery,true);
 }
 for(const doc of ['//! inner\n','/*! inner */','#![doc="inner"]']) {
  const p=await run(`m!{${doc} static X:T=load();}\nfn g(){}`); assert.ok(p.diagnostics.length,doc);
  const m=walk(p.tree).find(n=>n.type==='macro_invocation'); assert.equal(m.children.filter(n=>n.field==='declaration').length,0); assert.equal(p.diagnostics[0].affectsFunctionDiscovery,true);
 }
});
test('direct doc attributes occur only at the initializer boundary',async()=>{
 for(const keyword of ['static','const']) {
  for(const doc of ['/** docs */','/// docs\n']) {
   for(const content of [`${keyword} ${doc} X:fn()=|| load();`,`${keyword} X ${doc}:fn()=|| load();`,`${keyword} X:fn() ${doc}=|| load();`,`${keyword} X:fn()=|| load() ${doc};`]) {
    const p=await run(`m!{${content}}\nfn g(){}`); assert.ok(p.diagnostics.length,content);
    const m=walk(p.tree).find(n=>n.type==='macro_invocation'); assert.equal(m.children.filter(n=>n.field==='declaration').length,0);
   }
   const p=await run(`m!{${keyword} X:fn()= /* ordinary */ ${doc} /* ordinary */ || load();}\nfn g(){}`);
   assert.deepEqual(p.diagnostics,[]); assert.deepEqual(p.functions.map(f=>f.name),['X','g']);
  }
  for(const doc of ['/*! inner */','//! inner\n']) {const p=await run(`m!{${keyword} X:T=${doc} load();}`);assert.ok(p.diagnostics.length,doc);}
  const plain=await run(`m!{${keyword} /* a */ X /* b */ : T /* c */ = load() /* d */;}`);assert.deepEqual(plain.diagnostics,[]);
 }
});

test('nested docs retain their own declaration context',async()=>{
 const p=await run('m!{static X:i32={ /** docs */ const INNER:i32=1; INNER };}\nfn g(){}');
 assert.deepEqual(p.diagnostics,[]); const m=walk(p.tree).find(n=>n.type==='macro_invocation');
 assert.equal(m.children.filter(n=>n.field==='declaration').length,1);
 assert.ok(walk(m).some(n=>n.type==='const_item'));
});