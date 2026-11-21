import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../scripts/parser.mjs';
import {analyze} from '../scripts/analyzers/javascript/analyze.mjs';
import {prepare} from '../scripts/analyzers/javascript/analyze-ast.mjs';
import {cognitive} from '../scripts/analyzers/javascript/cognitive.mjs';
const all=n=>[n,...n.children.flatMap(all)];
async function get(s,fn=analyze){const p=await parse(s,'javascript');try{return fn(p.tree,s,'C:/fixture.js')}finally{p.dispose()}}
const total=p=>all(p.tree).filter(n=>p.ownerByNode.get(n)===p.functions[0].id).reduce((sum,n)=>sum+n.score.cognitive,0);
test('step 5 basic and recursive totals',async()=>{
 for(const [s,want] of [
 ['function f(){}',0],['function f(){a(b());}',0],['function f(){return a(b());}',0],['function f(){let x=new Foo(load());}',0],['function f(){const x=b?first():second();}',1],['function f(){if(a){if(b){}}}',3],['function f(){make()[key()]();}',0],['function f(){try {prepare()} finally {cleanup()}}',0],['function f(){switch(x){case 1: {a()} {b()} break;}}',1],['function f(){(class {static {work()}});}',0],['function f(){(class {x=load();});}',0],['function f(x = a ? b : c){}',1],['function f(){for(const x of xs) consume(x);}',1],['function f(){a && f(b || c) && d;}',2],['function f(){if(a){const x=()=>{if(b){if(c){}}};} if(d){}}',9]
 ]) assert.equal(total(await get(s)),want,s);
});
test('Cognitive scoring preserves prepared nodes, owners and diagnostics',async()=>{
 const source='function f(){if(a){if(b){}}} function* g(){yield x;}';
 const prepared=await get(source,prepare), nodes=all(prepared.tree), owners=[...prepared.ownerByNode];
 const shape=JSON.stringify(prepared.tree,(key,value)=>key==='score'?undefined:value);
 assert.equal(total(prepared),0);
 cognitive(prepared);
 assert.equal(total(prepared),3);
 assert.equal(JSON.stringify(prepared.tree,(key,value)=>key==='score'?undefined:value),shape);
 assert.ok(all(prepared.tree).every((node,i)=>node===nodes[i]));
 assert.deepEqual([...prepared.ownerByNode],owners);
 assert.deepEqual(prepared.diagnostics,[]);
 const fresh=await get(source);
 assert.deepEqual(all(fresh.tree).map(node=>node.score),nodes.map(node=>node.score));
 assert.deepEqual(fresh.diagnostics,prepared.diagnostics);
});
test('decisions, boundaries, and zero parents retain scored children',async()=>{
 for(const [s,want] of [
 ['function f(){if(a){}else if(b){}else{}}',3],
 ['function f(){for(;;){} for(x in y){} for(x of y){} while(x){} do{}while(x);}',5],
 ['function f(){switch(x){case 1: case 2: default:}}',1],
 ['function f(){try {if(a){}} catch(e){if(b){}} finally {if(c){}}}',5],
 ['function f(){return a?.b ?? (c && d);}',1],
 ['function f(){x &&= a ? b() : c();}',1],
 ['function f(){x++; ++x; x--; --x;}',0],
 ['function f(){const {a,b}=load(); let x=1,y=2;}',0],
 ['function f(){const a=()=>42;const b=()=>calculate();}',0],
 ['function f(){const a=()=>x ? 1 : y ? 2 : 3;}',5],
 ['function f(){(a && b) == (c && d);}',2],
 ['function f(){(a && b) || (c && d);}',3],
 ['function f(){a && !(b && c);}',2],
 ['function f(){1 + call(); (()=>{call();});}',0],
 ['function f(){return { [key()] (x = a ? b : c) { if(d){} } };}',4],
 ]) assert.equal(total(await get(s)),want,s);
});



