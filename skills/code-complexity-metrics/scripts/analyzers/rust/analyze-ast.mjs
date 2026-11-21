import {createAnalyzeNode, outerId} from '../contracts.mjs';
import {parseMacroArguments} from './macro-arguments.mjs';
import {parseMacroRecord} from './macro-record.mjs';
import {parseMacroPattern} from './macro-pattern.mjs';
import {parseMacroArms} from './macro-arms.mjs';
import {parseMacroSemicolons} from './macro-semicolons.mjs';
import {parseMacroTypes} from './macro-types.mjs';
import {parseMacroDeclarations} from './macro-declarations.mjs';
import {docAttributeProbe, collectExpressionDocs} from './macro-docs.mjs';

const annotationSensitiveTypes = new Set([
  'string_literal', 'raw_string_literal', 'char_literal', 'block_comment',
]);

export function prepare(parsedTree, source, fileId) {
  if (!parsedTree?.rootNode) throw new TypeError('Expected a parsed Rust tree');
  const root = parsedTree.rootNode;
  const {lineStarts, range} = sourceLocations(source);
  const {tree, issues, comments, unsafe} = copySyntax(root, parsedTree.language, source, range);
  const {functions, ownerByNode} = findOuters(tree, source, fileId);
  const diagnostics = buildDiagnostics(issues, ownerByNode, fileId, range);
  const presentation = buildPresentation(source, lineStarts, comments, unsafe, root.hasError);
  return {tree, functions, ownerByNode, diagnostics, presentation, halsteadOccurrences: []};
}

function sourceLocations(source) {
  const lineStarts = [0];
  for (let newline = source.indexOf('\n'); newline !== -1; newline = source.indexOf('\n', newline + 1)) {
    lineStarts.push(newline + 1);
  }
  const position = index => {
    let lo = 0, hi = lineStarts.length;
    while (lo + 1 < hi) { const mid = (lo + hi) >>> 1; if (lineStarts[mid] <= index) lo = mid; else hi = mid; }
    return {row: lo, column: index - lineStarts[lo]};
  };
  const range = (startIndex, endIndex) => ({startIndex, endIndex, startPosition: position(startIndex), endPosition: position(endIndex)});
  return {lineStarts, range};
}

function copySyntax(root, language, source, range) {
  const comments = [], unsafe = [], issues = [];
  function lexical(node, offset = 0) {
    const start = node.startIndex + offset, end = node.endIndex + offset;
    const isCommentNode = node.type === 'line_comment' || node.type === 'block_comment';
    if (isCommentNode) comments.push(range(start, end));
    const protectFromAnnotation = annotationSensitiveTypes.has(node.type);
    if (protectFromAnnotation) unsafe.push(range(start, end));
    for (const child of node.children) lexical(child, offset);
  }

  function copy(node, field = null, offset = 0, excluded = false, definitionBoundary = false, parentNode = null) {
    const start = node.startIndex + offset, end = node.endIndex + offset;
    const out = createAnalyzeNode({type: node.type, field, isNamed: node.isNamed, ...range(start, end)});
    const isDefinition = excluded || node.type === 'macro_definition';
    const shouldReportParseError = (!excluded || definitionBoundary) && (node.type === 'ERROR' || node.isMissing);
    if (shouldReportParseError) {
      issues.push({node: out, code: 'rust-parse-error', category: 'parse',
        message: 'Rust syntax could not be parsed completely.', boundaryRisk: boundaryRisk(node, parentNode)});
    }
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      const shouldExpandMacroArguments = !isDefinition && node.type === 'macro_invocation' && child.type === 'token_tree';
      if (shouldExpandMacroArguments) {
        out.children.push(...expandTokenTree(child, node, parentNode, offset, out));
        continue;
      }
      out.children.push(copy(child, node.fieldNameForChild(i), offset, isDefinition, node.type === 'macro_definition', node));
    }
    return out;
  }

  const make = (type, field, start, end) => createAnalyzeNode({type, field, isNamed: true, ...range(start, end)});
  function recover(node, field, offset) {
    // Recovered syntax may expose lexical nodes hidden in the original token tree.
    lexical(node, offset);
    return copy(node, field, offset);
  }

  function expandTokenTree(token, invocation, parent, offset, out) {
    const open = token.firstChild, close = token.lastChild;
    const closed = validDelimiters(token, open, close);
    const isMalformedTokenTree = token.hasError || !closed;
    if (isMalformedTokenTree) {
      issues.push({node: out, code: 'rust-parse-error', category: 'parse',
        message: 'Macro delimiters or contents contain a syntax error.',
        boundaryRisk: tokenTreeBoundaryRisk(token, invocation, parent, source, offset, open, close, closed)});
      return [];
    }
    const recovered = recoverMacro(language, token, source, offset, recover, make);
    if (recovered !== null) return recovered;
    issues.push({node: out, code: 'rust-unsupported-macro-arguments', category: 'unsupported',
      message: 'Macro arguments are not a complete expression list.'});
    return [];
  }

  // Presentation describes the physical source, including excluded and unsupported syntax.
  lexical(root);
  const tree = copy(root);
  return {tree, issues, comments, unsafe};
}

