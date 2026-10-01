import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from './utils.js';

const CLI = join(ROOT, 'source/skills/build/buildctl/cli.js');
const VALID_PLAN_MD = join(ROOT, 'scripts/fixtures/buildctl/kemet-lite/valid-plan.md');
const PLAN_QUALITY = join(ROOT, 'source/skills/impl-plan/reference/plan-quality.md');

const COMMAND = 'node --test test/legacy-pose.test.js';
const OBSERVATION = 'adopts a legacy building pose';
const TASK_VERIFY = `verify: ${JSON.stringify(COMMAND)}`;
const MUST_HAVE_EVIDENCE = `evidence: { kind: behavioral-test, ref: ${JSON.stringify(`${COMMAND} :: ${OBSERVATION}`)} }`;
const SLICE_VERIFY = `verify: [${JSON.stringify(COMMAND)}]`;
const BINDING_KIND = '{ id: B-001, kind: behavior,';

// Replace one exact snippet of the fixture, failing loudly if it is absent so a
// fixture edit cannot silently turn a reject case into a no-op.
function replaceOnce(source, from, to) {
  assert.ok(source.includes(from), `fixture is missing ${from}`);
  return source.replace(from, () => to);
}

// Compile a rewritten copy of valid-plan.md in a throwaway Git repository and
// return the CLI result.
function validateRewrittenPlan(rewrite) {
  const repo = mkdtempSync(join(tmpdir(), 'buildctl-evidence-pipe-'));
  try {
    const init = spawnSync('git', ['init', '-q'], { cwd: repo, encoding: 'utf8' });
    assert.equal(init.status, 0, init.stderr);
    const original = readFileSync(VALID_PLAN_MD, 'utf8');
    const rewritten = rewrite(original);
    assert.notEqual(rewritten, original, 'plan rewrite must change the fixture');
    writeFileSync(join(repo, 'plan.md'), rewritten, 'utf8');
    return spawnSync(process.execPath, [
      CLI,
      'validate-plan',
      '--plan', 'plan.md',
      '--out', join(repo, '.build/contracts/plan/contract.json'),
    ], { cwd: repo, encoding: 'utf8' });
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

// Swap T-001's command in both the MH-001 evidence ref and the task verify.
function withTaskCommand(command) {
  return validateRewrittenPlan((source) => {
    const withRef = replaceOnce(
      source,
      MUST_HAVE_EVIDENCE,
      `evidence: { kind: behavioral-test, ref: ${JSON.stringify(`${command} :: ${OBSERVATION}`)} }`,
    );
    return replaceOnce(withRef, TASK_VERIFY, `verify: ${JSON.stringify(command)}`);
  });
}

function assertRejected(result, path) {
  assert.equal(result.status, 1, result.stderr);
  assert.ok(result.stderr.includes(`E_EVIDENCE_PIPE ${path}:`), result.stderr);
  assert.ok(!result.stderr.includes('E_YAML_PARSE'), result.stderr);
}

function assertAccepted(result) {
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes('"ok":true'), result.stdout);
}

for (const command of [
  'npm test | grep ok',
  'set -o pipefail; npm test | grep ok',
  'npm test |& tee log',
]) {
  test(`evidence pipe gate: rejects task verify ${command}`, () => {
    assertRejected(withTaskCommand(command), 'execution_manifest[0].verify');
  });
}

for (const command of [
  'npm test || true',
  'node -e "console.log(\'a|b\')"',
  "bash -o pipefail -c 'npm test | grep ok'",
  'printf a\\|b',
]) {
  test(`evidence pipe gate: accepts task verify ${command}`, () => {
    assertAccepted(withTaskCommand(command));
  });
}

test('evidence pipe gate: rejects a piped delivery-slice verify', () => {
  const result = validateRewrittenPlan((source) => replaceOnce(
    source,
    SLICE_VERIFY,
    `verify: [${JSON.stringify('npm test | tail -20')}]`,
  ));
  assertRejected(result, 'delivery_slices[0].verify[0]');
});

test('evidence pipe gate: rejects a piped task verify behind structural evidence', () => {
  const result = validateRewrittenPlan((source) => {
    const structural = replaceOnce(
      source,
      MUST_HAVE_EVIDENCE,
      `evidence: { kind: structural, ref: ${JSON.stringify('src/legacy-pose.js')} }`,
    );
    const invariant = replaceOnce(structural, BINDING_KIND, '{ id: B-001, kind: invariant,');
    return replaceOnce(invariant, TASK_VERIFY, `verify: ${JSON.stringify('npm test | tail -20')}`);
  });
  assertRejected(result, 'execution_manifest[0].verify');
  const codes = new Set(result.stderr.match(/\bE_[A-Z_]+\b/g));
  assert.deepEqual([...codes], ['E_EVIDENCE_PIPE'], result.stderr);
});

test('evidence pipe gate: plan-quality tells authors not to pipe evidence commands', () => {
  const quality = readFileSync(PLAN_QUALITY, 'utf8');
  assert.ok(
    quality.includes(
      'Evidence commands — every task and slice `verify` and every behavioral-test or command-assertion command — must not pipe output',
    ),
    'plan-quality.md must forbid piped evidence commands',
  );
  console.log('evidence pipe gate complete');
});
