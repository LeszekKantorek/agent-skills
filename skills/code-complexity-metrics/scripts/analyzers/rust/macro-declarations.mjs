import ts from '../../../vendor/tree-sitter/tree-sitter.js';
import {hasMetavariable} from './macro-arguments.mjs';

// Parse the entire input as source items. The probe introduces no scored nodes.
export function parseMacroDeclarations(language, tokenTree, source, offset, copy) {
  const start = tokenTree.startIndex + offset + 1, end = tokenTree.endIndex + offset - 1;
  const content = source.slice(start, end);
  const parser = new ts.Parser(); let tree;
  try {
    parser.setLanguage(language);
    tree = parser.parse(content);
    const root = tree.rootNode;
    const bad = n => n.type === 'ERROR' || n.isMissing || n.children.some(bad);
    if (bad(root) || content.slice(0, root.startIndex).trim() !== '' || content.slice(root.endIndex).trim() !== '') return null;
    const selected = []; let pendingAttribute = false, declarations = 0;
    for (const node of root.namedChildren) {
      if (node.type.endsWith('_comment')) {
        if (node.namedChildren.some(child => child.type === 'inner_doc_comment_marker')) return null;
        if (node.namedChildren.some(child => child.type === 'outer_doc_comment_marker')) pendingAttribute = true;
        selected.push([node, null]); continue;
      }
      if (hasMetavariable(node)) return null;
      if (node.type === 'attribute_item') { selected.push([node, null]); pendingAttribute = true; continue; }
      if (!['static_item', 'const_item'].includes(node.type) || !node.childForFieldName('name') || !node.childForFieldName('type') || !node.childForFieldName('value') || node.lastChild?.type !== ';') return null;
      // Direct doc comments are attributes, not arbitrary trivia. Only the
      // initializer's attribute boundary can occur inside a declaration.
      const value = node.childForFieldName('value');
      const equals = node.children.find(child => child.type === '=');
      for (const child of node.children) {
        if (!child.type.endsWith('_comment')) continue;
        if (child.namedChildren.some(marker => marker.type === 'inner_doc_comment_marker')) return null;
        if (child.namedChildren.some(marker => marker.type === 'outer_doc_comment_marker') &&
            (!equals || child.startIndex < equals.endIndex || child.endIndex > value.startIndex)) return null;
      }
      selected.push([node, 'declaration']); declarations++; pendingAttribute = false;
    }
    if (!declarations || pendingAttribute) return null;
    return selected.map(([node, field]) => copy(node, field, start));
  } finally { tree?.delete(); parser.delete(); }
}
