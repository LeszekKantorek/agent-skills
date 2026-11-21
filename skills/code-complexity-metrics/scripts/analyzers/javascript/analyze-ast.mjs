import {createAnalyzeNode, outerId} from '../contracts.mjs';

// These are the visible named node types in the pinned JavaScript grammar which
// the scoring profile can classify. Wrappers retain all children and fields.
const supported = new Set([
  'identifier', 'hash_bang_line', 'html_character_reference', 'string_fragment', 'optional_chain',
  'escape_sequence', 'comment', 'regex_pattern', 'regex_flags', 'number',
  'private_property_identifier', 'this', 'super', 'true', 'false', 'null', 'undefined',
  'html_comment', 'program', 'export_statement', 'namespace_export', 'export_clause',
  'export_specifier', 'import', 'import_statement', 'import_clause', 'namespace_import',
  'named_imports', 'import_specifier', 'import_attribute', 'expression_statement',
  'variable_declaration', 'lexical_declaration', 'using_declaration', 'variable_declarator',
  'statement_block', 'else_clause', 'if_statement', 'switch_statement', 'for_statement',
  'for_in_statement', 'while_statement', 'do_statement', 'try_statement', 'break_statement',
  'continue_statement', 'return_statement', 'throw_statement', 'empty_statement',
  'labeled_statement', 'switch_body', 'switch_case', 'switch_default', 'catch_clause',
  'finally_clause', 'parenthesized_expression', 'object', 'object_pattern', 'assignment_pattern',
  'object_assignment_pattern', 'array', 'array_pattern', 'string', 'class', 'class_declaration',
  'class_heritage', 'function_expression', 'function_declaration', 'generator_function',
  'generator_function_declaration', 'arrow_function', 'call_expression', 'new_expression',
  'await_expression', 'yield_expression', 'with_statement', 'debugger_statement',
  'member_expression', 'subscript_expression', 'assignment_expression',
  'augmented_assignment_expression', 'spread_element', 'ternary_expression', 'binary_expression',
  'unary_expression', 'update_expression', 'sequence_expression', 'template_string',
  'template_substitution', 'regex', 'meta_property', 'arguments', 'class_body', 'field_definition',
  'formal_parameters', 'class_static_block', 'rest_pattern', 'method_definition', 'pair',
  'pair_pattern', 'computed_property_name', 'property_identifier', 'shorthand_property_identifier',
  'shorthand_property_identifier_pattern', 'statement_identifier',
]);
const functions = new Set(['function_expression','function_declaration','generator_function','generator_function_declaration','arrow_function','method_definition']);
const annotationSensitiveTypes = new Set([
  'string', 'template_string', 'regex', 'comment', 'html_comment',
  'jsx_text', 'jsx_element', 'jsx_self_closing_element',
]);

export function prepare(parsedTree, source, fileId) {
  if (!parsedTree?.rootNode) throw new TypeError('Expected a parsed JavaScript tree');
  const root = parsedTree.rootNode;
  const {starts, ends, range} = sourceLocations(source);
  const {tree, issues, comments, unsafe} = copySyntax(root, range);
  const {functions, ownerByNode} = findOuters(tree, source, fileId);
  const diagnostics = buildDiagnostics(issues, ownerByNode, fileId, range);
  const presentation = buildPresentation(starts, ends, comments, unsafe, root.hasError);
  return {tree, functions, ownerByNode, diagnostics, presentation};
}

function sourceLocations(source) {
  // ECMAScript recognizes CR, LF, LS and PS; CRLF is one terminator.
  const starts = [0], ends = [];
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const isLineTerminator = ch === '\r' || ch === '\n' || ch === '\u2028' || ch === '\u2029';
    if (isLineTerminator) {
      ends.push(i);
      if (ch === '\r' && source[i + 1] === '\n') i++;
      starts.push(i + 1);
    }
  }
  ends.push(source.length);
  const position = index => {
    let lo = 0, hi = starts.length;
    while (lo + 1 < hi) { const mid = (lo + hi) >>> 1; if (starts[mid] <= index) lo = mid; else hi = mid; }
    return {row: lo, column: index - starts[lo]};
  };
  const range = (startIndex, endIndex) => ({startIndex, endIndex, startPosition: position(startIndex), endPosition: position(endIndex)});
  return {starts, ends, range};
}

