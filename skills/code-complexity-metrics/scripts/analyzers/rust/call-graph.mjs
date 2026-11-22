import path from 'node:path';
import {CallGraphReason as Reason} from '../../call-graph-reasons.mjs';
import {addBinding, definition, field, named, resolved, spelling, unresolved, unwrapParentheses} from '../call-graph-syntax.mjs';

const ordinaryTypes = new Set(['struct_item', 'enum_item', 'union_item', 'trait_item']);
const conditionalAttributes = new Set(['cfg', 'cfg_attr']);
const localValueKind = 'local-value';
const lexicalBindings = new Set([localValueKind, Reason.parameter, Reason.genericType, 'closure-binding', Reason.mutableBinding]);
const ignoredNodes = new Set(['attribute_item', 'inner_attribute_item', 'macro_definition', 'token_tree']);
const identifierNodes = new Set(['identifier', 'type_identifier', 'self', 'super', 'crate', 'primitive_type']);
const nameOf = (file, node) => spelling(file, node)?.replace(/^r#/, '');
const cfg = (file, attributes) => attributes.some(attribute => conditionalAttributes.has(nameOf(file, named(attribute)[0])));
const attributesOf = node => named(node).filter(child => child.type === 'inner_attribute_item').flatMap(named);

function entries(node) {
  const result = [];
  let attributes = [];
  for (const child of named(node)) {
    if (child.type === 'attribute_item') attributes.push(...named(child));
    else if (child.type !== 'inner_attribute_item') {
      result.push({node: child, attributes});
      attributes = [];
    }
  }
  return result;
}

function segments(file, node) {
  if (!node) return null;
  if (identifierNodes.has(node.type)) return [nameOf(file, node)];
  if (node.type === 'scoped_identifier' || node.type === 'scoped_type_identifier') {
    const previous = field(node, 'path');
    const prefix = previous ? segments(file, previous) : [''];
    const name = nameOf(file, field(node, 'name'));
    return prefix && name ? [...prefix, name] : null;
  }
  if (node.type === 'bracketed_type') return segments(file, named(node)[0]);
  return null;
}

function typePathTokens(file, node) {
  if (node.type === 'line_comment' || node.type === 'block_comment') return [];
  if (!node.children.length) return [spelling(file, node)];
  return node.children.flatMap(child => typePathTokens(file, child));
}

function writtenPath(file, expression) {
  const node = unwrapParentheses(expression);
  if (!node) return null;
  if (node.type === 'generic_function') return writtenPath(file, field(node, 'function'));
  if (node.type === 'field_expression') {
    const receiver = writtenPath(file, field(node, 'value'));
    const member = nameOf(file, field(node, 'field'));
    return receiver && member ? [...receiver, ['member', member]] : null;
  }
  if (node.type === 'scoped_identifier') {
    const qualifier = field(node, 'path');
    const prefix = qualifier ? writtenPath(file, qualifier) : [''];
    const name = nameOf(file, field(node, 'name'));
    return prefix && name ? [...prefix, name] : null;
  }
  if (['bracketed_type', 'generic_type'].includes(node.type)) return [['type', ...typePathTokens(file, node)]];
  return segments(file, node);
}

function* imports(file, node, prefix = []) {
  if (!node) return;
  if (node.type === 'scoped_use_list' || node.type === 'use_list') {
    const qualifier = field(node, 'path');
    const head = qualifier ? segments(file, qualifier) : node.children[0]?.type === '::' ? [''] : [];
    if (!head) return;
    const list = field(node, 'list') ?? node;
    for (const child of named(list)) yield* imports(file, child, [...prefix, ...head]);
    return;
  }
  if (node.type === 'use_wildcard') {
    yield {wildcard: true};
    return;
  }
  const remote = node.type === 'use_as_clause' ? field(node, 'path') : node;
  const tail = segments(file, remote);
  if (!tail) return;
  const parts = tail.length === 1 && tail[0] === 'self' && prefix.length ? prefix : [...prefix, ...tail];
  const name = nameOf(file, field(node, 'alias')) ?? parts.at(-1);
  if (name && name !== '_') yield {name, parts};
}

function modulePath(file, attributes) {
  const matches = attributes.filter(attribute => nameOf(file, named(attribute)[0]) === 'path');
  if (!matches.length) return undefined;
  if (matches.length !== 1) return null;
  const value = field(matches[0], 'value');
  if (value?.type === 'raw_string_literal') {
    return spelling(file, named(value).find(child => child.type === 'string_content')) ?? null;
  }
  if (value?.type !== 'string_literal') return null;
  let known = true;
  const text = spelling(file, value).slice(1, -1).replace(/\\(?:x([\da-f]{2})|u\{([\da-f_]+)\}|(\r?\n\s*)|(.))/giu,
    (_match, byte, unicode, continuation, char) => {
      if (continuation) return '';
      const code = parseInt(byte ?? unicode?.replaceAll('_', ''), 16);
      if (Number.isFinite(code) && code <= 0x10ffff) return String.fromCodePoint(code);
      const escapes = {'\\': '\\', '"': '"', "'": "'", n: '\n', r: '\r', t: '\t', '0': '\0'};
      if (Object.hasOwn(escapes, char)) return escapes[char];
      known = false;
      return '';
    });
  return known && text && !text.includes('\0') ? text : null;
}

function* patternNames(pattern) {
  if (!pattern) return;
  if (['identifier', 'shorthand_field_identifier'].includes(pattern.type)) yield pattern;
  else if (pattern.type === 'field_pattern') {
    const binding = field(pattern, 'pattern') ?? field(pattern, 'name');
    yield* patternNames(binding);
  } else if (pattern.type === 'parameter') yield* patternNames(field(pattern, 'pattern'));
  else if (pattern.type.endsWith('_pattern') || ['closure_parameters', 'parameters', 'tuple_expression', 'array_expression',
    'parenthesized_expression'].includes(pattern.type)) {
    for (const child of named(pattern)) {
      if (child.field !== 'type' && child.field !== 'condition') yield* patternNames(child);
    }
  }
}

function scope(module, parent = null, {itemBoundary = false, self = null} = {}) {
  return {module, parent, itemBoundary, self, bindings: new Map(), wildcard: false};
}

function candidates(current, name, mode, onlyHere = false) {
  let skipLocals = false;
  for (let at = current; at; at = onlyHere ? null : at.parent) {
    const choices = (at.bindings.get(name) ?? []).filter(binding =>
      (binding.namespace === mode || mode === 'any' || binding.namespace === 'both') &&
      !(skipLocals && lexicalBindings.has(binding.kind)));
    if (choices.length) return choices;
    if (at.wildcard) return [{kind: Reason.unresolvedGlobImport}];
    skipLocals ||= at.itemBoundary;
  }
  return [];
}

function inheritedSelf(current) {
  for (let at = current; at; at = at.parent) {
    if (at.self) return at.self;
    if (at.itemBoundary) break;
  }
  return null;
}

function resolvePath(current, parts, mode, visited) {
  if (!parts?.length) return unresolved(Reason.unsupportedQualifiedPath);
  const module = current.module;
  let entity;
  let start = 1;
  const [first] = parts;
  if (first === '') return unresolved(Reason.externalModule, false);
  if (first === 'crate') entity = module.root ? {module: module.root} : unresolved(Reason.unknownCrateRoot);
  else if (first === 'self') entity = {module};
  else if (first === 'super') {
    let parent = module.parent;
    while (parts[start] === 'super') {
      parent = parent?.parent;
      start++;
    }
    entity = parent ? {module: parent} : unresolved(Reason.unknownParentModule);
  } else if (first === 'Self') {
    const impl = inheritedSelf(current);
    entity = impl?.entity ?? unresolved(Reason.unresolvedSelfType);
  } else {
    entity = resolveName(current, first, parts.length === 1 ? mode : 'type', visited);
  }
  for (let i = start; i < parts.length && !entity.reason; i++) {
    const name = parts[i];
    const namespace = i === parts.length - 1 ? mode : 'type';
    if (entity.module) entity = resolveName(entity.module.scope, name, namespace, visited, true);
    else if (entity.type) {
      const methods = entity.type.methods.get(name) ?? [];
      if (namespace === 'type' || !methods.length) entity = unresolved(Reason.unresolvedAssociatedItem);
      else if (methods.length > 1) entity = unresolved(Reason.ambiguousInherentMethod);
      else if (methods[0].reason) entity = unresolved(methods[0].reason);
      else entity = resolved(methods[0].target);
    } else entity = unresolved(Reason.unsupportedQualifiedPath);
  }
  return entity;
}

function resolveName(current, name, mode, visited, onlyHere = false) {
  const found = candidates(current, name, mode, onlyHere);
  if (found.length > 1) return unresolved(found.some(binding => binding.conditional) ? Reason.conditionalCfg : Reason.ambiguousBinding);
  if (!found.length) return onlyHere ? unresolved(Reason.unindexedItem, false) : unresolved(Reason.unboundName);
  const binding = found[0];
  if (binding.conditional) return unresolved(Reason.conditionalCfg);
  if (binding.kind === 'function' || binding.kind === 'closure-binding') return resolved(binding.target);
  if (binding.kind === 'module') return {module: binding.module};
  if (binding.kind === 'type') return {type: binding};
  if (binding.kind === 'import' || binding.kind === 'type-alias') {
    if (visited.has(binding)) return unresolved(Reason.cyclicImport);
    visited.add(binding);
    const result = resolvePath(binding.current, binding.parts, binding.kind === 'type-alias' ? 'type' : mode, visited);
    visited.delete(binding);
    return result;
  }
  const reason = binding.kind === localValueKind ? Reason.dynamicValue : binding.kind;
  return unresolved(reason, reason !== Reason.externalModule && reason !== Reason.externFunction);
}

function resolveCallee(file, current, expression, definitions) {
  let node = unwrapParentheses(expression);
  if (node?.type === 'generic_function') node = field(node, 'function');
  if (!node) return unresolved(Reason.missingCallee);
  if (node.type === 'closure_expression') return resolved(definitions.get(node));
  if (node.type === 'field_expression') return unresolved(Reason.dynamicMember);
  if (node.type === 'scoped_identifier') {
    const qualifier = field(node, 'path');
    if (qualifier?.type === 'generic_type') return unresolved(Reason.genericDispatch);
    if (qualifier?.type === 'bracketed_type' && named(qualifier)[0]?.type === 'qualified_type') return unresolved(Reason.traitDispatch);
  }
  const parts = segments(file, node);
  if (!parts) return unresolved(Reason.dynamicCallee);
  const found = resolvePath(current, parts, 'value', new Set());
  return found.target || found.reason ? found : unresolved(Reason.nonFunctionItem, false);
}

function macroDependency(file, node) {
  const anchor = field(node, 'macro');
  const macroPath = segments(file, anchor)?.join('::');
  if (!macroPath) return null;
  return {id: JSON.stringify(['rust-macro', macroPath]), label: `${macroPath}!`,
    kind: 'macro', fileId: file.fileId, node, anchor, owner: null};
}

function indexRust(files, probe) {
  const indexed = new Set();
  const calls = [], impls = [], writes = [];

  function moduleAt(file, node, parent, name, directories, explicit, lineage, context, conditional = false) {
    const module = {
      file, parent, segments: parent ? [...parent.segments, name] : [],
      root: parent?.root ?? null, ...directories, lineage, context,
    };
    if (!parent && explicit) module.root = module;
    module.scope = scope(module);
    indexed.add(file);
    visitContainer(node, module.scope, null, conditional, new Map());
    return module;
  }

  function root(file, explicit) {
    const directory = path.dirname(file.physical);
    moduleAt(file, file.analysis.tree, null, null, {directory, attributeDir: directory},
      explicit, new Set([file.identity]), [file.identity]);
  }

  function childModule(current, node, name, attributes, conditional) {
    const parent = current.module;
    const file = parent.file;
    const body = field(node, 'body');
    const configured = modulePath(file, attributes);
    const context = [...parent.context, name, node.startIndex];
    if (configured === null) return {kind: Reason.unsupportedModulePath};
    if (body) {
      const directory = configured === undefined ? path.join(parent.directory, name) : path.resolve(parent.directory, configured);
      const module = moduleAt(file, body, parent, name, {directory, attributeDir: directory},
        false, parent.lineage, context, conditional);
      return {kind: 'module', module};
    }
    if (!parent.root) return {kind: Reason.unknownCrateRoot};
    if (current !== parent.scope && configured === undefined) return {kind: Reason.unsupportedBlockModule};
    // A conditional path attribute can replace the conventional layout.
    if (attributes.some(attribute => nameOf(file, named(attribute)[0]) === 'cfg_attr')) return {kind: Reason.conditionalCfg};
    const candidates = configured === undefined
      ? [path.join(parent.directory, name + '.rs'), path.join(parent.directory, name, 'mod.rs')]
      : [path.resolve(parent.attributeDir, configured)];
    const matches = candidates.map(candidate => ({candidate, ...probe(candidate, 'rust')})).filter(candidate => candidate.exists);
    if (matches.length > 1) return {kind: Reason.ambiguousModuleFile};
    const matched = matches[0];
    if (!matched?.file) return {kind: Reason.moduleOutsideInput};
    if (parent.lineage.has(matched.file.identity)) return {kind: Reason.cyclicModule};
    const attributeDir = path.dirname(matched.candidate);
    const directory = configured !== undefined || path.basename(matched.candidate) === 'mod.rs'
      ? attributeDir : path.join(attributeDir, name);
    const module = moduleAt(matched.file, matched.file.analysis.tree, parent, name, {directory, attributeDir},
      false, new Set([...parent.lineage, matched.file.identity]), context, conditional);
    return {kind: 'module', module};
  }

  function fnDefinition(current, node, definitions, inferred) {
    if (definitions.has(node)) return definitions.get(node);
    const {module} = current;
    const localName = nameOf(module.file, field(node, 'name')) ?? inferred ?? '(anonymous)';
    const qualifier = inheritedSelf(current)?.label;
    const label = [...(module.root ? ['crate'] : []), ...module.segments, ...(qualifier ? [qualifier] : []), localName].join('::');
    const fn = definition(module.file, node, label, module.context);
    definitions.set(node, fn);
    return fn;
  }

  function register(current, node, attributes, conditional, definitions) {
    const file = current.module.file;
    const name = nameOf(file, field(node, 'name'));
    const declare = (name, binding, namespace) => addBinding(current.bindings, name, {conditional, namespace, ...binding});
    if (node.type === 'function_item') {
      declare(name, {kind: 'function', target: fnDefinition(current, node, definitions)}, 'value');
    } else if (node.type === 'mod_item') {
      if (name) declare(name, childModule(current, node, name, attributes, conditional), 'both');
    } else if (node.type === 'use_declaration') {
      for (const specifier of imports(file, field(node, 'argument'))) {
        if (specifier.wildcard) current.wildcard = true;
        else declare(specifier.name, {kind: 'import', current, parts: specifier.parts}, 'both');
      }
    } else if (ordinaryTypes.has(node.type)) {
      declare(name, {kind: 'type', methods: new Map()}, node.type === 'struct_item' ? 'both' : 'type');
    } else if (node.type === 'type_item') {
      const parts = segments(file, field(node, 'type'));
      declare(name, parts && !field(node, 'type_parameters') ?
        {kind: 'type-alias', current, parts} : {kind: Reason.genericTypeAlias}, 'type');
    } else if (node.type === 'extern_crate_declaration') {
      declare(nameOf(file, field(node, 'alias')) ?? name, {kind: Reason.externalModule}, 'both');
    } else if (node.type === 'foreign_mod_item') {
      const body = field(node, 'body');
      if (body) for (const item of entries(body)) {
        if (['function_signature_item', 'static_item'].includes(item.node.type)) {
          declare(nameOf(file, field(item.node, 'name')), {kind: Reason.externFunction}, 'value');
        }
      }
    } else if (node.type === 'const_item' || node.type === 'static_item') {
      const value = unwrapParentheses(field(node, 'value'));
      const closure = value?.type === 'closure_expression' && !node.children.some(child => child.type === 'mutable_specifier');
      declare(name, closure ? {kind: 'function', target: fnDefinition(current, value, definitions, name)} :
        {kind: Reason.dynamicValue}, 'value');
    }
  }

  function bindPattern(current, pattern, kind = localValueKind, details = {}) {
    const file = current.module.file;
    for (const name of patternNames(pattern)) {
      const local = nameOf(file, name);
      if (!current.bindings.has(local)) addBinding(current.bindings, local, {kind, namespace: 'value', ...details});
    }
  }

  function bindGenerics(current, node) {
    const generic = field(node, 'type_parameters');
    if (!generic) return;
    for (const parameter of named(generic)) {
      addBinding(current.bindings, nameOf(current.module.file, field(parameter, 'name')),
        {kind: Reason.genericType, namespace: parameter.type === 'const_parameter' ? 'value' : 'type'});
    }
  }

  function visitContainer(container, current, caller, conditional, definitions) {
    const file = current.module.file;
    conditional ||= cfg(file, attributesOf(container));
    const children = entries(container);
    for (const child of children) {
      child.conditional = conditional || cfg(file, child.attributes);
      register(current, child.node, child.attributes, child.conditional, definitions);
    }
    for (const child of children) {
      const {node, conditional} = child;
      if (node.type === 'mod_item') continue;
      if (node.type === 'let_declaration') {
        const value = unwrapParentheses(field(node, 'value'));
        const pattern = field(node, 'pattern');
        const localName = pattern?.type === 'identifier' ? nameOf(file, pattern) : null;
        const target = localName && value?.type === 'closure_expression' ? fnDefinition(current, value, definitions, localName) : null;
        visit(node, current, caller, conditional, definitions);
        current = scope(current.module, current);
        bindPattern(current, pattern, target ? 'closure-binding' : localValueKind, {target, conditional});
      } else visit(node, current, caller, conditional, definitions);
    }
  }

  function visitImpl(node, current, caller, conditional, definitions) {
    const body = field(node, 'body');
    if (!body) return;
    const file = current.module.file;
    const type = field(node, 'type');
    const base = type?.type === 'generic_type' ? field(type, 'type') : type;
    const parts = segments(file, base);
    const trait = Boolean(field(node, 'trait')) || node.type === 'trait_item';
    const generic = type?.type === 'generic_type' || Boolean(field(node, 'type_parameters'));
    const impl = {current, parts, trait, generic, conditional, label: parts?.at(-1) ?? nameOf(file, field(node, 'name')),
      entity: null, methods: []};
    impls.push(impl);
    const context = scope(current.module, current, {self: impl});
    bindGenerics(context, node);
    for (const child of entries(body)) {
      const methodConditional = conditional || cfg(file, attributesOf(body)) || cfg(file, child.attributes);
      if (child.node.type === 'function_item') {
        const target = fnDefinition(context, child.node, definitions);
        impl.methods.push({name: nameOf(file, field(child.node, 'name')), target, conditional: methodConditional});
      }
      visit(child.node, context, caller, methodConditional, definitions, impl);
    }
  }

  function visitCondition(node, current, caller, conditional, definitions) {
    if (node?.type === 'let_chain') {
      for (const child of named(node)) current = visitCondition(child, current, caller, conditional, definitions);
    } else if (node?.type === 'let_condition') {
      const pattern = field(node, 'pattern');
      visit(node, current, caller, conditional, definitions);
      current = scope(current.module, current);
      bindPattern(current, pattern);
    } else if (node) visit(node, current, caller, conditional, definitions);
    return current;
  }

  function visit(node, current, caller, conditional, definitions, impl = null) {
    if (ignoredNodes.has(node.type)) return;
    const file = current.module.file;
    const descend = (child, where = current, nearest = caller) => visit(child, where, nearest, conditional, definitions);
    if (node.type === 'block') {
      visitContainer(node, scope(current.module, current), caller, conditional, definitions);
    } else if (node.type === 'function_item' || node.type === 'closure_expression') {
      const fn = fnDefinition(current, node, definitions);
      const params = scope(current.module, current, {itemBoundary: node.type === 'function_item' && !impl, self: impl});
      bindGenerics(params, node);
      bindPattern(params, field(node, 'parameters'), Reason.parameter);
      for (const child of named(node)) descend(child, params, fn);
    } else if (node.type === 'impl_item' || node.type === 'trait_item') {
      visitImpl(node, current, caller, conditional, definitions);
    } else if (node.type === 'if_expression' || node.type === 'while_expression') {
      const condition = field(node, 'condition');
      const consequent = field(node, 'consequence') ?? field(node, 'body');
      const bound = visitCondition(condition, current, caller, conditional, definitions);
      for (const child of named(node)) if (child !== condition) descend(child, child === consequent ? bound : current);
    } else if (node.type === 'for_expression' || node.type === 'match_arm') {
      const pattern = field(node, 'pattern');
      const body = field(node, 'body') ?? (node.type === 'match_arm' ? field(node, 'value') : undefined);
      const bound = scope(current.module, current);
      bindPattern(bound, pattern);
      for (const child of named(node)) descend(child, child === pattern || child === body ? bound : current);
    } else {
      if (node.type === 'call_expression') {
        calls.push({file, node, callee: field(node, 'function'), caller, current, conditional, definitions});
      } else if (node.type === 'macro_invocation') {
        const target = macroDependency(file, node);
        if (target) calls.push({file, node, caller, callee: target.anchor, resolution: resolved(target)});
      } else if (['assignment_expression', 'compound_assignment_expr', 'compound_assignment_expression'].includes(node.type)) {
        writes.push({current, file, pattern: field(node, 'left')});
      } else if (node.type === 'reference_expression' && node.children.some(child => child.type === 'mutable_specifier')) {
        writes.push({current, file, pattern: field(node, 'value')});
      }
      for (const child of named(node)) descend(child);
    }
  }

  const conventional = files.filter(file => ['lib.rs', 'main.rs'].includes(path.basename(file.physical)));
  for (const file of conventional) root(file, true);
  for (const file of files) if (!indexed.has(file)) root(file, false);
  for (const {current, file, pattern} of writes) {
    for (const name of patternNames(pattern)) for (const binding of candidates(current, nameOf(file, name), 'value')) {
      if (binding.kind === 'closure-binding') binding.kind = Reason.mutableBinding;
    }
  }
  for (const impl of impls) {
    if (impl.trait) impl.entity = unresolved(Reason.traitDispatch);
    else if (impl.conditional) impl.entity = unresolved(Reason.conditionalCfg);
    else if (impl.generic) impl.entity = unresolved(Reason.genericDispatch);
    const entity = impl.parts && resolvePath(impl.current, impl.parts, 'type', new Set());
    if (!entity?.type) continue;
    impl.entity ??= entity;
    if (impl.trait) continue;
    for (const method of impl.methods) {
      const reason = impl.conditional || method.conditional ? Reason.conditionalCfg : impl.generic ? Reason.genericDispatch : null;
      addBinding(entity.type.methods, method.name, {reason, target: method.target});
    }
  }
  return calls;
}

export function rustCalls(files, probe) {
  return indexRust(files, probe).map(call => {
    const resolution = call.resolution ?? (call.conditional ? unresolved(Reason.conditionalCfg)
      : resolveCallee(call.file, call.current, call.callee, call.definitions));
    return {...call, resolution, writtenPath: resolution.reason ? writtenPath(call.file, call.callee) : null};
  });
}
