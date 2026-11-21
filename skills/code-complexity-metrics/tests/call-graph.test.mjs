import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {analyzerFor} from '../scripts/analyzers/registry.mjs';
import {aggregate} from '../scripts/aggregation.mjs';
import {buildCallGraph} from '../scripts/call-graph.mjs';
import {languageFor} from '../scripts/input-files.mjs';
import {parse} from '../scripts/parser.mjs';

const cli = fileURLToPath(new URL('../scripts/measure.mjs', import.meta.url));
const counts = (fan_in, fan_out, instability) => ({fan_in, fan_out, instability});
const complete = {complete: true, unresolved_calls: 0, reasons: []};
const partial = (unresolved_calls, ...reasons) => ({complete: false, unresolved_calls, reasons});
const record = (result, name) => result.functions.find(candidate => candidate.name === name).callGraph;

async function fixture(t, sources, selected = Object.keys(sources)) {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'complexity-graph-'));
  t.after(() => rmSync(cwd, {recursive: true, force: true}));
  for (const [name, source] of Object.entries(sources)) {
    const file = path.join(cwd, name);
    mkdirSync(path.dirname(file), {recursive: true});
    writeFileSync(file, source);
  }
  const read = async (files = selected) => {
    const results = [];
    for (const name of files) {
      const source = sources[name];
      const fileId = path.join(cwd, name);
      const language = languageFor(fileId);
      const parsed = await parse(source, language);
      try {
        const analysis = analyzerFor(language).analyze(parsed.tree, source, fileId);
        results.push({fileId, source: {fileId, source}, analysis, diagnostics: []});
      } finally {
        parsed.dispose();
      }
    }
    const result = aggregate(results);
    buildCallGraph(result, results);
    return result;
  };
  const run = (files, ...options) => spawnSync(process.execPath,
    [cli, ...files.flatMap(file => ['--path', file]), ...options], {cwd, encoding: 'utf8'});
  return {cwd, read, run};
}

function readReport(result, status = 0) {
  assert.equal(result.status, status, result.stderr);
  return JSON.parse(result.stdout);
}

const reported = (report, name) => report.functions.find(fn => fn.name === name);

test('specification examples count distinct callers and targets', async t => {
  const {read} = await fixture(t, {'a.mjs': `
    function validate() {}
    function connect() {}
    function listen() {}
    function startServer() { validate(); validate(); connect(); listen(); }
    function main() { startServer(); startServer(); }
    function restart() { startServer(); }
    function ping() {}
    function start(ready) {
      const check = () => {
        if (!ready) return;
        ping();
      };
      check();
    }
    function caller() { start(true); start(false); }
    function otherCaller() { start(true); }
    function isolated() {}
  `});
  const result = await read();
  assert.deepEqual(record(result, 'startServer').metrics, counts(2, 3, 0.6));
  assert.deepEqual(record(result, 'start').metrics, counts(2, 2, 0.5));
  assert.deepEqual(record(result, 'isolated').metrics, counts(0, 0, null));
  assert.deepEqual(result.callGraph, {scope: 'input_files', ...complete});
});

test('ESM aliases, default and namespace imports, and reexports retain canonical targets', async t => {
  const sources = {
    'a.mjs': 'export function validate() {}',
    'b.mjs': 'export default () => {};',
    'c.mjs': "export { validate as check } from './a.mjs'; export * as fromA from './a.mjs';",
    'start.mjs': `
      import { check as validate, fromA } from './c.mjs';
      import * as a from './a.mjs';
      import useDefault, { default as same } from './b.mjs';
      function start() {
        validate(); (a).validate(); fromA['validate'](); useDefault(); same();
      }
    `,
  };
  const files = Object.keys(sources);
  const {read, run} = await fixture(t, sources);
  const result = await read();
  const start = record(result, 'start');
  assert.deepEqual(start.metrics, counts(0, 2, 1));
  assert.deepEqual(start.outgoing.map(({target}) => path.basename(target.fileId)),
    ['a.mjs', 'a.mjs', 'a.mjs', 'b.mjs', 'b.mjs']);
  assert.deepEqual(start.outgoing.map(({node}) => node.startPosition.row), [5, 5, 5, 5, 5]);
  assert.equal(new Set(start.outgoing.map(({target}) => target.id)).size, 2);
  const full = run(files);
  assert.equal(full.status, 0, full.stderr);
  assert.equal(run([...files].reverse()).stdout, full.stdout);
  const filtered = run(files, '--filter', 'start');
  assert.equal(filtered.status, 0, filtered.stderr);
  const fullReport = JSON.parse(full.stdout);
  const filteredReport = JSON.parse(filtered.stdout);
  assert.deepEqual(filteredReport.functions, fullReport.functions.filter(fn => fn.name === 'start'));
  assert.deepEqual(filteredReport.summary.call_graph, fullReport.summary.call_graph);
  const explain = run(files, '--filter', 'start', '--explain');
  assert.equal(explain.status, 0, explain.stderr);
  assert.match(explain.stdout, /Fan-In: 0 \| Fan-Out: 2\nInstability: 1\.00\n/u);
  assert.doesNotMatch(explain.stdout, /Outgoing calls|Incoming callers/u);
});

