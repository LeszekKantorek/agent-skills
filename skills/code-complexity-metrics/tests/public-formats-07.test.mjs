import {explainRow} from './explain-rows.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';import {spawnSync} from 'node:child_process';import path from 'node:path';import os from 'node:os';import {fileURLToPath} from 'node:url';
const cli=fileURLToPath(new URL('../scripts/measure.mjs',import.meta.url));const run=(cwd,...args)=>spawnSync(process.execPath,[cli,...args],{cwd,encoding:'utf8'});

test('empty explain prints only the report header and metadata', () => {
  const result = run(os.tmpdir(), '--explain');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, [
    '# Code Complexity Metrics',
    '',
    'Files: 0; functions found: 0; functions presented: 0; function discovery complete: true; has errors: false',
    '',
    'Version: 20261122.0.0',
    '',
    '',
  ].join('\n'));
});

test('filtered explain counts project callers and targets outside the report paths', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'metrics-graph-explain-'));
  try {
    await writeFile(path.join(dir, 'target.mjs'),
      'import {helper} from "./helper.mjs";\nexport function target() { helper(); }\nexport function callbackOnly(cb) { cb(); }');
    const caller = 'import {target} from "./target.mjs";\nfunction caller() { target(); target(); }';
    await writeFile(path.join(dir, 'caller.mjs'), caller);
    await writeFile(path.join(dir, 'helper.mjs'), 'export function helper() {}');

    const narrow = ['--path', 'target.mjs', '--filter', 'target|callbackOnly'];
    const result = run(dir, ...narrow, '--explain');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /## target [^\n]+\n[\s\S]*?Fan-In: 1 \| Fan-Out: 1\nInstability: 0\.50\n/u);
    assert.match(result.stdout, /## callbackOnly [^\n]+\n[\s\S]*?Fan-In: 0 \| Fan-Out: 1\nInstability: 1\.00\n/u);
    assert.match(result.stdout, /- Fan-In · confirmed callers: 1\n  - caller\.mjs:2:21:8 · caller\n- Fan-Out · unresolved calls: 0\n/u);
    assert.match(result.stdout, /- Fan-In · confirmed callers: 0\n- Fan-Out · unresolved calls: 1\n  - target\.mjs:3:\d+ · cb · parameter\n/u);
    assert.doesNotMatch(result.stdout, /## (caller|helper) |call graph scope|Outgoing calls|Incoming callers/u);
    const full = JSON.parse(run(dir, '--path', '*.mjs', '--filter', 'target|callbackOnly').stdout);
    const single = JSON.parse(run(dir, ...narrow).stdout);
    assert.equal(single.summary.files, 1);
    assert.deepEqual(single.functions[0].call_graph, {
      fan_in: {callers_count: 1, callers: [{name: 'caller', location: 'caller.mjs:2:21:8'}]},
      fan_out: {unresolved_count: 0, unresolved_calls: []},
    });
    assert.deepEqual(single.functions[1].call_graph, {
      fan_in: {callers_count: 0, callers: []},
      fan_out: {unresolved_count: 1, unresolved_calls: [
        {location: 'target.mjs:3:36', call: 'cb', reasons: ['parameter']},
      ]},
    });
    assert.deepEqual(single.functions, full.functions);

    const blocked = run(dir, ...narrow, '--output', 'caller.mjs');
    assert.equal(blocked.status, 1);
    assert.match(blocked.stderr, /Output aliases an input file/);
    assert.equal(await readFile(path.join(dir, 'caller.mjs'), 'utf8'), caller);
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

test('a Rust file selected from outside its project uses the Cargo root for graph metrics', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'metrics-cargo-graph-'));
  try {
    const project = path.join(dir, 'project');
    const source = path.join(project, 'src');
    await mkdir(source, {recursive: true});
    await writeFile(path.join(project, 'Cargo.toml'), '[package]\nname = "graph"\nversion = "0.1.0"\n');
    await writeFile(path.join(source, 'lib.rs'), 'mod caller; mod target; mod helper;');
    await writeFile(path.join(source, 'caller.rs'), 'pub fn caller() { super::target::target(); }');
    await writeFile(path.join(source, 'helper.rs'), 'pub fn helper() {}');
    const file = path.join(source, 'target.rs');
    await writeFile(file, 'pub fn target() { crate::helper::helper(); }');

    const result = run(dir, '--path', file, '--filter', 'target');
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.summary.files, 1);
    assert.deepEqual(report.functions.map(({name, metrics}) => [name,metrics.fan_in,metrics.fan_out,metrics.instability]),
      [['target',1,1,0.5]]);
    assert.deepEqual(report.functions[0].call_graph.fan_in.callers,
      [{name: 'crate::caller::caller', location: 'project/src/caller.rs:1:19:23'}]);
    const explain = run(dir, '--path', file, '--filter', 'target', '--explain');
    assert.equal(explain.status, 0, explain.stderr);
    assert.match(explain.stdout, /project\/src\/caller\.rs:1:19:23 · crate::caller::caller/u);
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

test('explain preserves original indentation and annotates each outer independently', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'metrics7-explain-'));
  try {
    await writeFile(path.join(dir, 'a.js'),
      'function longName(){ // original comment\n\tif (ready) work();\n}\nfunction f(){}');
    const result = run(dir, '--path', 'a.js', '--explain');
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /^\| Name \| Location \||original comment/m);
    const blocks = [...result.stdout.matchAll(/```javascript\n([\s\S]*?)\n```/g)].map(match => match[1]);
    assert.equal(blocks.length, 2);
    assert.match(blocks[0], /^Fragment +\| Cognitive \| Halstead N1 \| Halstead N2 \| Halstead Eta1 \| Halstead Eta2 \| Fan-Out\n/);
    const [long, empty] = blocks.map(block => block.split('\n').slice(1).map(explainRow));
    assert.deepEqual(long.map(row => [row.fragment, row.cognitive, row.halstead]), [
      ['function longName(){', 0, [0, 0, 0, 0]],
      ['\tif (ready) work();', 1, [2, 2, 2, 2]],
      ['}', 0, [0, 0, 0, 0]],
    ]);
    assert.deepEqual(empty.map(row => [row.fragment, row.cognitive]), [['function f(){}', 0]]);
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

test('CSV quotes name and location delimiters with the metric columns', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'metrics7-csv-'));
  try {
    const source = 'const o = {"save,x"(){}};';
    await writeFile(path.join(dir, 'a,b.js'), source);
    const result = run(dir, '--path', 'a,b.js', '--format', 'csv');
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.stdout.split('\n').slice(3), [
      'Name,Location,Cognitive,Halstead Volume,Fan-In,Fan-Out,Instability,Error',
      '"""save,x""","a,b.js:1:12:12",0,0.00,0,0,NaN,None',
      '',
    ]);
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});
test('JSON, CSV, Markdown and explain agree on metrics for Rust and JavaScript', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'metrics-release-'));
  try {
    await writeFile(path.join(dir, 'package.json'), '{}');
    await writeFile(path.join(dir, 'example.mjs'), [
      'function target(flag) {',
      '  if (flag) helper();',
      '  second();',
      '}',
      'function helper() {}',
      'function second() {}',
      'function caller() { target(true); }',
      'function idle() {}',
      'function partial(cb) { cb(); }',
    ].join('\n'));
    await writeFile(path.join(dir, 'lib.rs'), [
      'fn target(flag: bool) {',
      '    if flag { helper(); }',
      '    second();',
      '}',
      'fn helper() {}',
      'fn second() {}',
      'fn caller() { target(true); }',
      'fn idle() {}',
      'fn partial(cb: fn()) { cb(); }',
    ].join('\n'));
    const args = ['--path', 'example.mjs', '--path', 'lib.rs', '--filter', 'target|idle|partial'];
    const json = run(dir, ...args);
    const csv = run(dir, ...args, '--format', 'csv');
    const md = run(dir, ...args, '--format', 'markdown');
    const explain = run(dir, ...args, '--explain');
    for (const result of [json, csv, md, explain]) assert.equal(result.status, 0, result.stderr);

    const report = JSON.parse(json.stdout);
    const columns = ['Name', 'Location', 'Cognitive', 'Halstead Volume', 'Fan-In', 'Fan-Out', 'Instability', 'Error'];
    const csvLines = csv.stdout.trimEnd().split('\n');
    const mdLines = md.stdout.split('\n').filter(line => line.startsWith('| '));
    const mdCells = line => line.split('|').slice(1, -1).map(cell => cell.trim());
    assert.deepEqual(csvLines[3].split(','), columns);
    assert.deepEqual(mdCells(mdLines[0]), columns);
    const summary = 'Files: 2 · Functions: 6 of 12';
    assert.equal(md.stdout.split('\n')[2], summary);
    assert.equal(csvLines[1], '# ' + summary);
    const sections = explain.stdout.split(/^## /m).slice(1);
    assert.equal(report.functions.length, 6);
    assert.equal(csvLines.length - 4, report.functions.length);
    assert.equal(mdLines.length - 2, report.functions.length);
    assert.equal(sections.length, report.functions.length);
    assert.equal('call_graph' in report.summary, false);
    assert.doesNotMatch(explain.stdout, /· partial|· complete|Call graph:|call graph scope|Outgoing calls|Incoming callers/);

    for (const [index, f] of report.functions.entries()) {
      const {cognitive_complexity: cognitive, halstead_volume: volume, fan_in: fanIn,
        fan_out: fanOut, instability} = f.metrics;
      const {n1, n2, eta1, eta2} = f.halstead_counts;
      const outgoing = f.call_graph.fan_out;
      const instabilityDisplay = instability === 'NaN' ? 'NaN' : instability.toFixed(2);
      const values = [f.name, f.location, cognitive, volume.toFixed(2), fanIn, fanOut,
        instabilityDisplay, 'None'].map(String);
      assert.deepEqual(mdCells(mdLines[index + 2]), values);
      assert.deepEqual(csvLines[index + 4].split(','), values);
      assert.deepEqual(sections[index].split('\n').slice(0, 5), [
        `${f.name} — ${f.location}`,
        `Cognitive: ${cognitive}`,
        `Halstead Volume: ${volume.toFixed(2)} (N1 = ${n1}, N2 = ${n2}, Eta1 = ${eta1}, Eta2 = ${eta2})`,
        `Fan-In: ${fanIn} | Fan-Out: ${fanOut}`,
        `Instability: ${instabilityDisplay}`,
      ]);
      if (f.name === 'target') {
        assert.deepEqual([cognitive, volume, n1, n2, eta1, eta2, fanIn, fanOut, instability],
          [1, 6 * Math.log2(5), 3, 3, 2, 3, 1, 2, 2 / 3]);
        const rows = sections[index].split('\n').map(explainRow).filter(Boolean);
        assert.deepEqual(rows.map(row => [row.cognitive, ...row.halstead, row.fanOut]),
          [[0, 0, 0, 0, 0, 0], [1, 2, 2, 2, 2, 1], [0, 1, 1, 0, 1, 1], [0, 0, 0, 0, 0, 0]]);
      } else {
        assert.deepEqual([fanIn, fanOut, instability], f.name === 'idle' ? [0, 0, 'NaN'] : [0, 1, 1]);
        assert.equal(outgoing.unresolved_count, f.name === 'idle' ? 0 : 1);
        assert.equal(outgoing.unresolved_calls.length, outgoing.unresolved_count);
      }
    }
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});
test('Markdown and CSV always show Error and preserve diagnostics in JSON and stderr', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'metrics7-'));
  try {
    await writeFile(path.join(dir, 'a.rs'), 'fn bad(){unknown!(a; => b);}\nfn good(){a();}');
    const args = ['--path', 'a.rs', '--filter', 'none'];
    const json = run(dir, ...args, '--format', 'json');
    assert.equal(json.status, 1);
    const report = JSON.parse(json.stdout);
    assert.equal(report.functions.length, 0);
    assert.equal(report.diagnostics[0].name, 'bad');
    assert.equal(report.diagnostics[0].location, 'a.rs:1:1:28');

    for (const filter of ['bad', 'good', 'none']) {
      const md = run(dir, '--path', 'a.rs', '--filter', filter, '--format', 'markdown');
      const csv = run(dir, '--path', 'a.rs', '--filter', filter, '--format', 'csv');
      assert.equal(md.status, 1);
      assert.equal(csv.status, 1);
      assert.match(md.stdout, /^\| Name \|.* \| Fan-In \| Fan-Out \| Instability \| Error \|$/m);
      assert.match(csv.stdout, /^Name,.*?,Fan-In,Fan-Out,Instability,Error$/m);
      assert.match(md.stdout, /Analysis errors/);
      assert.match(csv.stdout, /Analysis errors/);
      assert.doesNotMatch(md.stdout, /## Diagnostics/);
      assert.match(md.stderr, /rust-unsupported-macro-arguments/);
      assert.equal(csv.stderr, md.stderr);
      if (filter === 'bad') {
        assert.match(md.stdout, /^\| bad \|.*rust-unsupported-macro-arguments/m);
        assert.match(csv.stdout, /^bad,.*rust-unsupported-macro-arguments/m);
      } else {
        assert.doesNotMatch(md.stdout, /rust-unsupported-macro-arguments/);
        assert.doesNotMatch(csv.stdout, /rust-unsupported-macro-arguments/);
      }
      if (filter === 'good') {
        assert.match(md.stdout, /^\| good \|.* \| None \|$/m);
        assert.match(csv.stdout, /^good,.*,None$/m);
      }
    }
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});
test('input order does not change public report or diagnostics',async()=>{const dir=await mkdtemp(path.join(os.tmpdir(),'metrics7-'));try{await writeFile(path.join(dir,'a.rs'),'fn bad(){unknown!(a; => b);}');await writeFile(path.join(dir,'b.js'),'function f(){work();}');const a=run(dir,'--path','a.rs','--path','b.js'),b=run(dir,'--path','b.js','--path','a.rs');assert.equal(a.status,1);assert.equal(b.status,1);assert.equal(a.stdout,b.stdout)}finally{await rm(dir,{recursive:true,force:true})}});
test('ownerless errors remain visible with no records in all formats', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'metrics7-'));
  try {
    await writeFile(path.join(dir, 'input.xyz'), 'data');
    for (const format of ['json', 'markdown', 'csv']) {
      const result = run(dir, '--path', 'input.xyz', '--filter', 'none', '--format', format);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /UNSUPPORTED_LANGUAGE/);
      if (format === 'json') {
        const report = JSON.parse(result.stdout);
        assert.deepEqual(report.functions, []);
        assert.equal(report.diagnostics[0].name, null);
        assert.equal(report.diagnostics[0].location, 'input.xyz:0:0:null');
        assert.equal(report.summary.function_discovery_complete, false);
      } else {
        assert.match(result.stdout, /Function discovery: incomplete · Analysis errors/);
        assert.doesNotMatch(result.stdout, /UNSUPPORTED/);
      }
    }
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

