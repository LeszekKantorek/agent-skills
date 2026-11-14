import {test} from 'node:test';
import assert from 'node:assert/strict';
import {productionScore} from './production-score.mjs';
async function triple(source,language) { const m=await productionScore(source,language); return [m.cognitive,m.statements,m.cyclomatic]; }
test('equivalent Rust and JS constructions match manually derived triples',async()=>{
 const cases=[
  ['function f(){}','fn f(){}',[0,0,1]],
  ['function f(){a().b();}','fn f(){a().b();}',[0,2,1]],
  ['function f(){let [a,b]=pair;}','fn f(){let (a,b)=pair;}',[0,1,1]],
  ['function f(){if(a){x()}else if(b){y()}else{z()}}','fn f(){if a {x();}else if b {y();}else{z();}}',[3,5,3]],
  ['function f(){for(const x of xs){consume(x);}}','fn f(){for x in xs {consume(x);}}',[1,3,2]],
  ['function f(){if(a){const g=()=>{if(b){if(c){work();}}};}}','fn f(){if a {let g=||{if b {if c {work();}}};}}',[8,5,4]],
  ['function f(){function inner(){save();}}','fn f(){fn inner(){save();}}',[0,2,1]],
  ['function f(){return save();}','fn f(){return save();}',[0,2,1]],
 ];
 for(const [js,rs,expected] of cases){assert.deepEqual(await triple(js,'javascript'),expected,js);assert.deepEqual(await triple(rs,'rust'),expected,rs)}
});
test('comments and literal syntax do not create decisions; interpolation remains code',async()=>{
 assert.deepEqual(await triple('function f(){const s="if(x){}"; const r=/if\\(x\\)/; /* if(a){} */}', 'javascript'),[0,2,1]);
 assert.deepEqual(await triple('fn f(){let s=r#"if x {}"#; /* if x {} */}', 'rust'),[0,1,1]);
 assert.deepEqual(await triple('function f(){const s=`${a ? one() : two()}`;}', 'javascript'),[1,6,2]);
});
