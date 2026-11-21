import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../scripts/parser.mjs';
import {analyze} from '../scripts/analyzers/javascript/analyze.mjs';
import {prepare} from '../scripts/analyzers/javascript/analyze-ast.mjs';
import {analyze as rust} from '../scripts/analyzers/rust/analyze.mjs';
import {cognitive} from '../scripts/analyzers/javascript/cognitive.mjs';
const all=n=>[n,...n.children.flatMap(all)];
async function get(s,lang='javascript',fn=lang==='rust'?rust:analyze){const q=await parse(s,lang);try{return fn(q.tree,s,'C:/fixture.'+(lang==='rust'?'rs':'js'))}finally{q.dispose()}}
const total=p=>all(p.tree).filter(n=>p.ownerByNode.get(n)===p.functions[0].id).reduce((sum,n)=>sum+n.score.cognitive,0);
const nodes=(p,t)=>all(p.tree).filter(n=>n.type===t);
test('R05-01 comments and grouping preserve Cognitive',async()=>{
 for(const [s,lang,w] of [['const f=()=>(/* note */ value);','javascript',0],['function f(){const x=p ? (/* note */ foo()) : bar;}','javascript',1],['fn f(){(/* note */ yield work())}','rust',0]]){const p=await get(s,lang);assert.equal(total(p),w);for(const n of all(p.tree).filter(n=>['comment','block_comment','parenthesized_expression'].includes(n.type)))assert.equal(n.score.cognitive,0);}
});
test('R05-02 outer closures exclude surrounding module decisions',async()=>{
 for(const s of ['const x=p?(()=>work()):other;','const x=p?()=>work():other;']) {const p=await get(s),arrow=p.functions[0].root;assert.equal(total(p),0);assert.equal(p.ownerByNode.get(arrow),p.functions[0].id);assert.equal(p.ownerByNode.get(nodes(p,'variable_declarator')[0]),null);assert.equal(p.ownerByNode.get(nodes(p,'call_expression')[0]),p.functions[0].id);}
 const p=await get('function f(){return p ? (()=>work()) : other;}');assert.equal(p.ownerByNode.get(nodes(p,'arrow_function')[0]),p.functions[0].id);assert.equal(total(p),1);
});
test('R05-03 and 04 binding location and using declarations',async()=>{
 for(const kind of ['const','let','var','using','await using']) {const p=await get(`async function f(){for (${kind}\n{x} of xs) work();}`),loop=nodes(p,'for_in_statement')[0],left=loop.children.find(c=>c.field==='left');assert.equal(total(p),1,kind);assert.equal(loop.score.cognitive,1);assert.equal(left.score.cognitive,0);assert.equal(left.startPosition.row,1);assert.equal(p.ownerByNode.get(left),p.functions[0].id);}
 const p=await get('function f(){using x=work(); await using a=one(),b=two(); for(x of xs) work();}');assert.equal(nodes(p,'variable_declarator').length,3);for(const n of nodes(p,'variable_declarator')) assert.equal(p.ownerByNode.get(n),p.functions[0].id);assert.equal(nodes(p,'for_in_statement')[0].children.find(c=>c.field==='left').score.cognitive,0);assert.equal(total(p),1);
});
test('5.4 preserves immutable shape, owners and diagnostics during Cognitive scoring',async()=>{
 const p=await get('function bad(){return <X>{known()}</X>;} function good(){debugger;}', 'javascript',prepare);
 const list=all(p.tree);
 const shape=()=>JSON.stringify(p.tree,(key,value)=>key==='score'?undefined:value);
 const before=shape();
 const owners=[...p.ownerByNode];
 const diagnostics=structuredClone(p.diagnostics);
 cognitive(p);
 assert.equal(shape(),before);
 const actualNodes=all(p.tree);
 assert.equal(actualNodes.length,list.length);
 actualNodes.forEach((node,i)=>assert.strictEqual(node,list[i]));
 assert.equal(p.ownerByNode.size,list.length);
 assert.equal(p.ownerByNode.get(p.tree),null);
 for(const [node,owner] of owners) assert.equal(p.ownerByNode.get(node),owner);
 assert.deepEqual(p.diagnostics,diagnostics);
 const id=p.functions[0].id;
 assert.deepEqual(
  p.diagnostics.map(d=>[d.range.startIndex,d.range.endIndex,d.owner,d.affectedMetrics,d.affectsFunctionDiscovery]),
  [[22,38,id,['cognitive','halstead'],false],[22,25,id,['cognitive','halstead'],false],[25,34,id,['cognitive','halstead'],false],[34,38,id,['cognitive','halstead'],false]],
 );
});
test('5.4 each logical assignment is not a decision',async()=>{
 for(const op of ['&&=','||=','??=']) for(const rhs of ['value','a?b:c']){const p=await get(`function f(){x ${op} ${rhs};}`),assign=nodes(p,'augmented_assignment_expression')[0];assert.equal(assign.score.cognitive,0);assert.equal(total(p),rhs==='value'?0:1,op+rhs);}
});


test('R05-01 comments preserve results and positions across variants',async()=>{
 for(const [withComment,without,lang] of [
  ['const f=()=>(/*note*/value);','const f=()=>(value);','javascript'],
  ['function f(){const x=p?(/*note*/foo()):bar;}','function f(){const x=p?(foo()):bar;}','javascript'],
  ['fn f(){(/*note*/yield work())}','fn f(){(yield work())}','rust']
 ]) {
  const a=await get(withComment,lang),b=await get(without,lang);assert.equal(total(a),total(b));
  for(const c of all(a.tree).filter(n=>['comment','block_comment','line_comment'].includes(n.type)))assert.equal(c.score.cognitive,0);
 }
});
test('R05-03 bindings use identifier roles and await using kinds',async()=>{
 for(const kind of ['const','using','await using']) {
  const p=await get(`async function f(){for (${kind}\n x of items) work();}`),loop=nodes(p,'for_in_statement')[0],left=loop.children.find(n=>n.field==='left');
  assert.equal(left.type,'identifier');assert.equal(left.score.cognitive,0);assert.equal(left.startPosition.row,1);assert.equal(loop.score.cognitive,1);assert.equal(p.ownerByNode.get(left),p.functions[0].id);
 }
});


