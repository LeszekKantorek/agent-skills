import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../scripts/parser.mjs';
import {analyze, prepare} from '../scripts/analyzers/rust/analyze.mjs';
import {cognitive} from '../scripts/analyzers/rust/cognitive.mjs';
import {cyclomatic} from '../scripts/analyzers/rust/cyclomatic.mjs';
import {statements} from '../scripts/analyzers/rust/statements.mjs';
const walk = n => [n,...n.children.flatMap(walk)];
async function run(source) { const p=await parse(source,'rust'); try {return analyze(p.tree,source,'file');} finally {p.dispose();} }
const total = p => walk(p.tree).reduce((a,n)=>a.map((v,i)=>v+n.score[['cognitive','cyclomatic','statements'][i]]),[0,0,0]);
const examples=[
  ['fn f(){}',[0,1,0]], ['fn f(){a(b());}',[0,1,2]], ['fn f(){let x=a(b());}',[0,1,3]], ['fn f(){a(b())}',[0,1,3]],
  ['fn f(){if a {if b {}}}',[3,3,2]], ['fn f(){assert!(ready && verify());}',[1,2,2]],
  ['fn f(){if a {let c=||{if b{}}; if d{}} if e{}}',[7,5,5]], ['fn f(){m!(a&&b,c&&d);}',[2,3,1]],
  ['fn f(){let x={prepare();calculate()};}',[0,1,5]], ['fn f(){(a+b());}',[0,1,1]], ['fn f(){(||{work();});}',[0,1,2]],
  ['fn f(){let x=if a {1}else{2};}',[2,2,4]], ['fn f(){match a { A|B if a&&b => 1, _ => 2 };}',[2,4,3]],
  ['fn f(){const A:i32=1; static mut B:i32=2;}',[0,1,2]], ['fn f(){for (a,b) in pairs {}}',[1,2,2]],
  ['fn f(){macro_rules! x { () => { if a {work()} }; } x!();}',[0,1,2]],
  ['fn f(){let c=|| async { work() };}',[0,1,4]],
  ['fn f(){if let Some(x)=a && let Some(y)=b {foo();}}',[2,3,4]],
  ["fn f(){'outer: loop {if ready {break 'outer;}}}",[4,3,3]],
  ['fn f(){(a&&b)==(c&&d);}',[2,3,1]], ['fn f(){a&&f(b||c)&&d;}',[2,4,1]],
  ['fn f(){while let Some(x)=next() {consume(x);}}',[1,2,4]],
  ['fn f(){x+=1; ;}',[0,1,2]], ['fn f()->i32 {if a {1}else{2}}',[2,2,3]],
  ['fn f(){struct S;}',[0,1,0]], ['fn f(){use std::mem;}',[0,1,0]],
  ['fn f()->i32{unsafe {42}}',[0,1,2]], ['fn f()->i32{const {42}}',[0,1,2]],
 ];
for(const [s,expected] of examples) test(`Rust example: ${s}`, async()=>{ const p=await run(s); assert.deepEqual(p.diagnostics,[]); assert.deepEqual(total(p),expected); });
test('Rust: argument boundaries, token locations, owner and preserved diagnostic',async()=>{
 const s='fn f(){m!(a&&b,c&&d); bad!(value; => count);}'; const p=await run(s), all=walk(p.tree), ops=all.filter(n=>n.type==='&&');
 assert.deepEqual(ops.map(n=>n.score),[{cognitive:1,cyclomatic:1,statements:0},{cognitive:1,cyclomatic:1,statements:0}]);
 for(const op of ops) {assert.equal(s.slice(op.startIndex,op.endIndex),'&&'); assert.equal(p.ownerByNode.get(op),p.functions[0].id);}
 assert.equal(p.diagnostics.length,1); assert.equal(p.diagnostics[0].owner,p.functions[0].id); assert.deepEqual(p.diagnostics[0].affectedMetrics,['cognitive','cyclomatic','statements']);
 assert.deepEqual(total(p),[2,3,2]);
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
  assert.deepEqual(ops.map(n=>n.score.cognitive),expected); assert.ok(ops.every(n=>n.score.cyclomatic===1));
 }
});
test('Rust: passes preserve structure and other fields, fresh analysis',async()=>{
 const source='fn f(){assert!(ready && verify());}'; const parser=await parse(source,'rust');
 try {
  const p=prepare(parser.tree,source,'f');
  const structure = () => JSON.stringify(p.tree, (key,value) => key==='score' ? undefined : value);
  const shape=structure(), scores=()=>walk(p.tree).map(n=>({...n.score}));
  const before=scores(); cognitive(p); assert.equal(structure(),shape);
  const afterCognitive=scores();
  assert.deepEqual(afterCognitive.map(x=>[x.cyclomatic,x.statements]),before.map(x=>[x.cyclomatic,x.statements]));
  cyclomatic(p); assert.equal(structure(),shape);
  const afterCyclomatic=scores();
  assert.deepEqual(afterCyclomatic.map(x=>[x.cognitive,x.statements]),afterCognitive.map(x=>[x.cognitive,x.statements]));
  statements(p); assert.equal(structure(),shape);
  assert.deepEqual(scores().map(x=>[x.cognitive,x.cyclomatic]),afterCyclomatic.map(x=>[x.cognitive,x.cyclomatic]));
  assert.deepEqual(total(p),[1,2,2]); const fresh=analyze(parser.tree,source,'f'); assert.deepEqual(total(fresh),[1,2,2]);
 } finally {parser.dispose();}
});
test('Rust: self-contained true airspeed fixture',async()=>{
 const s=`fn f() { for value in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY, -0.01] { assert!(TrueAirspeed::new(value).is_err()); } for value in [0.0, 85.5, 999.0, 999.01, 1000.0, f64::MAX] { assert_eq!(TrueAirspeed::new(value).unwrap().knots(), value); } }`;
 const p=await run(s); assert.deepEqual(p.diagnostics,[]); assert.deepEqual(total(p),[2,3,11]);
});
