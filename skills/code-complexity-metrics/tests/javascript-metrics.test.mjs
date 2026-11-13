import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../scripts/parser.mjs';
import {analyze} from '../scripts/analyzers/javascript/analyze.mjs';
import {prepare} from '../scripts/analyzers/javascript/analyze-ast.mjs';
import {cognitive} from '../scripts/analyzers/javascript/cognitive.mjs';
import {cyclomatic} from '../scripts/analyzers/javascript/cyclomatic.mjs';
import {statements} from '../scripts/analyzers/javascript/statements.mjs';
const all=n=>[n,...n.children.flatMap(all)];
async function get(s,fn=analyze){const p=await parse(s,'javascript');try{return fn(p.tree,s,'C:/fixture.js')}finally{p.dispose()}}
const total=p=>all(p.tree).filter(n=>p.ownerByNode.get(n)===p.functions[0].id).reduce((a,n)=>a.map((v,i)=>v+n.score[['cognitive','cyclomatic','statements'][i]]),[0,0,0]);
test('step 5 basic and recursive totals',async()=>{
 for(const [s,want] of [
 ['function f(){}',[0,1,0]],['function f(){a(b());}',[0,1,2]],['function f(){return a(b());}',[0,1,3]],['function f(){let x=new Foo(load());}',[0,1,3]],['function f(){const x=b?first():second();}',[1,2,6]],['function f(){if(a){if(b){}}}',[3,3,2]],['function f(){make()[key()]();}',[0,1,3]],['function f(){try {prepare()} finally {cleanup()}}',[0,1,3]],['function f(){switch(x){case 1: {a()} {b()} break;}}',[1,2,6]],['function f(){(class {static {work()}});}',[0,1,2]],['function f(){(class {x=load();});}',[0,1,3]],['function f(x = a ? b : c){}',[1,2,3]],['function f(){for(const x of xs) consume(x);}',[1,2,3]],['function f(){a && f(b || c) && d;}',[2,4,1]],['function f(){if(a){const x=()=>{if(b){if(c){}}};} if(d){}}',[9,5,5]]
 ]) assert.deepEqual(total(await get(s)),want,s);
});
test('independent passes preserve structure, scores, ownership and diagnostics',async()=>{
 const s='function f(){return a(b());} function* g(){yield x;}' , p=await get(s,prepare), nodes=all(p.tree), owners=nodes.map(n=>p.ownerByNode.get(n));
 for(const [run,key] of [[cognitive,'cognitive'],[cyclomatic,'cyclomatic'],[statements,'statements']]) {const before=nodes.map(n=>({...n.score}));run(p);assert.deepEqual(all(p.tree),nodes);nodes.forEach((n,i)=>{for(const k of Object.keys(n.score))if(k!==key)assert.equal(n.score[k],before[i][k]);});}
 assert.deepEqual(nodes.map(n=>p.ownerByNode.get(n)),owners); assert.deepEqual(p.diagnostics,[]);
 const a=await get(s), b=await get(s); assert.deepEqual(total(a),total(b));assert.deepEqual(a.diagnostics,b.diagnostics);
 const calls=all(a.tree).filter(n=>n.type==='call_expression');assert.deepEqual(calls.map(n=>n.score.statements),[1,1]);assert.equal(all(a.tree).find(n=>n.type==='return_statement').score.statements,1);
});
test('decisions, boundaries, and zero parents retain scored children',async()=>{
 for(const [s,want] of [
 ['function f(){if(a){}else if(b){}else{}}',[3,3,2]],
 ['function f(){for(;;){} for(x in y){} for(x of y){} while(x){} do{}while(x);}',[5,6,5]],
 ['function f(){switch(x){case 1: case 2: default:}}',[1,4,1]],
 ['function f(){try {if(a){}} catch(e){if(b){}} finally {if(c){}}}',[5,4,5]],
 ['function f(){return a?.b ?? (c && d);}',[1,3,1]],
 ['function f(){x &&= a ? b() : c();}',[1,2,6]],
 ['function f(){x++; ++x; x--; --x;}',[0,1,4]],
 ['function f(){const {a,b}=load(); let x=1,y=2;}',[0,1,4]],
 ['function f(){const a=()=>42;const b=()=>calculate();}',[0,1,5]],
 ['function f(){const a=()=>x ? 1 : y ? 2 : 3;}',[5,3,6]],
 ['function f(){(a && b) == (c && d);}',[2,3,1]],
 ['function f(){(a && b) || (c && d);}',[3,4,1]],
 ['function f(){a && !(b && c);}',[2,3,1]],
 ['function f(){1 + call(); (()=>{call();});}',[0,1,3]],
 ['function f(){return { [key()] (x = a ? b : c) { if(d){} } };}',[4,3,6]],
 ]) assert.deepEqual(total(await get(s)),want,s);
});



