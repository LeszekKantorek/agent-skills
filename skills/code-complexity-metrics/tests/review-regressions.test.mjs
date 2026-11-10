import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, readFile, rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {parse} from '../scripts/parser.mjs';
import {outerFunctions} from '../scripts/ir.mjs';
import {complexityEvents} from '../scripts/metrics/complexity.mjs';
import {statementEvents} from '../scripts/metrics/statements.mjs';

const keys=['cognitive_complexity', 'cyclomatic_complexity', 'statement_count'];
const script=fileURLToPath(new URL('../scripts/measure.mjs', import.meta.url));

async function check(language, source, expected) {
  const parsed=await parse(source, language);
  try {
    assert.equal(parsed.tree.rootNode.hasError, false, source);
    const functions=outerFunctions(parsed.tree.rootNode);
    assert.equal(functions.length, 1, source);
    const events=[...complexityEvents(functions[0]), ...statementEvents(functions[0], language)];
    assert.deepEqual(keys.map(key=>events.filter(event=>event.metric===key).reduce((sum,event)=>sum+event.amount,0)), expected, source);
  } finally { parsed.dispose(); }
}

// Expectations below are (Cognitive, Cyclomatic, Statements), derived from
// .plans/code-complexity-metrics/code-complexity-metric-rules.md, not analyzer output.
test('R1: Rust let-chains count conjunctions, sequence changes and separate initializers', async()=>{
  // Lines 66-69, 127 and 149: one condition/loop, each logical operator,
  // first AND/OR sequence and changes; each binding and written call.
  for(const [source, expected] of [
    ['fn f(){if let Some(x)=value && x>0 {}}', [2,3,2]],
    ['fn f(){while let Some(x)=next() && check(x) {consume(x);}}', [2,3,5]],
    ['fn f(){if let Some(x)=a && x>0 && let Some(y)=b && y>0 {}}', [2,5,3]],
    ['fn f(){if let Some(x)=a && (x>0 || ready) {}}', [3,4,2]],
    ['fn f(){if let Some(x)=a && !(ready && other) {}}', [3,4,2]],
    ['fn f(){if let Some(x)=get(a && b) && ready {}}', [3,4,3]],
    ['fn f(){let g=||{if let Some(x)=a && ready {}};}', [3,3,3]],
  ]) await check('rust', source, expected);
});

test('R2: Rust non-block closure bodies return a value only when the body does', async()=>{
  // Lines 149 and 151: declaration + explicit return; an explicit return
  // replaces an implicit return. Value-producing nested closures still return values.
  for(const [source, expected] of [
    ['fn f(){let g=|| return 42;}', [0,1,2]],
    ['fn f(){let g=|| return load();}', [0,1,3]],
    ['fn f(){let g=|| (/* comment */ return 42);}', [0,1,2]],
    ['fn f(){let g=|| return if b {1}else{2};}', [3,2,5]],
    ['fn f(){let g=|| 42;}', [0,1,2]],
    ['fn f(){let g=|| {return 42;};}', [0,1,2]],
    ['fn f(){let g=|| {};}', [0,1,1]],
    ['fn f(){let g=|| || 42;}', [0,1,3]],
    ['fn f(){let g=|| loop {};}', [2,2,2]],
  ]) await check('rust', source, expected);
});

test('R3: Rust trailing items are not tail values, including inside extra blocks', async()=>{
  // Lines 149, 261, 263 and 265: items are not returned expressions;
  // extra blocks and actual tail values retain their own points.
  for(const [source, expected] of [
    ['fn f(){struct S;}', [0,1,0]],
    ['fn f(){use std::mem;}', [0,1,0]],
    ['fn f(){type T=i32;}', [0,1,0]],
    ['fn f(){mod m {}}', [0,1,0]],
    ['fn f(){trait T {}}', [0,1,0]],
    ['fn f(){{struct S;}}', [0,1,1]],
    ['fn f(){let x={struct S;};}', [0,1,2]],
    ['fn f()->i32{struct S; 42}', [0,1,1]],
    ['fn f(){fn inner(){}}', [0,1,1]],
    ['fn f(){const X:i32=1;}', [0,1,1]],
    ['fn f(){static X:i32=1;}', [0,1,1]],
    ['fn f(){static mut X:i32=1;}', [0,1,1]],
    ['fn f(){const X:i32=load();}', [0,1,2]],
    ['fn f(){const X:i32=1;save();}', [0,1,2]],
    ['fn f(){const X:i32=if true {1}else{2};}', [2,2,4]],
    ['fn f(){const X:i32=match true {true=>1,false=>2};}', [1,3,4]],
    ['fn f(){const X:i32={prepare();calculate()};}', [0,1,5]],
    ['fn f(){static X:i32={42};}', [0,1,3]],
  ]) await check('rust', source, expected);
});

