export const javascript = {
 function: new Set(['function_declaration','function_expression','generator_function_declaration','generator_function','arrow_function','method_definition']),
 decision: new Set(['if_statement','for_statement','for_in_statement','while_statement','do_statement','ternary_expression']),
 selection: new Set(['switch_statement']),
 branch: new Set(['switch_case','switch_default']),
 block: new Set(['statement_block']),
 call: new Set(['call_expression','new_expression']),
 opaque: new Set(),
 logical: new Set(['binary_expression']),
};