const pairs = {'(': ')', '[': ']', '{': '}'};
const validDelimiters = (node, open, close) =>
  open && close && !open.isMissing && !close.isMissing &&
  pairs[open.type] === close.type &&
  open.endIndex === node.startIndex + 1 && close.startIndex === node.endIndex - 1;
const anonymousLeaf = node => !node.isNamed && node.childCount === 0 && !node.isMissing;
// Apply the same locality test to parser errors encountered in the normal
// tree and errors inside an omitted token tree. Only explicit structural
// boundaries can establish that recovery stayed local.
function boundaryRisk(node, parent, localMissingClose = false, closedTokenTree = false) {
  const isLocalMissingDelimiter = localMissingClose && node.isMissing;
  if (isLocalMissingDelimiter) return false;
  if (node.type !== 'ERROR') return true;
  const isLocalTokenTreeError = closedTokenTree && node.childCount > 0 &&
    node.children.every(child => child.type !== '}' && anonymousLeaf(child));
  if (isLocalTokenTreeError) return false;
  const close = parent?.lastChild;
  const isLocalDeclarationError = parent?.type.endsWith('_declaration') && close?.type === ';' && !close.isMissing &&
    node.startIndex > parent.startIndex && node.endIndex <= close.startIndex &&
    node.children.every(anonymousLeaf);
  return !isLocalDeclarationError;
}

function collectParseErrors(node, parent, errors) {
  if (node.type === 'ERROR' || node.isMissing) errors.push([node, parent]);
  for (const child of node.children) collectParseErrors(child, node, errors);
}

function tokenTreeBoundaryRisk(token, invocation, parent, source, offset, open, close, closedTokenTree) {
  const errors = [];
  collectParseErrors(token, invocation, errors);
  if (errors.length === 0) return true;
  const blockClose = parent?.lastChild;
  const localMissingClose = errors.length === 1 && close?.isMissing &&
    errors[0][0].id === close.id && pairs[open?.type] === close.type &&
    parent?.type === 'block' && blockClose?.type === '}' && !blockClose.isMissing &&
    source.slice(token.endIndex + offset, blockClose.startIndex + offset).trim() === '';
  return errors.some(([bad, container]) => boundaryRisk(bad, container, localMissingClose, closedTokenTree));
}

function parseExpressionList(language, token, text, offset, copy) {
  const start = token.startIndex + offset + 1;
  return parseMacroArguments(language, text.slice(start, token.endIndex + offset - 1), start, copy);
}

const profiles = [
  parseExpressionList,
  parseMacroRecord,
  parseMacroPattern,
  parseMacroSemicolons,
  parseMacroArms,
  parseMacroTypes,
  parseMacroDeclarations,
];

function probeNode(_syntax, field) {
  return {field, children: []};
}

function selectProfile(language, token, source, offset) {
  for (const profile of profiles) {
    const expressionDocs = new Set();
    const macroBoundaries = [];
    const collect = (node, field, shift) => {
      collectExpressionDocs(node, shift, expressionDocs, macroBoundaries);
      return probeNode(node, field);
    };
    const profileMatches = profile(language, token, source, offset, collect, probeNode) !== null;
    if (profileMatches) {
      return {profile, expressionDocs, macroBoundaries};
    }
  }
  return null;
}