test('J1: JavaScript computed method names retain every explicit call', async()=>{
  // Lines 147 and 149: each written call, including initializer calls,
  // contributes separately from the declarator and nested-body statements.
  for(const [source, expected] of [
    ['function f(){const x={ [factory()](){} };}', [0,1,2]],
    ['function f(){class C{[factory()](){}}}', [0,1,1]],
    ['function f(){const x={ [factory().name()](){} };}', [0,1,3]],
    ['function f(){const x={ [factory()](){work();} };}', [0,1,3]],
    ['function f(){const x={ get [factory()](){return 1;} };}', [0,1,3]],
    ['function f(){const x={ [factory()](x=load()){save();} };}', [0,1,4]],
    ['const x={ [factory()](){} };', [0,1,1]],
  ]) await check('javascript', source, expected);
});

test('J2: JavaScript labels and static blocks do not receive direct-body exemptions', async()=>{
  // Lines 261-265: only the enumerated direct function/control bodies
  // are exempt; every additional block contributes, even when empty.
  for(const [source, expected] of [
    ['function f(){label:{}}', [0,1,1]],
    ['function f(){label:{work();}}', [0,1,2]],
    ['function f(){label:{{work();}}}', [0,1,3]],
    ['function f(){label:while(a){}}', [1,2,1]],
    ['function f(){class C{static {}}}', [0,1,1]],
    ['function f(){class C{static {work();}}}', [0,1,2]],
    ['function f(){try{}catch(e){}finally{}}', [1,1,1]],
    ['function f(){switch(x){case 1:{}}}', [1,2,1]],
    ['function f(){switch(x){default:{}}}', [1,2,1]],
    ['function f(){switch(x){case 1:{work();}}}', [1,2,2]],
    ['function f(){switch(x){case 1:{{work();}}}}', [1,2,3]],
    ['function f(){switch(x){case 1:{}{}}}', [1,2,1]],
    ['function f(){switch(x){case 1:work();{}{} default:{}{}}}', [1,3,2]],
    ['function f(){switch(x){case 1:{}{{}}}}', [1,2,2]],
  ]) await check('javascript', source, expected);
});

