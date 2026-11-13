import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../scripts/parser.mjs';
import {prepare} from '../scripts/analyzers/javascript/analyze-ast.mjs';
async function get(s){const p=await parse(s,'javascript');try{return prepare(p.tree,s,'C:/f.js')}finally{p.dispose()}}
const all=n=>[n,...n.children.flatMap(all)];
const of=(n,t)=>all(n).filter(x=>x.type===t);
const field=(n,f)=>n.children.find(x=>x.field===f);
const txt=(s,n)=>s.slice(n.startIndex,n.endIndex);

test('R04-01 JavaScript line terminators retain source offsets and rows',async()=>{
 const s='function f(){\rwork();\u2028again();\u2029last();\r\n}'; const p=await get(s), calls=of(p.tree,'call_expression');
 assert.deepEqual(calls.map(n=>[n.startIndex,n.endIndex,n.startPosition,n.endPosition,txt(s,n)]),[[14,20,{row:1,column:0},{row:1,column:6},'work()'],[22,29,{row:2,column:0},{row:2,column:7},'again()'],[31,37,{row:3,column:0},{row:3,column:6},'last()']]);
 assert.deepEqual(p.presentation.lineAnnotations.map(x=>x.endIndex),[13,21,30,38,41]);
});
test('R04-02 errors affect each recovered owner and preserve independent function',async()=>{
 const s='(a=()=>x(),b=()=>y()};\nfunction good(){}', p=await get(s), [a,b,good]=p.functions;
 const ds=p.diagnostics.filter(d=>d.category==='parse');
 assert.deepEqual(new Set(ds.filter(d=>d.owner!==null).map(d=>d.owner)),new Set([a.id,b.id]));
 assert.ok(ds.some(d=>d.owner===null&&d.affectsFunctionDiscovery)); assert.ok(!ds.some(d=>d.owner===good.id));
 for(const d of ds){assert.deepEqual(d.affectedMetrics,['cognitive','cyclomatic','statements']);assert.equal(d.range.startIndex,0);assert.equal(d.range.endIndex,21)}
 const q=await get('function f(){ const x = ; work(); } function good(){}'); assert.ok(q.diagnostics.some(d=>d.owner===q.functions[0].id)); assert.ok(!q.diagnostics.some(d=>d.owner===q.functions[1].id)); assert.equal(of(q.tree,'call_expression').length,1);
});
test('R04-03 using declarations retain binding and initializer roles',async()=>{
 const s='function f(){using x=make(); await using a=one(), b=two(); for(using z of xs) use(z);}'; const p=await get(s); assert.deepEqual(p.diagnostics,[]);
 const decls=of(p.tree,'using_declaration'); assert.equal(decls.length,2); const vars=decls.flatMap(d=>of(d,'variable_declarator')); assert.deepEqual(vars.map(v=>txt(s,field(v,'name'))),['x','a','b']); assert.deepEqual(vars.map(v=>field(v,'value').type),['call_expression','call_expression','call_expression']); assert.ok(decls[1].children.some(n=>n.type==='await'));
 const loop=of(p.tree,'for_in_statement')[0]; assert.equal(txt(s,field(loop,'kind')),'using'); assert.equal(txt(s,field(loop,'left')),'z'); assert.equal(field(loop,'body').type,'expression_statement');
});
test('R04-04 delegated syntax is classified without tainting discovery',async()=>{
 for(const s of ['function* f(){yield work();} function good(){}','function f(o){with(o) work();} function good(){}','function f(){debugger;} function good(){}','function* f(){yield (() => work());} function good(){}']){
 const p=await get(s), d=p.diagnostics.filter(x=>x.category==='unsupported'); assert.equal(d.length,0); assert.equal(p.functions.length,2); assert.ok(!d.some(x=>x.owner===p.functions[1].id)); if(s.includes('=>')) assert.equal(p.ownerByNode.get(of(p.tree,'arrow_function')[0]),p.functions[0].id);
 }
});
test('R04-05 method decorators stay in the surrounding context',async()=>{
 for(const [s,nested] of [['class C { @dec(() => 1) m(){} }',false],['function outer(){class C { @dec(() => 1) m(){} }}',true]]){
 const p=await get(s), method=of(p.tree,'method_definition')[0], deco=field(method,'decorator'), arrow=of(deco,'arrow_function')[0], call=of(deco,'call_expression')[0]; const env=nested?p.functions[0].id:null;
 assert.equal(p.ownerByNode.get(deco),env); assert.equal(p.ownerByNode.get(call),env); assert.equal(p.ownerByNode.get(arrow),nested?env:p.functions.find(f=>f.root===arrow).id); assert.equal(p.ownerByNode.get(field(method,'body')),p.ownerByNode.get(method)); assert.equal(p.functions.length,nested?1:2);
 assert.ok(p.diagnostics.some(d=>d.code==='javascript-unsupported-syntax'&&d.range.startIndex===s.indexOf('@')&&d.owner===env));
 }
});
test('R04-06 JSX text prevents annotation within text after disposal',async()=>{
 const s='function f(){\nreturn <div>{work()} text\n</div>;}'; const p=await get(s), n=of(p.tree,'jsx_text')[0]; assert.equal(txt(s,n),' text\n'); assert.equal(p.presentation.lineAnnotations[1].endIndex,null); assert.ok(p.presentation.unsafeCommentRanges.some(r=>r.startIndex===n.startIndex&&r.endIndex===n.endIndex)); assert.equal(p.ownerByNode.get(n),p.functions[0].id);
});
test('R04-T1 switch, exception and static block roles survive prepare',async()=>{
 const p=await get('function f(){switch(x){case 1:{a();}{b();} default:{c();}} try {a()} catch(e) {b()} finally {c()} class C {static { { work(); } } static m(){} }}');
 const c=of(p.tree,'switch_case')[0], d=of(p.tree,'switch_default')[0]; assert.deepEqual(c.children.filter(x=>x.type==='statement_block').map(x=>x.field),['body','body']); assert.equal(d.children.find(x=>x.type==='statement_block').field,'body');
 const t=of(p.tree,'try_statement')[0]; assert.equal(field(t,'body').type,'statement_block'); assert.equal(field(field(t,'handler'),'body').type,'statement_block'); assert.equal(field(field(t,'finalizer'),'body').type,'statement_block'); const st=of(p.tree,'class_static_block')[0]; assert.equal(field(st,'body').type,'statement_block'); assert.equal(of(field(st,'body'),'statement_block')[1].field,null); assert.equal(field(of(p.tree,'method_definition')[0],'body').type,'statement_block');
});