function copySyntax(root, range) {
  const comments = [], unsafe = [], issues = [];
  function copy(n, field = null, parent = null) {
    const loc = range(n.startIndex, n.endIndex);
    const node = createAnalyzeNode({type:n.type, field, isNamed:n.isNamed, ...loc});
    const isCommentNode = n.type === 'comment' || n.type === 'html_comment';
    if (isCommentNode) comments.push(loc);
    const protectFromAnnotation = annotationSensitiveTypes.has(n.type);
    if (protectFromAnnotation) unsafe.push(loc);
    const isParseError = n.type === 'ERROR' || n.isMissing;
    if (isParseError) {
      // A delimiter can alter the recovered nesting despite a later semicolon.
      // Only leaf tokens incapable of opening or closing a structural boundary
      // are evidence that this error remained inside the declaration.
      const isLocalDeclarationError = n.type === 'ERROR' && parent?.type === 'variable_declarator' &&
        n.childCount > 0 &&
        n.children.every(c => !c.isNamed && c.childCount === 0 && !c.isMissing && !/[()[\]{}]/u.test(c.type)) &&
        parent.parent?.children.some(c => c.type === ';' && !c.isMissing);
      issues.push({node, category:'parse', code:'javascript-parse-error', message:'JavaScript syntax could not be parsed completely.', local:isLocalDeclarationError});
    }
    else if (n.isNamed && !supported.has(n.type)) {
      issues.push({node, category:'unsupported', code:'javascript-unsupported-syntax', message:`JavaScript syntax ${n.type} is not classified by the scoring profile.`, complete:!n.hasError});
    }
    for (let i = 0; i < n.childCount; i++) node.children.push(copy(n.child(i), n.fieldNameForChild(i), n));
    return node;
  }
  const tree = copy(root);
  return {tree, issues, comments, unsafe};
}

function findOuters(tree, source, fileId) {
  const records = [], ownerByNode = new Map();
  const text = node => source.slice(node.startIndex, node.endIndex);
  function assign(node, owner = null, parent = null) {
    const enclosing = owner;
    const isOuterFunction = functions.has(node.type) && owner === null;
    if (isOuterFunction) {
      owner = outerId(fileId, records.length);
      const explicit = node.children.find(c => c.field === 'name');
      let binding = null;
      const isVariableInitializer = node.field === 'value' && parent?.type === 'variable_declarator';
      if (isVariableInitializer) {
        const isVariableNameNode = child =>
          child.field === 'name' && child.type === 'identifier';
        binding = parent.children.find(isVariableNameNode);
      } else if (node.field === 'value' && parent?.type === 'field_definition') {
        binding = parent.children.find(c => c.field === 'property' && ['property_identifier','private_property_identifier'].includes(c.type));
      }
      const label = explicit && explicit.type !== 'computed_property_name' ? explicit : (!explicit ? binding : null);
      records.push({id:owner, name:label ? text(label) : null, root:node});
    }
    ownerByNode.set(node, owner);
    for (const child of node.children) {
      // Computed names execute in the definition's surrounding context. This
      // also applies to functions appearing within the name itself.
      const usesEnclosingOwner = node.type === 'method_definition' &&
        ((child.field === 'name' && child.type === 'computed_property_name') || child.field === 'decorator');
      const childOwner = usesEnclosingOwner ? enclosing : owner;
      assign(child, childOwner, node);
    }
  }
  assign(tree);
  return {functions:records, ownerByNode};
}

function buildDiagnostics(issues, ownerByNode, fileId, range) {
  const diagnostics = [];
  for (const {node, category, code, message, local, complete} of issues) {
    const owners = new Set([ownerByNode.get(node)]);
    // An unclassified or recovered region can affect every discovered outer in
    // that region. A sibling outside it does not inherit the diagnostic.
    function collectOwners(n) { owners.add(ownerByNode.get(n)); for (const c of n.children) collectOwners(c); }
    collectOwners(node);
    for (const owner of owners) diagnostics.push({code,category,message,fileId,range:range(node.startIndex,node.endIndex),owner,affectedMetrics:['cognitive'],affectsFunctionDiscovery:owner === null || (category === 'unsupported' ? !complete : !local)});
  }
  return diagnostics;
}

function buildPresentation(starts, ends, comments, unsafe, hasError) {
  const sorted = values => values.sort((a,b) => a.startIndex-b.startIndex || a.endIndex-b.endIndex);
  sorted(comments); sorted(unsafe);
  const lineAnnotations = [];
  let cursor = 0, furthest = -1;
  for (let row=0; row<starts.length; row++) {
    const end=ends[row];
    while(cursor<unsafe.length && unsafe[cursor].startIndex<end) furthest=Math.max(furthest,unsafe[cursor++].endIndex);
    lineAnnotations.push({row,contentEndIndex:end,endIndex:furthest>end || hasError ? null : end});
  }
  return {comments:hasError ? [] : comments,unsafeCommentRanges:unsafe,lineAnnotations};
}




