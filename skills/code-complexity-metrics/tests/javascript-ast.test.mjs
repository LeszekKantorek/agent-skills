import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../scripts/parser.mjs';
import {prepare} from '../scripts/analyzers/javascript/analyze-ast.mjs';
const file = 'C:/fixture.js';
async function get(source) { const p=await parse(source,'javascript'); try { return prepare(p.tree,source,file); } finally { p.dispose(); } }
function all(n) { return [n,...n.children.flatMap(all)]; }
function find(n,t) { return all(n).filter(x=>x.type===t); }
const slice=(s,n)=>s.slice(n.startIndex,n.endIndex);
const child=(n,f)=>n.children.find(c=>c.field===f);

test('step 4: independent tree, UTF-16, ordered tokens and complete ownership after disposal', async()=>{
  const s='// 😀\r\n\tfunction f(){ a && b || c ?? d; x += 1; x++; }';
  const p=await get(s), nodes=all(p.tree);
  assert.equal(p.ownerByNode.size,nodes.length); assert.equal(new Set(nodes).size,nodes.length);
  for(const n of nodes) { assert.deepEqual(n.score,{cognitive:0,cyclomatic:0,statements:0}); assert.ok(p.ownerByNode.has(n)); assert.ok(p.ownerByNode.get(n)===null || p.functions.some(f=>f.id===p.ownerByNode.get(n))); }
  const f=p.functions[0]; assert.equal(f.name,'f'); assert.equal(p.ownerByNode.get(f.root),f.id);
  for(const t of ['&&','||','??','+=','++']) { const n=find(p.tree,t)[0]; assert.ok(n,t); assert.equal(slice(s,n),t); assert.equal(n.isNamed,false); assert.equal(n.field,'operator'); assert.deepEqual(n.startPosition,{row:1,column:n.startIndex-s.indexOf('\n')-1}); assert.equal(n.endIndex-n.startIndex,t.length); }
  assert.equal(f.root.startIndex,8); assert.deepEqual(f.root.startPosition,{row:1,column:1}); assert.equal(slice(s,f.root),'function f(){ a && b || c ?? d; x += 1; x++; }');
});

test('step 4: computed names preserve surrounding owners even through a function',async()=>{
 for(const [s,outer] of [['function outer(){ return { [(() => key())()] (x = arg()) { body(); } }; }',true],['const o = { [(() => key())()] (x = arg()) { body(); } };',false]]) {
  const p=await get(s), method=find(p.tree,'method_definition')[0], name=child(method,'name'), params=child(method,'parameters'), body=child(method,'body');
  const env=outer?p.functions.find(f=>f.name==='outer').id:null, own=p.ownerByNode.get(method);
  assert.equal(p.ownerByNode.get(name),env); assert.equal(p.ownerByNode.get(params),own); assert.equal(p.ownerByNode.get(body),own);
  const arrow=find(name,'arrow_function')[0]; assert.equal(p.ownerByNode.get(arrow),outer?env:p.functions.find(f=>f.root===arrow).id);
  assert.equal(p.ownerByNode.get(find(name,'call_expression').find(n=>slice(s,n)==='key()')),p.ownerByNode.get(arrow));
  assert.equal(p.functions.length,outer?1:2); assert.equal(p.functions.find(f=>f.root===method)?.name,outer?undefined:null);
 }
});

test('step 4: names and function boundaries',async()=>{
 const s='const handler = () => 1; const x = function named() {}; consume(function(){}); const o = { m() {}, [key()]() {} }; class C { static init(){} static { work(); } }';
 const p=await get(s); assert.deepEqual(p.functions.map(f=>f.name),['handler','named',null,'m',null,'init']);
 assert.equal(find(p.tree,'class_static_block').length,1); assert.equal(p.ownerByNode.get(find(p.tree,'class_static_block')[0]),null);
 assert.equal(p.diagnostics.length,0);
});

test('step 4: retain block, field, complex expression and call roles',async()=>{
 const s='function f(){make()[key()](); switch(x){case 1: {a();} default: b();} try {a()} catch(e) {b()} finally {c()} const s = `literal fake() ${real()}`;} class C { field; #private = init(); static [key()] = select ? a() : b(); static { work(); } static method(){} }';
 const p=await get(s); assert.deepEqual(p.diagnostics,[]);
 const calls=find(p.tree,'call_expression'); for(const x of ['make()','key()','make()[key()]()','real()']) assert.ok(calls.some(n=>slice(s,n)===x),x); assert.ok(!calls.some(n=>slice(s,n)==='fake()'));
 const outer=calls.find(n=>slice(s,n)==='make()[key()]()'); assert.equal(child(outer,'function').type,'subscript_expression'); assert.equal(child(child(outer,'function'),'object').type,'call_expression'); assert.equal(child(child(outer,'function'),'index').type,'call_expression');
 assert.equal(find(p.tree,'switch_case').length,1); assert.equal(find(p.tree,'switch_default').length,1); assert.equal(find(p.tree,'catch_clause').length,1); assert.equal(find(p.tree,'finally_clause').length,1);
 const fields=find(p.tree,'field_definition'); assert.equal(fields.length,3); assert.equal(child(fields[0],'property').type,'property_identifier'); assert.equal(child(fields[1],'property').type,'private_property_identifier'); assert.equal(child(fields[1],'value').type,'call_expression'); assert.equal(child(fields[2],'property').type,'computed_property_name'); assert.ok(fields[2].children.some(n=>n.type==='static')); assert.equal(child(fields[2],'value').type,'ternary_expression');
});

test('step 4: pinned supported syntax and diagnostics for unsupported or invalid syntax',async()=>{
 const s='function f({[key()]: x = init()}) { obj?.method?.(); import("x"); tag`a ${call()}`; await work(); } class C extends B { constructor(){super();} field = init(); }';
 const p=await get(s); assert.deepEqual(p.diagnostics,[]); for(const type of ['optional_chain','import','super','template_substitution','await_expression','computed_property_name','assignment_pattern','field_definition']) assert.ok(find(p.tree,type).length,type);
 const yielding=await get('function* f(){ yield value; }'); assert.deepEqual(yielding.diagnostics,[]);
 const bad=await get('function f(){ return <Widget value={call()}/>; } function good(){}'); assert.ok(bad.diagnostics.some(d=>d.category==='unsupported' && d.owner===bad.functions[0].id && !d.affectsFunctionDiscovery && d.affectedMetrics.length===3 && d.range)); assert.equal(bad.functions[1].name,'good');
 const invalid=await get('function f(){ let x = ; } function good(){}'); assert.ok(invalid.diagnostics.some(d=>d.category==='parse' && d.affectsFunctionDiscovery && d.range));
});

test('step 4: presentation retains comment and multiline template after disposal',async()=>{
 const s='function f(){\r\n  const x = `literal // no comment\r\n ${real()}`; // actual\r\n}'; const p=await get(s);
 assert.deepEqual(p.presentation.comments.map(r=>s.slice(r.startIndex,r.endIndex)),['// actual']);
 assert.ok(p.presentation.unsafeCommentRanges.some(r=>s.slice(r.startIndex,r.endIndex)==='`literal // no comment\r\n ${real()}`'));
 assert.equal(p.presentation.lineAnnotations[1].endIndex,null); assert.equal(p.presentation.lineAnnotations[2].endIndex,s.indexOf('\r\n}',s.indexOf('real')));
});