test('JavaScript lexical binding follows parameters, block declarations, var and writes', async t => {
  const {read} = await fixture(t, {'scopes.js': `
    function hit() {}
    function helper() {}
    function scopes() {
      hit();
      { let hit; hit(); }
      { const hit = () => {}; hit(); }
      function params({hit}) { hit(); }
      function hoisted() { hit(); if (true) { var hit; } }
      function defaults(f = hit()) { var hit; hit(); }
      function stable() { function check() {} var check; check(); }
      function rewrite() { helper = () => {}; helper(); }
      function viaLoop() { for (helper of []) helper(); }
      function viaMember(object) { object.hit(); object['hit'](); }
    }
    function other() { helper(); }
  `});
  const result = await read();
  const scopes = record(result, 'scopes');
  assert.deepEqual(scopes.metrics, counts(0, 3, 1));
  assert.equal(record(result, 'hit').metrics.fan_in, 2);
  assert.equal(record(result, 'helper').metrics.fan_in, 0);
  assert.deepEqual(scopes.outgoing.map(call => call.reason ?? call.target.label),
    ['hit', 'mutable-binding', 'hit', 'parameter', 'mutable-binding', 'hit', 'mutable-binding',
      'check', 'mutable-binding', 'mutable-binding', 'dynamic-member', 'computed-member']);
  assert.deepEqual(record(result, 'other').fan_out, partial(1, 'mutable-binding'));
  assert.deepEqual(record(result, 'helper').fan_out, complete);
  assert.deepEqual(record(result, 'helper').fan_in, partial(9, 'computed-member', 'dynamic-member', 'mutable-binding', 'parameter'));
});

test('JavaScript assigns nearest caller, skips exact recursion and ignores top-level callers', async t => {
  const {read} = await fixture(t, {'nested.mjs': `
    function dependency() {}
    function start() {
      start();
      const first = function self() { self(); dependency(); dependency(); start(); };
      const second = () => { dependency(); };
      first(); first(); second();
    }
    start();
  `});
  const result = await read();
  const start = record(result, 'start');
  const dependency = record(result, 'dependency');
  assert.deepEqual(start.metrics, counts(1, 4, 0.8));
  assert.equal(start.incoming[0].caller.label, 'self');
  assert.deepEqual(start.outgoing.filter(call => call.excluded).map(call => call.target.label), ['start', 'self']);
  assert.deepEqual(dependency.metrics, counts(2, 0, 0));
  assert.deepEqual([...new Set(dependency.incoming.map(call => call.caller.label))], ['self', 'second']);
});

