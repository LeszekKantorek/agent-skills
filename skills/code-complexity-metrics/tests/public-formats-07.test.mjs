import {explainRow} from './explain-rows.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';import {spawnSync} from 'node:child_process';import path from 'node:path';import os from 'node:os';import {fileURLToPath} from 'node:url';
const cli=fileURLToPath(new URL('../scripts/measure.mjs',import.meta.url));const run=(cwd,...args)=>spawnSync(process.execPath,[cli,...args],{cwd,encoding:'utf8'});

test('empty explain prints only the report header and metadata', () => {
  const result = run(os.tmpdir(), '--explain');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, [
    '# Code Complexity Metrics',
    '',
    'Files: 0; functions found: 0; functions presented: 0; function discovery complete: true; has errors: false',
    '',
    'Version: 2.0.0-dev.3',
    '',
    '',
  ].join('\n'));
});

test('filtered explain counts project callers and targets outside the report paths', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'metrics-graph-explain-'));
  try {
    await writeFile(path.join(dir, 'target.mjs'),
      'import {helper} from "./helper.mjs";\nexport function target() { helper(); }\nexport function callbackOnly(cb) { cb(); }');
    const caller = 'import {target} from "./target.mjs";\nfunction caller() { target(); target(); }';
    await writeFile(path.join(dir, 'caller.mjs'), caller);
    await writeFile(path.join(dir, 'helper.mjs'), 'export function helper() {}');

    const narrow = ['--path', 'target.mjs', '--filter', 'target|callbackOnly'];
    const result = run(dir, ...narrow, '--explain');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /## target [^\n]+\n[\s\S]*?Fan-In: 1 \| Fan-Out: 1\nInstability: 0\.50\n/u);
    assert.match(result.stdout, /## callbackOnly [^\n]+\n[\s\S]*?Fan-In: 0 \| Fan-Out: 0\nInstability: NaN\n/u);
    assert.doesNotMatch(result.stdout, /## (caller|helper) |unresolved|partial graph|call graph scope|Outgoing calls|Incoming callers/u);
    const full = JSON.parse(run(dir, '--path', '*.mjs', '--filter', 'target|callbackOnly').stdout);
    const single = JSON.parse(run(dir, ...narrow).stdout);
    assert.equal(single.summary.files, 1);
    assert.deepEqual(single.functions, full.functions);
    assert.deepEqual(single.summary.call_graph, full.summary.call_graph);

    const blocked = run(dir, ...narrow, '--output', 'caller.mjs');
    assert.equal(blocked.status, 1);
    assert.match(blocked.stderr, /Output aliases an input file/);
    assert.equal(await readFile(path.join(dir, 'caller.mjs'), 'utf8'), caller);
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

test('a Rust file selected from outside its project uses the Cargo root for graph metrics', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'metrics-cargo-graph-'));
  try {
    const project = path.join(dir, 'project');
    const source = path.join(project, 'src');
    await mkdir(source, {recursive: true});
    await writeFile(path.join(project, 'Cargo.toml'), '[package]\nname = "graph"\nversion = "0.1.0"\n');
    await writeFile(path.join(source, 'lib.rs'), 'mod caller; mod target; mod helper;');
    await writeFile(path.join(source, 'caller.rs'), 'pub fn caller() { super::target::target(); }');
    await writeFile(path.join(source, 'helper.rs'), 'pub fn helper() {}');
    const file = path.join(source, 'target.rs');
    await writeFile(file, 'pub fn target() { crate::helper::helper(); }');

    const result = run(dir, '--path', file, '--filter', 'target');
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.summary.files, 1);
    assert.equal(report.summary.call_graph.scope, 'project_files');
    assert.deepEqual(report.functions.map(({name, metrics}) => [name,metrics.fan_in,metrics.fan_out,metrics.instability]),
      [['target',1,1,0.5]]);
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

test('explain preserves original indentation and annotates each outer independently', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'metrics7-explain-'));
  try {
    await writeFile(path.join(dir, 'a.js'),
      'function longName(){ // original comment\n\tif (ready) work();\n}\nfunction f(){}');
    const result = run(dir, '--path', 'a.js', '--explain');
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /^\| Name \| Location \||original comment/m);
    const blocks = [...result.stdout.matchAll(/```javascript\n([\s\S]*?)\n```/g)].map(match => match[1]);
    assert.equal(blocks.length, 2);
    assert.match(blocks[0], /^Fragment +\| Cognitive \| Halstead N1 \| Halstead N2 \| Halstead Eta1 \| Halstead Eta2\n/);
    const [long, empty] = blocks.map(block => block.split('\n').slice(1).map(explainRow));
    assert.deepEqual(long.map(row => [row.fragment, row.cognitive, row.halstead]), [
      ['function longName(){', 0, [0, 0, 0, 0]],
      ['\tif (ready) work();', 1, [2, 2, 2, 2]],
      ['}', 0, [0, 0, 0, 0]],
    ]);
    assert.deepEqual(empty.map(row => [row.fragment, row.cognitive]), [['function f(){}', 0]]);
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

test('CSV quotes name and location delimiters with the metric columns', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'metrics7-csv-'));
  try {
    const source = 'const o = {"save,x"(){}};';
    await writeFile(path.join(dir, 'a,b.js'), source);
    const result = run(dir, '--path', 'a,b.js', '--format', 'csv');
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.stdout.split('\n').slice(3), [
      'Name,Location,Cognitive,Halstead Volume,N1,N2,Eta1,Eta2,Fan-In,Fan-Out,Instability,Fan-In complete,Fan-Out complete,Unresolved in,Unresolved out,Error',
      '"""save,x""","a,b.js:1:12:12",0,0,0,0,0,0,0,0,null,true,true,0,0,',
      '',
    ]);
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});
test('JSON, Markdown and CSV agree by function, value and location',async()=>{const dir=await mkdtemp(path.join(os.tmpdir(),'metrics7-'));try{await writeFile(path.join(dir,'a.js'),'function f(){if(a){work();}} function g(){return 1;}');const args=['--path','a.js'];const j=run(dir,...args),m=run(dir,...args,'--format','markdown'),c=run(dir,...args,'--format','csv');assert.equal(j.status,0);assert.equal(m.status,0);assert.equal(c.status,0);const report=JSON.parse(j.stdout),mdRows=m.stdout.split('\n').filter(x=>x.startsWith('| ')&&!x.includes('---')).slice(1).map(x=>x.split('|').slice(1,-1).map(v=>v.trim())),csvRows=c.stdout.trimEnd().split('\n').slice(4).map(x=>x.split(','));assert.equal(mdRows.length,report.functions.length);assert.equal(csvRows.length,report.functions.length);for(let i=0;i<report.functions.length;i++){const f=report.functions[i],{fan_in,fan_out,instability}=f.metrics,incoming=f.call_graph.fan_in,outgoing=f.call_graph.fan_out,values=[f.name,f.location,f.metrics.cognitive_complexity,f.metrics.halstead_volume,...Object.values(f.halstead_counts),fan_in,fan_out,instability,incoming.complete,outgoing.complete,incoming.unresolved_calls,outgoing.unresolved_calls,f.error ?? ''].map(String);assert.deepEqual(csvRows[i],values);values[3]=f.metrics.halstead_volume.toFixed(2);if(instability!==null)values[10]=instability.toFixed(2);assert.deepEqual(mdRows[i],values);assert.equal(Number(f.location.split(':').at(-3)),1);assert.ok(Number(f.location.split(':').at(-2))>0)}}finally{await rm(dir,{recursive:true,force:true})}});
test('diagnostics and discovery survive an empty filter in JSON Markdown and CSV stderr',async()=>{const dir=await mkdtemp(path.join(os.tmpdir(),'metrics7-'));try{await writeFile(path.join(dir,'a.rs'),'fn bad(){unknown!(a; => b);} fn good(){a();}');const args=['--path','a.rs','--filter','none'];for(const format of ['json','markdown','csv']){const r=run(dir,...args,'--format',format);assert.equal(r.status,1);if(format==='json'){const j=JSON.parse(r.stdout);assert.equal(j.functions.length,0);assert.equal(j.diagnostics[0].name,'bad');assert.equal(j.diagnostics[0].location,'a.rs:1:1:28')}else if(format==='markdown')assert.match(r.stdout,/rust-unsupported-macro-arguments/);else {assert.match(r.stderr,/rust-unsupported-macro-arguments/);assert.doesNotMatch(r.stdout,/rust-unsupported-macro-arguments/)}}}finally{await rm(dir,{recursive:true,force:true})}});
test('input order does not change public report or diagnostics',async()=>{const dir=await mkdtemp(path.join(os.tmpdir(),'metrics7-'));try{await writeFile(path.join(dir,'a.rs'),'fn bad(){unknown!(a; => b);}');await writeFile(path.join(dir,'b.js'),'function f(){work();}');const a=run(dir,'--path','a.rs','--path','b.js'),b=run(dir,'--path','b.js','--path','a.rs');assert.equal(a.status,1);assert.equal(b.status,1);assert.equal(a.stdout,b.stdout)}finally{await rm(dir,{recursive:true,force:true})}});
test('ownerless errors remain visible with no records in all formats',async()=>{const dir=await mkdtemp(path.join(os.tmpdir(),'metrics7-'));try{await writeFile(path.join(dir,'input.xyz'),'data');for(const format of ['json','markdown','csv']){const r=run(dir,'--path','input.xyz','--filter','none','--format',format);assert.equal(r.status,1);if(format==='json'){const j=JSON.parse(r.stdout);assert.deepEqual(j.functions,[]);assert.equal(j.diagnostics[0].name,null);assert.equal(j.diagnostics[0].location,'input.xyz:0:0:null');assert.equal(j.summary.function_discovery_complete,false)}else if(format==='markdown')assert.match(r.stdout,/UNSUPPORTED\\_LANGUAGE/);else assert.match(r.stderr,/UNSUPPORTED_LANGUAGE/)}}finally{await rm(dir,{recursive:true,force:true})}});

