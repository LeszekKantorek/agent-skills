import { test } from 'node:test';
import assert from 'node:assert/strict';
import {productionCognitive as score} from './production-score.mjs';
test('decisions and nesting use project rules in both languages',async()=>{
 for (const [lang, flat,nested] of [
  ['javascript','function f(){if(a){} if(b){} if(c){}}','function f(){if(a){if(b){if(c){}}}}'],
  ['rust','fn f(){if a {} if b {} if c {}}','fn f(){if a {if b {if c {}}}}'],
 ]) { assert.equal(await score(flat,lang),3); assert.equal(await score(nested,lang),6); }
});
test('logical sequences add points when operators change',async()=>{
 assert.equal(await score('function f(){return a || b && c || d;}','javascript'),3);
 assert.equal(await score('fn f(){return a || b && c || d;}','rust'),3);
});
test('ternary is a single cognitive decision',async()=>{
 assert.equal(await score('function f(){if(a ? b : c){}}','javascript'),2);
});
test('control flow and nesting rules',async()=>{
 for(const [lang,source,expected] of [
  ['javascript','function f(){if(a){}else if(b){}else{}}',3],
  ['rust','fn f(){if a {} else if b {} else {}}',3],
  ['javascript','function f(){switch(x){case 1:break;case 2:break;default:break;}}',1],
  ['rust','fn f(){match x {1=>{},2=>{},_=>{}}}',1],
  ['javascript','function f(){if(a){const x=()=>{if(b){if(c){}}}}}',8],
  ['rust','fn f(){if a {let x=||{if b {if c {}}};}}',8],
 ]) assert.equal(await score(source,lang),expected,source);
});
test('comments do not change else-if nesting',async()=>{
 assert.equal(await score('function f(){if(a){}else /* x */ if(b){}}','javascript'),2);
});
test('comments in grouping preserve logical sequence',async()=>{
 assert.equal(await score('function f(){return a && (/* x */ b && c);}','javascript'),1);
});

test('Cognitive increases by one per flat decision',async()=>{
 for(const n of [4,8,64]) {
  assert.equal(await score(`function f(){${'if(a){} '.repeat(n)}}`,'javascript'),n);
  assert.equal(await score(`fn f(){${'if a {} '.repeat(n)}}`,'rust'),n);
 }
});
test('logical groups, nullish and optional access',async()=>{
 for(const [expr,cognitive] of [['a && b && c',1],['a || b || c',1],['a && b || c',2],['a && !(b && c)',2]]) {
  assert.equal(await score(`function f(){return ${expr};}`,'javascript'),cognitive);
  assert.equal(await score(`fn f(){return ${expr};}`,'rust'),cognitive);
 }
 assert.equal(await score('function f(){return a ?? b;}','javascript'),0);
 assert.equal(await score('function f(){return a?.b;}','javascript'),0);
});
test('catch, loop, switch and labeled jumps follow profile',async()=>{
 assert.equal(await score('function f(){try{}catch(e){if(a){}}}','javascript'),3);
 assert.equal(await score('function f(){label: while(a){if(b){break label;}}}','javascript'),4);
 assert.equal(await score("fn f(){'label: loop {if b {break 'label;}}}",'rust'),4);
 assert.equal(await score('fn f(){load()?;}','rust'),0);
});
