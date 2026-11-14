const functions = new Set(['function_expression', 'function_declaration', 'generator_function', 'generator_function_declaration', 'arrow_function', 'method_definition']);
const loops = new Set(['for_statement', 'for_in_statement', 'while_statement', 'do_statement']);
const operations = new Set(['call_expression', 'new_expression', 'assignment_expression', 'augmented_assignment_expression', 'update_expression', 'if_statement', 'switch_statement', 'try_statement', 'catch_clause', 'return_statement', 'throw_statement', 'break_statement', 'continue_statement', 'yield_expression', 'with_statement', 'debugger_statement', ...loops]);
const wrapperSuppressingOperations = new Set([...operations, 'ternary_expression', 'class_static_block']);
const scoredOperations = new Set([...wrapperSuppressingOperations, 'variable_declarator', 'field_definition']);
const declarationKinds = new Set(['let', 'const', 'var', 'using']);
const directBlockParents = new Set(['else_clause', 'try_statement', 'catch_clause', 'finally_clause', 'class_static_block']);
const bodyParents = new Set([...functions, ...loops, 'with_statement']);
const resultBranches = new Set(['consequence', 'alternative']);
const forHeaderFields = new Set(['initializer', 'condition']);
const expressionBoundaries = new Set(['statement_block', 'variable_declarator', 'class_static_block']);
const comments = new Set(['comment', 'html_comment']);
const named = node => node.children.filter(child => child.isNamed && !comments.has(child.type));

function isDirectBlock(parentType, child) {
  if (child.type !== 'statement_block') return false;
  return directBlockParents.has(parentType) ||
    (child.field === 'body' && bodyParents.has(parentType)) ||
    (child.field === 'consequence' && parentType === 'if_statement');
}

function isResult(parentType, child, groupedResult) {
  return child === groupedResult ||
    (parentType === 'arrow_function' && child.field === 'body' && child.type !== 'statement_block') ||
    (parentType === 'ternary_expression' && resultBranches.has(child.field));
}

function sharesExpressionContext(parentType, child) {
  if (expressionBoundaries.has(parentType)) return false;
  if (parentType === 'field_definition') return child.field === 'property';
  if (!functions.has(parentType)) return true;
  // Computed method names and decorators belong to the enclosing expression.
  return parentType === 'method_definition' &&
    (child.field === 'decorator' || (child.field === 'name' && child.type === 'computed_property_name'));
}

class StatementVisitor {
  constructor(prepared) {
    this.roots = new Set(prepared.functions.map(fn => fn.root));
  }

  scoreLocal(node, context) {
    const {type} = node;
    const declaration = type === 'function_declaration' || type === 'generator_function_declaration';
    if (declaration && !this.roots.has(node)) node.score.statements++;
    if (scoredOperations.has(type)) node.score.statements++;
    if (type === 'empty_statement' && !context.separator) node.score.statements++;
    if (type === 'statement_block' && !context.directBlock) node.score.statements++;
    // Grouping and ternary nodes pass result context to their children.
    if (context.result && !this.roots.has(node) && type !== 'ternary_expression' && type !== 'parenthesized_expression') node.score.statements++;
  }

  scoreForBinding(node) {
    const binding = node.children.find(child => child.field === 'left');
    const hasDeclaration = node.children.some(child => child.field === 'kind' && declarationKinds.has(child.type));
    if (binding && hasDeclaration) binding.score.statements++;
  }

  visitExpressionStatement(node) {
    const expression = named(node)[0];
    if (!expression || !this.visit(expression)) node.score.statements++;
    return true;
  }

  visitChildren(node, context) {
    const {type} = node;
    const groupedResult = context.result && type === 'parenthesized_expression' ? named(node)[0] : null;
    let counted = wrapperSuppressingOperations.has(type);
    for (const child of node.children) {
      const childCounted = this.visit(child, {
        directBlock: isDirectBlock(type, child),
        result: isResult(type, child, groupedResult),
        separator: type === 'for_statement' && forHeaderFields.has(child.field),
      });
      if (childCounted && sharesExpressionContext(type, child)) counted = true;
    }
    return counted;
  }

  visit(node, context = {}) {
    this.scoreLocal(node, context);
    if (node.type === 'for_in_statement') this.scoreForBinding(node);
    if (node.type === 'expression_statement') return this.visitExpressionStatement(node);
    return this.visitChildren(node, context);
  }
}

export function statements(prepared) {
  new StatementVisitor(prepared).visit(prepared.tree);
}
