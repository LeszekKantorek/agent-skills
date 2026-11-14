const functions = new Set(['function_item', 'closure_expression']);
const loops = new Set(['loop_expression', 'while_expression', 'for_expression']);
const declarations = new Set(['let_declaration', 'const_item', 'static_item']);
const patternBindings = new Set(['let_condition', 'for_expression']);
const separateCounts = new Set([...functions, ...declarations, 'let_condition']);
const scopeBoundaries = new Set([...functions, 'async_block', 'const_block']);
const comments = new Set(['line_comment', 'block_comment']);
const noTail = new Set(['empty_statement', 'macro_definition']);
const direct = new Set(['call_expression', 'macro_invocation', 'assignment_expression', 'compound_assignment_expr', 'return_expression', 'break_expression', 'continue_expression', 'yield_expression', 'if_expression', 'match_expression', ...loops]);
const scored = new Set([...direct, ...declarations, 'empty_statement']);
const blockExpressions = new Set(['block', 'async_block', 'unsafe_block', 'const_block', 'try_block', 'if_expression', 'match_expression', ...loops]);
const forwardResult = new Set([...blockExpressions, 'else_clause', 'expression_statement', 'parenthesized_expression', 'return_expression', 'break_expression', 'continue_expression']);

const named = n => n.children.filter(c => c.isNamed && !comments.has(c.type));
const child = (n, field) => n.children.find(c => c.field === field);
const roots = p => new Set(p.functions.map(f => f.root));
const hasSemicolon = node => node.children.some(c => c.type === ';');

function isFunctionBodyOrMatchArmValue(type, field) {
 return (functions.has(type) && field === 'body') ||
  (type === 'match_arm' && field === 'value');
}

function isIfBranch(type, field) {
 return (type === 'if_expression' && field === 'consequence') || type === 'else_clause';
}

function isConstContext(type, child) {
 // These const-evaluation positions may contain ordinary blocks.
 return (type === 'type_arguments' && child.type === 'block') ||
  (['array_type', 'array_expression'].includes(type) && child.field === 'length');
}

function breakTarget(stack, label) {
 if (label !== null) return stack.findLast(item => item.label && item.label === label);
 // Every frame is a loop target or a barrier. An unlabeled break cannot skip either.
 const nearest = stack.at(-1);
 return nearest?.takesUnlabeledBreak ? nearest : undefined;
}

function isBlockSeparator(node, previous) {
 return node.type === 'empty_statement' && previous?.type === 'expression_statement' &&
  !hasSemicolon(previous) && blockExpressions.has(named(previous)[0]?.type);
}

function isTailExpression(node, last, noResult) {
 return !noResult && node === last && !noTail.has(node.type) &&
  !node.type.endsWith('_item') && !node.type.endsWith('_declaration') &&
  !(node.type === 'expression_statement' && hasSemicolon(node));
}

class StatementVisitor {
 constructor(p, source) {
  this.p = p;
  this.source = source;
  this.outer = roots(p);
  this.valueLoops = new Set();
 }

 readLabel(n) {
  const label = n.children.find(c => c.type === 'label');
  return label ? this.source.slice(label.startIndex, label.endIndex).replace(/^'r#/, "'").normalize('NFC') : null;
 }

 resolveBreak(n, stack) {
  const value = named(n).find(c => c.type !== 'label');
  if (!value) return null;
  const target = breakTarget(stack, this.readLabel(n));
  if (target?.node.type === 'loop_expression') this.valueLoops.add(target.node);
  return target?.node.type === 'block' ? value : null;
 }

 childBreakScope(n, c, stack, isLoopBody) {
  if (isConstContext(n.type, c)) return [];
  // A while condition admits a labeled break, but is an unlabeled-break barrier.
  const isWhileCondition = n.type === 'while_expression' && c.field === 'condition';
  if (!isLoopBody && !isWhileCondition) return stack;
  return [...stack, {node: n, label: this.readLabel(n), takesUnlabeledBreak: isLoopBody}];
 }

 scoreLocal(n, result) {
  // Outer function roots never receive a local statement point; their bodies still do.
  if (this.outer.has(n)) return;
  const {type} = n;
  if (type === 'function_item') n.score.statements++;
  if (scored.has(type)) n.score.statements++;
  if (type === 'let_declaration' && child(n, 'alternative')) n.score.statements++;
  if (patternBindings.has(type)) {
   const pattern = child(n, 'pattern');
   if (pattern) pattern.score.statements++;
  }
  // An outer's result belongs outside its own report.
  if (result && !forwardResult.has(type)) n.score.statements++;
 }

 visitExpressionStatement(n, ctx, loopStack) {
  const expr = named(n)[0];
  if (!expr) {
   n.score.statements++;
   return true;
  }
  const result = ctx.result && !hasSemicolon(n);
  const found = this.visit(expr, {result}, loopStack);
  if (!result && !found) n.score.statements++;
  return n.score.statements > 0 || direct.has(expr.type);
 }

 visitBlock(n, ctx, loopStack) {
  if (!ctx.directBlock) n.score.statements++;
  // An empty string can represent a label when source was omitted.
  const label = this.readLabel(n);
  if (label !== null) loopStack = [...loopStack, {node: n, label, takesUnlabeledBreak: false}];
  const children = named(n);
  const last = children.filter(c => c.type !== 'label').at(-1);
  let previous = null;
  for (const c of children) {
   // Parsed empty statements can be terminators of the preceding expression.
   if (!isBlockSeparator(c, previous)) {
    this.visit(c, {result: isTailExpression(c, last, ctx.noResult)}, loopStack);
   }
   previous = c;
  }
  return !ctx.directBlock;
 }

 visitChildren(n, resultChild, loopStack) {
  const {type} = n;
  let childCounted = false;
  for (const c of n.children) {
   const isLoopBody = loops.has(type) && c.field === 'body';
   const valueBody = isFunctionBodyOrMatchArmValue(type, c.field);
   const failureBody = type === 'let_declaration' && c.field === 'alternative';
   const result = c === resultChild || valueBody;
   // Only the block handler consumes directBlock; a block computes its own tail result.
   const directBlock = valueBody || isLoopBody || failureBody || isIfBranch(type, c.field);
   const childStack = this.childBreakScope(n, c, loopStack, isLoopBody);
   const found = this.visit(c, {result, directBlock, noResult: failureBody}, childStack);
   childCounted = found || childCounted;
  }
  return childCounted;
 }

 visit(n, ctx = {}, loopStack = []) {
  const {type} = n;
  if (type === 'macro_definition') {
   if (this.p.ownerByNode.get(n) !== null) n.score.statements++;
   return true;
  }
  if (type === 'block') return this.visitBlock(n, ctx, loopStack);
  if (type === 'expression_statement') return this.visitExpressionStatement(n, ctx, loopStack);
  this.scoreLocal(n, ctx.result);
  if (type === 'empty_statement') return true;

  const boundary = scopeBoundaries.has(type) || type.endsWith('_item');
  if (boundary) loopStack = [];
  const blockBreakValue = type === 'break_expression' ? this.resolveBreak(n, loopStack) : null;
  const resultChild = type === 'parenthesized_expression' && ctx.result ? named(n)[0] : blockBreakValue;
  const childCounted = this.visitChildren(n, resultChild, loopStack);
  if (ctx.result && this.valueLoops.has(n)) n.score.statements++;
  return direct.has(type) || (!separateCounts.has(type) && childCounted);
 }
}

export function statements(p, source = '') {
 new StatementVisitor(p, source).visit(p.tree);
}

