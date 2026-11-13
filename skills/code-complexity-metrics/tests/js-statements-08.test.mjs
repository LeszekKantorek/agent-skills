import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../scripts/parser.mjs';
import {analyze} from '../scripts/analyzers/javascript/analyze.mjs';
const walk=n=>[n,...n.children.flatMap(walk)];
// Each listed local value follows a declarator, written operation or result boundary.
const cases=[
 ['constant-arrow','const f=()=>42;',[['number',1]]],
 ['call-arrow','const f=()=>calculate();',[['call_expression',2]]],
 ['declarators','function f(){let a=1,b=2;}',[['variable_declarator',1],['variable_declarator',1]]],
 ['for-binding','function f(){for(const value of values){consume(value);}}',[['for_in_statement',1],['identifier',1],['call_expression',1]]],
 ['constant-choice','function f(){const x=b?1:2;}',[['variable_declarator',1],['ternary_expression',1],['number',1],['number',1]]],
 ['call-choice','function f(){const x=b?first():second();}',[['variable_declarator',1],['ternary_expression',1],['call_expression',2],['call_expression',2]]],
 ['three-functions','function f(){const a=()=>{};const b=function(){};const c=function named(){};}',[['variable_declarator',1],['variable_declarator',1],['variable_declarator',1]]],
 ['block-call','function f(){{work();}}',[['statement_block',1],['call_expression',1]]],
 ['switch','function f(){switch(x){case 1:first();break;default:second();}}',[['switch_statement',1],['call_expression',1],['break_statement',1],['call_expression',1]]],
 ['catch','function f(){try{}catch(e){recover();}}',[['try_statement',1],['catch_clause',1],['call_expression',1]]],
 ['post-increment','function f(){x++;}',[['update_expression',1]]],
 ['pre-increment','function f(){++x;}',[['update_expression',1]]],
 ['post-decrement','function f(){x--;}',[['update_expression',1]]],
 ['pre-decrement','function f(){--x;}',[['update_expression',1]]],
 ['constructor','function f(){new Foo();}',[['new_expression',1]]],
 ['constructor-init','function f(){let x=new Foo(load());}',[['variable_declarator',1],['new_expression',1],['call_expression',1]]]
];
for(const [id,source,expected] of cases) test(`J08-statements-${id}`,async()=>{
 const q=await parse(source,'javascript');try{
  assert.equal(q.tree.rootNode.hasError,false);const p=analyze(q.tree,source,'js');
  assert.equal(p.functions.length,1);assert.deepEqual(p.diagnostics,[]);
  const owner=p.functions[0].id,nodes=walk(p.tree).filter(n=>p.ownerByNode.get(n)===owner);
  assert.deepEqual(nodes.filter(n=>n.score.statements).map(n=>[n.type,n.score.statements]),expected);
  assert.equal(nodes.reduce((sum,n)=>sum+n.score.statements,0),expected.reduce((sum,[,n])=>sum+n,0));
 }finally{q.dispose()}
});
