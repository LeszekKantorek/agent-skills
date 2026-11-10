import { adapter } from '../languages.mjs';
const choices = new Set(['if_expression','match_expression','ternary_expression']);
const controls = new Set(['if_expression','if_statement','match_expression','switch_statement','for_expression','for_statement','for_in_statement','while_expression','while_statement','loop_expression','do_statement','catch_clause','ternary_expression']);
const valueBlocks = new Set(['async_block','unsafe_block','const_block']);
const declarators = new Set(['let_declaration','variable_declarator','const_item','static_item']);
const expressionOperations = new Set(['assignment_expression','augmented_assignment_expression','compound_assignment_expr','update_expression']);
const direct = new Set(['return_statement','return_expression','break_statement','break_expression','continue_statement','continue_expression','throw_statement','empty_statement',...expressionOperations,...declarators,'macro_definition']);
const equal = (a,b) => a && b && a.id === b.id;
const uncommented = n => n.namedChildren.find(c => c.type !== 'comment' && !c.type.endsWith('_comment'));
function unwrap(n) { while (n?.type === 'parenthesized_expression') { const next=uncommented(n); if (!next) break; n=next; } return n; }

export function statementEvents(fn, language) {
 const syntax=adapter(language), blocks=syntax.block, calls=syntax.call;
 const events=[];
 const add=(n,rule)=>events.push({metric:'statement_count',amount:1,line:n.startPosition.row,rule});
 const isTailValue=n=>language==='rust' && syntax.isValue(n.type);
 // A nested function's body is a separate expression context, even though its
 // events belong to the same outer. Computed method names remain in this context.
 function expressionIsScored(n, nested=false, sameExpression=true) {
  n=unwrap(n);
  if (syntax.function.has(n.type)) {
   const name=n.childForFieldName('name');
   return name?.type==='computed_property_name' && expressionIsScored(name,true,sameExpression);
  }
  if (calls.has(n.type) || expressionOperations.has(n.type)) return true;
  if (sameExpression && (choices.has(n.type) || (language==='rust' && (blocks.has(n.type) || valueBlocks.has(n.type))))) return true;
  if (!nested && (direct.has(n.type) || controls.has(n.type) || blocks.has(n.type) || valueBlocks.has(n.type))) return true;
  // A selection used as an operand accounts for this expression. A selection
  // in a separate statement/declarator does not account for an enclosing value.
  const shared=sameExpression && !blocks.has(n.type) && !declarators.has(n.type) && n.type!=='expression_statement';
  return n.namedChildren.some(child=>expressionIsScored(child,true,shared));
 }
 function visit(n, context={}) {
  if (!n || n.type === 'comment' || n.type.endsWith('_comment')) return;
  if (n.type === 'empty_statement' && n.parent?.type === 'for_statement' && !equal(n,n.parent.childForFieldName('body'))) return;
  if (n.type === 'macro_definition' || n.type === 'macro_invocation') { if (n.type === 'macro_invocation' && context.tail) add(n,'implicit return'); add(n,n.type); return; }
  if (syntax.function.has(n.type)) {
   if (context.tail && isTailValue(n)) add(n,'implicit return');
   if (!equal(n,fn) && ['function_declaration','generator_function_declaration','function_item'].includes(n.type)) add(n,'nested function');
   const body=n.childForFieldName('body');
   for (const child of n.namedChildren) if (!equal(child,body)) visit(child);
   if (body) {
    if (blocks.has(body.type)) visit(body,{directBlock:true, tail:language==='rust'});
    else {
     const value=unwrap(body);
     if (language!=='rust' && !choices.has(value.type) && !valueBlocks.has(value.type)) add(value,'implicit return');
     visit(value,{tail:language==='rust'});
    }
   }
   return;
  }
  if (blocks.has(n.type)) {
   if (!context.directBlock) add(n,'block');
   const children=n.namedChildren.filter(c => c.type !== 'comment' && !c.type.endsWith('_comment'));
   children.forEach((c,i)=>visit(c,{tail: language==='rust' && i===children.length-1 && (context.tail || context.valueBlock || !context.directBlock)}));
   return;
  }
  if (n.type === 'expression_statement') {
   const child=n.namedChildren[0];
   if (!child) return;
   const tail=context.tail && !n.text.trimEnd().endsWith(';');
   visit(child,{tail});
   if (!tail && !expressionIsScored(child)) add(n,'expression');
   return;
  }
  if (n.type === 'parenthesized_expression' && uncommented(n)) { visit(uncommented(n),context); return; }
  if (valueBlocks.has(n.type)) { for (const child of n.namedChildren) visit(child,{tail:context.tail || context.value || context.valueBlock}); return; }
  if (context.tail && isTailValue(n) && !choices.has(n.type) && !blocks.has(n.type) && !direct.has(n.type) && !controls.has(n.type)) add(n,'implicit return');
  if (calls.has(n.type) || direct.has(n.type) || controls.has(n.type)) add(n,n.type);
  if (n.type === 'for_expression' || n.type === 'let_condition') add(n,'binding');
  if (n.type === 'for_in_statement' && n.children.some(c=>['const','let','var'].includes(c.type))) add(n,'binding');
  if (n.type === 'ternary_expression') {
   const cond=n.childForFieldName('condition'), a=n.childForFieldName('consequence'), b=n.childForFieldName('alternative');
   visit(cond); for (const branch of [a,b]) { if (!choices.has(unwrap(branch)?.type)) add(branch,'branch value'); visit(branch); } return;
  }
  if (n.type === 'if_expression' || n.type === 'match_expression') {
   const value=!!(context.tail || context.value || !['expression_statement','else_clause'].includes(n.parent?.type));
   const condition=n.childForFieldName('condition') ?? n.childForFieldName('value');
   for (const child of n.namedChildren) {
    if (equal(child,condition)) visit(child);
    else if (child.type==='block') visit(child,{directBlock:true,tail:value});
    else if (child.type==='else_clause') {
     const branch=uncommented(child);
     if (branch?.type==='block') visit(branch,{directBlock:true,tail:value}); else visit(branch,{tail:value});
    } else if (child.type==='match_block') visit(child,{value});
    else visit(child);
   }
   return;
  }
  if (n.type === 'match_arm') {
   const value=n.childForFieldName('value');
   for (const child of n.namedChildren) if (equal(child,value)) {
    if (child.type==='block') visit(child,{directBlock:true,tail:context.value});
    else visit(child,{tail:context.value});
   } else visit(child);
   return;
  }
  const bodies=n.childrenForFieldName('body');
  const value=n.childForFieldName('value');
  for (const child of n.namedChildren) {
   if (blocks.has(child.type) && (((controls.has(n.type) || syntax.branch.has(n.type)) && bodies.some(body=>equal(child,body))) || ['if_statement','else_clause','try_statement','finally_clause'].includes(n.type))) visit(child,{directBlock:true});
   else if (equal(child,value) && declarators.has(n.type)) visit(child,{value:true, valueBlock:true});
   else if (language==='rust' && (choices.has(child.type) || child.type==='parenthesized_expression') && ['arguments','return_expression','return_statement'].includes(n.type)) visit(child,{value:true});
   else visit(child, n.type==='match_block' ? {value:context.value} : {});
  }
 }
 visit(fn);
 return events;
}