function recoverMacro(language, token, source, offset, copy, make) {
  const selected = selectProfile(language, token, source, offset);
  if (!selected) return null;
  const {profile, expressionDocs, macroBoundaries} = selected;
  const validDocs = docAttributeProbe(language, token, source, offset,
    (candidate, text, shift) => profile(language, candidate, text, shift, probeNode, probeNode) !== null,
    expressionDocs, macroBoundaries);
  if (!validDocs) return null;
  return profile(language, token, source, offset, copy, make);
}

function functionName(node, parent, source) {
  const name = node.children.find(child => child.field === 'name');
  if (name) return source.slice(name.startIndex, name.endIndex);
  const canUseBindingName = node.type === 'closure_expression' && node.field === 'value' &&
    ['let_declaration', 'const_item', 'static_item'].includes(parent?.type);
  if (!canUseBindingName) return null;
  const binding = parent.children.find(child =>
    child.type === 'identifier' && (child.field === 'pattern' || child.field === 'name'));
  return binding ? source.slice(binding.startIndex, binding.endIndex) : null;
}

function findOuters(tree, source, fileId) {
  const functions = [], ownerByNode = new Map();
  function assign(node, owner = null, excluded = false, parent = null) {
    const definition = excluded || node.type === 'macro_definition';
    const isOuterFunction = !definition && owner === null &&
      (node.type === 'function_item' || node.type === 'closure_expression');
    if (isOuterFunction) {
      owner = outerId(fileId, functions.length);
      functions.push({id: owner, name: functionName(node, parent, source), root: node});
    }
    ownerByNode.set(node, owner);
    for (const child of node.children) assign(child, owner, definition, node);
  }
  assign(tree);
  return {functions, ownerByNode};
}

function collectOwners(node, ownerByNode, owners) {
  owners.add(ownerByNode.get(node));
  for (const child of node.children) collectOwners(child, ownerByNode, owners);
}

function buildDiagnostics(issues, ownerByNode, fileId, range) {
  // An owner from error recovery does not prove its closing boundary.
  const uncertainOwners = new Set(issues.filter(issue => issue.boundaryRisk).map(issue => ownerByNode.get(issue.node)));
  const diagnostics = [];
  for (const {node, code, category, message} of issues) {
    const origin = ownerByNode.get(node);
    const owners = new Set([origin]);
    if (category === 'parse') collectOwners(node, ownerByNode, owners);
    const affectsFunctionDiscovery = origin === null || uncertainOwners.has(origin);
    for (const owner of owners) {
      diagnostics.push({code, category, message, fileId, range: range(node.startIndex, node.endIndex),
        owner, affectedMetrics: ['cognitive', 'halstead'], affectsFunctionDiscovery});
    }
  }
  return diagnostics;
}

function buildPresentation(source, lineStarts, comments, unsafe, hasError) {
  const dedup = values => [...new Map(values.map(r => [`${r.startIndex}:${r.endIndex}`, r])).values()].sort((a,b) => a.startIndex-b.startIndex || a.endIndex-b.endIndex);
  const commentRanges = dedup(comments), unsafeRanges = dedup(unsafe);
  const lineAnnotations = [];
  let nextRange = 0, furthestEnd = -1;
  for (let row = 0; row < lineStarts.length; row++) {
    const nextStart = lineStarts[row + 1];
    let end = source.length;
    if (nextStart !== undefined) end = source[nextStart - 2] === '\r' ? nextStart - 2 : nextStart - 1;
    while (nextRange < unsafeRanges.length && unsafeRanges[nextRange].startIndex < end) furthestEnd = Math.max(furthestEnd, unsafeRanges[nextRange++].endIndex);
    lineAnnotations.push({row, contentEndIndex: end, endIndex: furthestEnd > end || hasError ? null : end});
  }
  return {comments: hasError ? [] : commentRanges, unsafeCommentRanges: unsafeRanges, lineAnnotations};
}
