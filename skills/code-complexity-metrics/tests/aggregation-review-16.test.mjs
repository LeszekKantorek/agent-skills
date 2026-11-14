import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../scripts/parser.mjs';
import {analyzerFor} from '../scripts/analyzers/registry.mjs';
import {aggregate} from '../scripts/aggregation.mjs';
const score=(c=0,y=0,s=0)=>({cognitive:c,cyclomatic:y,statements:s});
async function file(source, lang='javascript', id='C:/f.js') {const p=await parse(source,lang);try{return {fileId:id,source:{fileId:id,source},analysis:analyzerFor(lang).analyze(p.tree,source,id),diagnostics:[]}}finally{p.dispose()}}
const all=n=>[n,...n.children.flatMap(all)];
test('R16-01 unsupported nested syntax does not imply missing outer',async()=>{
 for(const source of ['function f(){return <X/>;} function good(){ok();}','function f(){return <X render={() => work()}/>;} function good(){ok();}']) {
  const f=await file(source), r=aggregate([f]), [bad,good]=r.functions;assert.equal(r.functions.length,2);assert.equal(r.files[0].functionDiscoveryComplete,true);assert.equal(r.functionDiscoveryComplete,true);assert.equal(r.hasErrors,true);assert.ok(r.diagnostics.length);assert.ok(r.diagnostics.every(d=>d.category==='unsupported' && d.owner===bad.id && !d.affectsFunctionDiscovery && d.affectedMetrics.length===3));assert.deepEqual(bad.metrics,{cognitive:0,cyclomatic:0,statements:0});assert.deepEqual(good.metrics,score());assert.deepEqual(good.byRow.get(1),score());assert.equal(f.analysis.ownerByNode.get(all(f.analysis.tree).find(n=>n.type==='jsx_self_closing_element')),bad.id);
  if(source.includes('<X/>')) {assert.deepEqual(bad.knownScore,score(0,1,1));assert.deepEqual(bad.byRow.get(1),score());assert.deepEqual(r.diagnostics[0].range,{startIndex:20,endIndex:24,startPosition:{row:0,column:20},endPosition:{row:0,column:24}});}
 }
 const module=aggregate([await file('const x=<X/>; function good(){ok();}')]);assert.equal(module.functionDiscoveryComplete,false);assert.ok(module.diagnostics.some(d=>d.owner===null && d.affectsFunctionDiscovery));assert.deepEqual(module.functions[0].metrics,score());
 const broken=aggregate([await file('function f(){let x = } function b(){x()}; } function good(){a()}')]);assert.equal(broken.functionDiscoveryComplete,false);
});
test('R16-02 reject wrong row or UTF-16 column atomically, including diagnostic ranges',async()=>{
 const source='function f(){\r\n work();\r\n}', ok=await file('function good(){a();}','javascript','C:/good.js');
 for(const mutate of [n=>{n.startPosition.row=0;n.endPosition.row=0},n=>{n.startPosition.column++;n.endPosition.column++}]) {
  const f=await file(source), call=all(f.analysis.tree).find(n=>n.type==='call_expression');assert.deepEqual(call.startPosition,{row:1,column:1});mutate(call);const r=aggregate([f,ok]);assert.equal(r.files[0].analyzed,false);assert.equal(r.presentation.has(f.fileId),false);assert.equal(r.functions.length,1);assert.deepEqual(r.functions[0].metrics,score(0,1,1));assert.ok(r.diagnostics.some(d=>d.code==='INVALID_ANALYSIS_CONTRACT'));
 }
 const f=await file(source), r=aggregate([f]);assert.deepEqual([...r.functions[0].byRow],[[1,score(0,1,0)],[2,score(0,0,1)]]);
 const d=await file('function f(){\r\n let x = = 1;\r\n}');d.analysis.diagnostics[0].range.startPosition.column++;assert.equal(aggregate([d,ok]).files[0].analyzed,false);
});
test('R16-03 physical ends survive nulls and retain UTF-16 original slices',async()=>{
 for(const [lang,source,id,ends] of [['javascript','function f(){return `a\r${g()}\u2028b`;}','C:/f.js',[22,29,34]],['rust','fn f(){let s = r#"a\r\nb\u2028c\nd"#; g();}','C:/f.rs',[19,24,35]]]) {
  const f=await file(source,lang,id), p=f.analysis.presentation,r=aggregate([f]);assert.deepEqual(p.lineAnnotations.map(x=>x.contentEndIndex),ends);assert.deepEqual(p.lineAnnotations.map(x=>x.endIndex),[null,null,source.length]);assert.equal(r.presentation.get(id),p);assert.equal(r.sources.get(id).source,source);assert.deepEqual(r.functions[0].metrics,score(0,1,2));assert.deepEqual(r.functions[0].byRow.get(1),score(0,1,1));assert.deepEqual(r.functions[0].byRow.get(lang==='rust'?3:2),score(0,0,1));
  assert.equal(source.slice(source.indexOf(lang==='rust'?'r#"':'`'),source.indexOf(lang==='rust'?'"#':'`',source.indexOf(lang==='rust'?'r#"':'`')+1)+(lang==='rust'?2:1)),lang==='rust'?'r#"a\r\nb\u2028c\nd"#':'`a\r${g()}\u2028b`');
 }
});
test('R16-02 CRLF interior and emoji preserve source coordinates',async()=>{
 const source='fn f(){\r\n // 😀 note\r\n a();\r\n}', f=await file(source,'rust','C:/f.rs'), p=f.analysis.presentation, comment=p.comments[0], r=aggregate([f]);assert.equal(r.files[0].analyzed,true);assert.equal(source[comment.endIndex-1],'\r');assert.equal(source[comment.endIndex],'\n');assert.equal(comment.endPosition.row,1);assert.equal(comment.endPosition.column,source.slice(source.indexOf('//'),comment.endIndex).length+1);assert.deepEqual(r.functions[0].byRow.get(3),score(0,0,1));
 for(const mutate of [x=>delete x.analysis.presentation.lineAnnotations[1].contentEndIndex,x=>x.analysis.presentation.lineAnnotations[1].contentEndIndex--]) {const bad=await file(source,'rust','C:/bad.rs');mutate(bad);assert.equal(aggregate([bad]).files[0].analyzed,false);}
 const emoji=await file('function f(){\n "😀"; work();\n}');const call=all(emoji.analysis.tree).find(n=>n.type==='call_expression');assert.equal(call.startPosition.column,7);assert.equal(aggregate([emoji]).files[0].analyzed,true);
});

