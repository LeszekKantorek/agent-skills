import ts from '../../../vendor/tree-sitter/tree-sitter.js';
import {parseMacroArguments, hasMetavariable} from './macro-arguments.mjs';

// Probe patterns independently; the synthetic match never enters the AST.
function pattern(language, content, start, copy) {
  const prefix = 'fn __fragment(){ match __value { ', suffix = ' => () } }';
  const parser = new ts.Parser(); let tree;
  try {
    parser.setLanguage(language); tree = parser.parse(prefix + content + suffix);
    const bad = n => n.type === 'ERROR' || n.isMissing || n.children.some(bad);
    const fn = tree.rootNode.namedChild(0), body = fn?.childForFieldName('body');
    const items = body?.namedChildren.filter(n => !n.type.endsWith('_comment'));
    const expression = items?.length === 1 ? items[0] : null;
    const match = expression?.type === 'expression_statement' ? expression.namedChild(0) : expression;
    const block = match?.childForFieldName('body');
    const arms = block?.namedChildren.filter(n => !n.type.endsWith('_comment'));
    const arm = arms?.length === 1 ? arms[0] : null, pat = arm?.childForFieldName('pattern');
    const value = arm?.childForFieldName('value');
    const parts = arm?.children.filter(n => !n.type.endsWith('_comment'));
    if (bad(tree.rootNode) || tree.rootNode.namedChildCount !== 1 || tree.rootNode.endIndex !== prefix.length + content.length + suffix.length || fn?.type !== 'function_item' || match?.type !== 'match_expression' || match.childForFieldName('value')?.text !== '__value' || arm?.type !== 'match_arm' || !pat || pat.childForFieldName('condition') || pat.startIndex !== prefix.length || pat.endIndex !== prefix.length + content.length || hasMetavariable(pat) || value?.type !== 'unit_expression' || parts?.length !== 3 || parts[0].id !== pat.id || parts[1].type !== '=>' || parts[1].startIndex !== prefix.length + content.length + 1 || parts[2].id !== value.id) return null;
    return copy(pat, 'pattern', start - prefix.length);
  } finally { tree?.delete(); parser.delete(); }
}

export function parseMacroArms(language, tokenTree, source, offset, copy) {
  const tokens = tokenTree.children.slice(1, -1).filter(n => !n.type.endsWith('_comment'));
  if (!tokens.length) return null;
  const start = i => tokens[i].startIndex + offset, end = i => tokens[i].endIndex + offset;
  const expr = (a, b, cb = (_n, field) => field) => {
    const result = parseMacroArguments(language, source.slice(a, b), a, cb, {single:true});
    return result && result.filter(x => (typeof x === 'string' ? x : x?.field) === 'argument').length === 1 ? result : null;
  };
  const blockExpr = (a, b) => {
    const result = parseMacroArguments(language, source.slice(a, b), a,
      (node, field) => field === 'argument' ? node.type : null, {single:true});
    return result?.filter(Boolean).length === 1 && result.includes('block');
  };
  const beginsArm = pos => {
    for (let j = pos + 1; j < tokens.length; j++) {
      if (tokens[j].type === '=>') return -1;
      if (tokens[j].type === '=' && pattern(language, source.slice(start(pos), end(j-1)), start(pos), () => true)) return j;
    }
    return -1;
  };
  const plans = []; let i = 0;
  while (i < tokens.length) {
    let binding = -1, arrow = -1;
    for (let j = i + 1; j < tokens.length; j++) {
      if (tokens[j].type === '=>') break;
      if (tokens[j].type === '=' && pattern(language, source.slice(start(i), end(j-1)), start(i), () => true)) { binding = j; break; }
    }
    if (binding < 0) return null;
    for (let j = binding + 2; j < tokens.length; j++) {
      if (tokens[j].type === '=>' && expr(start(binding+1), end(j-1))) { arrow = j; break; }
    }
    if (arrow < 0 || arrow + 1 >= tokens.length) return null;
    const first = arrow + 1; let last = -1, next = -1;
    for (let j = first + 1; j <= tokens.length; j++) {
      const comma = j < tokens.length && tokens[j].type === ',';
      const candidate = tokens[j-1];
      const block = candidate.type === 'token_tree' && candidate.firstChild?.type === '{' && blockExpr(start(first), end(j-1));
      if (j !== tokens.length && !comma && !block) continue;
      const candidateNext = comma ? j + 1 : j;
      const nextBinding = candidateNext < tokens.length ? beginsArm(candidateNext) : -1;
      if (candidateNext < tokens.length && nextBinding < 0) continue;
      if (tokens[j-1].type === ',' || !expr(start(first), end(j-1))) continue;
      last = j - 1; next = comma ? j + 1 : j; break;
    }
    if (last < 0 || (next < tokens.length && tokens[next].type === ',')) return null;
    plans.push({pa:start(i), pb:end(binding-1), ia:start(binding+1), ib:end(arrow-1), ba:start(first), bb:end(last)});
    i = next;
  }
  const out = [];
  for (const p of plans) {
    out.push(pattern(language, source.slice(p.pa,p.pb), p.pa, copy));
    for (const [a,b,role] of [[p.ia,p.ib,'input'], [p.ba,p.bb,'body']]) {
      const children = expr(a,b,copy);
      for (const child of children) { if (child.field === 'argument') child.field = role; out.push(child); }
    }
  }
  return out;
}
