import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { inputFiles, languageFor } from '../scripts/input-files.mjs';

test('mjs paths and globs analyze ES modules with locations in JSON and explain', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mjs-metrics-'));
  try {
    await writeFile(path.join(root, 'module.mjs'), "import {x} from './other.mjs';\nawait x();\nexport function f(){ return x(); }\n");
    assert.equal(languageFor('module.mjs'), 'javascript');
    assert.deepEqual(await inputFiles(['module.mjs'], root), [path.join(root, 'module.mjs')]);
    assert.deepEqual(await inputFiles(['*.mjs'], root), [path.join(root, 'module.mjs')]);
    const cli = fileURLToPath(new URL('../scripts/measure.mjs', import.meta.url));
    for (const pattern of ['module.mjs', '*.mjs']) {
      const run = args => spawnSync(process.execPath, [cli, '--path', pattern, ...args], {cwd: root, encoding: 'utf8'});
      const json = run([]); assert.equal(json.status, 0, json.stderr);
      const report = JSON.parse(json.stdout);
      assert.equal(report.functions.length, 1);
      assert.equal(report.functions[0].name, 'f');
      assert.deepEqual(report.functions[0].metrics, {cognitive_complexity: 0});
      assert.match(report.functions[0].location, /^module\.mjs:3:/);
      const explain = run(['--explain']); assert.equal(explain.status, 0, explain.stderr);
      assert.match(explain.stdout, /module\.mjs:3:/);
    }
  } finally { await rm(root, {recursive: true, force: true}); }
});
