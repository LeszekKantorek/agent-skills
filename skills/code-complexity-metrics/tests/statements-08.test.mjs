import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../scripts/parser.mjs';
import {analyze as rust} from '../scripts/analyzers/rust/analyze.mjs';
import {analyze as javascript} from '../scripts/analyzers/javascript/analyze.mjs';
const walk=n=>[n,...n.children.flatMap(walk)];
// Each entry is a written-operation decomposition from the shared Statements table.
const cases=[
 ['empty','','',0],
 ['call','save();','save();',1],
 ['call-empty','save();;','save();;',2],
 ['empty-empty',';;',';;',2],
 ['assign','x=3;','x=3;',1],
 ['compound','x+=1;','x+=1;',1],
 ['compound-call','x+=calculate();','x+=calculate();',2],
 ['chain','value.trim().toLowerCase();','value.trim().to_lowercase();',2],
 ['nested-call','outer(inner());','outer(inner());',2],
 ['two-declarations','let a=1; let b=2;','let a=1; let b=2;',2],
 ['destructure','let [a,b]=pair;','let (a,b)=pair;',1],
 ['declaration-call','let x=load();','let x=load();',2],
 ['declaration-chain','let x=a().b();','let x=a().b();',3],
 ['return-call','return save();','return save();',2],
 ['return-constant','return 42;','return 42;',1],
 ['ordinary-expressions','x;42;x+1;','x;42;x+1;',3]
];
const roles={
 'empty':[], 'call':['call'], 'call-empty':['call','empty'], 'empty-empty':['empty','empty'],
 'assign':['assignment'], 'compound':['compound'], 'compound-call':['compound','call'],
 'chain':['call','call'], 'nested-call':['call','call'],
 'two-declarations':['declarator','declarator'], 'destructure':['declarator'], 'declaration-call':['declarator','call'],
 'declaration-chain':['declarator','call','call'], 'return-call':['return','call'], 'return-constant':['return'],
 'ordinary-expressions':['wrapper','wrapper','wrapper']
};
const types={call:'call_expression',empty:'empty_statement',assignment:'assignment_expression',wrapper:'expression_statement',
 compound:{rust:'compound_assignment_expr',javascript:'augmented_assignment_expression'},
 declarator:{rust:'let_declaration',javascript:'variable_declarator'},return:{rust:'return_expression',javascript:'return_statement'}};
for(const [id,js,rs,expected] of cases) for(const [language,body] of [['javascript',js],['rust',rs]]) {
 test(`S08-${language}-${id}`,async()=>{
  const source=`${language==='rust'?'fn':'function'} f(){${body}}`,q=await parse(source,language);
  try{
   assert.equal(q.tree.rootNode.hasError,false);const p=(language==='rust'?rust:javascript)(q.tree,source,'s');
   assert.equal(p.functions.length,1);assert.deepEqual(p.diagnostics,[]);
   const owner=p.functions[0].id,nodes=walk(p.tree).filter(n=>p.ownerByNode.get(n)===owner);
   const local=nodes.filter(n=>n.score.statements!==0);
   assert.equal(local.length,expected);
   assert.deepEqual(local.map(n=>n.score.statements),Array(expected).fill(1));
   assert.deepEqual(local.map(n=>n.type).sort(),roles[id].map(role=>typeof types[role]==='string'?types[role]:types[role][language]).sort());
   assert.equal(nodes.reduce((sum,n)=>sum+n.score.statements,0),expected);
  }finally{q.dispose()}
 });
}
