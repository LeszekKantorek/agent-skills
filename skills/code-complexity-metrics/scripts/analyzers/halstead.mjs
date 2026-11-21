// The body is the starting boundary only for reported functions. A local
// function's declaration, parameters and body are part of the enclosing body.
export function collectHalstead(prepared, source, classify) {
  const occurrences = [];
  let node;
  const operator = (anchor, key) => {
    if (anchor && anchor.startIndex < anchor.endIndex) {
      occurrences.push({node, category: 'operator', key, range: copyRange(anchor)});
    }
  };
  const operand = (kind, anchor = node) => {
    if (anchor.startIndex < anchor.endIndex) {
      const key = source.slice(anchor.startIndex, anchor.endIndex);
      occurrences.push({node, category: 'operand', kind, key, range: copyRange(anchor)});
    }
  };
  const emit = {operator, operand};
  for (const {id, root} of prepared.functions) {
    const body = childField(root, 'body');
    if (!body) continue;
    const stack = [body];
    while (stack.length) {
      node = stack.pop();
      if (prepared.ownerByNode.get(node) !== id) continue;
      const children = classify(node, emit) ?? node.children;
      for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
    }
  }
  return occurrences;
}

export const childField = (node, field) => node.children.find(child => child.field === field);
export const childToken = (node, type) => node?.children.find(child => !child.isNamed && child.type === type);

function copyRange(anchor) {
  const {startIndex, endIndex, startPosition, endPosition} = anchor;
  return {startIndex, endIndex, startPosition: {...startPosition}, endPosition: {...endPosition}};
}