test('delegated suspension, environment and debugging operations preserve descendants',async()=>{
 const s='function* f(){yield work(); with(load()){consume();} debugger;} function ok(){done();}';
 const p=await get(s), nodes=all(p.tree), byType=t=>nodes.filter(n=>n.type===t);
 assert.deepEqual(p.diagnostics,[]);
 assert.equal(p.functions.length,2);
 assert.equal(byType('call_expression').length,4);
 for(const type of ['yield_expression','with_statement','debugger_statement']) {
  assert.equal(byType(type).length,1);
  assert.equal(p.ownerByNode.get(byType(type)[0]),p.functions[0].id);
 }
 assert.equal(byType('with_statement')[0].children.find(n=>n.field==='body').type,'statement_block');
 assert.ok(!p.diagnostics.some(d=>d.owner===p.functions[1].id));
});

test('delegated operations retain owner and original rows',async()=>{
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
 assert.deepEqual(p.diagnostics,[]); assert.equal(total(p),1);
 for(const [type,rows] of [['yield_expression',[1,2]],['with_statement',[3]],['debugger_statement',[6,7]]]) {
  assert.deepEqual(pick(type).map(n=>n.startPosition.row),rows);
  for(const n of pick(type)){assert.deepEqual(n.score,{cognitive:0});assert.equal(p.ownerByNode.get(n),p.functions[0].id);}
 }
 const withBody=pick('with_statement')[0].children.find(n=>n.field==='body');
 assert.ok(withBody.children.some(n=>n.type==='statement_block'));
 assert.equal(pick('call_expression').length,4);
 for(const n of pick('call_expression')) assert.equal(p.ownerByNode.get(n),p.functions[0].id);
});
test('yield nesting, wrapper and independent diagnostics',async()=>{
 for(const [s,w] of [['function* f(){yield;}',0],['function* f(){yield (()=>work());}',0],['function* f(){if(a){yield (b?c():d());} if(e) work();}',4],['function* f(){use(a && (yield (b && c)) && d, p || q);}',3]]) assert.equal(total(await get(s)),w,s);
 const p=await get('function bad(){return <X/>;} function good(){debugger;}');assert.ok(p.diagnostics.some(d=>d.owner===p.functions[0].id));assert.ok(!p.diagnostics.some(d=>d.owner===p.functions[1].id));
});

test('field declarators, initializer boundaries, and computed method owners',async()=>{
 const s='function outer(){(class { a; #b=load(); static c=x?one():two(); static {work()} [key()] (x=arg()) {if(x){}} });}';const p=await get(s), n=all(p.tree), owner=p.functions[0].id;
 for(const field of n.filter(x=>x.type==='field_definition')) {assert.equal(p.ownerByNode.get(field),owner);}
 const method=n.find(x=>x.type==='method_definition'), name=method.children.find(x=>x.field==='name');assert.equal(p.ownerByNode.get(name),owner);
 assert.equal(method.children.find(x=>x.field==='body').children.find(x=>x.type==='if_statement').score.cognitive,2);
 assert.ok(n.some(x=>x.type==='class_static_block'));assert.deepEqual(p.diagnostics,[]);
 const isolated=await get('function f(){(class {a=load();});}');const nodes=all(isolated.tree);assert.ok(nodes.some(x=>x.type==='expression_statement'));assert.equal(total(isolated),0);
});
test('operators and multiline calls retain local explain positions',async()=>{
 const s=`function f(){
  a && b || c && d;
  client
    .first()
    .second()
    .third();
}`;const p=await get(s),nodes=all(p.tree),ops=nodes.filter(n=>['&&','||'].includes(n.type));
 assert.deepEqual(ops.map(n=>n.score.cognitive),[1,1,1]);
 const calls=nodes.filter(n=>n.type==='call_expression');assert.equal(calls.length,3);for(const c of calls){assert.equal(c.startPosition.row,2);assert.equal(p.ownerByNode.get(c),p.functions[0].id);}

});
