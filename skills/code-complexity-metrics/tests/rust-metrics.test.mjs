import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../scripts/parser.mjs';
import {analyze, prepare} from '../scripts/analyzers/rust/analyze.mjs';
import {cognitive} from '../scripts/analyzers/rust/cognitive.mjs';
const walk = n => [n,...n.children.flatMap(walk)];
async function run(source) { const p=await parse(source,'rust'); try {return analyze(p.tree,source,'file');} finally {p.dispose();} }
const total = p => walk(p.tree).reduce((sum,n)=>sum+n.score.cognitive,0);
const examples=[
  ['fn f(){}',0], ['fn f(){a(b());}',0], ['fn f(){let x=a(b());}',0], ['fn f(){a(b())}',0],
  ['fn f(){if a {if b {}}}',3], ['fn f(){assert!(ready && verify());}',1],
  ['fn f(){if a {let c=||{if b{}}; if d{}} if e{}}',7], ['fn f(){m!(a&&b,c&&d);}',2],
  ['fn f(){let x={prepare();calculate()};}',0], ['fn f(){(a+b());}',0], ['fn f(){(||{work();});}',0],
  ['fn f(){let x=if a {1}else{2};}',2], ['fn f(){match a { A|B if a&&b => 1, _ => 2 };}',2],
  ['fn f(){const A:i32=1; static mut B:i32=2;}',0], ['fn f(){for (a,b) in pairs {}}',1],
  ['fn f(){macro_rules! x { () => { if a {work()} }; } x!();}',0],
  ['fn f(){let c=|| async { work() };}',0],
  ['fn f(){if let Some(x)=a && let Some(y)=b {foo();}}',2],
  ["fn f(){'outer: loop {if ready {break 'outer;}}}",4],
  ['fn f(){(a&&b)==(c&&d);}',2], ['fn f(){a&&f(b||c)&&d;}',2],
  ['fn f(){while let Some(x)=next() {consume(x);}}',1],
  ['fn f(){x+=1; ;}',0], ['fn f()->i32 {if a {1}else{2}}',2],
  ['fn f(){struct S;}',0], ['fn f(){use std::mem;}',0],
  ['fn f()->i32{unsafe {42}}',0], ['fn f()->i32{const {42}}',0],
 ];
for(const [s,expected] of examples) test(`Rust example: ${s}`, async()=>{ const p=await run(s); assert.deepEqual(p.diagnostics,[]); assert.equal(total(p),expected); });
test('Rust: argument boundaries, token locations, owner and preserved diagnostic',async()=>{
 const s='fn f(){m!(a&&b,c&&d); bad!(value; => count);}'; const p=await run(s), all=walk(p.tree), ops=all.filter(n=>n.type==='&&');
 assert.deepEqual(ops.map(n=>n.score),[{cognitive:1},{cognitive:1}]);
 for(const op of ops) {assert.equal(s.slice(op.startIndex,op.endIndex),'&&'); assert.equal(p.ownerByNode.get(op),p.functions[0].id);}
 assert.equal(p.diagnostics.length,1); assert.equal(p.diagnostics[0].owner,p.functions[0].id); assert.deepEqual(p.diagnostics[0].affectedMetrics,['cognitive']);
 assert.equal(total(p),2);
});
test('Rust: nested closure depth is restored for siblings',async()=>{
 const s='fn f(){if a {let c=||{if b{}}; if d{}} if e{}}', p=await run(s);
 const conditions=walk(p.tree).filter(n=>n.type==='if_expression');
 assert.deepEqual(conditions.map(n=>n.score.cognitive),[1,3,2,1]);
 assert.ok(conditions.every(n=>p.ownerByNode.get(n)===p.functions[0].id));
});
test('Rust: logical source order and argument boundaries',async()=>{
 for(const [s, expected] of [['fn f(){(a&&b)||(c&&d);}',[1,1,1]], ['fn f(){a&&f(b||c)&&d;}',[1,1,0]]]) {
  const p=await run(s), ops=walk(p.tree).filter(n=>['&&','||'].includes(n.type)).sort((a,b)=>a.startIndex-b.startIndex);
  assert.deepEqual(ops.map(n=>n.score.cognitive),expected);
 }
});
test('Rust: Cognitive scoring preserves prepared structure and ownership',async()=>{
 const source='fn f(){assert!(ready && verify());}', parser=await parse(source,'rust');
 try {
  const p=prepare(parser.tree,source,'f');
  const structure = () => JSON.stringify(p.tree, (key,value) => key==='score' ? undefined : value);
  const shape=structure(), owners=[...p.ownerByNode];
  assert.equal(total(p),0);
  cognitive(p);
  assert.equal(structure(),shape);
  assert.deepEqual([...p.ownerByNode],owners);
  assert.equal(total(p),1);
  const fresh=analyze(parser.tree,source,'f');
  assert.equal(total(fresh),1);
  assert.deepEqual(walk(fresh.tree).map(n=>n.score),walk(p.tree).map(n=>n.score));
 } finally {parser.dispose();}
});
test('Rust: self-contained true airspeed fixture',async()=>{
 const s=`fn f() { for value in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY, -0.01] { assert!(TrueAirspeed::new(value).is_err()); } for value in [0.0, 85.5, 999.0, 999.01, 1000.0, f64::MAX] { assert_eq!(TrueAirspeed::new(value).unwrap().knots(), value); } }`;
 const p=await run(s); assert.deepEqual(p.diagnostics,[]); assert.equal(total(p),2);
});