test('sloppy direct eval can shadow outer immutable bindings in bodies and parameters', async t => {
  const {read} = await fixture(t, {
    'script.js': `
      const target = () => {};
      function caller() { eval('var target = () => {};'); target(); }
      function defaults(value = eval('var target = () => {};'), other = target()) { target(); }
      function withCallback(eval) {
        eval('var target = () => {};');
        function nested() { target(); }
      }
      function stable() { target(); }
      function shadowed() { const eval = () => {}; eval(''); target(); }
      function sameScope() { const local = () => {}; eval(''); local(); }
      function directive() { 'use strict'; eval('var target = () => {};'); target(); }
    `,
    'strict.mjs': `
      const moduleTarget = () => {};
      function strict() { eval('var moduleTarget = () => {};'); moduleTarget(); }
    `,
  });
  const result = await read();
  for (const name of ['caller', 'defaults', 'withCallback']) {
    const graph = record(result, name);
    assert.equal(graph.metrics.fan_out, 0, name);
    assert.ok(graph.fan_out.reasons.includes('dynamic-scope'), name);
  }
  assert.deepEqual(record(result, 'target').incoming.map(({caller}) => caller.label),
    ['stable', 'shadowed', 'directive']);
  assert.equal(record(result, 'shadowed').metrics.fan_out, 2);
  assert.equal(record(result, 'sameScope').metrics.fan_out, 1);
  assert.equal(record(result, 'strict').metrics.fan_out, 1);
  assert.equal(record(result, 'moduleTarget').metrics.fan_in, 1);
});

test('out-of-scope imports and unresolved cycles leave explicit graph coverage', async t => {
  const {read} = await fixture(t, {
    'outside.mjs': "export { known as remote } from './known.mjs';",
    'known.mjs': 'export function known() {}',
    'app.mjs': "import { remote } from './outside.mjs'; function useRemote() { remote(); }",
    'cycle-a.mjs': "export { go as go } from './cycle-b.mjs';",
    'cycle-b.mjs': "export { go as go } from './cycle-a.mjs';",
    'use-cycle.mjs': "import { go } from './cycle-a.mjs'; function useCycle() { go(); }",
  });
  const narrow = await read(['app.mjs', 'known.mjs']);
  assert.deepEqual(narrow.callGraph, {scope: 'input_files', ...partial(1, 'module-outside-input')});
  assert.deepEqual(record(narrow, 'useRemote').metrics, counts(0, 0, null));
  assert.deepEqual(record(narrow, 'useRemote').fan_out, partial(1, 'module-outside-input'));
  assert.deepEqual(record(narrow, 'known').fan_in, partial(1, 'module-outside-input'));
  const wide = await read(['app.mjs', 'known.mjs', 'outside.mjs']);
  assert.deepEqual(record(wide, 'useRemote').metrics, counts(0, 1, 1));
  assert.deepEqual(record(wide, 'known').metrics, counts(1, 0, 0));
  const cyclic = await read(['cycle-b.mjs', 'cycle-a.mjs', 'use-cycle.mjs']);
  assert.deepEqual(record(cyclic, 'useCycle').fan_out, partial(1, 'cyclic-export'));
});

test('Rust explicit roots, aliases, inline modules, mod.rs and path attributes', async t => {
  const {read} = await fixture(t, {
    'src/lib.rs': `
      mod module1 { pub fn validate() {} }
      mod module2;
      use crate::module1::validate as check;
      #[path = "redirect.rs"] mod aliased;
      fn start() { check(); crate::module1::validate(); self::module2::validate(); }
      fn fromRedirect() { aliased::run(); }
    `,
    'src/module2/mod.rs': 'pub fn validate() {} pub fn parentCall() { super::start(); }',
    'src/redirect.rs': 'mod children; pub fn run() { self::children::call(); }',
    'src/children.rs': 'pub fn call() { super::super::start(); }',
    'other/main.rs': 'mod module1 { pub fn validate() {} } fn other() { crate::module1::validate(); }',
  });
  const result = await read();
  const start = record(result, 'start');
  assert.deepEqual(start.metrics, counts(2, 2, 0.5));
  assert.deepEqual(start.outgoing.map(call => call.target.label),
    ['crate::module1::validate', 'crate::module1::validate', 'crate::module2::validate']);
  assert.equal(start.outgoing[0].target.id, start.outgoing[1].target.id);
  const other = record(result, 'other');
  assert.equal(other.outgoing[0].target.label, start.outgoing[0].target.label);
  assert.notEqual(other.outgoing[0].target.id, start.outgoing[0].target.id);
  assert.equal(record(result, 'fromRedirect').outgoing[0].target.label, 'crate::aliased::run');
  assert.equal(record(result, 'run').outgoing[0].target.label, 'crate::aliased::children::call');
  assert.deepEqual(result.callGraph, {scope: 'input_files', ...complete});
});

