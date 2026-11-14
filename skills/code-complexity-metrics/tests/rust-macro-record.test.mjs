import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../scripts/parser.mjs';
import {analyze, prepare} from '../scripts/analyzers/rust/analyze.mjs';
const walk=n=>[n,...n.children.flatMap(walk)];
async function run(source, score=true) {const p=await parse(source,'rust'); try{return (score?analyze:prepare)(p.tree,source,'file');} finally{p.dispose();}}
const total=p=>walk(p.tree).reduce((a,n)=>a.map((v,i)=>v+n.score[['cognitive','cyclomatic','statements'][i]]),[0,0,0]);
const fixtures = [
 // M07: src/providers/simconnect/journal.rs:283
 ['json!({ "path": path, "size_bytes": metadata.len(),\n        "modified_unix_ms": metadata.modified().ok().and_then(|at| at.duration_since(UNIX_EPOCH).ok()).map(|at| at.as_millis().to_string()),\n        "sha256": format!("{:x}", hash.finalize()) })', [0,1,14]],
 // M64: src/telemetry.rs:809
 ['serde_json::json!({\n                "vs0_kt": 40.0, "redline_kt": 140.0,\n                "references": {"vr_kt": 55.0, "vg_kt": 90.0}\n            })', [0,1,1]],
 // M52: src/providers/simconnect/runtime.rs:832
 ['json!({\n                        "sample_index": sample_index,\n                        "raw": { "pitch_radians": number(radians[0]),\n                            "pitch_degrees": unit_probe.as_ref().map(|p| number(p.degrees[0])),\n                            "bank_radians": number(radians[1]),\n                            "bank_degrees": unit_probe.as_ref().map(|p| number(p.degrees[1])) },\n                        "repeated_radians": unit_probe.as_ref().map(|p| json!({\n                            "pitch": number(p.repeated_radians[0]), "bank": number(p.repeated_radians[1]),\n                        })),\n                        "interval_us": last_sample.map(|at| now.saturating_duration_since(at).as_micros().to_string()),\n                    })', [0,1,22]],
];
for (const [fragment, expected] of fixtures) test('record fixture '+fragment.slice(0,25),async()=>{
 for (const macro of [fragment,fragment.replace(/^[\w:]+!/, 'other!')]) {
  const source=`// 😀\r\nfn f(){${macro};}`, p=await run(source), nodes=walk(p.tree);
  assert.deepEqual(p.diagnostics,[]); assert.deepEqual(total(p),expected);
  const records=nodes.filter(n=>n.type==='macro_record'); assert.ok(records.length);
  for(const n of records) {assert.equal(source[n.startIndex],'{');assert.equal(source[n.endIndex-1],'}');assert.ok(Object.values(n.score).every(x=>x===0));assert.equal(p.ownerByNode.get(n),p.functions[0].id);}
  for(const n of nodes.filter(n=>n.type==='macro_record_field')) {assert.equal(n.children[0].field,'key');assert.equal(n.children[1].field,'value'); assert.ok(Object.values(n.score).every(x=>x===0));}
 }
});
test('records: expression contexts, complete consumption and negative cases',async()=>{
 for (const [text,expected] of [['m!({"k":ready && verify()})',[1,2,2]],['m!({"k": {}})',[0,1,2]],['m!({"k": f(|a,b| a+b),})',[0,1,3]],['m!(A(x))',[0,1,2]]]) {
  const p=await run(`fn f(){${text};}`); assert.deepEqual(p.diagnostics,[],text);assert.deepEqual(total(p),expected,text);
 }
 for(const text of ['m!({"ok": work(), "bad":})','m!({"ok": work(), other: value})','m!({"ok": work()} extra)','m!({"a":1} => x)', 'm!({"a": 1,,})', 'm!({"a": 1,, "b": 2})', 'm!({"a": {"b": 1,,}})', 'm!({b"a": 1})', 'm!({br#"a"#: 1})', 'm!({c"a": 1})', 'm!({cr#"a"#: 1})']) {
  const p=await run(`fn f(){${text};}`);assert.ok(p.diagnostics.length,text);assert.equal(walk(p.tree).filter(n=>n.type==='macro_record').length,0,text);
 }
});
test('record keys allow ordinary and raw text strings',async()=>{
 const p=await run('fn f(){m!({"a": 1, r##"b"##: work()});}');
 assert.deepEqual(p.diagnostics,[]);assert.deepEqual(total(p),[0,1,2]);
});


test('record values keep separate logical and closure contexts and local scores',async()=>{
 const source='// 😀\r\nfn f(){ if outer { m!({"a": left && right, "b": || { if inner { call(); } }}); } }';
 const p=await run(source), all=walk(p.tree), macro=all.find(n=>n.type==='macro_invocation');
 assert.deepEqual(p.diagnostics,[]); assert.deepEqual(macro.score,{cognitive:0,cyclomatic:0,statements:1});
 const op=all.find(n=>n.type==='&&');assert.deepEqual(op.score,{cognitive:1,cyclomatic:1,statements:0});
 assert.deepEqual(all.filter(n=>n.type==='if_expression').map(n=>n.score.cognitive),[1,3]);
 const call=all.find(n=>n.type==='call_expression');assert.deepEqual(call.score,{cognitive:0,cyclomatic:0,statements:1});
 for(const n of [macro,op,call]) {assert.equal(p.ownerByNode.get(n),p.functions[0].id);assert.equal(n.startPosition.column,n.startIndex-source.lastIndexOf('\n',n.startIndex-1)-1);}
});

test('record report and explain show the same unmasked points',async()=>{
 const {mkdtemp,writeFile,rm}=await import('node:fs/promises');const os=(await import('node:os')).default;const path=(await import('node:path')).default;const {spawnSync}=await import('node:child_process');const {fileURLToPath}=await import('node:url');
 const dir=await mkdtemp(path.join(os.tmpdir(),'metric-record-'));
 try {await writeFile(path.join(dir,'input.rs'),'fn f(){\n m!({"k":\n ready && verify()\n });\n}');
  const cli=fileURLToPath(new URL('../scripts/measure.mjs',import.meta.url));const run=(...args)=>spawnSync(process.execPath,[cli,'--path','input.rs',...args],{cwd:dir,encoding:'utf8'});
  const report=run();assert.equal(report.status,0);const f=JSON.parse(report.stdout).functions[0];assert.deepEqual(Object.values(f.metrics),[1,2,2]);assert.equal(f.error,null);
  const explain=run('--explain');assert.equal(explain.status,0);assert.match(explain.stdout,/Cognitive: 1; Cyclomatic: 2; Statements: 2/);assert.match(explain.stdout,/ready && verify\(\).*Cognitive: \+1; Cyclomatic: \+1; Statements: \+1/);
 } finally {await rm(dir,{recursive:true,force:true});}
});


test('long records stop at the first complete field boundary',async()=>{
 const ts=(await import('../vendor/tree-sitter/tree-sitter.js')).default;
 const source='fn f(){m!({'+Array.from({length:100},(_,i)=>`"k${i}": v`).join(',')+', "bad":});}';
 const p=await parse(source,'rust');const original=ts.Parser.prototype.parse;let calls=0;
 try {ts.Parser.prototype.parse=function(...args){calls++;return original.apply(this,args)};
  const result=prepare(p.tree,source,'file');assert.equal(result.diagnostics.length,1);assert.ok(calls<=105,`wrapper parses: ${calls}`);
 } finally {ts.Parser.prototype.parse=original;p.dispose();}
});
