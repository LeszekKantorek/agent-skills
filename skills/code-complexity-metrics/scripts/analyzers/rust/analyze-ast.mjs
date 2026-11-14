import {createAnalyzeNode, outerId} from '../contracts.mjs';
import {parseMacroArguments} from './macro-arguments.mjs';
import {parseMacroRecord} from './macro-record.mjs';
import {parseMacroPattern} from './macro-pattern.mjs';
import {parseMacroArms} from './macro-arms.mjs';
import {parseMacroSemicolons} from './macro-semicolons.mjs';
import {parseMacroTypes} from './macro-types.mjs';
import {parseMacroDeclarations} from './macro-declarations.mjs';
import {docAttributeProbe, collectExpressionDocs} from './macro-docs.mjs';

export function prepare(parsedTree, source, fileId) {
  if (!parsedTree?.rootNode) throw new TypeError('Expected a parsed Rust tree');
  const language = parsedTree.language;
  const comments = [], unsafe = [], issues = [];
  const lineStarts = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') lineStarts.push(i + 1);
  const position = index => {
    let lo = 0, hi = lineStarts.length;
    while (lo + 1 < hi) { const mid = (lo + hi) >>> 1; if (lineStarts[mid] <= index) lo = mid; else hi = mid; }
    return {row: lo, column: index - lineStarts[lo]};
  };
  const range = (startIndex, endIndex) => ({startIndex, endIndex, startPosition: position(startIndex), endPosition: position(endIndex)});
  function lexical(node, offset = 0) {
    const start = node.startIndex + offset, end = node.endIndex + offset;
    if (node.type === 'line_comment' || node.type === 'block_comment') comments.push(range(start, end));
    if (['string_literal', 'raw_string_literal', 'char_literal', 'block_comment'].includes(node.type)) unsafe.push(range(start, end));
    for (const child of node.children) lexical(child, offset);
  }
  // Presentation describes the physical source, including excluded and unsupported syntax.
  lexical(parsedTree.rootNode);
  const pairs = {'(': ')', '[': ']', '{': '}'};
  const validDelimiters = node => {
    const first = node.firstChild, last = node.lastChild;
    return first && last && !first.isMissing && !last.isMissing && pairs[first.type] === last.type && first.endIndex === node.startIndex + 1 && last.startIndex === node.endIndex - 1;
  };
  // Apply the same locality test to parser errors encountered in the normal
  // tree and errors inside an omitted token tree. Only explicit structural
  // boundaries can establish that recovery stayed local.
  function boundaryRisk(node, parent, context = {}) {
    if (context.localMissingClose && node.isMissing) return false;
    if (context.closedTokenTree && node.type === 'ERROR' && node.childCount > 0 && node.children.every(c => !c.isNamed && c.childCount === 0 && !c.isMissing && c.type !== '}')) return false;
    return !(node.type === 'ERROR' && parent?.type.endsWith('_declaration') && parent.lastChild?.type === ';' && !parent.lastChild.isMissing && node.startIndex > parent.startIndex && node.endIndex <= parent.lastChild.startIndex && node.children.every(child => !child.isNamed && child.childCount === 0 && !child.isMissing));
  }
  function copy(node, field = null, offset = 0, excluded = false, definitionBoundary = false, parentNode = null) {
    const start = node.startIndex + offset, end = node.endIndex + offset;
    const out = createAnalyzeNode({type: node.type, field, isNamed: node.isNamed, ...range(start, end)});
    const isDefinition = excluded || node.type === 'macro_definition';
    if ((!excluded || definitionBoundary) && (node.type === 'ERROR' || node.isMissing)) issues.push({node: out, code: 'rust-parse-error', category: 'parse', message: 'Rust syntax could not be parsed completely.', boundaryRisk: boundaryRisk(node, parentNode)});
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i), childField = node.fieldNameForChild(i);
      if (!isDefinition && node.type === 'macro_invocation' && child.type === 'token_tree') {
        const open = child.firstChild, close = child.lastChild;
        if (child.hasError || !validDelimiters(child)) {
          const errors = [];
          function collectBad(n, parent) {
            if (n.type === 'ERROR' || n.isMissing) errors.push([n, parent]);
            for (const c of n.children) collectBad(c, n);
          }
          collectBad(child, node);
          const localMissingClose = errors.length === 1 && errors[0][0].id === close?.id && close?.isMissing && pairs[open?.type] === close.type && parentNode?.type === 'block' && parentNode.lastChild?.type === '}' && !parentNode.lastChild.isMissing && source.slice(child.endIndex + offset, parentNode.lastChild.startIndex + offset).trim() === '';
          const context = {localMissingClose, closedTokenTree: validDelimiters(child)};
          const risk = errors.length === 0 || errors.some(([bad, parent]) => boundaryRisk(bad, parent, context));
          issues.push({node: out, code: 'rust-parse-error', category: 'parse', message: 'Macro delimiters or contents contain a syntax error.', boundaryRisk: risk});
          continue;
        }
        const a = child.startIndex + offset + 1, b = child.endIndex + offset - 1;
        const recover = (n, f, o) => {
          // Recovered syntax may expose lexical nodes hidden in the original token tree.
          lexical(n, o);
          return copy(n, f, o);
        };
        const parseProfiles = (token, text, shift, cb, make) => [
          () => parseMacroArguments(language, text.slice(token.startIndex + shift + 1, token.endIndex + shift - 1), token.startIndex + shift + 1, cb),
          () => parseMacroRecord(language, token, text, shift, cb, make),
          () => parseMacroPattern(language, token, text, shift, cb),
          () => parseMacroSemicolons(language, token, text, shift, cb),
          () => parseMacroArms(language, token, text, shift, cb),
          () => parseMacroTypes(language, token, text, shift, cb),
          () => parseMacroDeclarations(language, token, text, shift, cb),
        ];
        const dummy = (_n, field) => ({field, children: []});
        const dummyNode = (_type, field) => ({field, children: []});
        const expressionDocs = new Set(), macroBoundaries = [];
        const collect = (node, field, shift) => { collectExpressionDocs(node, shift, expressionDocs, macroBoundaries); return dummy(node, field); };
        const probes = parseProfiles(child, source, offset, collect, dummyNode);
        let profile = -1;
        for (let i = 0; i < probes.length; i++) { expressionDocs.clear(); macroBoundaries.length = 0; if (probes[i]() !== null) { profile = i; break; } }
        const valid = profile >= 0 && docAttributeProbe(language, child, source, offset,
          (token, text, shift) => parseProfiles(token, text, shift, dummy, dummyNode)[profile]() !== null, expressionDocs, macroBoundaries);
        const make = (type, field, start, end) => createAnalyzeNode({type, field, isNamed: true, ...range(start, end)});
        const recovered = valid ? parseProfiles(child, source, offset, recover, make)[profile]() : null;
        if (recovered === null) issues.push({node: out, code: 'rust-unsupported-macro-arguments', category: 'unsupported', message: 'Macro arguments are not a complete expression list.'});
        else out.children.push(...recovered);
      } else out.children.push(copy(child, childField, offset, isDefinition, node.type === 'macro_definition', node));
    }
    return out;
  }
  const tree = copy(parsedTree.rootNode);
  const functions = [], ownerByNode = new Map();
  function assign(node, owner = null, excluded = false, parent = null) {
    const definition = excluded || node.type === 'macro_definition';
    if (!definition && owner === null && (node.type === 'function_item' || node.type === 'closure_expression')) {
      owner = outerId(fileId, functions.length);
      const nameNode = node.children.find(c => c.field === 'name');
      const binding = node.type === 'closure_expression' && node.field === 'value' && ['let_declaration', 'const_item', 'static_item'].includes(parent?.type)
        ? parent.children.find(c => (c.field === 'pattern' || c.field === 'name') && c.type === 'identifier') : null;
      const label = nameNode || binding;
      functions.push({id: owner, name: label ? source.slice(label.startIndex, label.endIndex) : null, root: node});
    }
    ownerByNode.set(node, owner);
    for (const child of node.children) assign(child, owner, definition, node);
  }
  assign(tree);
  // An owner from error recovery does not prove its closing boundary. Only a
  // bounded token error inside a terminated declaration is established local;
  // other parser errors conservatively leave discovery incomplete.
  const uncertainOwners = new Set(issues.filter(issue => issue.boundaryRisk).map(issue => ownerByNode.get(issue.node)));
  const diagnostics = [];
  for (const {node, code, category, message} of issues) {
    const owners = new Set([ownerByNode.get(node)]);
    if (category === 'parse') {
      const visit = n => { owners.add(ownerByNode.get(n)); for (const child of n.children) visit(child); };
      visit(node);
    }
    for (const owner of owners) diagnostics.push({code, category, message, fileId, range: range(node.startIndex, node.endIndex), owner, affectedMetrics: ['cognitive', 'cyclomatic', 'statements'], affectsFunctionDiscovery: ownerByNode.get(node) === null || uncertainOwners.has(ownerByNode.get(node))});
  }
  const dedup = values => [...new Map(values.map(r => [`${r.startIndex}:${r.endIndex}`, r])).values()].sort((a,b) => a.startIndex-b.startIndex || a.endIndex-b.endIndex);
  const commentRanges = dedup(comments), unsafeRanges = dedup(unsafe);
  const lineAnnotations = [];
  let nextRange = 0, furthestEnd = -1;
  for (let row = 0; row < lineStarts.length; row++) {
    const start = lineStarts[row], rawEnd = row + 1 < lineStarts.length ? lineStarts[row + 1] - 1 : source.length;
    const end = row + 1 < lineStarts.length && rawEnd > start && source[rawEnd - 1] === '\r' ? rawEnd - 1 : rawEnd;
    while (nextRange < unsafeRanges.length && unsafeRanges[nextRange].startIndex < end) furthestEnd = Math.max(furthestEnd, unsafeRanges[nextRange++].endIndex);
    lineAnnotations.push({row, contentEndIndex: end, endIndex: furthestEnd > end || parsedTree.rootNode.hasError ? null : end});
  }
  return {tree, functions, ownerByNode, diagnostics, presentation: {comments: parsedTree.rootNode.hasError ? [] : commentRanges, unsafeCommentRanges: unsafeRanges, lineAnnotations}};
}
