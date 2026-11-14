import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, readFile, rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const cli=fileURLToPath(new URL('../scripts/measure.mjs',import.meta.url));
test('physical error lines mask all owners and partial reports are published',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'metric-lines-'));
 try {
  const run=(...args)=>spawnSync(process.execPath,[cli,'--path','input.rs',...args],{cwd:dir,encoding:'utf8'});
  await writeFile(path.join(dir,'input.rs'),'fn a() { good(); bad!(x; => y); } fn b() { good(); }\nfn c(){ good(); }');
  const j=run(); assert.equal(j.status,1); assert.match(j.stderr,/unsupported/);
  const report=JSON.parse(j.stdout); assert.deepEqual(report.functions.map(f=>Object.values(f.metrics)),[[0,0,0],[0,0,0],[0,1,1]]);
  assert.ok(report.functions[0].error); assert.ok(report.functions[1].error); assert.equal(report.functions[2].error,null);
  for(const format of ['markdown','csv']) { const x=run('--format',format); assert.equal(x.status,1); assert.match(x.stderr,/unsupported/); assert.match(x.stdout,/Error/); }
  const explain=run('--explain'); assert.equal(explain.status,1); assert.match(explain.stdout,/Cognitive: 0; Cyclomatic: 0; Statements: 0 \/\/ error:/);
  await writeFile(path.join(dir,'out.json'),'old'); const output=run('--output','out.json'); assert.equal(output.status,1); assert.equal(output.stdout,''); assert.equal(JSON.parse(await readFile(path.join(dir,'out.json'),'utf8')).functions.length,3);
  await writeFile(path.join(dir,'input.rs'),'unknown! { fn hidden() {} => custom }\nfn good(){a();}');
  const separated=JSON.parse(run().stdout); assert.deepEqual(Object.values(separated.functions[0].metrics),[0,1,1]); assert.equal(separated.functions[0].error,null);
  await writeFile(path.join(dir,'unknown.xyz'),'x');
  const unsupported=spawnSync(process.execPath,[cli,'--path','unknown.xyz','--path','missing.rs'],{cwd:dir,encoding:'utf8'}); assert.equal(unsupported.status,1); assert.equal(JSON.parse(unsupported.stdout).diagnostics.length,2);
  const control=run('--path','[z-a]\r\n\x1b'); assert.equal(control.status,1); assert.equal(JSON.parse(control.stdout).functions.length,1); assert.match(control.stderr,/\\r\\n\\u001B/); assert.ok(!control.stderr.includes('\x1b')); assert.equal(control.stderr.trimEnd().split('\n').length,2);
  const missing=run('--path','missing.rs'); assert.equal(missing.status,1); assert.equal(JSON.parse(missing.stdout).functions.length,1); assert.match(missing.stderr,/READ_ERROR/);
 } finally { await rm(dir,{recursive:true,force:true}); }
});

test('explain preserves unterminated multiline lexical constructs',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'metric-recovery-'));
 try {
  for(const source of ['function f(){\n  const x = `abc\n  second\n  third\n}', 'function outer(){\n one();\n /* hello\n end']) {
   await writeFile(path.join(dir,'input.js'),source);
   const r=spawnSync(process.execPath,[cli,'--path','input.js','--explain'],{cwd:dir,encoding:'utf8'});
   assert.equal(r.status,1); assert.match(r.stderr,/parse-error/);
   const code=r.stdout.match(/```javascript\n([\s\S]*?)\n```/)[1];
   const tail=source.slice(source.indexOf(source.includes('`abc') ? '  const x' : ' /* hello'));
   assert.ok(code.includes(tail)); assert.match(r.stdout,/Wiersz [234]: Cognitive:/);
  }
 } finally {await rm(dir,{recursive:true,force:true});}
});