test('J3: nested function bodies do not replace a standalone expression point', async()=>{
  // Lines 39, 149, 362 and 370: the standalone expression contributes once;
  // its nested body contributes independently. Calls/assignments still need no wrapper.
  for(const [language, source, expected] of [
    ['javascript', 'function f(){(()=>{});}', [0,1,1]],
    ['javascript', 'function f(){(()=>{return 1;});}', [0,1,2]],
    ['javascript', 'function f(){(()=>{;});}', [0,1,2]],
    ['javascript', 'function f(){(()=>{work();});}', [0,1,2]],
    ['javascript', 'function f(){(()=>work());}', [0,1,3]],
    ['javascript', 'function f(){(()=>{return 1;})();}', [0,1,2]],
    ['javascript', 'function f(){const g=()=>{return 1;};}', [0,1,2]],
    ['javascript', 'function f(){1+(()=>{return 1;});}', [0,1,2]],
    ['javascript', 'function f(){({method(){return 1;}});}', [0,1,2]],
    ['javascript', 'function f(){({[factory()](){return 1;}});}', [0,1,2]],
    ['rust', 'fn f(){||{return 1;};}', [0,1,2]],
    ['rust', 'fn f(){||{work();};}', [0,1,2]],
    ['rust', 'fn f(){|| 42;}', [0,1,2]],
    ['rust', 'fn f(){|| work();}', [0,1,3]],
    ['javascript', 'function f(){(class {});}', [0,1,1]],
    ['javascript', 'function f(){(class {static {}});}', [0,1,2]],
    ['javascript', 'function f(){(class {static {;}});}', [0,1,3]],
    ['javascript', 'function f(){(class {static {if(a){}}});}', [1,2,3]],
    ['javascript', 'function f(){(class {static {factory();}});}', [0,1,2]],
    ['javascript', 'function f(){(class {static {x=1;}});}', [0,1,2]],
    ['javascript', 'function f(){(class {static {x++;}});}', [0,1,2]],
    ['javascript', 'function f(){a?2:3;}', [1,2,3]],
    ['javascript', 'function f(){1+(a?2:3);}', [1,2,3]],
    ['javascript', 'function f(){-(a?2:3);}', [1,2,3]],
    ['javascript', 'function f(){1+(a?(b?2:3):4);}', [3,3,5]],
    ['javascript', 'function f(){({x:a?1:2});}', [1,2,3]],
    ['javascript', 'function f(){(class {static {a?1:2;}});}', [1,2,5]],
    ['javascript', 'function f(){(class {static {1+(a?1:2);}});}', [1,2,5]],
    ['javascript', 'function f(){(class {static {const x=a?1:2;}});}', [1,2,6]],
    ['javascript', 'function f(){({[a?1:2](){}});}', [2,2,3]],
    ['javascript', 'function f(){({method(){a?1:2;}});}', [2,2,4]],
    ['rust', 'fn f(){1+if b {1}else{2};}', [2,2,3]],
    ['rust', 'fn f(){1+{if b {1}else{2}};}', [2,2,4]],
    ['rust', 'fn f(){1+{42};}', [0,1,2]],
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
    const expected={chain:[2,3,2],returned_closure:[0,1,2],trailing_item:[0,1,0],constant:[2,2,4],computed:[0,1,2],labeled:[0,1,1],standalone:[0,1,2],switch_blocks:[1,3,2],class_value:[0,1,3],selection_value:[1,2,3]};
    assert.deepEqual(report.summary,{files:2,functions_found:10,functions_presented:10});
    for(const fn of report.functions) assert.deepEqual(keys.map(key=>fn.metrics[key]), expected[fn.name], fn.name);
    const written=run(...args,'--output','report.json');
    assert.equal(written.status,0,written.stderr);
    assert.equal(written.stdout,'');
    assert.deepEqual(JSON.parse(await readFile(path.join(dir,'report.json'),'utf8')),report);
    const csv=run(...args,'--format','csv');
    assert.equal(csv.status,0,csv.stderr);
    const csvRows=csv.stdout.trimEnd().split('\n').slice(4);
    assert.deepEqual(csvRows.map(row=>{
      const [name,,cognitive,cyclomatic,statements]=row.split(',');
      return [name,[cognitive,cyclomatic,statements].map(Number)];
    }), report.functions.map(fn=>[fn.name,expected[fn.name]]));
    const explained=run(...args,'--format','json','--explain');
    assert.equal(explained.status,0,explained.stderr);
    const blocks=[...explained.stdout.matchAll(/```(?:rust|javascript)\n([\s\S]*?)\n```/g)];
    assert.equal(blocks.length,10);
    blocks.forEach((match,index)=>{
      const lines=match[1].split('\n');
      const totals=[0,0,0];
      for(const line of lines.slice(0,-1)) {
        const annotation=line.match(/\/\/ Cognitive: ([+\d]+).*; Cyclomatic: ([+\d]+).*; Statements: ([+\d]+)/);
        assert.ok(annotation,line);
        annotation.slice(1).forEach((value,i)=>totals[i]+=Number(value));
      }
      const name=report.functions[index].name;
      assert.deepEqual(totals,expected[name],name);
      assert.equal(lines.at(-1),`// Cognitive: ${totals[0]}; Cyclomatic: ${totals[1]}; Statements: ${totals[2]}`);
    });
    assert.match(explained.stdout,/&& x>0 \{\} +\/\/ Cognitive: \+1 \(&&\); Cyclomatic: \+1 \(&&\); Statements: 0/);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
