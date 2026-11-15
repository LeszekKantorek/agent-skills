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

function readExpression(language, source, start, end, copy = (_node, field) => field) {
  const result = parseMacroArguments(language, source.slice(start, end), start, copy, {single: true});
  return result && result.filter(x => (typeof x === 'string' ? x : x?.field) === 'argument').length === 1 ? result : null;
}

function isBlockExpression(language, source, start, end) {
  const result = parseMacroArguments(language, source.slice(start, end), start,
    (node, field) => field === 'argument' ? node.type : null, {single: true});
  return result?.filter(Boolean).length === 1 && result.includes('block');
}

function findBinding(tokens, first, read) {
  for (let j = first + 1; j < tokens.length; j++) {
    if (tokens[j].type === '=>') return -1;
    if (tokens[j].type === '=' && read.pattern(read.start(first), read.end(j - 1), () => true)) return j;
  }
  return -1;
}

function findInputArrow(tokens, binding, read) {
  for (let j = binding + 2; j < tokens.length; j++) {
    if (tokens[j].type === '=>' && read.expression(read.start(binding + 1), read.end(j - 1))) return j;
  }
  return -1;
}

function findBodyBoundary(tokens, first, read) {
  for (let j = first + 1; j <= tokens.length; j++) {
    const comma = j < tokens.length && tokens[j].type === ',';
    const candidate = tokens[j - 1];
    const block = candidate.type === 'token_tree' && candidate.firstChild?.type === '{' &&
      read.isBlock(read.start(first), read.end(j - 1));
    if (j !== tokens.length && !comma && !block) continue;
    const next = comma ? j + 1 : j;
    if (next < tokens.length && findBinding(tokens, next, read) < 0) continue;
    if (candidate.type === ',' || !read.expression(read.start(first), read.end(j - 1))) continue;
    return {last: j - 1, next};
  }
  return null;
}

function planArms(tokens, read) {
  const plans = [];
  let first = 0;
  while (first < tokens.length) {
    const binding = findBinding(tokens, first, read);
    if (binding < 0) return null;
    const arrow = findInputArrow(tokens, binding, read);
    if (arrow < 0 || arrow + 1 >= tokens.length) return null;
    const body = findBodyBoundary(tokens, arrow + 1, read);
    if (!body || (body.next < tokens.length && tokens[body.next].type === ',')) return null;
    plans.push({
      pattern: [read.start(first), read.end(binding - 1)],
      input: [read.start(binding + 1), read.end(arrow - 1)],
      body: [read.start(arrow + 1), read.end(body.last)],
    });
    first = body.next;
  }
  return plans;
}

function appendExpression(out, children, role) {
  for (const child of children) {
    if (child.field === 'argument') child.field = role;
    out.push(child);
  }
}

function copyArms(plans, read, copy) {
  const out = [];
  for (const {pattern, input, body} of plans) {
    out.push(read.pattern(...pattern, copy));
    appendExpression(out, read.expression(...input, copy), 'input');
    appendExpression(out, read.expression(...body, copy), 'body');
  }
  return out;
}

export function parseMacroArms(language, tokenTree, source, offset, copy) {
  const tokens = tokenTree.children.slice(1, -1).filter(n => !n.type.endsWith('_comment'));
  if (!tokens.length) return null;
  const read = {
    start: i => tokens[i].startIndex + offset,
    end: i => tokens[i].endIndex + offset,
    pattern: (start, end, callback) => pattern(language, source.slice(start, end), start, callback),
    expression: (start, end, callback) => readExpression(language, source, start, end, callback),
    isBlock: (start, end) => isBlockExpression(language, source, start, end),
  };
  const plans = planArms(tokens, read);
  if (!plans) return null;
  return copyArms(plans, read, copy);
}
