import test from 'node:test';import assert from 'node:assert/strict';import {parse} from '../scripts/parser.mjs';import {analyze} from '../scripts/analyzers/rust/analyze.mjs';
const walk=n=>[n,...n.children.flatMap(walk)];
const cases=[
 ['depth','fn f(){if a{m!(if b{work();});}}',[3,3,4],[['if_expression',[[1,1,1],[2,1,1]]],['macro_invocation',[[0,0,1]]],['call_expression',[[0,0,1]]]]],
 ['arguments','fn f(){m!(a&&b,c&&d);}',[2,3,1],[['&&',[[1,1,0],[1,1,0]]],['macro_invocation',[[0,0,1]]]]],
 ['nested','fn f(){m!(outer!(load()));}',[0,1,3],[['macro_invocation',[[0,0,1],[0,0,1]]],['call_expression',[[0,0,1]]]]],
 ['closure','fn f(){m!(||{work();});}',[0,1,2],[['macro_invocation',[[0,0,1]]],['closure_expression',[[0,0,0]]],['call_expression',[[0,0,1]]]]],
 ['block-choice','fn f(){m!({work();},if a{yes()}else{no()});}',[2,2,8],[['macro_invocation',[[0,0,1]]],['if_expression',[[1,1,1]]],['call_expression',[[0,0,1],[0,0,2],[0,0,2]]]]]
];
for(const [id,source,expected,checks] of cases) test(`R08-composition-${id}`,async()=>{
 const q=await parse(source,'rust');try{assert.equal(q.tree.rootNode.hasError,false);const p=analyze(q.tree,source,'r');assert.equal(p.functions.length,1);assert.deepEqual(p.diagnostics,[]);const owner=p.functions[0].id,nodes=walk(p.tree).filter(n=>p.ownerByNode.get(n)===owner);
 const score=n=>[n.score.cognitive,n.score.cyclomatic,n.score.statements];for(const [type,local] of checks)assert.deepEqual(nodes.filter(n=>n.type===type).map(score),local,type);
 assert.deepEqual(['cognitive','cyclomatic','statements'].map(k=>nodes.reduce((s,n)=>s+n.score[k],0)),expected);
 }finally{q.dispose()}
});

test('R08-composition-literal-is-not-call',async()=>{
 const source='fn f(){m!("fake()");}',q=await parse(source,'rust');try{assert.equal(q.tree.rootNode.hasError,false);const p=analyze(q.tree,source,'r');assert.equal(p.functions.length,1);assert.deepEqual(p.diagnostics,[]);const nodes=walk(p.tree).filter(n=>p.ownerByNode.get(n)===p.functions[0].id);assert.equal(nodes.filter(n=>n.type==='call_expression').length,0);assert.deepEqual(['cognitive','cyclomatic','statements'].map(k=>nodes.reduce((s,n)=>s+n.score[k],0)),[0,1,1])}finally{q.dispose()}
});

test('R08-composition-unrecognized-repetition-is-explicit',async()=>{
 const source='fn f(){vec![load(); => count()];}',q=await parse(source,'rust');try{assert.equal(q.tree.rootNode.hasError,false);const p=analyze(q.tree,source,'r');assert.equal(p.functions.length,1);const owner=p.functions[0].id,nodes=walk(p.tree).filter(n=>p.ownerByNode.get(n)===owner),macro=nodes.find(n=>n.type==='macro_invocation');assert.deepEqual(macro.score,{cognitive:0,cyclomatic:0,statements:1});assert.equal(nodes.filter(n=>n.type==='call_expression').length,0);assert.equal(p.diagnostics.length,1);assert.equal(p.diagnostics[0].code,'rust-unsupported-macro-arguments');assert.equal(p.diagnostics[0].owner,owner);assert.deepEqual(p.diagnostics[0].affectedMetrics,['cognitive','cyclomatic','statements'])}finally{q.dispose()}
});
