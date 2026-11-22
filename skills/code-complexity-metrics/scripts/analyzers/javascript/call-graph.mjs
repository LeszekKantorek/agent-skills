import {fileURLToPath, pathToFileURL} from 'node:url';
import {CallGraphReason as Reason} from '../../call-graph-reasons.mjs';
import {addBinding, definition, field, named, resolved, spelling, unresolved, unwrapParentheses} from '../call-graph-syntax.mjs';

const declarations = new Set(['function_declaration', 'generator_function_declaration']);
const functions = new Set([...declarations, 'function_expression', 'generator_function', 'arrow_function', 'method_definition']);
const classes = new Set(['class', 'class_declaration']);
const scopeNodes = new Set(['statement_block', 'switch_body', 'catch_clause', 'for_statement', 'for_in_statement']);
const identifiers = new Set(['identifier', 'undefined', 'shorthand_property_identifier_pattern']);
const escapes = new Map([['b', '\b'], ['f', '\f'], ['n', '\n'], ['r', '\r'], ['t', '\t'], ['v', '\v'], ['0', '\0']]);

function decode(text) {
  return text.replace(/\\(?:u\{([\da-f]+)\}|u([\da-f]{4})|x([\da-f]{2})|(\r\n|[\r\n\u2028\u2029])|(.))/giu,
    (_match, codePoint, unicode, byte, continuation, char) => {
      if (continuation) return '';
      const code = parseInt(codePoint ?? unicode ?? byte, 16);
      if (Number.isFinite(code)) return code <= 0x10ffff ? String.fromCodePoint(code) : '\ufffd';
      return escapes.get(char) ?? char;
    });
}

function nameOf(file, node) {
  const text = spelling(file, node);
  return text == null ? null : decode(node.type === 'string' ? text.slice(1, -1) : text);
}

function writtenPath(file, expression) {
  const node = unwrapParentheses(expression);
  if (!node) return null;
  if (identifiers.has(node.type) || node.type === 'this' || node.type === 'super') return [nameOf(file, node)];
  if (node.type !== 'member_expression' && node.type !== 'subscript_expression') return null;
  const object = writtenPath(file, field(node, 'object'));
  const member = node.type === 'member_expression' ? field(node, 'property') : unwrapParentheses(field(node, 'index'));
  if (!object || !member) return null;
  const knownMember = node.type === 'member_expression' || ['string', 'number'].includes(member.type);
  return knownMember ? [...object, nameOf(file, member)] : null;
}

function memberAccess(file, node) {
  if (node?.type === 'member_expression') {
    const property = field(node, 'property');
    return {
      object: field(node, 'object'), key: nameOf(file, property), reason: Reason.dynamicMember,
      privateMember: property?.type === 'private_property_identifier',
    };
  }
  if (node?.type === 'subscript_expression') {
    const index = unwrapParentheses(field(node, 'index'));
    return {
      object: field(node, 'object'), key: index?.type === 'string' ? nameOf(file, index) : null,
      reason: Reason.computedMember,
    };
  }
  return null;
}

const hasToken = (node, token) => node.children.some(child => !child.isNamed && child.type === token);

function classMemberName(file, node) {
  if (node?.type !== 'computed_property_name') return nameOf(file, node);
  const key = unwrapParentheses(named(node)[0]);
  return key?.type === 'string' ? nameOf(file, key) : null;
}

function indexClassMembers(file, body) {
  const methods = new Map();
  let dynamicMembers = false;
  for (const member of body ? named(body) : []) {
    if (member.type === 'class_static_block' || !hasToken(member, 'static')) continue;
    const property = field(member, 'name') ?? field(member, 'property');
    if (property?.type === 'private_property_identifier') continue;
    const key = classMemberName(file, property);
    if (key === null || property?.type === 'number') {
      dynamicMembers = true;
      continue;
    }
    const uniqueMethod = member.type === 'method_definition' && !hasToken(member, 'get')
      && !hasToken(member, 'set') && !methods.has(key);
    methods.set(key, uniqueMethod ? member : null);
  }
  return {methods, dynamicMembers};
}

