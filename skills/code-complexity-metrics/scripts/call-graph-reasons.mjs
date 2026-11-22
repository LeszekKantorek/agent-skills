// Stable reason codes used by all resolvers and the JSON call graph.
export const CallGraphReason = Object.freeze({
  // Name lookup found multiple candidate bindings in the same scope.
  ambiguousBinding: 'ambiguous-binding',
  // A JavaScript module has multiple entries for the requested export name.
  ambiguousExport: 'ambiguous-export',
  // Multiple Rust inherent methods match the requested type and method name.
  ambiguousInherentMethod: 'ambiguous-inherent-method',
  // Both conventional files for a Rust module exist, for example foo.rs and foo/mod.rs.
  ambiguousModuleFile: 'ambiguous-module-file',
  // A diagnostic limits graph coverage or affects a call site or target definition.
  analysisGap: 'analysis-gap',
  // The JavaScript callee resolves to a class binding.
  classConstructor: 'class-constructor',
  // A JavaScript bracket access such as receiver[key]() has an unknown target.
  computedMember: 'computed-member',
  // Rust cfg or cfg_attr leaves a call, candidate binding, or module path conditional.
  conditionalCfg: 'conditional-cfg',
  // Resolving JavaScript import or export bindings revisits a binding.
  cyclicExport: 'cyclic-export',
  // Resolving Rust imports or type aliases revisits a binding.
  cyclicImport: 'cyclic-import',
  // A Rust file module points back to a file already in its enclosing module chain.
  cyclicModule: 'cyclic-module',
  // The callee uses an unsupported expression shape, as in makeHandler()().
  dynamicCallee: 'dynamic-callee',
  // A member call such as receiver.run() has an unknown target.
  dynamicMember: 'dynamic-member',
  // JavaScript with or sloppy direct eval can supply a binding during lookup.
  dynamicScope: 'dynamic-scope',
  // A bound value has an unknown function target, as in a factory result.
  dynamicValue: 'dynamic-value',
  // A Rust callee resolves to a foreign function or static declared in an extern block.
  externFunction: 'extern-function',
  // The target lookup enters an external JavaScript module or Rust crate.
  externalModule: 'external-module',
  // A Rust generic qualifier or implementation prevents method resolution.
  genericDispatch: 'generic-dispatch',
  // The Rust lookup resolves to a generic type or const parameter.
  genericType: 'generic-type',
  // A Rust type alias has parameters or a target that the path resolver cannot represent.
  genericTypeAlias: 'generic-type-alias',
  // The parsed call has no callee expression.
  missingCallee: 'missing-callee',
  // A referenced JavaScript or Rust source module is missing from the graph index.
  moduleOutsideInput: 'module-outside-input',
  // The callee is a writable binding whose function target may change.
  mutableBinding: 'mutable-binding',
  // A JavaScript call targets a module namespace object directly.
  namespaceNotCallable: 'namespace-not-callable',
  // A Rust callee resolves to a module or type with no indexed function definition.
  nonFunctionItem: 'non-function-item',
  // The callee is bound as a function parameter or a JavaScript catch parameter.
  parameter: 'parameter',
  // A JavaScript block function can become a var binding in a non-strict scope.
  sloppyBlockFunction: 'sloppy-block-function',
  // A Rust qualified call or Self lookup requires trait method resolution.
  traitDispatch: 'trait-dispatch',
  // Name lookup found no matching binding in the visible scopes.
  unboundName: 'unbound-name',
  // The requested JavaScript export has no indexed entry in its module.
  unindexedExport: 'unindexed-export',
  // The requested Rust item has no indexed binding in the resolved module.
  unindexedItem: 'unindexed-item',
  // A Rust crate path or file module lacks a known crate root.
  unknownCrateRoot: 'unknown-crate-root',
  // A Rust super path leads beyond the known parent modules.
  unknownParentModule: 'unknown-parent-module',
  // An associated lookup on a known Rust type falls outside its indexed inherent methods.
  unresolvedAssociatedItem: 'unresolved-associated-item',
  // Rust name lookup reaches a glob import without an explicit matching binding.
  unresolvedGlobImport: 'unresolved-glob-import',
  // A Rust Self path has no resolved implementation type.
  unresolvedSelfType: 'unresolved-self-type',
  // A Rust file module is declared inside a block without an explicit path.
  unsupportedBlockModule: 'unsupported-block-module',
  // The Rust path attribute cannot be read as one valid source path.
  unsupportedModulePath: 'unsupported-module-path',
  // A JavaScript relative import has an unsupported module specifier, such as a URL query.
  unsupportedModuleSpecifier: 'unsupported-module-specifier',
  // A Rust qualified path cannot be traversed with the indexed modules and types.
  unsupportedQualifiedPath: 'unsupported-qualified-path',
  // A JavaScript wildcard re-export may supply a name absent from the explicit index.
  unsupportedWildcardExport: 'unsupported-wildcard-export',
});
