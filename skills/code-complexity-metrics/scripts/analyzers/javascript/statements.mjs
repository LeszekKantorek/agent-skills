const functions = new Set(['function_expression', 'function_declaration', 'generator_function', 'generator_function_declaration', 'arrow_function', 'method_definition']);
const loops = new Set(['for_statement', 'for_in_statement', 'while_statement', 'do_statement']);
const operations = new Set(['call_expression', 'new_expression', 'assignment_expression', 'augmented_assignment_expression', 'update_expression', 'if_statement', 'switch_statement', 'try_statement', 'catch_clause', 'return_statement', 'throw_statement', 'break_statement', 'continue_statement', 'yield_expression', 'with_statement', 'debugger_statement', ...loops]);
const comments = new Set(['comment', 'html_comment']);
const named = node => node.children.filter(child => child.isNamed && !comments.has(child.type));

export function statements(prepared) {
  const roots = new Set(prepared.functions.map(fn => fn.root));

  function visit(node, context = {}) {
    const isFunction = functions.has(node.type);
    const isDeclaration = node.type === 'function_declaration' || node.type === 'generator_function_declaration';
    if (isDeclaration && !roots.has(node)) node.score.statements++;
    if (operations.has(node.type) || ['variable_declarator', 'field_definition', 'ternary_expression'].includes(node.type)) node.score.statements++;
    if (node.type === 'empty_statement' && !context.separator) node.score.statements++;
    if (node.type === 'statement_block' && !context.directBlock) node.score.statements++;
    if (node.type === 'class_static_block') node.score.statements++;
    if (context.result && !roots.has(node) && !['ternary_expression', 'parenthesized_expression'].includes(node.type)) node.score.statements++;

    if (node.type === 'for_in_statement') {
      const binding = node.children.find(child => child.field === 'left');
      const hasDeclaration = node.children.some(child => child.field === 'kind' && ['let', 'const', 'var', 'using'].includes(child.type));
      if (binding && hasDeclaration) binding.score.statements++;
    }

    if (node.type === 'expression_statement') {
      const expression = named(node)[0];
      const counted = expression ? visit(expression) : false;
      if (!counted) node.score.statements++;
      return true;
    }

    let counted = operations.has(node.type) || ['ternary_expression', 'class_static_block'].includes(node.type);
    const groupedValue = node.type === 'parenthesized_expression' ? named(node)[0] : null;
    for (const child of node.children) {
      const methodName = node.type === 'method_definition' &&
        ((child.field === 'name' && child.type === 'computed_property_name') || child.field === 'decorator');
      const functionBody = isFunction && child.field === 'body';
      let directBlock = functionBody && child.type === 'statement_block';
      if (node.type === 'if_statement' && child.field === 'consequence') directBlock = true;
      if ((loops.has(node.type) || node.type === 'with_statement') && child.field === 'body') directBlock = true;
      if (node.type === 'else_clause' && child.type === 'statement_block') directBlock = true;
      if (['try_statement', 'catch_clause', 'finally_clause', 'class_static_block'].includes(node.type) && child.type === 'statement_block') directBlock = true;

      let result = functionBody && node.type === 'arrow_function' && child.type !== 'statement_block';
      if (node.type === 'ternary_expression' && ['consequence', 'alternative'].includes(child.field)) result = true;
      if (node.type === 'parenthesized_expression' && context.result && child === groupedValue) result = true;
      const separator = node.type === 'for_statement' && ['initializer', 'condition'].includes(child.field);
      const childCounted = visit(child, {directBlock, result, separator});

      let boundary = (isFunction && !methodName) || ['statement_block', 'variable_declarator', 'class_static_block'].includes(node.type);
      if (node.type === 'field_definition' && child.field !== 'property') boundary = true;
      if (!boundary && childCounted) counted = true;
    }
    return counted;
  }
  visit(prepared.tree);
}
