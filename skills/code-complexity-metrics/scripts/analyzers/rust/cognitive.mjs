const functions = new Set(['function_item', 'closure_expression']);
const loops = new Set(['loop_expression', 'while_expression', 'for_expression']);
const named = n => n.children.filter(c => c.isNamed && !['line_comment','block_comment'].includes(c.type));
const child = (n, field) => n.children.find(c => c.field === field);
const logical = n => n.type === 'binary_expression' && ['&&','||'].includes(child(n,'operator')?.type);
const roots = p => new Set(p.functions.map(f => f.root));

export function cognitive(p) {
 const outer = roots(p);
 function visit(n, depth=0, sequence=null, elseIf=false) {
  if(n.type === 'macro_definition') return;
  const d = outer.has(n) ? 0 : functions.has(n.type) ? depth+1 : depth;
  if(n.type === 'if_expression') n.score.cognitive += elseIf ? 1 : 1+d;
  if(n.type === 'let_declaration' && child(n,'alternative')) n.score.cognitive += 1+d;
  if(loops.has(n.type) || n.type === 'match_expression') n.score.cognitive += 1+d;
  if(n.type === 'else_clause' && !named(n).some(c=>c.type==='if_expression')) n.score.cognitive++;
  if(['break_expression','continue_expression'].includes(n.type) && n.children.some(c=>c.type==='loop_label' || c.type==='label')) n.score.cognitive++;
  if(logical(n) || n.type==='let_chain') {
   const state=sequence || {last:null};
   for(const c of n.children) {
    if(c.field==='operator' || (n.type==='let_chain' && c.type==='&&')) { if(state.last!==c.type) c.score.cognitive++; state.last=c.type; }
    else visit(c,d,state);
   }
   return;
  }
  if(n.type === 'parenthesized_expression' && sequence) { for(const c of n.children) visit(c,d,sequence); return; }
  for(const c of n.children) {
   const body = (n.type==='if_expression' && c.field==='consequence') || (loops.has(n.type) && c.field==='body') || (n.type==='match_arm' && c.field==='value') || (n.type==='else_clause' && c.type==='block') || (n.type==='let_declaration' && c.field==='alternative');
   visit(c,d+(body?1:0),null,n.type==='else_clause' && c.type==='if_expression');
  }
 }
 visit(p.tree);
}
