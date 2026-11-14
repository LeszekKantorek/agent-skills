import ts from '../../../vendor/tree-sitter/tree-sitter.js';
import {parseMacroArguments, hasMetavariable} from './macro-arguments.mjs';

// Parse the complete list once; the tuple and alias exist only in this probe.
export function parseMacroTypes(language, tokenTree, source, offset, copy) {
  const start = tokenTree.startIndex + offset + 1, end = tokenTree.endIndex + offset - 1;
  const content = source.slice(start, end);
  const prefix = 'type __Fragment = (\n', suffix = '\n);';
  const parser = new ts.Parser(); let tree;
  try {
    parser.setLanguage(language);
    tree = parser.parse(prefix + content + suffix);
    const root = tree.rootNode, item = root.namedChild(0), tuple = item?.childForFieldName('type');
    const bad = n => n.type === 'ERROR' || n.isMissing || n.children.some(bad);
    if (bad(root) || root.namedChildCount !== 1 || root.startIndex !== 0 || root.endIndex !== prefix.length + content.length + suffix.length || item?.type !== 'type_item' || item.startIndex !== 0 || item.endIndex !== root.endIndex || item.childForFieldName('name')?.text !== '__Fragment' || tuple?.type !== 'tuple_type' || tuple.startIndex !== prefix.length - 2 || tuple.endIndex !== prefix.length + content.length + 2 || tuple.firstChild?.type !== '(' || tuple.lastChild?.type !== ')') return null;
    const types = []; let expectType = true;
    for (const node of tuple.children.slice(1, -1)) {
      if (node.startIndex < prefix.length || node.endIndex > prefix.length + content.length) return null;
      if (node.type.endsWith('_comment')) continue;
      if (expectType) {
        if (!node.isNamed || hasMetavariable(node)) return null;
        types.push(node); expectType = false;
      } else {
        if (node.type !== ',') return null;
        expectType = true;
      }
    }
    if (!types.length) return null;
    let witness = false;
    for (const node of types) {
      const a = start + node.startIndex - prefix.length, b = start + node.endIndex - prefix.length;
      const text = source.slice(a, b);
      const expr = parseMacroArguments(language, text, a, (_n, field) => field, {single: true});
      if (!expr || expr.filter(x => x === 'argument').length !== 1) { witness = true; break; }
    }
    if (!witness) return null;
    return types.map(node => copy(node, 'type', start - prefix.length));
  } finally { tree?.delete(); parser.delete(); }
}