test('quoted method and anonymous callback use one location across formats and filters', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'metrics7-names-'));
  try {
    const source = 'const o = {"foo:bar"(){}}; use(()=>{});';
    await writeFile(path.join(dir, 'a.js'), source);
    const json = run(dir, '--path', 'a.js');
    const md = run(dir, '--path', 'a.js', '--format', 'markdown');
    const csv = run(dir, '--path', 'a.js', '--format', 'csv');
    const explain = run(dir, '--path', 'a.js', '--explain');
    for (const result of [json, md, csv, explain]) assert.equal(result.status, 0, result.stderr);
    const functions = JSON.parse(json.stdout).functions;
    const expected = [
      ['"foo:bar"', `a.js:1:${source.indexOf('"foo:bar"') + 1}:${'"foo:bar"(){}'.length}`],
      [null, `a.js:1:${source.indexOf('()=>{}') + 1}:${'()=>{}'.length}`],
    ];
    assert.deepEqual(functions.map(({name, location}) => [name, location]), expected);
    const decode = text => text.replace(/\\([\\`*_\[\]()|!~#])/g, '$1').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
    const rows = md.stdout.split('\n').filter(line => line.startsWith('| ') && !line.includes('---')).slice(1).map(line => line.split('|').slice(1,3).map(cell => decode(cell.trim())));
    assert.deepEqual(rows, expected.map(([name, location]) => [name ?? '(anonymous)', location]));
    const csvRows = csv.stdout.trimEnd().split('\n').slice(4);
    const scores = '0,0,0,0,0,0,0,0,null,true,true,0,0,';
    assert.deepEqual(csvRows, [`"""foo:bar""",${expected[0][1]},${scores}`, `,${expected[1][1]},${scores}`]);
    const headings = [...explain.stdout.matchAll(/^## (.*?) — (.*?)$/gm)].map(match => match.slice(1).map(decode));
    assert.deepEqual(headings, expected.map(([name, location]) => [name ?? '(anonymous)', location]));
    const filtered = run(dir, '--path', 'a.js', '--filter', '(anonymous)');
    assert.equal(filtered.status, 0, filtered.stderr);
    assert.deepEqual(JSON.parse(filtered.stdout).functions, []);
  } finally { await rm(dir, {recursive:true, force:true}); }
});

test('filtering a nested name keeps diagnostics on its outer function', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'metrics7-nested-'));
  try {
    const source = 'function outer(){ function nested(){ return <X/>; } }';
    await writeFile(path.join(dir, 'nested.js'), source);
    const result = run(dir, '--path', 'nested.js', '--filter', 'nested');
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.functions, []);
    assert.equal(report.diagnostics.length, 1);
    assert.equal(report.diagnostics[0].name, 'outer');
    assert.equal(report.diagnostics[0].location, `nested.js:1:1:${source.length}`);
    assert.match(report.diagnostics[0].error, /^javascript-unsupported-syntax:/);
  } finally { await rm(dir, {recursive:true, force:true}); }
});
