import {fileURLToPath, pathToFileURL} from 'node:url';
import {addBinding, definition, field, named, resolved, spelling, unresolved, unwrapParentheses} from '../call-graph-syntax.mjs';

const declarations = new Set(['function_declaration', 'generator_function_declaration']);
const functions = new Set([...declarations, 'function_expression', 'generator_function', 'arrow_function', 'method_definition']);
const scopeNodes = new Set(['statement_block', 'switch_body', 'catch_clause', 'class_static_block', 'for_statement', 'for_in_statement']);
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

function* patternNames(node) {
  if (!node) return;
  if (identifiers.has(node.type)) yield node;
  else if (['assignment_pattern', 'object_assignment_pattern'].includes(node.type)) yield* patternNames(field(node, 'left'));
  else if (node.type === 'pair_pattern') yield* patternNames(field(node, 'value'));
  else if (['rest_pattern', 'object_pattern', 'array_pattern', 'formal_parameters', 'parenthesized_expression'].includes(node.type)) {
    for (const child of named(node)) yield* patternNames(child);
  }
}

function scope(parent, {variable = false, strict = parent?.strict ?? false, dynamic = false} = {}) {
  const current = {parent, bindings: new Map(), variable: null, strict, dynamic, evalBindings: false};
  current.variable = variable ? current : parent.variable;
  return current;
}

