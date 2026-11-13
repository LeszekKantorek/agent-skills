import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../scripts/parser.mjs';
import {analyze} from '../scripts/analyzers/javascript/analyze.mjs';
import {prepare} from '../scripts/analyzers/javascript/analyze-ast.mjs';
import {analyze as rust} from '../scripts/analyzers/rust/analyze.mjs';
import {cognitive} from '../scripts/analyzers/javascript/cognitive.mjs';
import {cyclomatic} from '../scripts/analyzers/javascript/cyclomatic.mjs';
import {statements} from '../scripts/analyzers/javascript/statements.mjs';
const all=n=>[n,...n.children.flatMap(all)];
async function get(s,lang='javascript',fn=lang==='rust'?rust:analyze){const q=await parse(s,lang);try{return fn(q.tree,s,'C:/fixture.'+(lang==='rust'?'rs':'js'))}finally{q.dispose()}}
const total=p=>all(p.tree).filter(n=>p.ownerByNode.get(n)===p.functions[0].id).reduce((a,n)=>a.map((v,i)=>v+n.score[['cognitive','cyclomatic','statements'][i]]),[0,0,0]);
const nodes=(p,t)=>all(p.tree).filter(n=>n.type===t);
test('R05-01 comments never receive forwarded results',async()=>{
 for(const [s,lang,w] of [['const f=()=>(/* note */ value);','javascript',[0,1,1]],['function f(){const x=p ? (/* note */ foo()) : bar;}','javascript',[1,2,5]],['fn f(){(/* note */ yield work())}','rust',[0,1,3]]]){const p=await get(s,lang);assert.deepEqual(total(p),w);for(const n of all(p.tree).filter(n=>['comment','block_comment','parenthesized_expression'].includes(n.type)))assert.equal(n.score.statements,0);}
});
test('R05-02 outer roots do not receive results from module owner',async()=>{
 for(const s of ['const x=p?(()=>work()):other;','const x=p?()=>work():other;']) {const p=await get(s),arrow=p.functions[0].root;assert.deepEqual(total(p),[0,1,2]);assert.equal(arrow.score.statements,0);assert.equal(p.ownerByNode.get(nodes(p,'variable_declarator')[0]),null);assert.equal(nodes(p,'call_expression')[0].score.statements,2);for(const n of [p.tree,...nodes(p,'parenthesized_expression')])assert.equal(n.score.statements,0);}
 const p=await get('function f(){return p ? (()=>work()) : other;}');assert.equal(nodes(p,'arrow_function')[0].score.statements,1);assert.deepEqual(total(p),[1,2,6]);
});
test('R05-03 and 04 binding location and using declarations',async()=>{
 for(const kind of ['const','let','var','using','await using']) {const p=await get(`async function f(){for (${kind}\n{x} of xs) work();}`),loop=nodes(p,'for_in_statement')[0],left=loop.children.find(c=>c.field==='left');assert.deepEqual(total(p),[1,2,3],kind);assert.equal(loop.score.statements,1);assert.equal(left.score.statements,1);assert.equal(left.startPosition.row,1);assert.equal(p.ownerByNode.get(left),p.functions[0].id);}
 const p=await get('function f(){using x=work(); await using a=one(),b=two(); for(x of xs) work();}');assert.equal(nodes(p,'variable_declarator').length,3);for(const n of nodes(p,'variable_declarator'))assert.equal(n.score.statements,1);assert.equal(nodes(p,'for_in_statement')[0].children.find(c=>c.field==='left').score.statements,0);assert.deepEqual(total(p),[1,2,8]);
});
test('R05-05 field name and initializer have distinct boundaries',async()=>{
 for(const [body,w,wrapper] of [['x=load();',3,1],['[key()];',2,0],['[key()]=load();',3,0],['[key()](){}',1,0]]){const p=await get(`function f(){(class {${body}});}`);assert.equal(total(p)[2],w,body);assert.equal(nodes(p,'expression_statement')[0].score.statements,wrapper);}
});
test('5.4 preserves immutable shape, owners and diagnostics after each pass',async()=>{
 const p=await get('function bad(){return <X>{known()}</X>;} function good(){debugger;}', 'javascript',prepare), list=all(p.tree);
 const shape=list.map(n=>({node:n,keys:Object.keys(n).sort(),type:n.type,field:n.field,isNamed:n.isNamed,startIndex:n.startIndex,endIndex:n.endIndex,startPosition:{...n.startPosition},endPosition:{...n.endPosition},children:[...n.children]}));const owners=[...p.ownerByNode],diagnostics=structuredClone(p.diagnostics), root=p.tree;
 for(const [run,key] of [[cognitive,'cognitive'],[cyclomatic,'cyclomatic'],[statements,'statements']]){const before=list.map(n=>({...n.score}));run(p);assert.strictEqual(p.tree,root);const actualNodes=all(p.tree);assert.equal(actualNodes.length,list.length);actualNodes.forEach((node,i)=>assert.strictEqual(node,list[i]));assert.equal(p.ownerByNode.size,actualNodes.length);assert.ok(p.ownerByNode.has(p.tree));assert.equal(p.ownerByNode.get(p.tree),null);for(const node of actualNodes)assert.ok(p.ownerByNode.has(node));list.forEach((n,i)=>{const snapshot=shape[i];assert.deepEqual(Object.keys(n).sort(),snapshot.keys);for(const k of ['type','field','isNamed','startIndex','endIndex','startPosition','endPosition'])assert.deepEqual(n[k],snapshot[k]);assert.equal(n.children.length,snapshot.children.length);n.children.forEach((child,j)=>assert.strictEqual(child,snapshot.children[j]));for(const k of Object.keys(n.score))if(k!==key)assert.equal(n.score[k],before[i][k]);});assert.equal(p.ownerByNode.size,owners.length);for(const [node,owner] of owners){assert.ok(p.ownerByNode.has(node));assert.equal(p.ownerByNode.get(node),owner);}assert.deepEqual(p.diagnostics,diagnostics);}
 assert.deepEqual(p.diagnostics.map(d=>[d.range.startIndex,d.range.endIndex,d.owner,d.affectedMetrics,d.affectsFunctionDiscovery]),[[22,38,p.functions[0].id,['cognitive','cyclomatic','statements'],false],[22,25,p.functions[0].id,['cognitive','cyclomatic','statements'],false],[25,34,p.functions[0].id,['cognitive','cyclomatic','statements'],false],[34,38,p.functions[0].id,['cognitive','cyclomatic','statements'],false]]);assert.ok(!p.diagnostics.some(d=>d.owner===p.functions[1].id));assert.equal(nodes(p,'call_expression')[0].score.statements,1);assert.equal(nodes(p,'debugger_statement')[0].score.statements,1);
});
test('5.4 each logical assignment is not a decision',async()=>{
 for(const op of ['&&=','||=','??=']) for(const rhs of ['value','a?b:c']){const p=await get(`function f(){x ${op} ${rhs};}`),assign=nodes(p,'augmented_assignment_expression')[0];assert.equal(assign.score.cyclomatic,0);assert.equal(total(p)[1],rhs==='value'?1:2,op+rhs);}
});


test('R05-01 comments preserve results and positions across variants',async()=>{
 for(const [withComment,without,lang] of [
  ['const f=()=>(/*note*/value);','const f=()=>(value);','javascript'],
  ['function f(){const x=p?(/*note*/foo()):bar;}','function f(){const x=p?(foo()):bar;}','javascript'],
  ['fn f(){(/*note*/yield work())}','fn f(){(yield work())}','rust']
 ]) {
  const a=await get(withComment,lang),b=await get(without,lang);assert.deepEqual(total(a),total(b));
  for(const c of all(a.tree).filter(n=>['comment','block_comment','line_comment'].includes(n.type)))assert.equal(c.score.statements,0);
 }
});
test('R05-03 bindings use identifier roles and await using kinds',async()=>{
 for(const kind of ['const','using','await using']) {
  const p=await get(`async function f(){for (${kind}\n x of items) work();}`),loop=nodes(p,'for_in_statement')[0],left=loop.children.find(n=>n.field==='left');
  assert.equal(left.type,'identifier');assert.equal(left.score.statements,1);assert.equal(left.startPosition.row,1);assert.equal(loop.score.statements,1);assert.equal(p.ownerByNode.get(left),p.functions[0].id);
 }
});


