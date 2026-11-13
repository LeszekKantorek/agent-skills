import ts from '../../../vendor/tree-sitter/tree-sitter.js';

const prefix = 'fn __fragment(){ __capture(\n';
const suffix = '\n); }';

// Parse the entire wrapper, not merely a valid prefix of its argument list.
export function parseMacroArguments(language, content, contentStart, copy) {
  const parser = new ts.Parser();
  let tree;
  try {
    parser.setLanguage(language);
    tree = parser.parse(prefix + content + suffix);
    const root = tree.rootNode;
    const bad = n => n.type === 'ERROR' || n.isMissing || n.children.some(bad);
    if (bad(root) || root.namedChildCount !== 1) return null;
    const fn = root.namedChild(0), body = fn.childForFieldName('body');
    const bodyNodes = body?.namedChildren.filter(n => !n.type.endsWith('_comment'));
    if (root.startIndex !== 0 || root.endIndex !== prefix.length + content.length + suffix.length || fn.startIndex !== 0 || fn.endIndex !== root.endIndex || fn.type !== 'function_item' || fn.childForFieldName('name')?.text !== '__fragment' || !body || bodyNodes.length !== 1) return null;
    const statement = bodyNodes[0], call = statement.namedChildren[0];
    if (statement.type !== 'expression_statement' || statement.namedChildCount !== 1 || call?.type !== 'call_expression' || call.childForFieldName('function')?.text !== '__capture') return null;
    const args = call.childForFieldName('arguments');
    const start = prefix.length, end = start + content.length;
    if (!args || args.startIndex !== start - 2 || args.endIndex !== end + 2 || statement.endIndex !== end + 3 || body.endIndex !== end + suffix.length) return null;
    const elements = args.children.slice(1, -1);
    let expectExpression = true;
    let pendingAttribute = false;
    const selected = [];
    for (const element of elements) {
      if (element.startIndex < start || element.endIndex > end) return null;
      if (element.type.endsWith('_comment')) { selected.push([element, null]); continue; }
      if (expectExpression) {
        if (element.type === 'attribute_item') {
          selected.push([element, null]);
          pendingAttribute = true;
          continue;
        }
        if (!element.isNamed) return null;
        selected.push([element, 'argument']);
        pendingAttribute = false;
        expectExpression = false;
      } else {
        if (element.type !== ',') return null;
        expectExpression = true;
      }
    }
    if (pendingAttribute) return null;
    return selected.map(([element, field]) => copy(element, field, contentStart - start));
  } finally {
    tree?.delete();
    parser.delete();
  }
}



