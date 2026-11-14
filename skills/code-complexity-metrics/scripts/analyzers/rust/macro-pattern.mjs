import ts from '../../../vendor/tree-sitter/tree-sitter.js';
import {parseMacroArguments, hasMetavariable} from './macro-arguments.mjs';

// The original token tree supplies candidate separators. The match wrapper is
// only a grammar probe; none of its selector, arm or delimiters are copied.
export function parseMacroPattern(language, tokenTree, source, offset, copy) {
  const tokens = tokenTree.children.slice(1, -1).filter(n => !n.type.endsWith('_comment'));
  const prefix = 'fn __fragment(){ match __value {\n', suffix = '\n=> () } }';
  const endToken = tokens.at(-1)?.type === ',' ? tokens.length - 1 : tokens.length;
  const bad = n => n.type === 'ERROR' || n.isMissing || n.children.some(bad);
  for (let i = 1; i < endToken - 1; i++) {
    if (tokens[i].type !== ',' || tokens[i-1].type === ',' || tokens[i+1].type === ',') continue;
    const a = tokens[0].startIndex + offset, b = tokens[i-1].endIndex + offset;
    const c = tokens[i+1].startIndex + offset, d = tokens[endToken-1].endIndex + offset;
    const expression = parseMacroArguments(language, source.slice(a, b), a, (_n, field) => field);
    if (!expression || expression.filter(f => f === 'argument').length !== 1) continue;
    const content = source.slice(c, d), parser = new ts.Parser();
    let tree;
    try {
      parser.setLanguage(language);
      tree = parser.parse(prefix + content + suffix);
      const root = tree.rootNode;
      if (bad(root) || root.namedChildCount !== 1 || root.endIndex !== prefix.length + content.length + suffix.length) continue;
      const fn = root.namedChild(0), body = fn.childForFieldName('body');
      const statement = body?.namedChildren.filter(n => !n.type.endsWith('_comment'));
      const match = statement?.length === 1 && statement[0].namedChildCount === 1 ? statement[0].namedChild(0) : null;
      const block = match?.childForFieldName('body');
      const arms = block?.namedChildren.filter(n => !n.type.endsWith('_comment'));
      const arm = arms?.length === 1 ? arms[0] : null;
      const pattern = arm?.childForFieldName('pattern'), value = arm?.childForFieldName('value');
      if (fn.type !== 'function_item' || fn.childForFieldName('name')?.text !== '__fragment' || match?.type !== 'match_expression' || match.childForFieldName('value')?.text !== '__value' || arm?.type !== 'match_arm' || !pattern || value?.type !== 'unit_expression' || value.startIndex !== prefix.length + content.length + 4 || pattern.startIndex < prefix.length || pattern.endIndex > prefix.length + content.length) continue;
      const significant = arm.children.filter(n => !n.type.endsWith('_comment'));
      if (significant.length !== 3 || significant[0].id !== pattern.id || significant[1].type !== '=>' || significant[1].startIndex !== prefix.length + content.length + 1 || significant[2].id !== value.id) continue;
      // Everything supplied by the original fragment must be either the
      // pattern (including its guard), a comment, or whitespace. In particular,
      // attributes attached to the synthetic arm must not disappear.
      const spans = [pattern, ...block.children.filter(n => n.type.endsWith('_comment')), ...arm.children.filter(n => n.type.endsWith('_comment'))]
        .filter(n => n.startIndex >= prefix.length && n.endIndex <= prefix.length + content.length)
        .sort((x,y) => x.startIndex - y.startIndex);
      let cursor = prefix.length, covered = true;
      const wrapped = prefix + content + suffix;
      for (const span of spans) {
        if (span.startIndex < cursor || wrapped.slice(cursor, span.startIndex).trim()) { covered = false; break; }
        cursor = span.endIndex;
      }
      if (!covered || wrapped.slice(cursor, prefix.length + content.length).trim()) continue;
      const guard = pattern.childForFieldName('condition');
      if (hasMetavariable(pattern)) continue;
      const actual = pattern.namedChildren.filter(n => !n.type.endsWith('_comment') && (!guard || n.startIndex !== guard.startIndex));
      // Follow only pattern nodes. A const expression inside a pattern can
      // contain its own match, whose fields say nothing about this pattern.
      const structural = n => n.type === 'field_pattern' || n.type === 'remaining_field_pattern' || (n.type.endsWith('_pattern') && n.children.some(structural));
      if (actual.length !== 1 || !structural(actual[0])) continue;
      const recovered = parseMacroArguments(language, source.slice(a, b), a, copy);
      const shift = c - prefix.length;
      recovered.push(copy(actual[0], 'pattern', shift));
      if (guard) recovered.push(copy(guard, 'guard', shift));
      return recovered;
    } finally { tree?.delete(); parser.delete(); }
  }
  return null;
}
