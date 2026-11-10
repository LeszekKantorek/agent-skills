export const functionTypes = new Set([
  'function_item', 'closure_expression', 'function_declaration', 'function_expression',
  'generator_function_declaration', 'generator_function', 'arrow_function', 'method_definition',
]);
const opaque = new Set(['macro_invocation', 'macro_definition']);

export function outerFunctions(root) {
  const result = [];
  function visit(node) {
    if (opaque.has(node.type)) return;
    if (functionTypes.has(node.type)) { result.push(node); return; }
    for (const child of node.namedChildren) visit(child);
  }
  visit(root);
  return result;
}

export function functionName(node) {
  const own = node.childForFieldName('name');
  if (own) return own.text;
  let value = node;
  while (value.parent?.type === 'parenthesized_expression') value = value.parent;
  const parent = value.parent;
  if (parent?.type === 'variable_declarator' && parent.childForFieldName('value')?.id === value.id) {
    const name = parent.childForFieldName('name');
    if (name?.type === 'identifier') return name.text;
  }
  if (parent?.type === 'let_declaration' && parent.childForFieldName('value')?.id === value.id) {
    const name = parent.childForFieldName('pattern');
    if (name?.type === 'identifier') return name.text;
  }
  return null;
}
