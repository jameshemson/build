import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT } from './utils.js';
import { resolveCompilerVersion } from '../../source/skills/build/buildctl/plan-contract.js';

const CLI = join(ROOT, 'source/skills/build/buildctl/cli.js');
const FIXTURES = join(ROOT, 'scripts/fixtures/buildctl/kemet-lite');

let outputDir;

beforeEach(() => {
  outputDir = mkdtempSync(join(ROOT, '.build/buildctl-plan-test-'));
});

afterEach(() => {
  rmSync(outputDir, { recursive: true, force: true });
});

function run(...args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
  });
}

function compile(fixture, name = 'contract.json') {
  const out = join(outputDir, name);
  const result = run(
    'validate-plan',
    '--plan', join(FIXTURES, fixture),
    '--out', out,
  );
  return { result, out };
}

function semanticContract(contract) {
  const copy = structuredClone(contract);
  delete copy.contract_hash;
  delete copy.source;
  return copy;
}

test('validate-plan compiles Markdown deterministically with source and compiler hashes', () => {
  const first = compile('valid-plan.md', 'first.json');
  assert.equal(first.result.status, 0, first.result.stderr);
  const second = compile('valid-plan.md', 'second.json');
  assert.equal(second.result.status, 0, second.result.stderr);

  const firstBytes = readFileSync(first.out, 'utf8');
  const secondBytes = readFileSync(second.out, 'utf8');
  assert.equal(firstBytes, secondBytes);
  assert.ok(firstBytes.endsWith('\n'));

  const contract = JSON.parse(firstBytes);
  assert.equal(contract.schema_version, 1);
  assert.equal(contract.compiler.name, 'buildctl');
  assert.match(contract.compiler.version, /^\d+\.\d+\.\d+$/);
  assert.match(contract.source.sha256, /^[a-f0-9]{64}$/);
  assert.match(contract.contract_hash, /^[a-f0-9]{64}$/);
  assert.deepEqual(contract.approach_bindings, ['B-001']);
  assert.equal(contract.execution_manifest[0].workstream, 'legacy-pose');
  assert.deepEqual(contract.workstreams[0].files, [
    'src/legacy-pose.js',
    'test/legacy-pose.test.js',
  ]);
});

test('pure YAML approach compiles to the same semantic projection as Markdown', () => {
  const markdown = compile('valid-plan.md', 'markdown.json');
  const yaml = compile('valid-plan.yaml', 'yaml.json');
  assert.equal(markdown.result.status, 0, markdown.result.stderr);
  assert.equal(yaml.result.status, 0, yaml.result.stderr);

  assert.deepEqual(
    semanticContract(JSON.parse(readFileSync(markdown.out, 'utf8'))),
    semanticContract(JSON.parse(readFileSync(yaml.out, 'utf8'))),
  );
});

for (const [fixture, diagnostic] of [
  ['unbound-api.md', 'E_APPROACH_BINDING_COVERAGE'],
  ['non-atomic-task.md', 'E_TASK_ATOMICITY'],
  ['unrelated-evidence.md', 'E_EVIDENCE_COMMAND_MISMATCH'],
]) {
  test(`Kemet-lite ${fixture} is rejected with ${diagnostic}`, () => {
    const { result, out } = compile(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, new RegExp(diagnostic));
    assert.equal(existsSync(out), false);
  });
}

test('invalid source never overwrites an existing generated contract', () => {
  const out = join(outputDir, 'contract.json');
  writeFileSync(out, 'sentinel\n', 'utf8');
  const result = run(
    'validate-plan',
    '--plan', join(FIXTURES, 'unbound-api.md'),
    '--out', out,
  );
  assert.notEqual(result.status, 0);
  assert.equal(readFileSync(out, 'utf8'), 'sentinel\n');
});

test('unsupported YAML anchors fail with a stable parser diagnostic', () => {
  const plan = join(outputDir, 'anchor.yaml');
  const out = join(outputDir, 'anchor.json');
  writeFileSync(plan, 'approach: &shared value\nrequirements: []\n', 'utf8');
  const result = run('validate-plan', '--plan', plan, '--out', out);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /E_YAML_UNSUPPORTED/);
  assert.equal(existsSync(out), false);
});

test('Approach obligations require literal bracketed B markers', () => {
  const plan = join(outputDir, 'bare-marker.md');
  const source = readFileSync(join(FIXTURES, 'valid-plan.md'), 'utf8')
    .replace('[B-001]', 'B-001');
  writeFileSync(plan, source, 'utf8');
  const result = run('validate-plan', '--plan', plan, '--out', join(outputDir, 'contract.json'));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /E_APPROACH_BINDING_COVERAGE/);
});

test('compiler version discovery ignores unrelated nearer package manifests', () => {
  const nested = join(outputDir, 'unrelated', 'nested');
  mkdirSync(nested, { recursive: true });
  writeFileSync(
    join(outputDir, 'unrelated', 'package.json'),
    '{"name":"not-build","version":"99.99.99"}\n',
    'utf8',
  );
  assert.equal(resolveCompilerVersion(nested), resolveCompilerVersion(ROOT));
});

test('compiler version discovery accepts Codex cachebuster build metadata', () => {
  const plugin = join(outputDir, 'cachebusted-plugin');
  const nested = join(plugin, 'skills', 'build', 'buildctl');
  mkdirSync(join(plugin, '.codex-plugin'), { recursive: true });
  mkdirSync(nested, { recursive: true });
  writeFileSync(
    join(plugin, '.codex-plugin', 'plugin.json'),
    '{"name":"build","version":"1.12.1+codex.local-20260722-061608"}\n',
    'utf8',
  );

  assert.equal(
    resolveCompilerVersion(nested),
    '1.12.1+codex.local-20260722-061608',
  );
});

test('generated contract paths must stay inside the repository', () => {
  const result = run(
    'validate-plan',
    '--plan', join(FIXTURES, 'valid-plan.md'),
    '--out', join(outputDir, '../../../../contract.json'),
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /E_PATH_OUTSIDE_REPOSITORY/);
});
