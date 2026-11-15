// Recognize nonempty records with string keys using the original token-tree
// boundaries. Values are validated by the existing complete-expression parser.
import {parseMacroArguments} from './macro-arguments.mjs';

export function parseMacroRecord(language, tokenTree, source, offset, copy, makeNode) {
  const outer = contentTokens(tokenTree);
  const hasRecordArgument = outer.length === 1 || (outer.length === 2 && outer[1].type === ',');
  if (!hasRecordArgument || !isBraced(outer[0])) return null;

  const context = {language, source, offset, copy, makeNode};
  const plan = planRecord(outer[0], context);
  if (!plan) return null;
  return [buildRecord(plan, 'argument', context)];
}

function contentTokens(node) {
  return node.children.slice(1, -1).filter(child => !child.type.endsWith('_comment'));
}

function isBraced(node) {
  return node?.type === 'token_tree' && node.firstChild?.type === '{' && node.lastChild?.type === '}';
}

function isStringKey(token, {source, offset}) {
  if (!['string_literal', 'raw_string_literal'].includes(token?.type)) return false;
  // Tree-sitter uses the same node kinds for ordinary, byte and C strings.
  return /^(?:"|r#*")/.test(source.slice(token.startIndex + offset, token.endIndex + offset));
}

function planRecord(node, context) {
  const tokens = contentTokens(node);
  if (!tokens.length) return null;
  if (tokens.some((token, i) => token.type === ',' && tokens[i + 1]?.type === ',')) return null;

  const entries = [];
  let i = 0;
  while (i < tokens.length) {
    const key = tokens[i];
    if (!isStringKey(key, context) || tokens[i + 1]?.type !== ':') return null;
    const entry = findFieldValue(tokens, i + 2, context);
    if (!entry) return null;
    entries.push({key, value: entry.value, endIndex: entry.endIndex});
    i = entry.next;
  }
  return {node, entries};
}

function findFieldValue(tokens, first, context) {
  const {offset} = context;
  for (let end = first + 1; end <= tokens.length; end++) {
    if (end < tokens.length && tokens[end].type !== ',') continue;
    // A separator belongs to the record, never to its single value.
    if (tokens[end - 1].type === ',') continue;
    if (end + 1 < tokens.length && (!isStringKey(tokens[end + 1], context) || tokens[end + 2]?.type !== ':')) continue;
    const startIndex = tokens[first].startIndex + offset;
    const endIndex = tokens[end - 1].endIndex + offset;
    const nested = end === first + 1 && isBraced(tokens[first]) ? planRecord(tokens[first], context) : null;
    if (!nested && !isOneExpression(startIndex, endIndex, context)) continue;
    // A complete value fixes the boundary even if a later field fails.
    return {value: nested || {startIndex, endIndex}, endIndex, next: end + 1};
  }
  return null;
}

function isOneExpression(start, end, {language, source}) {
  const parsed = parseMacroArguments(language, source.slice(start, end), start, (_n, field) => field);
  return parsed?.filter(field => field === 'argument').length === 1;
}

function buildRecord({node, entries}, field, context) {
  const {makeNode, offset} = context;
  const result = makeNode('macro_record', field, node.startIndex + offset, node.endIndex + offset);
  for (const entry of entries) {
    const pair = buildField(entry, context);
    result.children.push(pair);
  }
  return result;
}

function buildField({key, value, endIndex}, context) {
  const {makeNode, copy, offset} = context;
  const pair = makeNode('macro_record_field', 'field', key.startIndex + offset, endIndex);
  pair.children.push(copy(key, 'key', offset));
  if (value.node) pair.children.push(buildRecord(value, 'value', context));
  else appendExpressionValue(pair, value, context);
  return pair;
}

function appendExpressionValue(pair, {startIndex, endIndex}, {language, source, copy}) {
  const parsed = parseMacroArguments(language, source.slice(startIndex, endIndex), startIndex, copy);
  for (const child of parsed) {
    if (child.field === 'argument') child.field = 'value';
    pair.children.push(child);
  }
}