test('Rust excludes unresolved cfg, trait dispatch, mutation, and competing module layouts', async t => {
  const {read} = await fixture(t, {
    'lib.rs': `
      mod competing;
      #[cfg(feature = "choice")] mod maybe;
      mod module1 { pub fn go() {} }
      use crate::module1::{self as renamed, go as g};
      use unknown::*;
      struct Worker;
      trait Act { fn run(); }
      impl Act for Worker { fn run() {} }
      impl Worker { fn perform() { Self::perform(); } }
      fn outer(hook: fn(), worker: Worker) {
        fn local() {}
        local(); renamed::go(); g(); Worker::perform(); <Worker>::perform();
        competing::go(); maybe::go(); unresolved();
        hook(); worker.run(); <Worker as Act>::run();
        let g = || local();
        g(); g();
        let mut local: fn() = || {};
        local = || {}; local();
        if let Some(g) = Some(hook) { g(); } else { g(); }
        match Some(hook) { Some(g) => g(), _ => local() }
      }
    `,
    'competing.rs': 'pub fn go() {}',
    'competing/mod.rs': 'pub fn go() {}',
  }, ['lib.rs', 'competing.rs']);
  const result = await read();
  const outer = record(result, 'outer');
  assert.deepEqual(outer.metrics, counts(0, 4, 1));
  assert.deepEqual(outer.fan_out, partial(12, 'ambiguous-module-file', 'conditional-cfg', 'dynamic-method',
    'local-value', 'mutable-binding', 'parameter', 'trait-dispatch', 'unresolved-glob-import'));
  assert.deepEqual(record(result, 'perform').metrics, counts(1, 0, 0));
  assert.equal(record(result, 'perform').outgoing[0].excluded, 'self-recursion');
});

test('Rust calls in a conditionally included file remain unresolved', async t => {
  const {read} = await fixture(t, {
    'lib.rs': '#[cfg(feature = "extra")] mod extra; fn local() {} fn dispatch() { extra::run(); }',
    'extra.rs': 'fn private() {} pub fn run() { private(); super::local(); }',
  });
  const result = await read();
  assert.deepEqual(record(result, 'dispatch').fan_out, partial(1, 'conditional-cfg'));
  assert.deepEqual(record(result, 'run').fan_out, partial(2, 'conditional-cfg'));
  assert.deepEqual(record(result, 'private').metrics, counts(0, 0, null));
  assert.deepEqual(record(result, 'local').fan_in, partial(3, 'conditional-cfg'));
});

test('unresolved Rust inherent methods contribute neither fan-out nor fan-in', async t => {
  const {read} = await fixture(t, {
    'lib.rs': `
      struct Platform;
      impl Platform {
        #[cfg(unix)] fn platform_work() {}
      }
      struct Generic<T>(T);
      impl<T> Generic<T> {
        fn generic_work(value: T) {}
      }
      fn run_platform() { Platform::platform_work(); }
      fn run_generic() { Generic::generic_work(0); }
    `,
  });
  const result = await read();
  for (const [caller, callee, reason] of [
    ['run_platform', 'platform_work', 'conditional-cfg'],
    ['run_generic', 'generic_work', 'generic-dispatch'],
  ]) {
    const call = record(result, caller);
    assert.deepEqual(call.metrics, counts(0, 0, null));
    assert.deepEqual(call.fan_out, partial(1, reason));
    assert.equal(call.outgoing[0].target, null);
    assert.deepEqual(record(result, callee).metrics, counts(0, 0, null));
    assert.deepEqual(record(result, callee).fan_in, partial(2, 'conditional-cfg', 'generic-dispatch'));
  }
});

