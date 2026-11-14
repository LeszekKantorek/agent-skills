import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../scripts/parser.mjs';
import {prepare} from '../scripts/analyzers/rust/analyze.mjs';
import {parseMacroArguments} from '../scripts/analyzers/rust/macro-arguments.mjs';
const walk = n => [n, ...n.children.flatMap(walk)];
async function prepared(source) { const p = await parse(source, 'rust'); try { return prepare(p.tree, source, 'file'); } finally { p.dispose(); } }
const text = (source,n) => source.slice(n.startIndex,n.endIndex);
test('step 2: recovered argument boundaries and operator roles survive disposal', async () => {
 const source='fn f(){m!(a && b, c && d);}'; const p=await prepared(source), all=walk(p.tree), macro=all.find(n=>n.type==='macro_invocation');
 const args=macro.children.filter(n=>n.field==='argument'); assert.deepEqual(args.map(n=>text(source,n)),['a && b','c && d']);
 assert.deepEqual(args.map(n=>n.children.find(c=>c.field==='operator').type),['&&','&&']);
 assert.equal(all.filter(n=>n.type==='token_tree').length,0); assert.equal(p.diagnostics.length,0);
 assert.ok(all.every(n=>Object.values(n.score).every(x=>x===0))); assert.equal(p.ownerByNode.size,all.length); assert.equal(new Set(all).size,all.length);
});
test('step 2: nested mapping uses original UTF-16 positions and CRLF', async () => {
 const source='// 😀\r\nfn f(){ "😀"; outer!("😀", inner!(a && b)); }'; const p=await prepared(source), all=walk(p.tree);
 for(const n of all) { assert.equal(n.startPosition.column,n.startIndex-(source.lastIndexOf('\n',n.startIndex-1)+1)); assert.equal(n.endPosition.column,n.endIndex-(source.lastIndexOf('\n',n.endIndex-1)+1)); }
 const op=all.find(n=>n.type==='&&'); assert.equal(text(source,op),'&&'); assert.equal(op.startIndex,source.indexOf('&&')); assert.equal(op.endIndex,source.indexOf('&&')+2); assert.deepEqual(op.startPosition,{row:1,column:source.indexOf('&&')-source.indexOf('\n')-1}); assert.deepEqual(op.endPosition,{row:1,column:source.indexOf('&&')-source.indexOf('\n')+1}); assert.deepEqual(p.diagnostics,[]);
});
test('step 2: full expression lists, nested delimiters, and unsupported DSL', async () => {
 for(const content of ['', '/* comment */', 'a,', 'f::<(u8,u8)>(x), |a,b| (a,b)', 'outer![inner!{load()}]', '"fake // x()"']) {
  const source=`fn f(){ m!(${content}); }`; const p=await prepared(source); assert.deepEqual(p.diagnostics,[],content);
 }
 for(const content of ['value; => count', 'a, broken +']) {
  const p=await prepared(`fn f(){ m!(${content}); }`); assert.ok(p.diagnostics.length,content);
 }
});
test('step 2: wrapper rejects injected statements', async () => {
 const p=await parse('fn f(){}','rust'); try { assert.equal(parseMacroArguments(p.tree.language, '); injected(); __capture(', 0, () => ({})), null); } finally { p.dispose(); }
});
test('step 2: functions, closure ownership and module uncertainty', async () => {
 const source='unknown!(value; => count); fn good(){ m!(|| { work() }); macro_rules! x { () => { fn hidden(){} } } }'; const p=await prepared(source), all=walk(p.tree);
 assert.deepEqual(p.functions.map(f=>f.name),['good']); const good=p.functions[0]; const closure=all.find(n=>n.type==='closure_expression'); assert.equal(p.ownerByNode.get(closure),good.id); assert.ok(p.diagnostics.some(d=>d.owner===null && d.affectsFunctionDiscovery));
 const module=await prepared('m!({ fn inner() {} });'); assert.deepEqual(module.functions.map(f=>f.name),['inner']);
});
test('step 2: literals and comments remain independent presentation ranges', async () => {
 const source='fn f(){\n let a="one\n// literal";\n m!(r#"two\n// literal"#, /* actual */ call()); // tail\n}'; const p=await prepared(source);
 assert.deepEqual(p.presentation.comments.map(r=>text(source,r)),['/* actual */','// tail']); assert.deepEqual(p.presentation.lineAnnotations.filter(x=>x.endIndex===null).map(x=>x.row),[1,3]);
});

