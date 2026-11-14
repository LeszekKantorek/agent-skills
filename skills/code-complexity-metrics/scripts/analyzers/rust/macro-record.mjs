// Recognize nonempty records with string keys using the original token-tree
// boundaries. Values are validated by the existing complete-expression parser.
import {parseMacroArguments} from './macro-arguments.mjs';

export function parseMacroRecord(language, tokenTree, source, offset, copy, makeNode) {
  const useful = n => n.children.slice(1, -1).filter(c => !c.type.endsWith('_comment'));
  const isBraced = n => n?.type === 'token_tree' && n.firstChild?.type === '{' && n.lastChild?.type === '}';
  const outer = useful(tokenTree);
  if (!(outer.length === 1 || (outer.length === 2 && outer[1].type === ',')) || !isBraced(outer[0])) return null;
  const oneExpression = (start, end) => {
    const parsed = parseMacroArguments(language, source.slice(start, end), start, (_n, field) => field);
    return parsed !== null && parsed.filter(x => x === 'argument').length === 1;
  };
  function record(node) {
    const tokens = useful(node);
    if (!tokens.length) return null;
    if (tokens.some((token, i) => token.type === ',' && tokens[i+1]?.type === ',')) return null;
    const isKey = token => {
      if (!token || !['string_literal', 'raw_string_literal'].includes(token.type)) return false;
      // Tree-sitter uses the same node kinds for ordinary, byte and C strings.
      return /^(?:"|r#*")/.test(source.slice(token.startIndex + offset, token.endIndex + offset));
    };
    const entries = [];
    let i = 0;
    while (i < tokens.length) {
      const key = tokens[i];
      if (!isKey(key) || tokens[i+1]?.type !== ':') return null;
      const first = i + 2;
      if (first >= tokens.length) return null;
      let found = false;
      for (let end = first + 1; end <= tokens.length; end++) {
        if (end < tokens.length && tokens[end].type !== ',') continue;
        // A separator belongs to the record, never to its single value.
        if (tokens[end-1].type === ',') continue;
        if (end < tokens.length && end + 1 < tokens.length &&
            (!isKey(tokens[end+1]) || tokens[end+2]?.type !== ':')) continue;
        const startIndex = tokens[first].startIndex + offset, endIndex = tokens[end-1].endIndex + offset;
        const nested = end === first + 1 && isBraced(tokens[first]) ? record(tokens[first]) : null;
        if (!nested && !oneExpression(startIndex, endIndex)) continue;
        // A complete expression followed by a field separator fixes this
        // boundary. A later failed field cannot turn it into part of a value.
        entries.push({key, value: nested || {startIndex, endIndex}, endIndex});
        i = end < tokens.length ? end + 1 : end;
        found = true;
        break;
      }
      if (!found) return null;
    }
    return {node, entries};
  }
  const plan = record(outer[0]);
  if (!plan) return null;
  function build(item, field) {
    const result = makeNode('macro_record', field, item.node.startIndex + offset, item.node.endIndex + offset);
    for (const entry of item.entries) {
      const pair = makeNode('macro_record_field', 'field', entry.key.startIndex + offset, entry.endIndex);
      pair.children.push(copy(entry.key, 'key', offset));
      if (entry.value.node) pair.children.push(build(entry.value, 'value'));
      else {
        const {startIndex, endIndex} = entry.value;
        const parsed = parseMacroArguments(language, source.slice(startIndex, endIndex), startIndex, copy);
        for (const child of parsed) { if (child.field === 'argument') child.field = 'value'; pair.children.push(child); }
      }
      result.children.push(pair);
    }
    return result;
  }
  return [build(plan, 'argument')];
}