test('R16-R1 rejected presentation retains only jointly plausible diagnostic coordinates',async()=>{
 const source='function f(){\n let x = = 1;\n}';
 for(const duplicate of [false,true]) {
  const f=await file(source), original=f.analysis.diagnostics[0];delete f.analysis.presentation.lineAnnotations[0].contentEndIndex;if(duplicate) f.diagnostics.push(structuredClone(original));
  const r=aggregate([f]);assert.equal(r.files[0].analyzed,false);assert.equal(r.diagnostics.filter(d=>d.category==='parse').length,1);assert.deepEqual(r.diagnostics.find(d=>d.category==='parse').range,original.range);assert.equal(r.diagnostics.filter(d=>d.category==='internal').length,1);
 }
 const bad=await file(source);delete bad.analysis.presentation.lineAnnotations[0].contentEndIndex;const d=bad.analysis.diagnostics[0];d.range.startPosition={row:0,column:d.range.startIndex};d.range.endPosition={row:0,column:d.range.endIndex};const rejected=aggregate([bad]);assert.deepEqual(rejected.diagnostics.map(x=>x.category),['internal']);
 bad.diagnostics.push(structuredClone(d));assert.deepEqual(aggregate([bad]).diagnostics.map(x=>x.category),['internal']);
 const second=await file('\n\nfunction f(){let x = = 1;}');delete second.analysis.presentation.lineAnnotations[0].contentEndIndex;const q=second.analysis.diagnostics[0];q.range.startPosition={row:0,column:q.range.startIndex};q.range.endPosition={row:0,column:q.range.endIndex};assert.deepEqual(aggregate([second]).diagnostics.map(x=>x.category),['internal']);
 const optional=await file('\r\rfunction f(){let x = = 1;}');delete optional.analysis.presentation.lineAnnotations[0].contentEndIndex;const o=optional.analysis.diagnostics[0];o.range={startIndex:2,endIndex:3,startPosition:{row:1,column:0},endPosition:{row:2,column:1}};assert.deepEqual(aggregate([optional]).diagnostics.map(x=>x.category),['internal']);
});

test('R16-R1 mandatory second LF cannot remain inside declared row',async()=>{
 const f=await file('\n\nfunction f(){let x = = 1;}');delete f.analysis.presentation.lineAnnotations[0].contentEndIndex;const d=f.analysis.diagnostics[0];d.range.startPosition={row:0,column:d.range.startIndex};d.range.endPosition={row:0,column:d.range.endIndex};assert.deepEqual(aggregate([f]).diagnostics.map(x=>x.category),['internal']);
});
test('R16-R1 same line-start cannot denote two rows with optional CR',async()=>{
 const f=await file('\r\rfunction f(){let x = = 1;}');delete f.analysis.presentation.lineAnnotations[0].contentEndIndex;f.analysis.diagnostics[0].range={startIndex:2,endIndex:3,startPosition:{row:1,column:0},endPosition:{row:2,column:1}};assert.deepEqual(aggregate([f]).diagnostics.map(x=>x.category),['internal']);
});

test('R16-R1 optional CR boundaries cannot cross the first position',async()=>{
 const f=await file('function f(){\r\r let x = = 1;\r}');delete f.analysis.presentation.lineAnnotations[0].contentEndIndex;const d=f.analysis.diagnostics[0];d.range={startIndex:22,endIndex:23,startPosition:{row:0,column:22},endPosition:{row:2,column:8}};assert.deepEqual(aggregate([f]).diagnostics.map(x=>x.category),['internal']);
 d.range={startIndex:22,endIndex:23,startPosition:{row:2,column:7},endPosition:{row:2,column:8}};const valid=aggregate([f]);assert.equal(valid.diagnostics.filter(x=>x.category==='parse').length,1);
 const across=await file('\r\rfunction f(){let x = = 1;}');delete across.analysis.presentation.lineAnnotations[0].contentEndIndex;across.analysis.diagnostics[0].range={startIndex:0,endIndex:2,startPosition:{row:0,column:0},endPosition:{row:2,column:0}};assert.equal(aggregate([across]).diagnostics.filter(x=>x.category==='parse').length,1);
});
