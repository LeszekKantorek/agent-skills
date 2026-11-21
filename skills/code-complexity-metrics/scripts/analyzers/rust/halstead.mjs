import {childField, childToken, collectHalstead} from '../halstead.mjs';

const operands = new Map([
  ...['identifier', 'type_identifier', 'primitive_type', 'field_identifier', 'shorthand_field_identifier',
    'self', 'super', 'crate'].map(type => [type, 'identifier']),
  ['integer_literal', 'number'],
  ['float_literal', 'number'],
  ['negative_literal', 'number'],
  ['string_literal', 'string'],
  ['raw_string_literal', 'string'],
  ['char_literal', 'character'],
  ['boolean_literal', 'boolean'],
  ['lifetime', 'lifetime'],
  ['label', 'label'],
]);
const opaque = new Set([
  'macro_definition', 'token_tree', 'token_tree_pattern', 'attribute_item', 'inner_attribute_item',
]);

const operatorTokens = new Map([
  ['let_declaration', ['let', '=', 'else']],
  ['let_condition', ['let', '=']],
  ['const_item', ['const', '=']],
  ['static_item', ['static', '=']],
  ['type_item', ['type', '=']],
  ['assignment_expression', ['=']],
  ['function_item', [['fn', 'function']]],
  ['function_signature_item', [['fn', 'function']]],
  ['function_modifiers', ['async', 'const', 'unsafe']],
  ['closure_expression', ['async', 'move']],
  ['struct_item', ['struct']],
  ['enum_item', ['enum']],
  ['union_item', ['union']],
  ['enum_variant', ['=']],
  ['trait_item', ['trait']],
  ['impl_item', ['impl']],
  ['mod_item', ['mod']],
  ['use_declaration', ['use']],
  ['if_expression', ['if']],
  ['else_clause', ['else']],
  ['match_expression', ['match']],
  ['match_pattern', ['if']],
  ['match_arm', [['=>', 'match_arm']]],
  ['for_expression', ['for', 'in']],
  ['while_expression', ['while']],
  ['loop_expression', ['loop']],
  ['return_expression', ['return']],
  ['break_expression', ['break']],
  ['continue_expression', ['continue']],
  ['try_expression', ['?']],
  ['try_block', ['try']],
  ['yield_expression', ['yield']],
  ['await_expression', ['await']],
  ['type_cast_expression', ['as']],
  ['unsafe_block', ['unsafe']],
  ['async_block', ['async', 'move']],
  ['const_block', ['const']],
  ['range_expression', ['..', '..=']],
  ['range_pattern', ['..', '..=', '...']],
  ['remaining_field_pattern', [['..', 'rest']]],
  ['captured_pattern', ['@']],
  ['reference_pattern', [['&', 'reference_pattern']]],
  ['ref_pattern', ['ref']],
  ['field_pattern', ['ref']],
  ['base_field_initializer', [['..', 'spread']]],
]);
const operatorFields = new Set(['binary_expression', 'compound_assignment_expr']);
const unaryKeys = new Map([['-', 'unary_-'], ['*', 'dereference'], ['!', '!']]);

export function halstead(prepared, source) {
  return collectHalstead(prepared, source, classify);
}

function classify(node, {operator, operand}) {
  const kind = operands.get(node.type);
  if (kind) {
    operand(kind);
    return [];
  }
  if (opaque.has(node.type)) return [];
  // Preparation replaces each token tree with recovered source nodes, in
  // their original ranges. The macro name and delimiter do not contribute.
  if (node.type === 'macro_invocation') {
    return node.children.filter(child => child.isNamed && child.field !== 'macro');
  }

  for (const entry of operatorTokens.get(node.type) ?? []) {
    const [token, key] = typeof entry === 'string' ? [entry, entry] : entry;
    operator(childToken(node, token), key);
  }

  if (operatorFields.has(node.type)) {
    const token = childField(node, 'operator');
    if (token && !token.isNamed) operator(token, token.type);
  }

  switch (node.type) {
    case 'call_expression':
      operator(childToken(childField(node, 'arguments'), '('), 'call');
      break;
    case 'field_expression':
      operator(childToken(node, '.'), 'member_access');
      break;
    case 'index_expression':
      operator(childToken(node, '['), 'index');
      break;
    case 'reference_expression': {
      const key = childToken(node, 'raw') ? 'raw_borrow' : 'borrow';
      operator(childToken(node, '&'), key);
      break;
    }
    case 'unary_expression':
      for (const token of node.children) {
        if (!token.isNamed && unaryKeys.has(token.type)) operator(token, unaryKeys.get(token.type));
      }
      break;
    case 'closure_expression':
      operator(childToken(childField(node, 'parameters'), '|'), '=>');
      break;
    case 'let_chain':
      for (const token of node.children) {
        if (!token.isNamed && token.type === '&&') operator(token, '&&');
      }
      break;
    case 'or_pattern':
      for (const token of node.children) {
        if (!token.isNamed && token.type === '|') operator(token, 'pattern_alternative');
      }
      break;
  }
}
