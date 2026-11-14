import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../scripts/parser.mjs';
import {analyze} from '../scripts/analyzers/rust/analyze.mjs';
import {parseMacroTypes} from '../scripts/analyzers/rust/macro-types.mjs';
import ts from '../vendor/tree-sitter/tree-sitter.js';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import os from 'node:os'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
const walk = n => [n,...n.children.flatMap(walk)];
async function run(source) { const p=await parse(source,'rust'); try{return analyze(p.tree,source,'file');} finally{p.dispose();} }
const sum = nodes => nodes.reduce((a,n)=>a.map((v,i)=>v+n.score[['cognitive','cyclomatic','statements'][i]]),[0,0,0]);
test('M12 and M13, changed names and original UTF-16 ranges', async()=>{
 for(const trait of ['Send','Sync']) for(const name of ['assert_not_impl','renamed']) {
  const source=`// 😀\r\nfn native_owners_cannot_cross_threads_or_be_shared(){\n        ${name}!(Connection<'static>, ${trait});\n}`;
  const p=await run(source), macro=walk(p.tree).find(n=>n.type==='macro_invocation');
  assert.deepEqual(p.diagnostics,[]); assert.equal(p.functions[0].name,'native_owners_cannot_cross_threads_or_be_shared');
  const roles=macro.children.filter(n=>n.field==='type');
  assert.deepEqual(roles.map(n=>source.slice(n.startIndex,n.endIndex)),["Connection<'static>",trait]);
  for(const n of roles){assert.equal(p.ownerByNode.get(n),p.functions[0].id); assert.equal(n.startPosition.row,2); assert.equal(n.startPosition.column,n.startIndex-source.lastIndexOf('\n',n.startIndex-1)-1);}
  assert.deepEqual(sum(walk(macro)),[0,0,1]);
 }
});
test('generic commas, embedded expression and complete validation', async()=>{
 const source="fn f(){m!(Connection<'static>, Outer<A, Inner<B, C>>, (A, B), [T; limit()]);}", p=await run(source), macro=walk(p.tree).find(n=>n.type==='macro_invocation');
 assert.deepEqual(p.diagnostics,[]); assert.deepEqual(macro.children.filter(n=>n.field==='type').map(n=>source.slice(n.startIndex,n.endIndex)),["Connection<'static>",'Outer<A, Inner<B, C>>','(A, B)','[T; limit()]']);
 assert.deepEqual(sum(walk(macro)),[0,0,2]); const call=walk(macro).find(n=>n.type==='call_expression'); assert.equal(source.slice(call.startIndex,call.endIndex),'limit()'); assert.equal(call.score.statements,1);
 for(const s of ["m!(Connection<'static, Send)","m!(Connection<'static>, +)","m!(Connection<'static>, 42 + 3)","m!(Connection<'static>, $t)","m!(Connection<'static>, Send,, Sync)"]) {const q=await run(`fn f(){${s};}`); assert.ok(q.diagnostics.length,s);}
 const expr=await run('fn f(){m!(a < b, f());}'), m=walk(expr.tree).find(n=>n.type==='macro_invocation'); assert.deepEqual(expr.diagnostics,[]); assert.deepEqual(m.children.filter(n=>n.field==='argument').map(n=>n.type),['binary_expression','call_expression']); assert.deepEqual(sum(walk(m)),[0,0,2]);
});
test('CLI explain reports expression inside type on original line',async()=>{const dir=await mkdtemp(path.join(os.tmpdir(),'macro-types-')); try {await writeFile(path.join(dir,'input.rs'),"fn f(){\n m!(Connection<'static>,\n [T; limit()]);\n}"); const cli=fileURLToPath(new URL('../scripts/measure.mjs',import.meta.url)); const r=spawnSync(process.execPath,[cli,'--path','input.rs','--explain'],{cwd:dir,encoding:'utf8'}); assert.equal(r.status,0); assert.match(r.stdout,/\[T; limit\(\)\]\); \/\/ Cognitive: 0; Cyclomatic: 0; Statements: \+1/);}finally{await rm(dir,{recursive:true,force:true});}});


test('whole-list probe is bounded and single types preserve trailing commas', async()=>{
 for(const suffix of ['', ',']) {
  const source=`fn f(){m!(Connection<'static>${suffix});}`, p=await run(source), macro=walk(p.tree).find(n=>n.type==='macro_invocation');
  assert.deepEqual(p.diagnostics,[]); assert.deepEqual(macro.children.filter(n=>n.field==='type').map(n=>source.slice(n.startIndex,n.endIndex)),["Connection<'static>"]);
 }
 for(const count of [100,200,400]) {
  const source=`fn f(){m!(${Array.from({length:count},()=>"Connection<'static>").join(', ')}, @);}`;
  const parsed=await parse(source,'rust'); try {
   const find=n=>n.type==='token_tree'?n:n.namedChildren.map(find).find(Boolean), token=find(parsed.tree.rootNode); let probes=0, volume=0;
   const original=ts.Parser.prototype.parse; ts.Parser.prototype.parse=function(text,...args){probes++;volume+=text.length;return original.call(this,text,...args);};
   let result; try {result=parseMacroTypes(parsed.tree.language,token,source,0,()=>true);} finally {ts.Parser.prototype.parse=original;}
   assert.equal(result,null); assert.equal(probes,1); assert.ok(volume<=source.length+100);
  } finally {parsed.dispose();}
  const valid="fn f(){m!(" + Array.from({length:count},()=> "Path").join(", ") + ", Connection<'static>);}";
  const p=await parse(valid,'rust'); try {
   const find=n=>n.type==='token_tree'?n:n.namedChildren.map(find).find(Boolean); let probes=0, volume=0;
   const original=ts.Parser.prototype.parse; ts.Parser.prototype.parse=function(text,...args){probes++;volume+=text.length;return original.call(this,text,...args);};
   let result; try {result=parseMacroTypes(p.tree.language,find(p.tree.rootNode),valid,0,()=>true);} finally {ts.Parser.prototype.parse=original;}
   assert.equal(result.length,count+1); assert.equal(probes,count+2); assert.ok(volume < valid.length * 8);
  } finally {p.dispose();}
 }
});
