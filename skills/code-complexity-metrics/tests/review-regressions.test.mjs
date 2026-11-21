import {explainRow} from './explain-rows.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {productionCognitive} from './production-score.mjs';
import {mkdtemp, writeFile, readFile, rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';

const script=fileURLToPath(new URL('../scripts/measure.mjs', import.meta.url));

async function check(language, source, expected) {
  assert.equal(await productionCognitive(source,language), expected, source);
}

test('R1: Rust let-chains count conjunctions, sequence changes and separate initializers', async()=>{
  for(const [source, expected] of [
    ['fn f(){if let Some(x)=value && x>0 {}}', 2],
    ['fn f(){while let Some(x)=next() && check(x) {consume(x);}}', 2],
    ['fn f(){if let Some(x)=a && x>0 && let Some(y)=b && y>0 {}}', 2],
    ['fn f(){if let Some(x)=a && (x>0 || ready) {}}', 3],
    ['fn f(){if let Some(x)=a && !(ready && other) {}}', 3],
    ['fn f(){if let Some(x)=get(a && b) && ready {}}', 3],
    ['fn f(){let g=||{if let Some(x)=a && ready {}};}', 3],
  ]) await check('rust', source, expected);
});

test('R2: Rust non-block closures score nested control flow', async()=>{
  for(const [source, expected] of [
    ['fn f(){let g=|| return 42;}', 0],
    ['fn f(){let g=|| return load();}', 0],
    ['fn f(){let g=|| (/* comment */ return 42);}', 0],
    ['fn f(){let g=|| return if b {1}else{2};}', 3],
    ['fn f(){let g=|| 42;}', 0],
    ['fn f(){let g=|| {return 42;};}', 0],
    ['fn f(){let g=|| {};}', 0],
    ['fn f(){let g=|| || 42;}', 0],
    ['fn f(){let g=|| loop {};}', 2],
  ]) await check('rust', source, expected);
});

test('R3: Rust items retain the control flow in their initializers', async()=>{
  for(const [source, expected] of [
    ['fn f(){struct S;}', 0],
    ['fn f(){use std::mem;}', 0],
    ['fn f(){type T=i32;}', 0],
    ['fn f(){mod m {}}', 0],
    ['fn f(){trait T {}}', 0],
    ['fn f(){{struct S;}}', 0],
    ['fn f(){let x={struct S;};}', 0],
    ['fn f()->i32{struct S; 42}', 0],
    ['fn f(){fn inner(){}}', 0],
    ['fn f(){const X:i32=1;}', 0],
    ['fn f(){static X:i32=1;}', 0],
    ['fn f(){static mut X:i32=1;}', 0],
    ['fn f(){const X:i32=load();}', 0],
    ['fn f(){const X:i32=1;save();}', 0],
    ['fn f(){const X:i32=if true {1}else{2};}', 2],
    ['fn f(){const X:i32=match true {true=>1,false=>2};}', 1],
    ['fn f(){const X:i32={prepare();calculate()};}', 0],
    ['fn f(){static X:i32={42};}', 0],
  ]) await check('rust', source, expected);
});

test('J1: JavaScript computed method calls add no Cognitive points', async()=>{
  for(const [source, expected] of [
    ['function f(){const x={ [factory()](){} };}', 0],
    ['function f(){class C{[factory()](){}}}', 0],
    ['function f(){const x={ [factory().name()](){} };}', 0],
    ['function f(){const x={ [factory()](){work();} };}', 0],
    ['function f(){const x={ get [factory()](){return 1;} };}', 0],
    ['function f(){const x={ [factory()](x=load()){save();} };}', 0],
    ['const x={ [factory()](){} };', 0],
  ]) await check('javascript', source, expected);
});

test('J2: JavaScript labels and blocks retain nested decisions', async()=>{
  for(const [source, expected] of [
    ['function f(){label:{}}', 0],
    ['function f(){label:{work();}}', 0],
    ['function f(){label:{{work();}}}', 0],
    ['function f(){label:while(a){}}', 1],
    ['function f(){class C{static {}}}', 0],
    ['function f(){class C{static {work();}}}', 0],
    ['function f(){try{}catch(e){}finally{}}', 1],
    ['function f(){switch(x){case 1:{}}}', 1],
    ['function f(){switch(x){default:{}}}', 1],
    ['function f(){switch(x){case 1:{work();}}}', 1],
    ['function f(){switch(x){case 1:{{work();}}}}', 1],
    ['function f(){switch(x){case 1:{}{}}}', 1],
    ['function f(){switch(x){case 1:work();{}{} default:{}{}}}', 1],
    ['function f(){switch(x){case 1:{}{{}}}}', 1],
  ]) await check('javascript', source, expected);
});

test('J3: decisions retain their Cognitive points in standalone expressions', async()=>{
  for(const [language, source, expected] of [
    ['javascript', 'function f(){(()=>{});}', 0],
    ['javascript', 'function f(){(()=>{return 1;});}', 0],
    ['javascript', 'function f(){(()=>{;});}', 0],
    ['javascript', 'function f(){(()=>{work();});}', 0],
    ['javascript', 'function f(){(()=>work());}', 0],
    ['javascript', 'function f(){(()=>{return 1;})();}', 0],
    ['javascript', 'function f(){const g=()=>{return 1;};}', 0],
    ['javascript', 'function f(){1+(()=>{return 1;});}', 0],
    ['javascript', 'function f(){({method(){return 1;}});}', 0],
    ['javascript', 'function f(){({[factory()](){return 1;}});}', 0],
    ['rust', 'fn f(){||{return 1;};}', 0],
    ['rust', 'fn f(){||{work();};}', 0],
    ['rust', 'fn f(){|| 42;}', 0],
    ['rust', 'fn f(){|| work();}', 0],
    ['javascript', 'function f(){(class {});}', 0],
    ['javascript', 'function f(){(class {static {}});}', 0],
    ['javascript', 'function f(){(class {static {;}});}', 0],
    ['javascript', 'function f(){(class {static {if(a){}}});}', 1],
    ['javascript', 'function f(){(class {static {factory();}});}', 0],
    ['javascript', 'function f(){(class {static {x=1;}});}', 0],
    ['javascript', 'function f(){(class {static {x++;}});}', 0],
    ['javascript', 'function f(){a?2:3;}', 1],
    ['javascript', 'function f(){1+(a?2:3);}', 1],
    ['javascript', 'function f(){-(a?2:3);}', 1],
    ['javascript', 'function f(){1+(a?(b?2:3):4);}', 3],
    ['javascript', 'function f(){({x:a?1:2});}', 1],
    ['javascript', 'function f(){(class {static {a?1:2;}});}', 1],
    ['javascript', 'function f(){(class {static {1+(a?1:2);}});}', 1],
    ['javascript', 'function f(){(class {static {const x=a?1:2;}});}', 1],
    ['javascript', 'function f(){({[a?1:2](){}});}', 1],
    ['javascript', 'function f(){({method(){a?1:2;}});}', 2],
    ['rust', 'fn f(){1+if b {1}else{2};}', 2],
    ['rust', 'fn f(){1+{if b {1}else{2}};}', 2],
    ['rust', 'fn f(){1+{42};}', 0],
  ]) await check(language, source, expected);
});

test('review regressions agree in JSON, CSV and explain, including output-file writes', async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(), 'metrics-review-'));
  const run=(...args)=>spawnSync(process.execPath, [script,...args], {cwd:dir, encoding:'utf8'});
  try {
    await writeFile(path.join(dir,'review.rs'), `fn chain() {
    if let Some(x)=value
        && x>0 {}
}
fn returned_closure(){let g=|| return 42;}
fn trailing_item(){struct S;}
fn constant(){const X:i32=if true {1}else{2};}
`);
    await writeFile(path.join(dir,'review.js'), `function computed(){const x={ [factory()](){} };}
function labeled(){label:{}}
function standalone(){(()=>{return 1;});}
function switch_blocks(){switch(x){case 1:{}{} default:{}{{}}}}
function class_value(){(class {static {;}});}
function selection_value(){1+(a?1:2);}
`);
    const args=['--path','review.rs','--path','review.js'];
    const result=run(...args);
    assert.equal(result.status,0,result.stderr);
    const report=JSON.parse(result.stdout);
    const expected={chain:2,returned_closure:0,trailing_item:0,constant:2,computed:0,labeled:0,standalone:0,switch_blocks:1,class_value:0,selection_value:1};
    const {call_graph: graph, ...summary}=report.summary;
    assert.deepEqual(summary,{files:2,functions_found:10,functions_presented:10,function_discovery_complete:true,has_errors:false});
    assert.equal(graph.scope,'project_files');
    for(const fn of report.functions) assert.equal(fn.metrics.cognitive_complexity,expected[fn.name],fn.name);
    const written=run(...args,'--output','report.json');
    assert.equal(written.status,0,written.stderr);
    assert.equal(written.stdout,'');
    assert.deepEqual(JSON.parse(await readFile(path.join(dir,'report.json'),'utf8')),report);
    const csv=run(...args,'--format','csv');
    assert.equal(csv.status,0,csv.stderr);
    const csvRows=csv.stdout.trimEnd().split('\n').slice(4);
    assert.deepEqual(csvRows.map(row=>{
      const [name,,cognitive]=row.split(',');
      return [name,Number(cognitive)];
    }), report.functions.map(fn=>[fn.name,expected[fn.name]]));
    const explained=run(...args,'--format','json','--explain');
    assert.equal(explained.status,0,explained.stderr);
    const blocks=[...explained.stdout.matchAll(/```(?:rust|javascript)\n([\s\S]*?)\n```/g)];
    assert.equal(blocks.length,10);
    blocks.forEach((match,index)=>{
      const lines=match[1].split('\n').slice(1);
      let total=0;
      const halstead=[0,0,0,0];
      for(const line of lines) {
        const annotation=explainRow(line);
        assert.ok(annotation,line);
        total+=annotation.cognitive;
        for (let i=0;i<halstead.length;i++) halstead[i]+=annotation.halstead[i];
      }
      const {name,halstead_counts:{n1,n2,eta1,eta2}}=report.functions[index];
      assert.equal(total,expected[name],name);
      assert.deepEqual(halstead,[n1,n2,eta1,eta2],name);
    });
    assert.match(explained.stdout,/&& x>0 \{\} +\| +\+1 +\|/);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
