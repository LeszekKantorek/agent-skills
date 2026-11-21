import {test} from 'node:test';
import assert from 'node:assert/strict';
import {productionCognitive as score} from './production-score.mjs';
test('equivalent Rust and JS constructions match manually derived Cognitive scores',async()=>{
 const cases=[
  ['function f(){}','fn f(){}',0],
  ['function f(){a().b();}','fn f(){a().b();}',0],
  ['function f(){let [a,b]=pair;}','fn f(){let (a,b)=pair;}',0],
  ['function f(){if(a){x()}else if(b){y()}else{z()}}','fn f(){if a {x();}else if b {y();}else{z();}}',3],
  ['function f(){for(const x of xs){consume(x);}}','fn f(){for x in xs {consume(x);}}',1],
  ['function f(){if(a){const g=()=>{if(b){if(c){work();}}};}}','fn f(){if a {let g=||{if b {if c {work();}}};}}',8],
  ['function f(){function inner(){save();}}','fn f(){fn inner(){save();}}',0],
  ['function f(){return save();}','fn f(){return save();}',0],
 ];
 for(const [js,rs,expected] of cases){assert.equal(await score(js,'javascript'),expected,js);assert.equal(await score(rs,'rust'),expected,rs)}
});
test('comments and literal syntax do not create decisions; interpolation remains code',async()=>{
 assert.equal(await score('function f(){const s="if(x){}"; const r=/if\\(x\\)/; /* if(a){} */}', 'javascript'),0);
 assert.equal(await score('fn f(){let s=r#"if x {}"#; /* if x {} */}', 'rust'),0);
 assert.equal(await score('function f(){const s=`${a ? one() : two()}`;}', 'javascript'),1);
});
