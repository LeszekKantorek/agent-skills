const functions = new Set(['function_expression', 'function_declaration', 'generator_function', 'generator_function_declaration', 'arrow_function', 'method_definition']);
const loops = new Set(['for_statement', 'for_in_statement', 'while_statement', 'do_statement']);
const operator = node => node.children.find(child => child.field === 'operator');
const isLogical = node => node.type === 'binary_expression' && ['&&', '||'].includes(operator(node)?.type);

export function cognitive(prepared) {
  const roots = new Set(prepared.functions.map(fn => fn.root));
  function visit(node, depth = 0, sequence = null, elseIf = false) {
    const isFunction = functions.has(node.type);
    const localDepth = isFunction ? (roots.has(node) ? 0 : depth + 1) : depth;
    if (node.type === 'if_statement') node.score.cognitive += elseIf ? 1 : 1 + localDepth;
    if (loops.has(node.type) || ['switch_statement', 'catch_clause', 'ternary_expression'].includes(node.type)) node.score.cognitive += 1 + localDepth;
    if (node.type === 'else_clause' && !node.children.some(child => child.type === 'if_statement')) node.score.cognitive++;
    if (['break_statement', 'continue_statement'].includes(node.type) && node.children.some(child => child.type === 'statement_identifier')) node.score.cognitive++;

    if (isLogical(node)) {
      const state = sequence || {last: null};
      for (const child of node.children) {
        if (child === operator(node)) {
          if (state.last !== child.type) child.score.cognitive++;
          state.last = child.type;
        } else {
          visit(child, localDepth, state);
        }
      }
      return;
    }
    if (node.type === 'parenthesized_expression' && sequence) {
      for (const child of node.children) visit(child, localDepth, sequence);
      return;
    }
    for (const child of node.children) {
      const methodName = node.type === 'method_definition' &&
        ((child.field === 'name' && child.type === 'computed_property_name') || child.field === 'decorator');
      let nestedBody = node.type === 'if_statement' && child.field === 'consequence';
      if (loops.has(node.type) && child.field === 'body') nestedBody = true;
      if (['switch_case', 'switch_default', 'catch_clause'].includes(node.type) && child.field === 'body') nestedBody = true;
      if (node.type === 'else_clause' && child.type !== 'if_statement' && child.isNamed) nestedBody = true;
      if (node.type === 'ternary_expression' && ['consequence', 'alternative'].includes(child.field)) nestedBody = true;
      const childDepth = (methodName ? depth : localDepth) + (nestedBody ? 1 : 0);
      const childIsElseIf = node.type === 'else_clause' && child.type === 'if_statement';
      visit(child, childDepth, null, childIsElseIf);
    }
  }
  visit(prepared.tree);
}
