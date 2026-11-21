export const field = (node, name) => node?.children.find(child => child.field === name);
export const named = node => node.children.filter(child => child.isNamed &&
  !['comment', 'html_comment', 'line_comment', 'block_comment'].includes(child.type));
export const spelling = (file, node) => node && file.source.slice(node.startIndex, node.endIndex);

export function unwrapParentheses(node) {
  while (node?.type === 'parenthesized_expression' && named(node).length === 1) {
    node = named(node)[0];
  }
  return node;
}

export function addBinding(bindings, name, binding) {
  if (!name) return;
  const previous = bindings.get(name);
  if (previous) previous.push(binding);
  else bindings.set(name, [binding]);
}

export const unresolved = (reason, mayTargetInput = true) => ({reason, mayTargetInput});
export const resolved = target => ({target});

export function definition(file, node, label, context = null, anchor = field(node, 'name')) {
  return {
    id: JSON.stringify([file.language, file.identity, context, node.startIndex, node.endIndex]),
    fileId: file.fileId, node, anchor, label, owner: file.analysis.ownerByNode.get(node),
  };
}
