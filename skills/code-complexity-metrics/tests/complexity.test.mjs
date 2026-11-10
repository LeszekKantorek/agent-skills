import { test } from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../scripts/parser.mjs';
import {outerFunctions} from '../scripts/ir.mjs';
import {complexityEvents} from '../scripts/metrics/complexity.mjs';
async function score(source, lang) {
 const p = await parse(source,lang);
 try { assert.equal(p.tree.rootNode.hasError,false); const e=complexityEvents(outerFunctions(p.tree.rootNode)[0]); return ['cognitive_complexity','cyclomatic_complexity'].map(k => e.filter(x=>x.metric===k).reduce((s,x)=>s+x.amount,0)); } finally { p.dispose(); }
}
test('decisions and nesting use project rules in both languages',async()=>{
 for (const [lang, flat,nested] of [
  ['javascript','function f(){if(a){} if(b){} if(c){}}','function f(){if(a){if(b){if(c){}}}}'],
  ['rust','fn f(){if a {} if b {} if c {}}','fn f(){if a {if b {if c {}}}}'],
 ]) { assert.deepEqual(await score(flat,lang),[3,4]); assert.deepEqual(await score(nested,lang),[6,4]); }
});
test('logical sequences use changes, while cyclomatic counts operators',async()=>{
 assert.deepEqual(await score('function f(){return a || b && c || d;}','javascript'),[3,4]);
 assert.deepEqual(await score('fn f(){return a || b && c || d;}','rust'),[3,4]);
});
test('ternary is a single cognitive decision',async()=>{
 assert.deepEqual(await score('function f(){if(a ? b : c){}}','javascript'),[2,3]);
});
test('control flow and nesting rules',async()=>{
 for(const [lang,source,expected] of [
  ['javascript','function f(){if(a){}else if(b){}else{}}',[3,3]],
  ['rust','fn f(){if a {} else if b {} else {}}',[3,3]],
  ['javascript','function f(){switch(x){case 1:break;case 2:break;default:break;}}',[1,4]],
  ['rust','fn f(){match x {1=>{},2=>{},_=>{}}}',[1,4]],
  ['javascript','function f(){if(a){const x=()=>{if(b){if(c){}}}}}',[8,4]],
  ['rust','fn f(){if a {let x=||{if b {if c {}}};}}',[8,4]],
 ]) assert.deepEqual(await score(source,lang),expected,source);
});
test('comments do not change else-if nesting',async()=>{
 assert.deepEqual(await score('function f(){if(a){}else /* x */ if(b){}}','javascript'),[2,3]);
});
test('comments in grouping preserve logical sequence',async()=>{
 assert.deepEqual(await score('function f(){return a && (/* x */ b && c);}','javascript'),[1,3]);
});

test('cyclomatic scales with flat decisions and is independent of formatting',async()=>{
 for(const n of [4,8,64]) {
  assert.deepEqual(await score(`function f(){${'if(a){} '.repeat(n)}}`,'javascript'),[n,n+1]);
  assert.deepEqual(await score(`fn f(){${'if a {} '.repeat(n)}}`,'rust'),[n,n+1]);
 }
});
test('logical groups, nullish and optional access',async()=>{
 for(const [expr,cognitive,cyclo] of [['a && b && c',1,3],['a || b || c',1,3],['a && b || c',2,3],['a && !(b && c)',2,3]]) {
  assert.deepEqual(await score(`function f(){return ${expr};}`,'javascript'),[cognitive,cyclo]);
  assert.deepEqual(await score(`fn f(){return ${expr};}`,'rust'),[cognitive,cyclo]);
 }
 assert.deepEqual(await score('function f(){return a ?? b;}','javascript'),[0,2]);
 assert.deepEqual(await score('function f(){return a?.b;}','javascript'),[0,1]);
});
test('catch, loop, switch and labeled jumps follow profile',async()=>{
 assert.deepEqual(await score('function f(){try{}catch(e){if(a){}}}','javascript'),[3,2]);
 assert.deepEqual(await score('function f(){label: while(a){if(b){break label;}}}','javascript'),[4,3]);
 assert.deepEqual(await score("fn f(){'label: loop {if b {break 'label;}}}",'rust'),[4,3]);
 assert.deepEqual(await score('fn f(){load()?;}','rust'),[0,1]);
});
