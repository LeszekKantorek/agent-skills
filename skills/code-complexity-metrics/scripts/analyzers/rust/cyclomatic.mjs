const loops = new Set(['loop_expression', 'while_expression', 'for_expression']);
const child = (n, field) => n.children.find(c => c.field === field);
const logical = n => n.type === 'binary_expression' && ['&&','||'].includes(child(n,'operator')?.type);
const roots = p => new Set(p.functions.map(f => f.root));

export function cyclomatic(p) {
 const outer=roots(p);
 function visit(n) {
  if(n.type==='macro_definition') return;
  if(outer.has(n)) n.score.cyclomatic++;
  if(n.type==='if_expression' || loops.has(n.type) || n.type==='match_arm') n.score.cyclomatic++;
  if(n.type==='let_declaration' && child(n,'alternative')) n.score.cyclomatic++;
  if(logical(n)) child(n,'operator').score.cyclomatic++;
  if(n.type==='let_chain') for(const c of n.children) if(c.type==='&&') c.score.cyclomatic++;
  for(const c of n.children) visit(c);
 }
 visit(p.tree);
}