function* patternTargets(node) {
  if (!node) return;
  if (identifiers.has(node.type) || ['member_expression', 'subscript_expression'].includes(node.type)) yield node;
  else if (['assignment_pattern', 'object_assignment_pattern'].includes(node.type)) yield* patternTargets(field(node, 'left'));
  else if (node.type === 'pair_pattern') yield* patternTargets(field(node, 'value'));
  else if (['rest_pattern', 'object_pattern', 'array_pattern', 'formal_parameters', 'parenthesized_expression'].includes(node.type)) {
    for (const child of named(node)) yield* patternTargets(child);
  }
}

function scope(parent, {variable = false, strict = parent?.strict ?? false, dynamic = false,
  staticReceiver = parent?.staticReceiver ?? null} = {}) {
  const current = {parent, bindings: new Map(), variable: null, strict, dynamic, staticReceiver, evalBindings: false};
  current.variable = variable ? current : parent.variable;
  return current;
}

function bindingsFor(current, name, ignoreDynamic = false) {
  for (let at = current; at; at = at.parent) {
    if (at.dynamic && !ignoreDynamic) return [{kind: Reason.dynamicScope}];
    if (at.bindings.has(name)) {
      const choices = at.bindings.get(name);
      const substantive = choices.filter(choice => choice.kind !== 'uninitialized-var');
      return substantive.length ? substantive : [choices[0]];
    }
    if (at.evalBindings && !ignoreDynamic) return [{kind: Reason.dynamicScope}];
  }
  return [];
}

function hasStrictDirective(node, file) {
  for (const statement of named(node)) {
    const child = named(statement)[0];
    if (statement.type !== 'expression_statement' || child?.type !== 'string') break;
    if (['"use strict"', "'use strict'"].includes(spelling(file, child))) return true;
  }
  return false;
}

