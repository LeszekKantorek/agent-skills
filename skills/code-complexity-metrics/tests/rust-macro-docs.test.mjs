import test from 'node:test'; import assert from 'node:assert/strict';
import {parse} from '../scripts/parser.mjs'; import {analyze} from '../scripts/analyzers/rust/analyze.mjs';
async function run(s){const p=await parse(s,'rust');try{return analyze(p.tree,s,'f')}finally{p.dispose()}}
test('doc attributes are validated in all syntax profiles',async()=>{
 for(const input of ["first(); second() /** docs */","first(); //! docs\nsecond()","Connection<'static>, Send /** docs */","Vec</** docs */ u32>, Connection<'static>","first(), second() /** docs */",'"k": value() /** docs */']) {const p=await run(`fn f(){probe!(${input});}`);assert.ok(p.diagnostics.length,input)}
 for(const input of ['first(); /** docs */ second()', 'first(), /** docs */ second()', 'first(); { /** docs */ const X:i32=1; X }']) {const p=await run(`fn f(){probe!(${input});}`);assert.deepEqual(p.diagnostics,[],input)}
});
test('nested macro and definition boundaries remain separate',async()=>{
 const p=await run('fn f(){m!(nested!(/** dangling */));}'); assert.equal(p.diagnostics.length,1); assert.match(p.diagnostics[0].code,/unsupported/);
 const q=await run('fn f(){m!({macro_rules! inner { () => { /** template */ fn hidden(){} } } work()});}');assert.deepEqual(q.diagnostics,[]);
});
test('record, pattern, arms, declarations and type-size contexts',async()=>{
 for(const input of ['m!({"k": value() /** docs */});','m!(v, Foo { x, .. } /** docs */);','m!(x = first() => second() /** docs */);','m!{static X: Vec</** docs */ u32> = load();}']) {const p=await run(`fn f(){${input}}`);assert.ok(p.diagnostics.length,input)}
 for(const input of ['m!({"k": /** docs */ value()});',"m!(Connection<'static>, [T; { /** docs */ const X:usize=1; X }]);",'m!{static X:i32={ /** docs */ const INNER:i32=1; INNER };}']) {const p=await run(`fn f(){${input}}`);assert.deepEqual(p.diagnostics,[],input)}
});
test('doc at expression slots survives parser attribute limitations',async()=>{
 for(const input of ["probe!(&'static T, [T; /** doc */ len()]);",'probe!(x, A { .. } if /** doc */ yes());','probe!{static X: i32 = /** doc */ { const A: i32 = /** doc */ 1; A };}']) {
  const p=await run(`fn f(){${input}}`);assert.deepEqual(p.diagnostics,[],input);
 }
});
test('negation is not a nested macro boundary',async()=>{
 for(const expression of ['!(f() /** docs */)','!!(f() /** docs */)','{return !(f() /** docs */);}']) {
  const p=await run(`fn f(){p!(one(); ${expression});}`);assert.ok(p.diagnostics.length,expression);
 }
 for(const expression of ['nested!(/** docs */ call())','{macro_rules! inner {() => {/** template */ fn g() {}}} work()}']) {
  const p=await run(`fn f(){p!(one(); ${expression});}`);assert.deepEqual(p.diagnostics,[],expression);
 }
});
test('grouped expression admits doc only before its expression',async()=>{
 for(const [open,close] of [['(',')'],['[',']'],['{','}']]) {
  for(const prefix of ['!', '!!', 'return !']) {
   const legal=await run(`fn f(){p!${open}one(); ${prefix}(/** docs */ f())${close};}`); assert.deepEqual(legal.diagnostics,[],`${open} ${prefix}`);
   const invalid=await run(`fn f(){p!${open}one(); ${prefix}(f() /** docs */)${close};}`); assert.ok(invalid.diagnostics.length,`${open} ${prefix}`);
  }
 }
});
test('expression query distinguishes patterns and types from expression roles',async()=>{
 const arm=await run('fn f(){m!(match x { /** doc */ 1 => 2, _ => 0 });}');assert.deepEqual(arm.diagnostics,[]);
 for(const input of ['m!(match x { Foo { x: /** doc */ 1 } => 2 });',"m!(Vec</** doc */ u32>, &'static T);"]) {const p=await run(`fn f(){${input}}`);assert.ok(p.diagnostics.length,input)}
});
test('expression prefix roles across the recovered CST',async()=>{
 for(const expression of ['(/** docs */ f())','[0; /** docs */ count()]','A { x: /** docs */ f() }','f()[ /** docs */ i()]','if /** docs */ test() { yes() }','match x { _ => /** docs */ go() }','{ let x = /** docs */ f(); x }','(1 + /** docs */ f())','{ return /** docs */ f(); }','{ break /** docs */ f(); }','|| /** docs */ f()']) {
  const p=await run(`fn f(){p!(first(); ${expression});}`);assert.deepEqual(p.diagnostics,[],expression);
 }
});
test('ambiguous expression list takes precedence over a forced type list',async()=>{
 for(const [open,close] of [['(',')'],['[',']'],['{','}']]) {
  const expression=await run(`fn f(){p!${open}T, [/** docs */ u32; 4]${close};}`);assert.deepEqual(expression.diagnostics,[],open);
  const type=await run(`fn f(){p!${open}&'static T, [/** docs */ u32; 4]${close};}`);assert.ok(type.diagnostics.length,open);
  const length=await run(`fn f(){p!${open}&'static T, [u32; /** docs */ size()]${close};}`);assert.deepEqual(length.diagnostics,[],open);
 }
});
test('nested macro expression accepts its own prefix doc, not trailing doc',async()=>{
 for(const [open,close] of [['(',')'],['[',']'],['{','}']]) {
  const good=await run(`fn f(){p!${open}one(); (/** doc */ inner!())${close};}`); assert.deepEqual(good.diagnostics,[],open);
  const bad=await run(`fn f(){p!${open}one(); (inner!() /** doc */)${close};}`); assert.ok(bad.diagnostics.length,open);
 }
});
