import {childField, childToken, collectHalstead} from '../halstead.mjs';

const operands = new Map([
  ...['identifier', 'property_identifier', 'private_property_identifier', 'shorthand_property_identifier',
    'shorthand_property_identifier_pattern', 'this', 'super', 'undefined', 'meta_property']
    .map(type => [type, 'identifier']),
  ['statement_identifier', 'label'],
  ['number', 'number'],
  ['true', 'boolean'],
  ['false', 'boolean'],
  ['null', 'null'],
  ['string', 'string'],
  ['regex', 'regex'],
]);

// Tokens have meaning in their specific AST role (e.g. a default parameter's
// '=' is an assignment, a class method's '*' declares a generator).
const operatorTokens = new Map([
  ['lexical_declaration', ['let', 'const']],
  ['variable_declaration', ['var']],
  ['using_declaration', ['await', 'using']],
  ['variable_declarator', ['=']],
  ['assignment_pattern', ['=']],
  ['object_assignment_pattern', ['=']],
  ['assignment_expression', ['=']],
  ['field_definition', ['static', '=']],
  ['class_static_block', ['static']],
  ['class_declaration', ['class']],
  ['class', ['class']],
  ['class_heritage', ['extends']],
  ['if_statement', ['if']],
  ['else_clause', ['else']],
  ['switch_statement', ['switch']],
  ['switch_case', ['case']],
  ['switch_default', ['default']],
  ['for_statement', ['for']],
  ['for_in_statement', ['for', 'await', 'let', 'const', 'var', 'using', 'in', 'of']],
  ['while_statement', ['while']],
  ['do_statement', [['do', 'do_while']]],
  ['try_statement', ['try']],
  ['catch_clause', ['catch']],
  ['finally_clause', ['finally']],
  ['with_statement', ['with']],
  ['return_statement', ['return']],
  ['break_statement', ['break']],
  ['continue_statement', ['continue']],
  ['throw_statement', ['throw']],
  ['debugger_statement', ['debugger']],
  ['await_expression', ['await']],
  ['arrow_function', ['async', '=>']],
  ['function_expression', ['async', 'function']],
  ['function_declaration', ['async', 'function']],
  ['generator_function', ['async', 'function', ['*', 'generator']]],
  ['generator_function_declaration', ['async', 'function', ['*', 'generator']]],
  ['new_expression', ['new']],
  ['spread_element', [['...', 'spread']]],
  ['rest_pattern', [['...', 'rest']]],
  ['ternary_expression', [['?', 'conditional']]],
  ['import', ['import']],
]);
const operatorFields = new Set([
  'binary_expression', 'augmented_assignment_expression', 'unary_expression', 'update_expression',
]);

export function halstead(prepared, source) {
  return collectHalstead(prepared, source, classify);
}

function classify(node, {operator, operand}) {
  const kind = operands.get(node.type);
  if (kind) {
    operand(kind);
    return [];
  }

  for (const entry of operatorTokens.get(node.type) ?? []) {
    const [token, key] = typeof entry === 'string' ? [entry, entry] : entry;
    operator(childToken(node, token), key);
  }

  if (operatorFields.has(node.type)) {
    const token = childField(node, 'operator');
    if (token && !token.isNamed) {
      const signedUnary = node.type === 'unary_expression' && ['+', '-'].includes(token.type);
      operator(token, signedUnary ? `unary_${token.type}` : token.type);
    }
  }

  switch (node.type) {
    case 'call_expression': {
      const args = childField(node, 'arguments');
      const callee = childField(node, 'function');
      if (callee?.type !== 'import') operator(childToken(args, '(') ?? childToken(args, '`'), 'call');
      break;
    }
    case 'member_expression':
      operator(childToken(node, '.') ?? childField(node, 'optional_chain'), 'member_access');
      break;
    case 'subscript_expression':
      operator(childToken(node, '['), 'index');
      break;
    case 'optional_chain':
      operator(node, 'optional_chain');
      break;
    case 'method_definition': {
      const accessor = childToken(node, 'get') ?? childToken(node, 'set');
      const name = childField(node, 'name');
      operator(accessor ?? name, accessor?.type ?? 'function');
      operator(childToken(node, 'async'), 'async');
      operator(childToken(node, '*'), 'generator');
      break;
    }
    case 'yield_expression': {
      const delegated = childToken(node, '*');
      operator(delegated ?? childToken(node, 'yield'), delegated ? 'yield*' : 'yield');
      break;
    }
    case 'template_string':
      return classifyTemplate(node, operator, operand);
  }
}

function classifyTemplate(node, operator, operand) {
  const substitutions = node.children.filter(child => child.type === 'template_substitution');
  if (!substitutions.length) {
    operand('template');
    return [];
  }
  const delimiters = node.children.filter(child => !child.isNamed && child.type === '`');
  operator(delimiters[0], 'template_literal');
  let previous = delimiters[0];
  // Source boundaries preserve escapes and coalesce adjacent lexer fragments.
  for (const next of [...substitutions, delimiters.at(-1)]) {
    if (previous && next) {
      operand('template_chunk', {
        startIndex: previous.endIndex, endIndex: next.startIndex,
        startPosition: previous.endPosition, endPosition: next.startPosition,
      });
    }
    previous = next;
  }
  return substitutions;
}