function indexModule(file) {
  const tree = file.analysis.tree;
  const top = scope(null, {variable: true, strict: file.physical.endsWith('.mjs') || hasStrictDirective(tree, file) ||
    named(tree).some(node => ['import_statement', 'export_statement'].includes(node.type))});
  const classValues = new Map();
  const module = {file, top, exports: new Map(), definitions: new Map(), classValues,
    calls: [], memberWrites: [], classEscapes: [], evalScopes: [], wildcard: false};
  const writes = [];
  const evals = [];

  function declare(current, name, binding) {
    addBinding(current.bindings, nameOf(file, name), binding);
  }

  function indexFunction(node, parent, current, caller) {
    let binding = parent;
    while (binding?.type === 'parenthesized_expression') binding = parents.get(binding);
    const explicit = field(node, 'name');
    const classValue = parent?.type === 'class_body' ? classValues.get(parents.get(parent)) : null;
    const inferred = binding?.type === 'variable_declarator' && field(binding, 'name')?.type === 'identifier'
      ? field(binding, 'name') : null;
    const methodName = explicit?.type === 'computed_property_name' && !classValue ? null : classMemberName(file, explicit);
    const localName = methodName ?? nameOf(file, inferred) ??
      (binding?.type === 'export_statement' ? 'default' : '(anonymous)');
    const isStaticMethod = classValue && hasToken(node, 'static');
    const classPrefix = isStaticMethod ? classValue.name : `${classValue?.name}.prototype`;
    const label = classValue ? `${classPrefix}.${localName}` : localName;
    const fn = definition(file, node, label);
    module.definitions.set(node, fn);
    const body = field(node, 'body');
    const strict = current.strict || node.type === 'method_definition' && parent?.type === 'class_body' ||
      Boolean(body?.type === 'statement_block' && hasStrictDirective(body, file));

    let nameScope = current;
    if (declarations.has(node.type)) {
      declare(current, explicit, {kind: 'function', target: fn, writable: true});
      // Sloppy scripts can make a block declaration visible as a var alias.
      if (!current.strict && current !== top && parent?.type !== 'export_statement' && !functionBodies.has(current)) {
        declare(current.variable, explicit, {kind: Reason.sloppyBlockFunction});
      }
    } else if (explicit && node.type !== 'method_definition') {
      nameScope = scope(current);
      declare(nameScope, explicit, {kind: 'function', target: fn});
    }
    const staticReceiver = node.type === 'arrow_function' ? current.staticReceiver : isStaticMethod ? classValue : null;
    const params = scope(nameScope, {variable: true, strict, staticReceiver});
    const parameters = field(node, 'parameters') ?? field(node, 'parameter');
    for (const name of patternTargets(parameters)) declare(params, name, {kind: Reason.parameter});
    const bodyScope = scope(params, {variable: true, strict});
    functionBodies.add(bodyScope);
    if (node.type === 'arrow_function' && body?.type !== 'statement_block') rememberClassEscape(body, bodyScope);
    for (const child of named(node)) {
      if (child === body) visit(child, bodyScope, fn, node, true);
      else if (child === parameters) visit(child, params, fn, node);
      else if (child === explicit && explicit.type === 'computed_property_name') visit(child, current, caller, node);
    }
  }

  function importBindings(node, current) {
    const specifier = nameOf(file, field(node, 'source'));
    const clause = named(node).find(child => child.type === 'import_clause');
    if (!clause) return;
    for (const child of named(clause)) {
      if (child.type === 'identifier') declare(current, child, {kind: 'import', specifier, name: 'default'});
      else if (child.type === 'namespace_import') {
        declare(current, named(child)[0], {kind: 'namespace', specifier});
      } else if (child.type === 'named_imports') {
        for (const item of named(child)) {
          const imported = field(item, 'name');
          declare(current, field(item, 'alias') ?? imported, {kind: 'import', specifier, name: nameOf(file, imported)});
        }
      }
    }
  }

  function indexExports(node) {
    const add = (name, binding) => addBinding(module.exports, name, binding);
    const specifier = nameOf(file, field(node, 'source'));
    const clause = named(node).find(child => child.type === 'export_clause');
    const namespace = named(node).find(child => child.type === 'namespace_export');
    const declaration = field(node, 'declaration');
    const value = unwrapParentheses(field(node, 'value'));
    const name = nameOf(file, field(declaration, 'name'));
    if (clause) {
      for (const item of named(clause)) {
        const original = nameOf(file, field(item, 'name'));
        const exported = nameOf(file, field(item, 'alias')) ?? original;
        add(exported, {kind: specifier === null ? 'local-export' : 'import', specifier, name: original});
      }
    } else if (namespace) {
      add(nameOf(file, named(namespace)[0]), {kind: 'namespace', specifier});
    } else if (node.children.some(child => child.type === '*')) {
      module.wildcard = true;
    } else if (node.children.some(child => child.type === 'default')) {
      const target = value ?? declaration;
      const fn = module.definitions.get(target);
      const classValue = classValues.get(target);
      if (name) add('default', {kind: 'local-export', name});
      else if (fn) add('default', {kind: 'function', target: fn});
      else if (classValue) add('default', {kind: 'class', classValue});
      else if (value?.type === 'identifier') add('default', {kind: 'local-export', name: nameOf(file, value)});
      else add('default', {kind: Reason.dynamicValue});
    } else if (name) {
      add(name, {kind: 'local-export', name});
    } else if (declaration) {
      for (const declarator of named(declaration)) {
        for (const name of patternTargets(field(declarator, 'name'))) {
          const local = nameOf(file, name);
          add(local, {kind: 'local-export', name: local});
        }
      }
    }
  }

  function indexClass(node, parent, current) {
    const name = field(node, 'name');
    let wrapper = parent;
    while (wrapper?.type === 'parenthesized_expression') wrapper = parents.get(wrapper);
    const inferredName = wrapper?.type === 'variable_declarator' ? field(wrapper, 'name') : null;
    const label = nameOf(file, name) ?? (inferredName?.type === 'identifier' ? nameOf(file, inferredName) : null);
    const classValue = {name: label ?? '(anonymous class)', ...indexClassMembers(file, field(node, 'body')), module};
    classValues.set(node, classValue);
    if (node.type === 'class_declaration') declare(current, name, {kind: 'class', classValue, writable: true});
    const classScope = scope(current, {strict: true, staticReceiver: null});
    declare(classScope, name, {kind: 'class', classValue});
    return classScope;
  }

  function indexVariable(node, parent, current) {
    const name = field(node, 'name');
    const value = unwrapParentheses(field(node, 'value'));
    const kind = field(parent, 'kind')?.type ?? (parent.type === 'variable_declaration' ? 'var' : 'let');
    const destination = kind === 'var' ? current.variable : current;
    const trackInitializer = kind === 'const' || kind === 'let';
    for (const leaf of patternTargets(name)) {
      let binding;
      if (trackInitializer && leaf === name && functions.has(value?.type)) {
        binding = {kind: 'function-initializer', value, writable: kind === 'let'};
      } else if (trackInitializer && leaf === name && classes.has(value?.type)) {
        binding = {kind: 'class-initializer', value, writable: kind === 'let'};
      } else if (trackInitializer && leaf === name && mayReferenceClass(value)) {
        binding = {kind: 'class-alias', value, current, classAlias: true, writable: kind === 'let'};
      } else {
        binding = {kind: kind === 'const' ? Reason.dynamicValue :
          kind === 'var' && !value ? 'uninitialized-var' : Reason.mutableBinding};
      }
      declare(destination, leaf, binding);
    }
  }

  function mayReferenceClass(node) {
    return identifiers.has(node?.type) || ['member_expression', 'subscript_expression', 'this'].includes(node?.type);
  }

  function rememberClassEscape(expression, current) {
    const value = unwrapParentheses(expression);
    if (mayReferenceClass(value)) module.classEscapes.push({value, current});
  }

  function visit(node, current, caller, parent = null, functionBody = false) {
    parents.set(node, parent);
    if (functions.has(node.type)) {
      indexFunction(node, parent, current, caller);
      return;
    }
    if (node.type === 'class_static_block') {
      current = scope(current, {variable: true, staticReceiver: classValues.get(parents.get(parent))});
    } else if (scopeNodes.has(node.type) && !functionBody) current = scope(current);
    if (node.type === 'import_statement') importBindings(node, current);
    if (node.type === 'catch_clause') {
      for (const name of patternTargets(field(node, 'parameter'))) declare(current, name, {kind: Reason.parameter});
    }
    if (classes.has(node.type)) current = indexClass(node, parent, current);
    if (node.type === 'variable_declarator') indexVariable(node, parent, current);
    if (node.type === 'for_in_statement') {
      const kind = field(node, 'kind')?.type;
      const left = field(node, 'left');
      if (kind) {
        for (const name of patternTargets(left)) declare(kind === 'var' ? current.variable : current, name, {kind: Reason.dynamicValue});
      } else writes.push({current, pattern: left});
    }
    if (['assignment_expression', 'augmented_assignment_expression', 'update_expression'].includes(node.type)) {
      writes.push({current, pattern: field(node, 'left') ?? field(node, 'argument')});
      rememberClassEscape(field(node, 'right'), current);
    }
    if (node.type === 'unary_expression' && field(node, 'operator')?.type === 'delete') {
      const access = memberAccess(file, unwrapParentheses(field(node, 'argument')));
      if (access && !access.privateMember) module.memberWrites.push({current, ...access});
    }
    if (node.type === 'call_expression' || node.type === 'new_expression') {
      const callee = field(node, 'function') ?? field(node, 'constructor');
      // Dynamic import loads a module and does not invoke a function definition.
      if (callee?.type !== 'import') module.calls.push({file, node, callee, caller, current});
      const identifier = unwrapParentheses(callee);
      if (identifier?.type === 'identifier' && nameOf(file, identifier) === 'eval' && node.type === 'call_expression' &&
          !field(node, 'optional_chain')) evals.push(current);
      const args = field(node, 'arguments');
      if (args) {
        for (const argument of named(args)) {
          rememberClassEscape(argument.type === 'spread_element' ? named(argument)[0] : argument, current);
        }
      }
    }
    if (node.type === 'return_statement') rememberClassEscape(named(node)[0], current);
    const withBody = node.type === 'with_statement' ? field(node, 'body') : null;
    const withScope = withBody && scope(current, {dynamic: true});
    const staticFieldValue = node.type === 'field_definition' && hasToken(node, 'static') ? field(node, 'value') : null;
    for (const child of named(node)) {
      const childScope = child === withBody ? withScope : child === staticFieldValue
        ? scope(current, {staticReceiver: classValues.get(parents.get(parent))}) : current;
      visit(child, childScope, caller, node);
    }
    if (node.type === 'export_statement') indexExports(node);
  }

  const parents = new Map();
  const functionBodies = new Set();
  visit(tree, top, null);
  for (const {current, pattern} of writes) {
    for (const leaf of patternTargets(pattern)) {
      const access = memberAccess(file, leaf);
      if (access) {
        if (!access.privateMember) module.memberWrites.push({current, ...access});
        continue;
      }
      const matches = bindingsFor(current, nameOf(file, leaf), true);
      for (const binding of matches) if (binding.writable) binding.kind = Reason.mutableBinding;
    }
  }
  for (const current of evals) {
    const bindings = bindingsFor(current, 'eval');
    if (bindings.length === 1 && ['function', 'function-initializer', 'class', 'class-initializer'].includes(bindings[0].kind)) continue;
    // Sloppy direct eval can introduce bindings into the caller's variable
    // environment. Lookups that pass it may no longer reach outer bindings.
    if (!current.strict) current.variable.evalBindings = true;
    module.evalScopes.push(current);
    for (let at = current; at; at = at.parent) {
      for (const entries of at.bindings.values()) {
        for (const binding of entries) if (binding.writable) binding.kind = Reason.mutableBinding;
      }
    }
  }
  return module;
}

