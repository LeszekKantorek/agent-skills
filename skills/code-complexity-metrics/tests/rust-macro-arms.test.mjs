import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import os from 'node:os'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
import {parse} from '../scripts/parser.mjs';
import {analyze} from '../scripts/analyzers/rust/analyze.mjs';
const walk = n => [n,...n.children.flatMap(walk)];
async function run(source) { const p = await parse(source,'rust'); try { return analyze(p.tree,source,'file'); } finally { p.dispose(); } }
const sum = nodes => nodes.reduce((a,n)=>a.map((v,i)=>v+n.score[['cognitive','cyclomatic','statements'][i]]),[0,0,0]);
// Exact source fragments M01–M03 and M22 from the inventory.
const fragments = [
  "tokio::select! {\n        result = shutdown => result.map_err(ApplicationError::from),\n        result = &mut http => {\n            http_result = Some(result);\n            Err(ApplicationError::Io(io::Error::other(\"HTTP service ended unexpectedly\")))\n        },\n        result = &mut producer => {\n            producer_result = Some(result);\n            Err(ApplicationError::Io(io::Error::other(\"telemetry supervision ended unexpectedly\")))\n        },\n    }",
  "tokio::select! {\n        result = tokio::signal::ctrl_c() => result,\n        _ = async { if receiver.await.is_err() { std::future::pending::<()>().await; } } => Ok(()),\n    }",
  "tokio::select! {\n                result = server.run(std::future::pending()) => result,\n                _ = dropped => Ok(()),\n            }",
  "tokio::select! {\n            result = &mut shutdown => {\n                let signalled = stop.signal();\n                break result.and(signalled);\n            }\n            _ = tokio::time::sleep(Duration::from_millis(50)) => {}\n        }"
];
test('M01–M03 and M22: complete roles, original ranges and owner', async () => {
 for (const fragment of fragments) for (const name of ['tokio::select!', 'renamed!']) {
  const source = `// 😀\r\nfn f(){loop {${fragment.replace('tokio::select!',name)};}}`, p=await run(source), nodes=walk(p.tree), macro=nodes.find(n=>n.type==='macro_invocation');
  assert.deepEqual(p.diagnostics,[]); const roles=macro.children.filter(n=>['pattern','input','body'].includes(n.field));
  assert.deepEqual(roles.map(n=>n.field),Array.from({length:fragment===fragments[0]?3:2},()=>['pattern','input','body']).flat());
  for (const n of roles) {assert.equal(p.ownerByNode.get(n),p.functions[0].id); assert.ok(n.startIndex >= macro.startIndex && n.endIndex <= macro.endIndex); assert.ok(source.slice(n.startIndex,n.endIndex).length > 0); assert.equal(n.startPosition.column,n.startIndex-source.lastIndexOf('\n',n.startIndex-1)-1);}
  assert.ok(!nodes.some(n=>n.type==='match_arm'||n.type==='match_expression')); assert.equal(macro.score.statements,1);
 }
});
test('M03 operation points and real async tail point', async () => {
 for(const tail of [false,true]) {const source=`fn f(){ ${tail?'async move {':''} ${fragments[2]}${tail?' }':';'}; }`, p=await run(source), macro=walk(p.tree).find(n=>n.type==='macro_invocation'); assert.deepEqual(p.diagnostics,[]); assert.deepEqual(sum(walk(macro)),[0,0,tail?5:4]); assert.equal(macro.score.statements,tail?2:1);
  assert.deepEqual(macro.children.filter(n=>['pattern','input','body'].includes(n.field)).map(n=>[n.field,source.slice(n.startIndex,n.endIndex)]), [['pattern','result'],['input','server.run(std::future::pending())'],['body','result'],['pattern','_'],['input','dropped'],['body','Ok(())']]);
 }
 const original = `fn f(){ let task = tokio::spawn(async move {\n            ${fragments[2]}\n        }); }`;
 const p=await run(original), macro=walk(p.tree).find(n=>n.type==='macro_invocation' && original.slice(n.startIndex,n.endIndex)===fragments[2]);
 assert.deepEqual(p.diagnostics,[]); assert.deepEqual(sum(walk(macro)),[0,0,5]); assert.equal(macro.score.statements,2);
});
test('independent contexts, block and jump contributions; invalid complete lists', async () => {
 for(const [s,expected] of [['m!(x = a && b => c && d)',[2,2,1]], ['m!(x = load() => { run(); }, _ = other() => done())',[0,0,6]], ['m!(x = load() => { break; } _ = other() => {})',[0,0,6]]]) {const p=await run(`fn f(){loop { ${s}; }}`), macro=walk(p.tree).find(n=>n.type==='macro_invocation'); assert.deepEqual(p.diagnostics,[],s); assert.deepEqual(sum(walk(macro)),expected,s);}
 for(const s of ['m!(x = a =>)', 'm!(x = a => b, _ = c =>)', 'm!(x = a => b,, _ = c => d)', 'm!(x = $a => b)', 'm!($x = a => b)', 'm!(x = a => $b)', 'm!(x = a => b _ = c => d)', 'm!(x = a => b, junk)']) {const p=await run(`fn f(){${s};}`); assert.equal(p.diagnostics[0]?.code,'rust-unsupported-macro-arguments',s); assert.equal(p.diagnostics[0].owner,p.functions[0].id); const macro=walk(p.tree).find(n=>n.type==='macro_invocation'); assert.ok(!macro.children.some(n=>['pattern','input','body'].includes(n.field)),s);}
});
test('comments at binding boundaries and nested metavariable constraints', async()=>{
 const source='fn f(){m!(Some(x) /* before */ = /* after */ load() => {run()} _ = next() => done());}';
 const p=await run(source), macro=walk(p.tree).find(n=>n.type==='macro_invocation'); assert.deepEqual(p.diagnostics,[]);
 assert.deepEqual(macro.children.filter(n=>['pattern','input','body'].includes(n.field)).map(n=>source.slice(n.startIndex,n.endIndex)),['Some(x)','load()','{run()}','_','next()','done()']);
 for(const s of ['m!(x = f($a) => b)','m!(x = a => f($b))','m!(Some($x) = a => b)','m!(x = #[doc = $a] a => b)']) { const result=await run(`fn f(){${s};}`); assert.equal(result.diagnostics[0]?.code,'rust-unsupported-macro-arguments',s); }
});
test('attributes, internal comments and commas inside patterns', async()=>{
 for(const s of ['m!(x = #[cfg(x)] a => b)', 'm!(x = f(/* internal */ a) => b)', 'm!(Foo::<A, B>::Bar = load() => done())', 'm!(x = a => {}, Foo::<A, B>::Bar = load() => done())', 'm!(mut x = a => b)', 'm!(x = a => b, mut y = c => d)', 'm!(ref mut x = a => b)']) {
  const p=await run(`fn f(){${s};}`); assert.deepEqual(p.diagnostics,[],s);
  const macro=walk(p.tree).find(n=>n.type==='macro_invocation'); assert.ok(macro.children.some(n=>n.field==='pattern'),s);
 }
 for(const s of ['m!(#[cfg(x)] y = a => b)', 'm!(y if ready() = a => b)', 'm!(mut = a => b)']) { const p=await run(`fn f(){${s};}`); assert.equal(p.diagnostics[0]?.code,'rust-unsupported-macro-arguments',s); }
});
test('a complete next member may follow a block without a separator', async()=>{
 for(const pat of ['| y','&y','(y)','[y]','-1']) {
  const s=`m!(x = a => {} ${pat} = b => c)`, p=await run(`fn f(){${s};}`);
  assert.deepEqual(p.diagnostics,[],s);
  const macro=walk(p.tree).find(n=>n.type==='macro_invocation'); assert.deepEqual(macro.children.filter(n=>['pattern','input','body'].includes(n.field)).map(n=>n.field),['pattern','input','body','pattern','input','body'],s);
  const separated=await run(`fn f(){m!(x = a => {}, ${pat} = b => c);}`); assert.deepEqual(separated.diagnostics,[],pat);
 }
});
test('labeled and attributed blocks can omit the following comma', async()=>{
 for(const separator of ['', ',']) for(const [body,expected] of [["'out: { break 'out; }", "'out: { break 'out; }"],['#[allow(unused)] {}','{}']]) {
  const source=`// 😀\r\nfn f(){m!(x = next() => ${body}${separator} _ = other() => {});}`, p=await run(source), nodes=walk(p.tree), macro=nodes.find(n=>n.type==='macro_invocation');
  assert.deepEqual(p.diagnostics,[],source); const roles=macro.children.filter(n=>['pattern','input','body'].includes(n.field));
  assert.deepEqual(roles.map(n=>n.field),['pattern','input','body','pattern','input','body']);
  assert.equal(source.slice(roles[2].startIndex,roles[2].endIndex),expected);
  assert.equal(roles[2].startPosition.column,roles[2].startIndex-source.lastIndexOf('\n',roles[2].startIndex-1)-1);
  assert.equal(p.ownerByNode.get(roles[2]),p.functions[0].id);
  if(body.startsWith("'out")){const jump=nodes.find(n=>n.type==='break_expression'); assert.equal(source.slice(jump.startIndex,jump.endIndex),"break 'out"); assert.equal(jump.score.statements,1); assert.equal(jump.score.cognitive,1);}
  else assert.ok(macro.children.some(n=>n.type==='attribute_item'));
 }
});
test('CLI explain reports arm operations at original lines', async()=>{const dir=await mkdtemp(path.join(os.tmpdir(),'macro-arms-'));try {await writeFile(path.join(dir,'input.rs'),'fn f(){\n m!(x = load() =>\n { run(); });\n}');const cli=fileURLToPath(new URL('../scripts/measure.mjs',import.meta.url));const r=spawnSync(process.execPath,[cli,'--path','input.rs','--explain'],{cwd:dir,encoding:'utf8'});assert.equal(r.status,0);assert.match(r.stdout,/load\(\)/);assert.match(r.stdout,/run\(\)/);}finally{await rm(dir,{recursive:true,force:true});}});
