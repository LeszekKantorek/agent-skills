import {fileURLToPath} from 'node:url';
import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,writeFile,readFile,link,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
const cli=fileURLToPath(new URL('../scripts/measure.mjs',import.meta.url));const run=(...args)=>spawnSync(process.execPath,[cli,...args],{encoding:'utf8'});
test('both languages preserve multiline literals, original rows and source',async()=>{const dir=await mkdtemp(path.join(os.tmpdir(),'metrics7-'));try{for(const [name,source] of [['a.js','function f() {\r\n  const s = `😀\r\nx`; // comment\r\n  make()\r\n    .first()\r\n    .second();\r\n}'],['b.rs','fn f() {\r\n  let s = r#"😀\r\nx"#; // comment\r\n  make()\r\n    .first()\r\n    .second();\r\n}']]){const file=path.join(dir,name);await writeFile(file,source);const json=run('--path',file);assert.equal(json.status,0,json.stderr);const report=JSON.parse(json.stdout);assert.equal(report.functions[0].metrics.statement_count,4);const explain=run('--path',file,'--explain');assert.equal(explain.status,0,explain.stderr);assert.ok(explain.stdout.includes('😀\r\nx'));assert.doesNotMatch(explain.stdout,/comment/);assert.match(explain.stdout,/make\(\).*Statements: \+3/);assert.equal(await readFile(file,'utf8'),source)}}finally{await rm(dir,{recursive:true,force:true})}});
test('output cannot truncate input; input error prevents CSV publication',async()=>{const dir=await mkdtemp(path.join(os.tmpdir(),'metrics7-'));try{const source=path.join(dir,'a.js'),alias=path.join(dir,'alias.js'),out=path.join(dir,'out.csv');await writeFile(source,'function f() {}');for(const target of [source]){const result=run('--path',source,'--output',target);assert.equal(result.status,1);assert.equal(await readFile(source,'utf8'),'function f() {}')}const result=run('--path',source,'--path',path.join(dir,'missing.js'),'--filter','none','--format','csv','--output',out);assert.equal(result.status,1);assert.match(result.stderr,/READ_ERROR/);assert.match(await readFile(out,'utf8'),/Name,Location/)}finally{await rm(dir,{recursive:true,force:true})}});

test('explain shows every original line of both multiline call examples',async()=>{const dir=await mkdtemp(path.join(os.tmpdir(),'rows7-'));try{for(const [name,source,expected] of [['a.js','function f() {\n  make()\n    .first()\n    .second();\n}',[[0,1,0],[0,0,3],[0,0,0],[0,0,0],[0,0,0]]],['b.rs','fn f() {\n    assert_eq!(\n        make()\n            .first()\n            .second(),\n        expected\n    );\n}',[[0,1,0],[0,0,1],[0,0,3],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0]]]]){const file=path.join(dir,name);await writeFile(file,source);const result=run('--path',file,'--explain');assert.equal(result.status,0,result.stderr);const body=result.stdout.match(/```(?:javascript|rust)\n([\s\S]*?)\n```/)[1].split('\n');assert.equal(body.length,expected.length);for(let i=0;i<body.length;i++){const values=body[i].match(/\/\/ Cognitive: ([+\d]+); Cyclomatic: ([+\d]+); Statements: ([+\d]+)/);assert.ok(values,`row ${i+1}`);assert.deepEqual(values.slice(1).map(Number),expected[i],`row ${i+1}`)}}}finally{await rm(dir,{recursive:true,force:true})}});

test('UTF-16 locations use CRLF, tab and non-BMP units in both languages', async () => {
 const dir=await mkdtemp(path.join(os.tmpdir(),'metrics7-utf16-'));
 try {
  const prefix='/*😀*/\t';
  for(const [file,fragment] of [['a.js','function f(){\r\n  return "😀";\r\n}'],['b.rs','fn f(){\r\n  let x = "😀";\r\n}']]) {
   const source=prefix+fragment+'\r\n';
   await writeFile(path.join(dir,file),source);
   const result=spawnSync(process.execPath,[cli,'--path',file],{cwd:dir,encoding:'utf8'});
   assert.equal(result.status,0,result.stderr);
   assert.equal(JSON.parse(result.stdout).functions[0].location,`${file}:1:${prefix.length+1}:${fragment.length}`);
   assert.equal(source.slice(prefix.length,prefix.length+fragment.length),fragment);
  }
 } finally {await rm(dir,{recursive:true,force:true});}
});