function bindingsFor(current, name, ignoreDynamic = false) {
  for (let at = current; at; at = at.parent) {
    if (at.dynamic && !ignoreDynamic) return [{kind: 'dynamic-scope'}];
    if (at.bindings.has(name)) {
      const choices = at.bindings.get(name);
      const substantive = choices.filter(choice => choice.kind !== 'uninitialized-var');
      return substantive.length ? substantive : [choices[0]];
    }
    if (at.evalBindings && !ignoreDynamic) return [{kind: 'dynamic-scope'}];
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
  const module = {file, top, exports: new Map(), definitions: new Map(), calls: [], wildcard: false};
  const writes = [];
  const evals = [];

  function declare(current, name, binding) {
    addBinding(current.bindings, nameOf(file, name), binding);
  }

  function indexFunction(node, parent, current, caller) {
    let binding = parent;
    while (binding?.type === 'parenthesized_expression') binding = parents.get(binding);
    const explicit = field(node, 'name');
    const inferred = binding?.type === 'variable_declarator' && field(binding, 'name')?.type === 'identifier'
      ? field(binding, 'name') : null;
    const localName = (explicit?.type === 'computed_property_name' ? null : nameOf(file, explicit)) ??
      nameOf(file, inferred) ?? (binding?.type === 'export_statement' ? 'default' : '(anonymous)');
    const fn = definition(file, node, localName);
    module.definitions.set(node, fn);
    const body = field(node, 'body');
    const strict = current.strict || node.type === 'method_definition' && parent?.type === 'class_body' ||
      Boolean(body?.type === 'statement_block' && hasStrictDirective(body, file));

    let nameScope = current;
    if (declarations.has(node.type)) {
      declare(current, explicit, {kind: 'function', target: fn, writable: true});
      // Sloppy scripts can make a block declaration visible as a var alias.
      if (!current.strict && current !== top && parent?.type !== 'export_statement' && !functionBodies.has(current)) {
        declare(current.variable, explicit, {kind: 'sloppy-block-function'});
      }
    } else if (explicit && node.type !== 'method_definition') {
      nameScope = scope(current);
      declare(nameScope, explicit, {kind: 'function', target: fn});
    }
    const params = scope(nameScope, {variable: true, strict});
    const parameters = field(node, 'parameters') ?? field(node, 'parameter');
    for (const name of patternNames(parameters)) declare(params, name, {kind: 'parameter'});
    const bodyScope = scope(params, {variable: true, strict});
    functionBodies.add(bodyScope);
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
      const fn = module.definitions.get(value ?? declaration);
      if (name) add('default', {kind: 'local-export', name});
      else if (fn) add('default', {kind: 'function', target: fn});
      else if (value?.type === 'identifier') add('default', {kind: 'local-export', name: nameOf(file, value)});
      else add('default', {kind: 'dynamic-value'});
    } else if (name) {
      add(name, {kind: 'local-export', name});
    } else if (declaration) {
      for (const declarator of named(declaration)) {
        for (const name of patternNames(field(declarator, 'name'))) {
          const local = nameOf(file, name);
          add(local, {kind: 'local-export', name: local});
        }
      }
    }
  }

  function visit(node, current, caller, parent = null, functionBody = false) {
    parents.set(node, parent);
    if (functions.has(node.type)) {
      indexFunction(node, parent, current, caller);
      return;
    }
    if (scopeNodes.has(node.type) && !functionBody) current = scope(current, {variable: node.type === 'class_static_block'});
    if (node.type === 'import_statement') importBindings(node, current);
    if (node.type === 'catch_clause') {
      for (const name of patternNames(field(node, 'parameter'))) declare(current, name, {kind: 'parameter'});
    }
    if (node.type === 'class' || node.type === 'class_declaration') {
      const name = field(node, 'name');
      if (node.type === 'class_declaration') declare(current, name, {kind: 'class', writable: true});
      current = scope(current, {strict: true});
      declare(current, name, {kind: 'class'});
    }
    if (node.type === 'variable_declarator') {
      const name = field(node, 'name');
      const value = unwrapParentheses(field(node, 'value'));
      const kind = field(parent, 'kind')?.type ?? (parent.type === 'variable_declaration' ? 'var' : 'let');
      const destination = kind === 'var' ? current.variable : current;
      for (const leaf of patternNames(name)) {
        const binding = kind === 'const' && leaf === name && functions.has(value?.type)
          ? {kind: 'function-initializer', value} : {kind: kind === 'const' ? 'dynamic-value' :
            kind === 'var' && !value ? 'uninitialized-var' : 'mutable-binding'};
        declare(destination, leaf, binding);
      }
    }
    if (node.type === 'for_in_statement') {
      const kind = field(node, 'kind')?.type;
      const left = field(node, 'left');
      if (kind) {
        for (const name of patternNames(left)) declare(kind === 'var' ? current.variable : current, name, {kind: 'dynamic-value'});
      } else writes.push({current, pattern: left});
    }
    if (['assignment_expression', 'augmented_assignment_expression', 'update_expression'].includes(node.type)) {
      writes.push({current, pattern: field(node, 'left') ?? field(node, 'argument')});
    }
    if (node.type === 'call_expression' || node.type === 'new_expression') {
      const callee = field(node, 'function') ?? field(node, 'constructor');
      // Dynamic import loads a module and does not invoke a function definition.
      if (callee?.type !== 'import') module.calls.push({file, node, callee, caller, current});
      const identifier = unwrapParentheses(callee);
      if (identifier?.type === 'identifier' && nameOf(file, identifier) === 'eval' && node.type === 'call_expression' &&
          !field(node, 'optional_chain')) evals.push(current);
    }
    const withBody = node.type === 'with_statement' ? field(node, 'body') : null;
    const withScope = withBody && scope(current, {dynamic: true});
    for (const child of named(node)) visit(child, child === withBody ? withScope : current, caller, node);
    if (node.type === 'export_statement') indexExports(node);
  }

  const parents = new Map();
  const functionBodies = new Set();
  visit(tree, top, null);
  for (const {current, pattern} of writes) {
    for (const leaf of patternNames(pattern)) {
      const matches = bindingsFor(current, nameOf(file, leaf), true);
      for (const binding of matches) if (binding.writable) binding.kind = 'mutable-binding';
    }
  }
  for (const current of evals) {
    const bindings = bindingsFor(current, 'eval');
    if (bindings.length === 1 && ['function', 'function-initializer', 'class'].includes(bindings[0].kind)) continue;
    // Sloppy direct eval can introduce bindings into the caller's variable
    // environment. Lookups that pass it may no longer reach outer bindings.
    if (!current.strict) current.variable.evalBindings = true;
    for (let at = current; at; at = at.parent) {
      for (const entries of at.bindings.values()) {
        for (const binding of entries) if (binding.writable) binding.kind = 'mutable-binding';
      }
    }
  }
  return module;
}