export function javascriptCalls(files, probe) {
  const modules = new Map(files.map(file => [file.fileId, indexModule(file)]));

  function relativeModule(module, specifier) {
    if (!specifier?.startsWith('./') && !specifier?.startsWith('../')) return unresolved(Reason.externalModule, false);
    try {
      const url = new URL(specifier, pathToFileURL(module.file.physical));
      if (url.search || url.hash) return unresolved(Reason.unsupportedModuleSpecifier);
      const {file} = probe(fileURLToPath(url), 'javascript');
      return file ? {namespace: modules.get(file.fileId)} : unresolved(Reason.moduleOutsideInput);
    } catch {
      return unresolved(Reason.unsupportedModuleSpecifier);
    }
  }

  function exported(module, name, visited, forWrite) {
    const choices = module.exports.get(name) ?? [];
    if (choices.length > 1) return unresolved(Reason.ambiguousExport);
    if (!choices.length) return module.wildcard ?
      unresolved(Reason.unsupportedWildcardExport) : unresolved(Reason.unindexedExport, false);
    return resolveBinding(module, choices[0], visited, forWrite);
  }

  function lexical(module, current, name, visited, forWrite) {
    const choices = bindingsFor(current, name, forWrite);
    if (choices.length > 1) return unresolved(Reason.ambiguousBinding);
    return choices.length ? resolveBinding(module, choices[0], visited, forWrite) : unresolved(Reason.unboundName);
  }

  function resolveBinding(module, binding, visited, forWrite) {
    if (visited.has(binding)) return unresolved(Reason.cyclicExport);
    visited.add(binding);
    if (binding.kind === 'function') return resolved(binding.target);
    if (binding.kind === 'function-initializer') return resolved(module.definitions.get(binding.value));
    if (binding.kind === 'class' || binding.kind === 'class-initializer' || forWrite && binding.kind === Reason.mutableBinding) {
      const classValue = binding.classValue ?? module.classValues.get(binding.value);
      if (classValue) return {classValue};
    }
    if (binding.kind === 'class-alias' || forWrite && binding.classAlias) {
      const {classValue} = resolveExpression(module, binding.current, binding.value, visited, forWrite);
      return classValue ? {classValue} : unresolved(binding.writable ? Reason.mutableBinding : Reason.dynamicValue);
    }
    if (binding.kind === 'local-export') return lexical(module, module.top, binding.name, visited, forWrite);
    if (binding.kind === 'namespace' || binding.kind === 'import') {
      const destination = relativeModule(module, binding.specifier);
      return !destination.namespace || binding.kind === 'namespace' ? destination
        : exported(destination.namespace, binding.name, visited, forWrite);
    }
    if (binding.kind === 'uninitialized-var') return unresolved(Reason.mutableBinding);
    return unresolved(binding.kind);
  }

  function resolveExpression(module, current, expression, visited, forWrite = false) {
    const node = unwrapParentheses(expression);
    if (!node) return unresolved(Reason.missingCallee);
    if (functions.has(node.type)) return resolved(module.definitions.get(node));
    if (identifiers.has(node.type)) return lexical(module, current, nameOf(module.file, node), visited, forWrite);
    if (node.type === 'this' && forWrite) return {classValue: current.staticReceiver};
    const access = memberAccess(module.file, node);
    if (!access) return unresolved(Reason.dynamicCallee);
    const {key, reason} = access;
    if (key === null || access.privateMember) return unresolved(reason);
    const object = resolveExpression(module, current, access.object, visited, forWrite);
    if (object.namespace) return exported(object.namespace, key, visited, forWrite);
    if ([Reason.moduleOutsideInput, Reason.externalModule].includes(object.reason)) return object;
    const classValue = object.classValue;
    const method = !classValue?.dynamicMembers && classValue?.methods.get(key);
    return method ? resolved(classValue.module.definitions.get(method)) : unresolved(reason);
  }

  function invalidateClasses({classValue, namespace}, namespaces) {
    if (classValue) classValue.dynamicMembers = true;
    if (!namespace || namespaces.has(namespace)) return;
    namespaces.add(namespace);
    for (const name of namespace.exports.keys()) {
      invalidateClasses(exported(namespace, name, new Set(), true), namespaces);
    }
  }

  for (const module of modules.values()) {
    for (const {current, object, key} of module.memberWrites) {
      const {classValue} = resolveExpression(module, current, object, new Set(), true);
      if (!classValue) continue;
      if (key === null) classValue.dynamicMembers = true;
      else classValue.methods.delete(key);
    }
    const namespaces = new Set();
    for (const {current, value} of module.classEscapes) {
      invalidateClasses(resolveExpression(module, current, value, new Set(), true), namespaces);
    }
    for (const current of module.evalScopes) {
      if (current.staticReceiver) current.staticReceiver.dynamicMembers = true;
      const seen = new Set();
      for (let at = current; at; at = at.parent) {
        for (const [name, bindings] of at.bindings) {
          if (seen.has(name)) continue;
          seen.add(name);
          for (const binding of bindings) invalidateClasses(resolveBinding(module, binding, new Set(), true), namespaces);
        }
      }
    }
  }
  return [...modules.values()].flatMap(module => module.calls.map(call => {
    const result = resolveExpression(module, call.current, call.callee, new Set());
    const resolution = result.namespace ? unresolved(Reason.namespaceNotCallable, false)
      : result.classValue ? unresolved(Reason.classConstructor, false) : result;
    return {...call, resolution, writtenPath: resolution.reason ? writtenPath(call.file, call.callee) : null};
  }));
}
