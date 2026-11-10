const valueKinds = new Set(['identifier','scoped_identifier','self','generic_function','metavariable','macro_invocation']);

export const rust = {
 function: new Set(['function_item','closure_expression']),
 decision: new Set(['if_expression','for_expression','while_expression','loop_expression']),
 selection: new Set(['match_expression']),
 branch: new Set(['match_arm']),
 block: new Set(['block']),
 call: new Set(['call_expression','macro_invocation']),
 opaque: new Set(['macro_invocation','macro_definition']),
 logical: new Set(['binary_expression','let_chain']),
 isValue: type => type.endsWith('_expression') || type.endsWith('_literal') || valueKinds.has(type),
};