test('R04-T1 operator tokens retain direct-parent order and both positions',async()=>{
 const s='// 😀\r\n\tfunction f(){ x && y; x || y; x ?? y; x = y; x &&= y; ++x; x--; }',p=await get(s), tokens=all(p.tree).filter(n=>['&&','||','??','=','&&=','++','--'].includes(n.type));
 assert.deepEqual(tokens.map(n=>txt(s,n)),['&&','||','??','=','&&=','++','--']);
 for(const n of tokens){assert.equal(n.startPosition.row,1); assert.equal(n.endPosition.row,1); assert.equal(n.startPosition.column,n.startIndex-7); assert.equal(n.endPosition.column,n.endIndex-7); const parent=all(p.tree).find(x=>x.children.includes(n)); assert.ok(parent); assert.equal(parent.children.indexOf(n),n.type==='++'?0:1); assert.equal(n.isNamed,false); assert.equal(n.field,n.type==='='?null:'operator');}
});


for (const [label, first, newline] of [['LF','\n','\n'],['CRLF','\r\n','\r\n'],['mixed LF/CRLF','\n','\r\n']]) {
 test(`R04-06a ${label} JSX element protects line boundaries without text node`,async()=>{
  const s=`function f(){${first}return <div>{work()}${newline}</div>;}`;
  const p=await get(s), element=of(p.tree,'jsx_element')[0], call=of(element,'call_expression')[0], owner=p.functions[0].id;
  assert.equal(txt(s,element),`<div>{work()}${newline}</div>`); assert.equal(txt(s,call),'work()');
  assert.equal(p.ownerByNode.get(element),owner); assert.equal(p.ownerByNode.get(call),owner);
  assert.deepEqual(call.startPosition,{row:1,column:13}); assert.deepEqual(call.endPosition,{row:1,column:19});
  assert.equal(p.presentation.lineAnnotations[1].endIndex,null);
  assert.equal(p.presentation.lineAnnotations[2].endIndex,s.length);
  assert.ok(p.presentation.unsafeCommentRanges.some(r=>r.startIndex===element.startIndex && r.endIndex===element.endIndex));
  assert.ok(p.diagnostics.some(d=>d.category==='unsupported'&&d.owner===owner));
 });
}

test('R04-06a multiline self-closing JSX protects syntax and retains children',async()=>{
 const s='function f(){return <Widget\n value={work()}\n/>;}'; const p=await get(s), element=of(p.tree,'jsx_self_closing_element')[0], call=of(element,'call_expression')[0];
 assert.equal(txt(s,element),'<Widget\n value={work()}\n/>'); assert.equal(txt(s,call),'work()'); assert.equal(p.ownerByNode.get(call),p.functions[0].id);
 assert.equal(p.presentation.lineAnnotations[0].endIndex,null); assert.equal(p.presentation.lineAnnotations[1].endIndex,null);
});