test('step 2: parser nodes and delimiters retain fields and source roles', async () => {
 const source='fn f(){let x = || { if a { call(); } match x { A | B => 1, _ => 2 } }; assert_eq!(TrueAirspeed::new(value).unwrap().knots(), value);}';
 const p=await prepared(source), all=walk(p.tree);
 for(const type of ['function_item','closure_expression','block','let_declaration','call_expression','if_expression','match_expression']) assert.ok(all.some(n=>n.type===type),type);
 assert.equal(all.filter(n=>n.type==='call_expression' && text(source,n).includes('TrueAirspeed')).length,3);
 const pipe=all.filter(n=>n.type==='|'); assert.ok(pipe.length>=3); assert.ok(pipe.every(n=>n.field!=='operator'));
});
import ts from '../vendor/tree-sitter/tree-sitter.js';
test('review 02: malformed original macro delimiters preserve parse diagnostics and no partial arguments', async () => {
 for (const source of ['fn f(){ m!(a, b } fn z(){}', 'fn f(){ m!{a) ; b}; } fn z(){}']) {
  const p=await prepared(source), f=p.functions.find(x=>x.name==='f'), z=p.functions.find(x=>x.name==='z'), macro=walk(p.tree).find(x=>x.type==='macro_invocation');
  assert.ok(f && z); assert.ok(p.diagnostics.some(d=>d.category==='parse' && d.owner===f.id && !d.affectsFunctionDiscovery)); assert.ok(!p.diagnostics.some(d=>d.owner===z.id)); assert.equal(macro.children.filter(x=>x.field==='argument').length,0);
 }
});
test('review 02: presentation covers unsupported macros and excluded definitions', async () => {
 for(const source of ['fn f(){ m!{r#"one\n// literal"# ; => count}; }', 'fn f(){ m!{value; /* actual\n comment */ => count}; }', 'fn f(){ macro_rules! x { () => { /* actual\n comment */ r#"one\n// literal"# }; } }']) {
  const p=await prepared(source); const expectsComment=source.includes('/* actual');
  assert.equal(p.presentation.comments.some(r=>text(source,r).startsWith('/* actual')),expectsComment);
  assert.ok(!p.presentation.comments.some(r=>text(source,r).startsWith('// literal')));
  assert.ok(p.presentation.lineAnnotations.filter(r=>r.endIndex===null).length >= (source.includes('r#"') && expectsComment ? 2 : 1));
 }
});
test('review 02: macro definition boundaries and local discovery', async () => {
 const broken=await prepared('macro_rules! x { () => { fn hidden() {} } fn good() {}');
 assert.deepEqual(broken.functions.map(f=>f.name),['good']); assert.ok(broken.diagnostics.some(d=>d.category==='parse' && d.owner===null && d.affectsFunctionDiscovery));
 const local=await prepared('fn f() { let x = ; } fn good() {}'); const f=local.functions.find(x=>x.name==='f');
 assert.ok(local.diagnostics.some(d=>d.category==='parse' && d.owner===f.id && !d.affectsFunctionDiscovery));
});
test('review 02: const and static closure names', async () => {
 const p=await prepared('const HANDLER: fn() = || {}; static CALLBACK: fn() = || {};'); assert.deepEqual(p.functions.map(f=>f.name),['HANDLER','CALLBACK']);
});
test('review 02: auxiliary parser and tree are disposed for success, rejection and exceptions', async () => {
 const parsed=await parse('fn f(){}','rust'), events=[], pd=ts.Parser.prototype.delete, td=ts.Tree.prototype.delete, pp=ts.Parser.prototype.parse;
 try {
  ts.Parser.prototype.delete=function(){events.push('parser'); return pd.call(this)}; ts.Tree.prototype.delete=function(){events.push('tree'); return td.call(this)};
  assert.ok(parseMacroArguments(parsed.tree.language,'a',0,()=>({}))); assert.deepEqual(events.splice(0),['tree','parser']);
  assert.equal(parseMacroArguments(parsed.tree.language,'a;',0,()=>({})),null); assert.deepEqual(events.splice(0),['tree','parser']);
  assert.throws(()=>parseMacroArguments(parsed.tree.language,'a',0,()=>{throw Error('copy')}),/copy/); assert.deepEqual(events.splice(0),['tree','parser']);
  ts.Parser.prototype.parse=function(){throw Error('parse')}; assert.throws(()=>parseMacroArguments(parsed.tree.language,'a',0,()=>({})),/parse/); assert.deepEqual(events.splice(0),['parser']);
  ts.Parser.prototype.parse=pp; const sl=ts.Parser.prototype.setLanguage; try { ts.Parser.prototype.setLanguage=function(){throw Error('language')}; assert.throws(()=>parseMacroArguments(parsed.tree.language,'a',0,()=>({})),/language/); assert.deepEqual(events.splice(0),['parser']); } finally { ts.Parser.prototype.setLanguage=sl; }
 } finally { ts.Parser.prototype.delete=pd; ts.Tree.prototype.delete=td; ts.Parser.prototype.parse=pp; parsed.dispose(); }
});