test('delegated suspension, environment and debugging operations preserve descendants',async()=>{
 const s='function* f(){yield work(); with(load()){consume();} debugger;} function ok(){done();}';
 const p=await get(s), nodes=all(p.tree), byType=t=>nodes.filter(n=>n.type===t);
 assert.deepEqual(p.diagnostics,[]);
 assert.equal(p.functions.length,2);
 for(const n of byType('call_expression')) assert.equal(n.score.statements,1);
 for(const n of [...byType('yield_expression'),...byType('with_statement'),...byType('debugger_statement')]) assert.equal(n.score.statements,1);
 assert.equal(byType('with_statement')[0].children.find(n=>n.field==='body').score.statements,0);
 assert.equal(p.functions[1].root.score.cyclomatic,1); assert.ok(!p.diagnostics.some(d=>d.owner===p.functions[1].id));
});

test('delegated operations have local points, owner and original rows',async()=>{
 const s=`function* f(){
 const x = yield work();
 yield* other();
 with(load()) {
  { consume(); }
 }
 debugger;
 if(a){debugger;}
}`;
 const p=await get(s), nodes=all(p.tree), pick=t=>nodes.filter(n=>n.type===t);
 assert.deepEqual(p.diagnostics,[]); assert.deepEqual(total(p),[1,2,12]);
 for(const [type,rows] of [['yield_expression',[1,2]],['with_statement',[3]],['debugger_statement',[6,7]]]) {
  assert.deepEqual(pick(type).map(n=>n.startPosition.row),rows);
  for(const n of pick(type)){assert.deepEqual(n.score,{cognitive:0,cyclomatic:0,statements:1});assert.equal(p.ownerByNode.get(n),p.functions[0].id);}
 }
 const withBody=pick('with_statement')[0].children.find(n=>n.field==='body'); assert.equal(withBody.score.statements,0);assert.equal(withBody.children.find(n=>n.type==='statement_block').score.statements,1);
 assert.equal(pick('variable_declarator')[0].score.statements,1); assert.equal(pick('call_expression').length,4);
 for(const n of pick('call_expression'))assert.equal(n.score.statements,1);
});
test('yield nesting, wrapper and independent diagnostics',async()=>{
 for(const [s,w] of [['function* f(){yield;}',[0,1,1]],['function* f(){yield (()=>work());}',[0,1,3]],['function* f(){if(a){yield (b?c():d());} if(e) work();}',[4,4,9]],['function* f(){use(a && (yield (b && c)) && d, p || q);}',[3,5,2]]]) assert.deepEqual(total(await get(s)),w,s);
 const p=await get('function bad(){return <X/>;} function good(){debugger;}');assert.ok(p.diagnostics.some(d=>d.owner===p.functions[0].id));assert.ok(!p.diagnostics.some(d=>d.owner===p.functions[1].id));
});

test('field declarators, initializer boundaries, and computed method owners',async()=>{
 const s='function outer(){(class { a; #b=load(); static c=x?one():two(); static {work()} [key()] (x=arg()) {if(x){}} });}';const p=await get(s), n=all(p.tree), owner=p.functions[0].id;
 for(const field of n.filter(x=>x.type==='field_definition')) {assert.equal(field.score.statements,1);assert.equal(p.ownerByNode.get(field),owner);}
 const method=n.find(x=>x.type==='method_definition'), name=method.children.find(x=>x.field==='name');assert.equal(p.ownerByNode.get(name),owner);
 assert.equal(method.children.find(x=>x.field==='body').children.find(x=>x.type==='if_statement').score.cognitive,2);
 assert.equal(n.find(x=>x.type==='class_static_block').score.statements,1);assert.deepEqual(p.diagnostics,[]);
 const isolated=await get('function f(){(class {a=load();});}');const nodes=all(isolated.tree);assert.equal(nodes.find(x=>x.type==='expression_statement').score.statements,1);assert.deepEqual(total(isolated),[0,1,3]);
});
test('operators and multiline calls retain local explain positions',async()=>{
 const s=`function f(){
  a && b || c && d;
  client
    .first()
    .second()
    .third();
}`;const p=await get(s),nodes=all(p.tree),ops=nodes.filter(n=>['&&','||'].includes(n.type));
 assert.deepEqual(ops.map(n=>n.score.cognitive),[1,1,1]);assert.deepEqual(ops.map(n=>n.score.cyclomatic),[1,1,1]);
 const calls=nodes.filter(n=>n.type==='call_expression');assert.equal(calls.length,3);for(const c of calls){assert.equal(c.score.statements,1);assert.equal(c.startPosition.row,2);assert.equal(p.ownerByNode.get(c),p.functions[0].id);}
 assert.equal(nodes.filter(n=>n.type==='expression_statement').at(-1).score.statements,0);
});
