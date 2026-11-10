import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../scripts/parser.mjs';
import {outerFunctions} from '../scripts/ir.mjs';
import {statementEvents} from '../scripts/metrics/statements.mjs';
async function count(source,lang){const p=await parse(source,lang); try {assert.equal(p.tree.rootNode.hasError,false);return statementEvents(outerFunctions(p.tree.rootNode)[0],lang).length}finally{p.dispose()}}
test('hand calculated statements across Rust and JavaScript',async()=>{
 for (const [js,rs,expected] of [
 ['function f(){}','fn f(){}',0],
 ['function f(){save();}','fn f(){save();}',1],
 ['function f(){let x=load();}','fn f(){let x=load();}',2],
 ['function f(){return save();}','fn f(){return save();}',2],
 ['function f(){if(a){save();}}','fn f(){if a {save();}}',2],
 ['function f(){function inner(){}}','fn f(){fn inner(){}}',1],
 ]) {assert.equal(await count(js,'javascript'),expected);assert.equal(await count(rs,'rust'),expected)}
});
test('value choices and nested blocks',async()=>{
 assert.equal(await count('fn f()->i32 {if x {1} else {2}}','rust'),3);
 assert.equal(await count('fn f(){let x = if b {1} else {2};}','rust'),4);
 assert.equal(await count('function f(){const x = b ? 1 : 2;}','javascript'),4);
 assert.equal(await count('fn f()->i32 {{{{1}}}}','rust'),4);
});
test('review regressions: tail loops, grouping, ternary and parameter calls',async()=>{
 assert.equal(await count('fn f(){loop {}}','rust'),1);
 assert.equal(await count('fn f()->i32 {(if b {1}else{2})}','rust'),3);
 assert.equal(await count('fn f(){let x=(if b {1}else{2});}','rust'),4);
 assert.equal(await count('const f = b => b ? 1 : 2','javascript'),3);
 assert.equal(await count('function f(a=load()) {}','javascript'),1);
 assert.equal(await count('function f(){for(x\nof\nxs){const y=1;}}','javascript'),2);
});
test('additional cases from metric rules',async()=>{
 const cases=[
 ['javascript','function f(){x;42;x+1;}',3],
 ['javascript','function f(){;;save();;}',4],
 ['javascript','function f(){x++;x+=calculate();new Foo();}',4],
 ['javascript','function f(){let a=1,b=2;}',2],
 ['javascript','function f(){switch(x){case 1:first();break;default:second();}}',4],
 ['javascript','function f(){if(a){first()}else if(b){second()}else{third()}}',5],
 ['rust','fn f(){if let Some(x)=item {consume(x);}}',3],
 ['rust','fn f(){while let Some(x)=next() {consume(x);}}',4],
 ['rust','fn f(){for x in xs {consume(x);}}',3],
 ['rust','fn f(){macro_rules! a {()=>{if x {call()}}} a!();}',2],
 ['rust','fn f(){let x={prepare(); calculate()};}',5],
 ['rust','fn f()->i32 {match x {true=>1,false=>2}}',3],
 ['rust','fn f(){let c = || if b {1}else{2};}',4],
 ];
 for(const [lang,source,expected] of cases) assert.equal(await count(source,lang),expected,source);
});
test('unsafe blocks preserve Rust value context',async()=>{
 assert.equal(await count('fn f()->i32 {unsafe {if b {1}else{2}}}','rust'),4);
 assert.equal(await count('fn f(){let x=unsafe {if b {1}else{2}};}','rust'),5);
});
test('comments and parentheses do not change value choices',async()=>{
 assert.equal(await count('function f(){const x=a?(b?1:2):3;}','javascript'),6);
 assert.equal(await count('fn f()->i32 {if b {1}else /*hi*/ {2}}','rust'),3);
 assert.equal(await count('fn f(){let c=|| async {work()};}','rust'),4);
});
test('comments in grouping preserve Rust branch values',async()=>{
 assert.equal(await count('fn f(){let x=(/* hi */ if b {1}else{2});}','rust'),4);
});
test('branch values in call and return',async()=>{
 assert.equal(await count('fn f(){consume(if b {1}else{2});}','rust'),4);
 assert.equal(await count('fn f()->i32{return if b {1}else{2};}','rust'),4);
 assert.equal(await count('function f(){consume(b?1:2);}','javascript'),4);
 assert.equal(await count('function f(){return b?1:2;}','javascript'),4);
});

test('nested Rust value choice within an expression',async()=>{
 assert.equal(await count('fn f(){let x=1 + if b {1}else{2};}','rust'),4);
});
test('Rust blocks yield values inside compound expressions',async()=>{
 assert.equal(await count('fn f(){let x=Some({prepare();calculate()});}','rust'),6);
 assert.equal(await count('fn f(){let x=({prepare();calculate()},0);}','rust'),5);
 assert.equal(await count('fn f(){let x=[{prepare();calculate()}];}','rust'),5);
});
test('macro invocation in value position counts the return and no macro interior',async()=>{
 assert.equal(await count('fn f()->i32 {answer!()}','rust'),2);
 assert.equal(await count('fn f(){let x=if b {answer!()}else{2};}','rust'),5);
});
test('for header separators do not count as empty statements',async()=>{
 for(const [source,expected] of [
  ['function f(){for(;;){}}',1],['function f(){for(;x;){}}',1],
  ['function f(){for(let i=0;;i++){}}',3],['function f(){for(;;);}',2],
 ]) assert.equal(await count(source,'javascript'),expected,source);
});
test('Rust const blocks count as extra blocks and preserve value',async()=>{
 assert.equal(await count('fn f(){let x=const {42};}','rust'),3);
 assert.equal(await count('fn f()->i32{const {42}}','rust'),2);
});
test('verification matrix: branch values, bindings, macros and standalone expressions',async()=>{
 const cases=[
  ['rust','fn f(){x;42;x+1;}',3],
  ['javascript','function f(){let x=new Foo(load());}',3],
  ['javascript','function f(){const x=b?first():second();}',6],
  ['rust','fn f(){let x=if b {first()}else{second()};}',6],
  ['rust','fn f(){let x=match b {true=>first(),false=>second()};}',6],
  ['rust','fn f(){for (key,value) in pairs {}}',2],
  ['javascript','function f(){for(const [key,value] of pairs){}}',2],
  ['rust','fn f(){macro_rules! answer {()=>{if b {call()} else {other()}}}}',1],
  ['rust','fn f(){println!(if a {call()}); let x=vec![call()];}',3],
  ['javascript','function f(){try{}catch(error){recover();}}',2],
 ];
 for(const [language,source,expected] of cases) assert.equal(await count(source,language),expected,source);
});
test('closure value blocks count a single implicit return and no return for unit',async()=>{
 for(const kind of ['const','unsafe','async']) {
  assert.equal(await count(`fn f(){let c=|| ${kind} {42};}`,'rust'),3,kind);
  assert.equal(await count(`fn f(){let c=|| ${kind} {};}`,'rust'),2,kind);
 }
});