test('review recheck: damaged outer boundary marks discovery incomplete without inventing functions', async () => {
 const source='fn a(){ foo(\nfn b() {}\nfn c() {}', p=await prepared(source);
 assert.deepEqual(p.functions.map(f=>f.name),['a','c']);
 const a=p.functions[0], c=p.functions[1];
 assert.ok(p.diagnostics.some(d=>d.category==='parse' && d.owner===a.id && d.affectsFunctionDiscovery));
 assert.ok(!p.diagnostics.some(d=>d.owner===c.id));
});
test('review recheck: isolated erroneous declarator retains complete discovery', async () => {
 const p=await prepared('fn f(){ let x = = 1; } fn good() {}');
 assert.deepEqual(p.functions.map(f=>f.name),['f','good']); const f=p.functions[0], good=p.functions[1];
 assert.ok(p.diagnostics.some(d=>d.category==='parse' && d.owner===f.id));
 assert.ok(p.diagnostics.filter(d=>d.owner===f.id).every(d=>!d.affectsFunctionDiscovery));
 assert.ok(!p.diagnostics.some(d=>d.owner===good.id));
});
test('review recheck: nested recovery in a declaration does not prove discovery', async () => {
 const p=await prepared('fn a(){ let x = foo(\nfn b() {}\n); } fn c() {}');
 assert.deepEqual(p.functions.map(f=>f.name),['a','c']); const a=p.functions[0], c=p.functions[1];
 assert.ok(p.diagnostics.some(d=>d.owner===a.id && d.affectsFunctionDiscovery));
 assert.ok(!p.diagnostics.some(d=>d.owner===c.id));
});
test('review final: malformed macro cannot hide a function boundary', async () => {
 for (const delimiter of ['(', '[']) {
  const source=`fn a(){ m!${delimiter}x } fn c(){} } fn d(){}`, p=await prepared(source);
  assert.deepEqual(p.functions.map(f=>f.name),['a','d']); const [a,d]=p.functions;
  assert.ok(p.diagnostics.some(x=>x.category==='parse' && x.owner===a.id && x.affectsFunctionDiscovery));
  assert.ok(!p.diagnostics.some(x=>x.owner===d.id));
  assert.equal(walk(a.root).filter(n=>n.field==='argument').length,0);
 }
});
test('review final: missing macro close at intact body boundary remains local', async () => {
 const p=await prepared('fn a(){ m!(x, b } fn c(){}'); assert.deepEqual(p.functions.map(f=>f.name),['a','c']);
 assert.ok(p.diagnostics.some(d=>d.category==='parse' && d.owner===p.functions[0].id && !d.affectsFunctionDiscovery));
 assert.ok(!p.diagnostics.some(d=>d.owner===p.functions[1].id));
});
test('review final: nested recovery and a later macro close do not establish a safe boundary', async () => {
 for (const source of ['fn a(){ m!(x } fn c(){} ) } fn d(){}','fn a(){ outer!(inner!(x } fn c(){} ) } fn d(){}']) {
  const p=await prepared(source); assert.deepEqual(p.functions.map(f=>f.name),['a','d']); const [a,d]=p.functions;
  assert.ok(p.diagnostics.some(x=>x.category==='parse' && x.owner===a.id && x.affectsFunctionDiscovery));
  assert.ok(!p.diagnostics.some(x=>x.owner===d.id));
 }
 const p=await prepared('m!(x } fn c(){} } fn d(){}'); assert.ok(p.diagnostics.some(d=>d.category==='parse' && d.owner===null && d.affectsFunctionDiscovery));
});
