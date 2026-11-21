import ts from '../../../vendor/tree-sitter/tree-sitter.js';
import {parseMacroArguments, hasMetavariable} from './macro-arguments.mjs';

const prefix = 'fn __fragment(){ match __value {\n';
const suffix = '\n=> () } }';

const isComment = node => node.type.endsWith('_comment');
const isSignificant = node => !isComment(node);

function hasInvalidSyntax(node) {
  return node.type === 'ERROR' || node.isMissing || node.children.some(hasInvalidSyntax);
}

function onlySignificantNamedChild(node) {
  const children = node?.namedChildren.filter(isSignificant);
  return children?.length === 1 ? children[0] : null;
}

function isCandidateSeparator(tokens, index) {
  return tokens[index].type === ',' && tokens[index - 1].type !== ',' && tokens[index + 1].type !== ',';
}

function parseProbeArm(root, wrapped, fragmentEnd) {
  if (hasInvalidSyntax(root) || root.namedChildCount !== 1 || root.endIndex !== wrapped.length) return null;

  const fn = root.namedChild(0);
  const statement = onlySignificantNamedChild(fn.childForFieldName('body'));
  const match = statement?.namedChild(0);
  const block = match?.childForFieldName('body');
  const arm = onlySignificantNamedChild(block);
  if (fn.type !== 'function_item' || fn.childForFieldName('name')?.text !== '__fragment'
      || statement?.namedChildCount !== 1 || match?.type !== 'match_expression'
      || match.childForFieldName('value')?.text !== '__value' || arm?.type !== 'match_arm') return null;

  const pattern = arm.childForFieldName('pattern');
  const value = arm.childForFieldName('value');
  if (!pattern || pattern.startIndex < prefix.length || pattern.endIndex > fragmentEnd
      || value?.type !== 'unit_expression' || value.startIndex !== fragmentEnd + 4) return null;

  const children = arm.children.filter(isSignificant);
  const [armPattern, arrow, armValue] = children;
  if (children.length !== 3 || armPattern.id !== pattern.id || arrow.type !== '=>'
      || arrow.startIndex !== fragmentEnd + 1 || armValue.id !== value.id) return null;
  return {block, arm, pattern};
}

// Everything in the fragment must be covered by the pattern (including its
// guard), comments, or whitespace. Attributes on the synthetic arm cannot disappear.
function coversFragment(wrapped, fragmentEnd, {block, arm, pattern}) {
  const isFragmentSpan = node => node.startIndex >= prefix.length && node.endIndex <= fragmentEnd;
  const comments = [...block.children.filter(isComment), ...arm.children.filter(isComment)];
  const spans = [pattern, ...comments.filter(isFragmentSpan)].sort((left, right) => left.startIndex - right.startIndex);
  let cursor = prefix.length;
  for (const span of spans) {
    if (span.startIndex < cursor || wrapped.slice(cursor, span.startIndex).trim()) return false;
    cursor = span.endIndex;
  }
  return wrapped.slice(cursor, fragmentEnd).trim() === '';
}

// Follow pattern nodes only. A const expression can contain its own match.
function isStructuralPattern(node) {
  return node.type === 'field_pattern' || node.type === 'remaining_field_pattern'
    || (node.type.endsWith('_pattern') && node.children.some(isStructuralPattern));
}

function recoverPattern(language, content, patternStart, expressionText, expressionStart, copy) {
  const wrapped = prefix + content + suffix;
  const fragmentEnd = prefix.length + content.length;
  const parser = new ts.Parser();
  let tree;
  try {
    parser.setLanguage(language);
    tree = parser.parse(wrapped);
    const probe = parseProbeArm(tree.rootNode, wrapped, fragmentEnd);
    if (!probe || !coversFragment(wrapped, fragmentEnd, probe)) return null;

    const {pattern} = probe;
    const guard = pattern.childForFieldName('condition');
    if (hasMetavariable(pattern)) return null;
    const isPatternChild = node => isSignificant(node) && node.startIndex !== guard?.startIndex;
    const actual = pattern.namedChildren.filter(isPatternChild);
    if (actual.length !== 1 || !isStructuralPattern(actual[0])) return null;

    const recovered = parseMacroArguments(language, expressionText, expressionStart, copy);
    const shift = patternStart - prefix.length;
    recovered.push(copy(actual[0], 'pattern', shift));
    if (guard) recovered.push(copy(guard, 'guard', shift));
    return recovered;
  } finally {
    tree?.delete();
    parser.delete();
  }
}

// Try each eligible separator in token order. The match wrapper is only a
// grammar probe; none of its selector, arm or delimiters are copied.
export function parseMacroPattern(language, tokenTree, source, offset, copy) {
  const tokens = tokenTree.children.slice(1, -1).filter(isSignificant);
  const tokenCount = tokens.at(-1)?.type === ',' ? tokens.length - 1 : tokens.length;
  for (let i = 1; i < tokenCount - 1; i++) {
    if (!isCandidateSeparator(tokens, i)) continue;
    const expressionStart = tokens[0].startIndex + offset;
    const expressionEnd = tokens[i - 1].endIndex + offset;
    const expressionText = source.slice(expressionStart, expressionEnd);
    const fields = parseMacroArguments(language, expressionText, expressionStart, (_node, field) => field);
    if (!fields || fields.filter(field => field === 'argument').length !== 1) continue;

    const patternStart = tokens[i + 1].startIndex + offset;
    const patternEnd = tokens[tokenCount - 1].endIndex + offset;
    const recovered = recoverPattern(language, source.slice(patternStart, patternEnd), patternStart, expressionText, expressionStart, copy);
    if (recovered) return recovered;
  }
  return null;
}
