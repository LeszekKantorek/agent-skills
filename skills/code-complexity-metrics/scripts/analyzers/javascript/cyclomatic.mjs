const loops = new Set(['for_statement', 'for_in_statement', 'while_statement', 'do_statement']);
const decisions = new Set(['if_statement', 'ternary_expression', 'switch_case', 'switch_default', ...loops]);

export function cyclomatic(prepared) {
  const roots = new Set(prepared.functions.map(fn => fn.root));
  function visit(node) {
    if (roots.has(node)) node.score.cyclomatic++;
    if (decisions.has(node.type)) node.score.cyclomatic++;
    if (node.type === 'binary_expression') {
      const operator = node.children.find(child => child.field === 'operator');
      if (operator && ['&&', '||', '??'].includes(operator.type)) operator.score.cyclomatic++;
    }
    for (const child of node.children) visit(child);
  }
  visit(prepared.tree);
}