test('quoted method and anonymous callback use one location across formats and filters', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'metrics7-names-'));
  try {
    const source = 'const o = {"foo:bar"(){}}; use(()=>{});';
    await writeFile(path.join(dir, 'a.js'), source);
    const json = run(dir, '--path', 'a.js');
    const md = run(dir, '--path', 'a.js', '--format', 'markdown');
    const csv = run(dir, '--path', 'a.js', '--format', 'csv');
    const explain = run(dir, '--path', 'a.js', '--explain');
    for (const result of [json, md, csv, explain]) assert.equal(result.status, 0, result.stderr);
    const functions = JSON.parse(json.stdout).functions;
    const expected = [
      ['"foo:bar"', `a.js:1:${source.indexOf('"foo:bar"') + 1}:${'"foo:bar"(){}'.length}`],
      [null, `a.js:1:${source.indexOf('()=>{}') + 1}:${'()=>{}'.length}`],
    ];
    assert.deepEqual(functions.map(({name, location}) => [name, location]), expected);
    const decode = text => text.replace(/\\([\\`*_\[\]()|!~#])/g, '$1').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
    const rows = md.stdout.split('\n').filter(line => line.startsWith('| ') && !line.includes('---')).slice(1).map(line => line.split('|').slice(1,3).map(cell => decode(cell.trim())));
    assert.deepEqual(rows, expected.map(([name, location]) => [name ?? '(anonymous)', location]));
    const csvRows = csv.stdout.trimEnd().split('\n').slice(4);
    const scores = '0,0.00,0,0,NaN,None';
    assert.deepEqual(csvRows, [`"""foo:bar""",${expected[0][1]},${scores}`, `(anonymous),${expected[1][1]},${scores}`]);
    const headings = [...explain.stdout.matchAll(/^## (.*?) — (.*?)$/gm)].map(match => match.slice(1).map(decode));
    assert.deepEqual(headings, expected.map(([name, location]) => [name ?? '(anonymous)', location]));
    const filtered = run(dir, '--path', 'a.js', '--filter', '(anonymous)');
    assert.equal(filtered.status, 0, filtered.stderr);
    assert.deepEqual(JSON.parse(filtered.stdout).functions, []);
  } finally { await rm(dir, {recursive:true, force:true}); }
});

test('filtering a nested name keeps diagnostics on its outer function', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'metrics7-nested-'));
  try {
    const source = 'function outer(){ function nested(){ return <X/>; } }';
    await writeFile(path.join(dir, 'nested.js'), source);
    const result = run(dir, '--path', 'nested.js', '--filter', 'nested');
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.functions, []);
    assert.equal(report.diagnostics.length, 1);
    assert.equal(report.diagnostics[0].name, 'outer');
    assert.equal(report.diagnostics[0].location, `nested.js:1:1:${source.length}`);
    assert.match(report.diagnostics[0].error, /^javascript-unsupported-syntax:/);
  } finally { await rm(dir, {recursive:true, force:true}); }
});
