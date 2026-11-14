import {parseMacroArguments} from './macro-arguments.mjs';

// Token-tree separators are candidates; the expression parser validates each
// entire span, including commas that may belong to closures or type syntax.
export function parseMacroSemicolons(language, tokenTree, source, offset, copy) {
  const separators = tokenTree.children.slice(1, -1).filter(n => n.type === ';');
  if (!separators.length) return null;
  const start = tokenTree.startIndex + offset + 1, end = tokenTree.endIndex + offset - 1;
  const boundaries = [start, ...separators.map(n => n.startIndex + offset), end];
  const spans = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const a = boundaries[i] + (i ? 1 : 0), b = boundaries[i + 1];
    const content = source.slice(a, b);
    const parsed = parseMacroArguments(language, content, a, (_node, field) => field, {single: true});
    if (!parsed || parsed.filter(field => field === 'argument').length !== 1) return null;
    spans.push([a, b]);
  }
  return spans.flatMap(([a, b]) => parseMacroArguments(language, source.slice(a, b), a, copy, {single: true}));
}
