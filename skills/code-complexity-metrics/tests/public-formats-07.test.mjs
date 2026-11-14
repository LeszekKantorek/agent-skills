import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {spawnSync} from 'node:child_process';import path from 'node:path';import os from 'node:os';import {fileURLToPath} from 'node:url';
const cli=fileURLToPath(new URL('../scripts/measure.mjs',import.meta.url));const run=(cwd,...args)=>spawnSync(process.execPath,[cli,...args],{cwd,encoding:'utf8'});
test('JSON, Markdown and CSV agree by function, value and location',async()=>{const dir=await mkdtemp(path.join(os.tmpdir(),'metrics7-'));try{await writeFile(path.join(dir,'a.js'),'function f(){if(a){work();}} function g(){return 1;}');const args=['--path','a.js'];const j=run(dir,...args),m=run(dir,...args,'--format','markdown'),c=run(dir,...args,'--format','csv');assert.equal(j.status,0);assert.equal(m.status,0);assert.equal(c.status,0);const report=JSON.parse(j.stdout),mdRows=m.stdout.split('\n').filter(x=>x.startsWith('| ')&&!x.includes('---')).slice(1).map(x=>x.split('|').slice(1,-1).map(v=>v.trim())),csvRows=c.stdout.trimEnd().split('\n').slice(4).map(x=>x.split(','));assert.equal(mdRows.length,report.functions.length);assert.equal(csvRows.length,report.functions.length);for(let i=0;i<report.functions.length;i++){const f=report.functions[i],values=[f.name,f.location,...Object.values(f.metrics).map(String)];assert.deepEqual(mdRows[i],values);assert.deepEqual(csvRows[i],values);assert.equal(Number(f.location.split(':').at(-3)),1);assert.ok(Number(f.location.split(':').at(-2))>0)}}finally{await rm(dir,{recursive:true,force:true})}});
test('diagnostics and discovery survive an empty filter in JSON Markdown and CSV stderr',async()=>{const dir=await mkdtemp(path.join(os.tmpdir(),'metrics7-'));try{await writeFile(path.join(dir,'a.rs'),'fn bad(){unknown!(a; b);} fn good(){a();}');const args=['--path','a.rs','--filter','none'];for(const format of ['json','markdown','csv']){const r=run(dir,...args,'--format',format);assert.equal(r.status,1);if(format==='json'){const j=JSON.parse(r.stdout);assert.equal(j.functions.length,0);assert.equal(j.diagnostics[0].name,'bad');assert.equal(j.diagnostics[0].location,'a.rs:1:1:25')}else if(format==='markdown')assert.match(r.stdout,/rust-unsupported-macro-arguments/);else {assert.match(r.stderr,/rust-unsupported-macro-arguments/);assert.doesNotMatch(r.stdout,/rust-unsupported-macro-arguments/)}}}finally{await rm(dir,{recursive:true,force:true})}});
test('input order does not change public report or diagnostics',async()=>{const dir=await mkdtemp(path.join(os.tmpdir(),'metrics7-'));try{await writeFile(path.join(dir,'a.rs'),'fn bad(){unknown!(a; b);}');await writeFile(path.join(dir,'b.js'),'function f(){work();}');const a=run(dir,'--path','a.rs','--path','b.js'),b=run(dir,'--path','b.js','--path','a.rs');assert.equal(a.status,1);assert.equal(b.status,1);assert.equal(a.stdout,b.stdout)}finally{await rm(dir,{recursive:true,force:true})}});
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
    assert.deepEqual(csvRows, [`"""foo:bar""",${expected[0][1]},0,1,0`, `,${expected[1][1]},0,1,0`]);
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