test('CLI resolves Rust roots and modules through the canonical path of a report alias', async t => {
  const {cwd, run} = await fixture(t, {
    'Cargo.toml': '',
    'src/lib.rs': 'mod helpers; fn entry() { self::helpers::helper(); }',
    'src/helpers.rs': 'pub fn helper() { super::entry(); }',
  });
  try { symlinkSync(path.join(cwd, 'src/lib.rs'), path.join(cwd, 'alias.rs'), 'file'); }
  catch (error) {
    if (!['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) throw error;
    t.skip('symlinks unavailable');
    return;
  }
  const alias = readReport(run(['alias.rs']));
  const physical = readReport(run(['src/lib.rs']));
  const aliasEntry = reported(alias, 'entry');
  assert.match(aliasEntry.location, /^alias\.rs:/u);
  assert.deepEqual({...aliasEntry, location: reported(physical, 'entry').location}, reported(physical, 'entry'));
  assert.deepEqual(alias.summary.call_graph, {scope: 'project_files', ...complete});
  assert.equal(aliasEntry.metrics.fan_in, 1);
  assert.equal(aliasEntry.metrics.fan_out, 1);
  assert.deepEqual(readReport(run(['alias.rs', 'src/lib.rs'])), physical);
  const helper = reported(readReport(run(['src/helpers.rs'])), 'helper');
  assert.equal(helper.metrics.fan_in, 1);
  assert.equal(helper.metrics.fan_out, 1);
});

test('CLI reports dependency and build files without changing the enclosing project graph', async t => {
  const {run} = await fixture(t, {
    'Cargo.toml': '',
    'package.json': '{}',
    'src/api.mjs': 'export function target() {}',
    'src/app.mjs': "import { target } from './api.mjs'; function app() { target(); }",
    'node_modules/pkg/package.json': '{}',
    'node_modules/pkg/use.mjs': `
      import { target } from '../../src/api.mjs';
      function privateHelper() {}
      function dependency() { privateHelper(); target(); }
    `,
    'target/generated.mjs': "import { target } from '../src/api.mjs'; function generated() { target(); }",
  });
  const narrow = readReport(run(['src/api.mjs']));
  const wide = readReport(run(['src/*.mjs', 'node_modules/pkg/use.mjs', 'target/generated.mjs']));
  const filtered = readReport(run(['src/*.mjs', 'node_modules/pkg/use.mjs', 'target/generated.mjs'], '--filter', 'target'));
  assert.equal(wide.summary.files, 4);
  assert.equal(reported(narrow, 'target').metrics.fan_in, 1);
  assert.deepEqual(reported(narrow, 'target').call_graph.fan_in, complete);
  assert.deepEqual(reported(wide, 'target'), reported(narrow, 'target'));
  assert.deepEqual(filtered.functions, narrow.functions);
  assert.deepEqual(filtered.summary.call_graph, narrow.summary.call_graph);
  assert.deepEqual(wide.summary.call_graph, narrow.summary.call_graph);
  assert.equal(reported(wide, 'dependency').metrics.fan_out, 1);
  assert.equal(reported(wide, 'privateHelper').metrics.fan_in, 1);
  assert.deepEqual(reported(wide, 'dependency').call_graph.fan_out, partial(1, 'module-outside-input'));
  assert.equal(reported(wide, 'generated').metrics.fan_out, 0);
});

test('CLI keeps call edges and per-function coverage inside each physical project', async t => {
  const {run} = await fixture(t, {
    'A/.git': '',
    'A/api.mjs': 'export function target() {}',
    'A/inside.mjs': "import { target } from './api.mjs'; function inside() { target(); }",
    'A/nested/.git': '',
    'A/nested/app.mjs': "import { target } from '../api.mjs'; function nested() { target(); }",
    'B/.git': '',
    'B/app.mjs': `
      import { target } from '../A/api.mjs';
      function outside() { target(); }
      function dynamic(cb) { cb(); }
    `,
  });
  const narrow = readReport(run(['A/api.mjs']));
  const paths = ['A/api.mjs', 'A/nested/app.mjs', 'B/app.mjs'];
  const wide = readReport(run(paths));
  const filtered = readReport(run(paths, '--filter', 'target'));
  assert.equal(reported(narrow, 'target').metrics.fan_in, 1);
  assert.deepEqual(reported(narrow, 'target').call_graph.fan_in, complete);
  assert.deepEqual(reported(wide, 'target'), reported(narrow, 'target'));
  assert.deepEqual(filtered.functions, narrow.functions);
  assert.deepEqual(wide.summary.call_graph, {scope: 'project_files', ...partial(3, 'module-outside-input', 'parameter')});
  assert.deepEqual(filtered.summary.call_graph, wide.summary.call_graph);
  for (const name of ['outside', 'nested']) {
    assert.equal(reported(wide, name).metrics.fan_out, 0);
    assert.deepEqual(reported(wide, name).call_graph.fan_out, partial(1, 'module-outside-input'));
  }
});

test('CLI isolates nested manifests and marker-free projects outside the working directory', async t => {
  const {cwd, run} = await fixture(t, {
    'manifest/package.json': '{}',
    'manifest/api.mjs': 'export function target() {}',
    'manifest/nested/Cargo.toml': '',
    'manifest/nested/app.mjs': "import { target } from '../api.mjs'; function child() { target(); }",
    'runner/.keep': '',
    'loose/api.mjs': 'export function target() {}',
    'loose/nested/app.mjs': "import { target } from '../api.mjs'; function child() { target(); }",
  });
  const runOutside = (files) => spawnSync(process.execPath,
    [cli, ...files.flatMap(file => ['--path', `../${file}`])], {cwd: path.join(cwd, 'runner'), encoding: 'utf8'});
  for (const [invoke, directory] of [[run, 'manifest'], [runOutside, 'loose']]) {
    const target = `${directory}/api.mjs`;
    const narrow = readReport(invoke([target]));
    const wide = readReport(invoke([target, `${directory}/nested/app.mjs`]));
    assert.equal(reported(narrow, 'target').metrics.fan_in, 0);
    assert.deepEqual(reported(narrow, 'target').call_graph.fan_in, complete);
    assert.deepEqual(reported(wide, 'target'), reported(narrow, 'target'));
    assert.deepEqual(reported(wide, 'child').call_graph.fan_out, partial(1, 'module-outside-input'));
  }
});

test('CLI project-only parse errors affect coverage without becoming report errors', async t => {
  const {run} = await fixture(t, {
    'healthy.mjs': 'function healthy() {}',
    'broken.mjs': 'function broken( {',
  });
  const runNarrow = run(['healthy.mjs']);
  const narrow = readReport(runNarrow);
  assert.equal(runNarrow.stderr, '');
  assert.deepEqual(narrow.diagnostics, []);
  assert.equal(narrow.summary.has_errors, false);
  assert.equal(narrow.summary.function_discovery_complete, true);
  assert.deepEqual(narrow.summary.call_graph, {scope: 'project_files', ...partial(0, 'analysis-gap')});
  assert.deepEqual(reported(narrow, 'healthy').call_graph.fan_in, partial(0, 'analysis-gap'));
  for (const path of ['broken.mjs', 'missing.mjs']) {
    const wide = readReport(run(['healthy.mjs', path]), 1);
    assert.equal(wide.summary.has_errors, true);
    assert.ok(wide.diagnostics.length > 0, path);
    assert.deepEqual(wide.summary.call_graph, narrow.summary.call_graph);
    assert.deepEqual(reported(wide, 'healthy'), reported(narrow, 'healthy'));
  }
});

test('diagnostic rows cannot contribute edges and macros retain recovered source call sites', async t => {
  const {read, run} = await fixture(t, {
    'lib.rs': `fn dependency() {}
fn damaged() {
    dependency(); unknown!(a => b);
}
fn healthy() {
    println!("{}", dependency());
}
`,
    'independent.mjs': 'function independent() {}',
  });
  const result = await read();
  assert.equal(result.hasErrors, true);
  const damaged = record(result, 'damaged');
  const healthy = record(result, 'healthy');
  const dependency = record(result, 'dependency');
  assert.deepEqual(damaged.fan_out, partial(1, 'analysis-gap'));
  assert.deepEqual(healthy.fan_out, complete);
  assert.deepEqual(dependency.fan_in, partial(1, 'analysis-gap'));
  assert.deepEqual(dependency.metrics, counts(1, 0, 0));
  assert.equal(healthy.outgoing.length, 1);
  assert.equal(healthy.outgoing[0].node.startPosition.row + 1, 6);
  assert.equal(healthy.outgoing[0].node.startPosition.column + 1, 20);
  assert.deepEqual(record(result, 'independent').fan_in, complete);
  const report = run(['lib.rs', 'independent.mjs']);
  assert.equal(report.status, 1);
  assert.match(report.stderr, /rust-unsupported-macro-arguments/);
});