export function javascriptCalls(files, probe) {
  const modules = new Map(files.map(file => [file.fileId, indexModule(file)]));

  function relativeModule(module, specifier) {
    if (!specifier?.startsWith('./') && !specifier?.startsWith('../')) return unresolved('external-module', false);
    try {
      const url = new URL(specifier, pathToFileURL(module.file.physical));
      if (url.search || url.hash) return unresolved('unsupported-module-specifier');
      const {file} = probe(fileURLToPath(url), 'javascript');
      return file ? {namespace: modules.get(file.fileId)} : unresolved('module-outside-input');
    } catch {
      return unresolved('unsupported-module-specifier');
    }
  }

  function exported(module, name, visited) {
    const choices = module.exports.get(name) ?? [];
    if (choices.length > 1) return unresolved('ambiguous-export');
    if (!choices.length) return module.wildcard ?
      unresolved('unsupported-wildcard-export') : unresolved('unindexed-export', false);
    return resolveBinding(module, choices[0], visited);
  }

  function lexical(module, current, name, visited) {
    const choices = bindingsFor(current, name);
    if (choices.length > 1) return unresolved('ambiguous-binding');
    return choices.length ? resolveBinding(module, choices[0], visited) : unresolved('unbound-name');
  }

  function resolveBinding(module, binding, visited) {
    if (visited.has(binding)) return unresolved('cyclic-export');
    visited.add(binding);
    if (binding.kind === 'function') return resolved(binding.target);
    if (binding.kind === 'function-initializer') return resolved(module.definitions.get(binding.value));
    if (binding.kind === 'local-export') return lexical(module, module.top, binding.name, visited);
    if (binding.kind === 'namespace' || binding.kind === 'import') {
      const destination = relativeModule(module, binding.specifier);
      return !destination.namespace || binding.kind === 'namespace' ? destination : exported(destination.namespace, binding.name, visited);
    }
    if (binding.kind === 'class') return unresolved('class-constructor', false);
    if (binding.kind === 'uninitialized-var') return unresolved('mutable-binding');
    return unresolved(binding.kind);
  }

  function resolveExpression(module, current, expression, visited) {
    const node = unwrapParentheses(expression);
    if (!node) return unresolved('missing-callee');
    if (functions.has(node.type)) return resolved(module.definitions.get(node));
    if (identifiers.has(node.type)) return lexical(module, current, nameOf(module.file, node), visited);
    if (node.type === 'member_expression') {
      const object = resolveExpression(module, current, field(node, 'object'), visited);
      if (object.namespace) return exported(object.namespace, nameOf(module.file, field(node, 'property')), visited);
      if (['module-outside-input', 'external-module'].includes(object.reason)) return object;
      return unresolved('dynamic-member');
    }
    if (node.type === 'subscript_expression') {
      const index = unwrapParentheses(field(node, 'index'));
      if (index?.type === 'string') {
        const object = resolveExpression(module, current, field(node, 'object'), visited);
        if (object.namespace) return exported(object.namespace, nameOf(module.file, index), visited);
        if (['module-outside-input', 'external-module'].includes(object.reason)) return object;
      }
      return unresolved('computed-member');
    }
    return unresolved('dynamic-callee');
  }

  return [...modules.values()].flatMap(module => module.calls.map(call => {
    const result = resolveExpression(module, call.current, call.callee, new Set());
    const resolution = result.namespace ? unresolved('namespace-not-callable', false) : result;
    return {...call, resolution};
  }));
}
