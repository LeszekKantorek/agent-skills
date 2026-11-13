const functions = new Set(['function_item', 'closure_expression']);
const loops = new Set(['loop_expression', 'while_expression', 'for_expression']);
const direct = new Set(['call_expression', 'macro_invocation', 'assignment_expression', 'compound_assignment_expr', 'return_expression', 'break_expression', 'continue_expression', 'yield_expression', 'if_expression', 'match_expression', ...loops]);
const named = n => n.children.filter(c => c.isNamed && !['line_comment','block_comment'].includes(c.type));
const child = (n, field) => n.children.find(c => c.field === field);
const roots = p => new Set(p.functions.map(f => f.root));
// These grammar nodes are block expressions whose trailing semicolon can be
// parsed as a separate empty_statement rather than part of the statement.
const blockExpressions = new Set(['block', 'async_block', 'unsafe_block', 'const_block', 'try_block', 'if_expression', 'match_expression', ...loops]);
const forwardResult = new Set(['block','async_block','unsafe_block','const_block','try_block','if_expression','match_expression','else_clause','expression_statement','parenthesized_expression','return_expression','break_expression','continue_expression', ...loops]);

export function statements(p, source = '') {
 const outer=roots(p);
 const labelName = node => source.slice(node.startIndex, node.endIndex).replace(/^'r#/, "'").normalize('NFC');
 function visit(n, ctx={}) {
  if(n.type==='macro_definition') { if(p.ownerByNode.get(n)!==null) n.score.statements++; return true; }
  const fun=functions.has(n.type);
  // A function, item, async block or const block has a separate control-flow
  // scope even when its written operations still belong to the same outer.
  const boundary=fun || n.type.endsWith('_item') || n.type==='async_block' || n.type==='const_block';
  let loopStack=boundary ? [] : (ctx.loopStack || []);
  let currentLoop=null;
  const ownLabel=n.children.find(c=>c.type==='label');
  if(loops.has(n.type) || (n.type==='block' && ownLabel)) {
   const label=ownLabel;
   currentLoop={node:n, label:label ? labelName(label) : null, result:!!ctx.result, value:false};
   // Block labels scope over the block. Loop labels scope over their bodies,
   // but not the condition or the iterator evaluated before the body.
   if(n.type==='block') loopStack=[...loopStack,currentLoop];
  }
  let blockBreakValue=null;
  if(n.type==='break_expression') {
   const label=n.children.find(c=>c.type==='label');
   const value=named(n).find(c=>c.type!=='label');
   const labelText=label ? labelName(label) : null;
   let target;
   if(label) {
    target=[...loopStack].reverse().find(item=>item.label && item.label===labelText);
   } else {
    // An unlabeled break cannot cross a labeled block or escape a while
    // condition. A loop entered inside either boundary is still a valid target.
    for(let i=loopStack.length-1;i>=0;i--) {
     const item=loopStack[i];
     if(item.unlabeledBarrier || item.node.type==='block') break;
     if(loops.has(item.node.type)) { target=item; break; }
    }
   }
   if(value && target?.node.type==='loop_expression') target.value=true;
   if(value && target?.node.type==='block') blockBreakValue=value;
  }
  if(n.type==='function_item' && !outer.has(n)) n.score.statements++;
  if(['let_declaration','const_item','static_item'].includes(n.type)) n.score.statements++;
  if(n.type==='let_declaration' && child(n,'alternative')) n.score.statements++;
  if(['let_condition','for_expression'].includes(n.type)) {
   const pattern=child(n,'pattern');
   if(pattern) pattern.score.statements++;
  }
  if(direct.has(n.type)) n.score.statements++;
  if(n.type==='block' && !ctx.directBlock) n.score.statements++;
  // A module result whose terminal expression is an outer function belongs
  // outside that function's report; no other AST node represents its result.
  if(ctx.result && !forwardResult.has(n.type) && !outer.has(n)) n.score.statements++;
  if(n.type==='empty_statement') { n.score.statements++; return true; }
  if(n.type==='expression_statement') {
   const expr=named(n)[0]; if(expr) { const result=ctx.result && !n.children.some(c=>c.type===';'); const counted=visit(expr,{result,loopStack}); if(!result && !counted) n.score.statements++; }
   else n.score.statements++;
   return n.score.statements>0 || (expr && direct.has(expr.type));
  }
  if(n.type==='block') {
   const last=named(n).filter(c=>c.type!=='label').at(-1);
   let previous=null;
   for(const c of n.children) {
    // Tree-sitter may represent a terminator following a block-like expression
    // as an empty statement. It is a separator, not another statement.
    if(c.type==='empty_statement' && previous?.type==='expression_statement' && !previous.children.some(x=>x.type===';') && blockExpressions.has(named(previous)[0]?.type)) { previous=c; continue; }
    const isTail=!ctx.noResult && c===last && c.type!=='empty_statement' && !c.type.endsWith('_item') && !c.type.endsWith('_declaration') && c.type!=='macro_definition' && !(c.type==='expression_statement' && c.children.some(x=>x.type===';'));
    visit(c,{result:isTail,loopStack});
    if(c.isNamed && !['line_comment','block_comment'].includes(c.type)) previous=c;
   }
   return !ctx.directBlock;
  }
  let counted=direct.has(n.type);
  for(const c of n.children) {
   let result=false, directBlock=false;
   if(fun && c.field==='body') {directBlock=c.type==='block'; result=c.type!=='block';}
   else if(n.type==='if_expression' && c.field==='consequence') directBlock=true;
   else if(loops.has(n.type) && c.field==='body') directBlock=true;
   else if(n.type==='else_clause' && c.type==='block') directBlock=true;
   else if(n.type==='match_arm' && c.field==='value') {directBlock=c.type==='block'; result=c.type!=='block';}
   else if(n.type==='parenthesized_expression' && c===named(n)[0]) result=!!ctx.result;
   else if(n.type==='break_expression' && c===blockBreakValue) result=true;
   const sameContext = !fun && n.type!=='block' && !['let_declaration','const_item','static_item','let_condition'].includes(n.type);
   let childStack=loopStack;
   if(loops.has(n.type) && c.field==='body') childStack=[...loopStack,currentLoop];
   // A while label is visible in the condition, unlike a for label in its
   // iterator. The condition nevertheless blocks an unlabeled outer break.
   else if(n.type==='while_expression' && c.field==='condition') childStack=[...loopStack,{...currentLoop,unlabeledBarrier:true}];
   // These child roles are const-evaluation contexts, even when the parser
   // uses an ordinary block rather than a const_block node.
   const constRole=(n.type==='type_arguments' && c.type==='block') ||
     (['array_type','array_expression'].includes(n.type) && c.field==='length');
   if(constRole) childStack=[];
   const failureBody=n.type==='let_declaration' && c.field==='alternative';
   const found=visit(c,{result,directBlock:directBlock || failureBody,noResult:failureBody,loopStack:childStack}); if(sameContext && found) counted=true;
  }
  if(currentLoop?.result && currentLoop.value && n.type==='loop_expression') n.score.statements++;
  return counted;
 }
 visit(p.tree);
}


