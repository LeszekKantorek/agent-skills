import ts from '../../../vendor/tree-sitter/tree-sitter.js';

// Build an independent syntax probe from CST document markers. Nested macro
// invocations and macro definitions are analyzed at their own boundaries.
// Query the original CST for expression *roles*, rather than classifying node
// types: identifiers and literals can also be patterns or types.
const expressionQueries = new WeakMap();
export function collectExpressionDocs(node, offset, positions, macroBoundaries) {
  const language=node.tree.language;
  let query=expressionQueries.get(language);
  if (!query) { query=new ts.Query(language, '(_expression) @expression'); expressionQueries.set(language,query); }
  function visit(n) {
    if (n.type==='macro_definition' || n.type==='macro_invocation') { macroBoundaries.push([n.startIndex+offset,n.endIndex+offset]); return; }
    for (const child of n.children) visit(child);
  }
  visit(node);
  // The parent is required for the query to distinguish the grammar role of
  // the selected root. Restrict captures to the original selected subtree.
  for (const {node: expression} of query.captures(node.parent ?? node)) {
    if (expression.startIndex < node.startIndex || expression.endIndex > node.endIndex) continue;
    if (macroBoundaries.some(([a,b])=>expression.startIndex+offset>=a && expression.endIndex+offset<=b && (expression.startIndex+offset>a || expression.endIndex+offset<b))) continue;
    const siblings=expression.parent?.children ?? [], index=siblings.findIndex(c=>c.id===expression.id);
    for (let i=index-1;i>=0;i--) {
      const previous=siblings[i];
      if (previous.type==='attribute_item') continue;
      if (!previous.type.endsWith('_comment')) break;
      if (previous.namedChildren.some(c=>c.type==='outer_doc_comment_marker')) positions.add(previous.startIndex+offset);
    }
  }
}
// Build an independent syntax probe from CST document markers. Nested macro
// invocations and macro definitions are analyzed at their own boundaries.
export function docAttributeProbe(language, tokenTree, source, offset, validate, expressionDocs = new Set(), macroBoundaries = []) {
  const start=tokenTree.startIndex+offset, end=tokenTree.endIndex+offset, replacements=[];
  function visit(node) {
    if (node.type.endsWith('_comment')) {
      const marker=node.namedChildren.find(n=>n.type==='outer_doc_comment_marker'||n.type==='inner_doc_comment_marker');
      if (marker) replacements.push({start:node.startIndex+offset,end:node.endIndex+offset,text:expressionDocs.has(node.startIndex+offset)?'/* doc */':marker.type==='outer_doc_comment_marker'?'#[doc=""]\n':'#![doc=""]\n'});
      return;
    }
    if (macroBoundaries.some(([a,b]) => node.startIndex+offset>=a && node.endIndex+offset<=b)) return;
    for (const child of node.children) visit(child);
  }
  visit(tokenTree);
  if(!replacements.length) return true;
  let text=source.slice(start,end);
  for(const r of replacements.reverse()) text=text.slice(0,r.start-start)+r.text+text.slice(r.end-start);
  const prefix='fn __doc_probe(){m!', suffix=';}'; const parser=new ts.Parser(); let tree;
  try {
    parser.setLanguage(language); tree=parser.parse(prefix+text+suffix);
    const root=tree.rootNode, bad=n=>n.type==='ERROR'||n.isMissing||n.children.some(bad);
    if(bad(root)) return false;
    const fn=root.namedChild(0), body=fn?.childForFieldName('body'), stmt=body?.namedChildren[0], macro=stmt?.namedChildren[0], token=macro?.children.find(n=>n.type==='token_tree');
    if(root.namedChildCount!==1||body?.namedChildCount!==1||macro?.type!=='macro_invocation'||!token||token.startIndex!==prefix.length||token.endIndex!==prefix.length+text.length) return false;
    return validate(token,prefix+text+suffix,0);
  } finally { tree?.delete(); parser.delete(); }
}
