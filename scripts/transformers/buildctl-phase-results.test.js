import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureRepositoryIdentity } from '../../source/skills/build/buildctl/repository.js';
import { sha256 } from '../../source/skills/build/buildctl/plan-contract.js';
import { parseWorkflowState } from '../../source/skills/build/buildctl/workflow-state.js';
import { ROOT } from './utils.js';

const CLI = join(ROOT, 'source/skills/build/buildctl/cli.js');
const VALID_PLAN = join(ROOT, 'scripts/fixtures/buildctl/kemet-lite/valid-plan.yaml');
const REVIEW_FIXTURE = join(
  ROOT,
  'scripts/fixtures/buildctl/phase-results/plan-review.md',
);
const sandboxes = [];

afterEach(() => {
  for (const path of sandboxes.splice(0)) rmSync(path, { recursive: true, force: true });
});

function run(args, cwd, expectedStatus = 0) {
  const result = spawnSync(args[0], args.slice(1), { cwd, encoding: 'utf8' });
  assert.equal(
    result.status,
    expectedStatus,
    `${args.join(' ')}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return result;
}

function git(repo, ...args) {
  return run(['git', ...args], repo).stdout.trim();
}

function replaceAll(source, values) {
  let output = source;
  for (const [name, value] of Object.entries(values)) {
    output = output.replaceAll(`__${name}__`, value);
  }
  return output;
}

async function makePlanReviewRepo() {
  const repo = mkdtempSync(join(tmpdir(), 'buildctl-phase-result-'));
  sandboxes.push(repo);
  run(['git', 'init', '-q'], repo);
  git(repo, 'config', 'user.email', 'buildctl@example.test');
  git(repo, 'config', 'user.name', 'Buildctl Test');
  writeFileSync(join(repo, '.gitignore'), '.build/\n', 'utf8');
  writeFileSync(join(repo, 'package.json'), '{"type":"module"}\n', 'utf8');
  writeFileSync(join(repo, 'plan.yaml'), readFileSync(VALID_PLAN), 'utf8');
  mkdirSync(join(repo, 'src'), { recursive: true });
  writeFileSync(join(repo, 'src/legacy-pose.js'), 'export const adopted = true;\n', 'utf8');
  mkdirSync(join(repo, 'test'), { recursive: true });
  writeFileSync(
    join(repo, 'test/legacy-pose.test.js'),
    "import test from 'node:test';\ntest('adopts a legacy building pose', () => {});\n",
    'utf8',
  );
  git(repo, 'add', '.');
  git(repo, 'commit', '-qm', 'fixture');

  const prefix = 'receipt-fixture';
  const plansDir = join(repo, '.build/plans');
  const contractPath = join(repo, '.build/contracts/plan/contract.json');
  const statePath = join(plansDir, `${prefix}-state.md`);
  const artifactPath = join(plansDir, `${prefix}-review.md`);
  const contextPath = join(plansDir, `${prefix}-context.md`);
  const requirementsPath = join(plansDir, `${prefix}-requirements.md`);
  mkdirSync(plansDir, { recursive: true });
  writeFileSync(contextPath, '# Context\n\nExact fixture context.\n', 'utf8');
  writeFileSync(requirementsPath, '# Requirements\n\n- REQ-001\n', 'utf8');
  run([
    process.execPath,
    CLI,
    'validate-plan',
    '--plan',
    'plan.yaml',
    '--out',
    contractPath,
  ], repo);

  const baseRef = git(repo, 'rev-parse', 'HEAD');
  const state = [
    'slug: "plan"',
    `base_ref: ${baseRef}`,
    'phase: "review"',
    `workflow_artifact_prefix: ${JSON.stringify(prefix)}`,
    'phase_result_references: []',
    'phase_result_bootstrap: []',
    '',
  ].join('\n');
  writeFileSync(statePath, state, 'utf8');
  assert.equal(parseWorkflowState(state, { required: ['base_ref'] }).base_ref, baseRef);

  const repository = await captureRepositoryIdentity({
    repoRoot: repo,
    evidenceDir: '.build/evidence/plan',
  });
  const values = {
    PLAN_SHA256: sha256(readFileSync(join(repo, 'plan.yaml'))),
    CONTRACT_SHA256: sha256(readFileSync(contractPath)),
    CONTEXT_SHA256: sha256(readFileSync(contextPath)),
    REQUIREMENTS_SHA256: sha256(readFileSync(requirementsPath)),
    REPOSITORY_SHA256: repository.fingerprint,
  };
  const report = replaceAll(readFileSync(REVIEW_FIXTURE, 'utf8'), values);
  writeFileSync(artifactPath, report, 'utf8');
  return {
    artifactPath,
    contextPath,
    contractPath,
    repo,
    report,
    state,
    statePath,
  };
}

function compileArgs(setup) {
  return [
    process.execPath,
    CLI,
    'compile-result',
    '--state',
    setup.statePath,
    '--contract',
    setup.contractPath,
    '--artifact',
    setup.artifactPath,
    '--evidence-dir',
    '.build/evidence/plan',
    '--receipts-dir',
    '.build/result-receipts',
  ];
}

test('phase-result plan-review: stale subjects and invalid verdicts block without state or git mutation', async () => {
  const setup = await makePlanReviewRepo();
  const stateBefore = readFileSync(setup.statePath, 'utf8');
  const headBefore = git(setup.repo, 'rev-parse', 'HEAD');
  const statusBefore = git(setup.repo, 'status', '--porcelain=v1', '--untracked-files=all');

  const first = run(compileArgs(setup), setup.repo);
  const result = JSON.parse(first.stdout);
  assert.deepEqual(
    {
      allowed_next_phase: result.allowed_next_phase,
      phase: result.phase,
      status: result.status,
      verdict: result.verdict,
    },
    {
      allowed_next_phase: 'implement',
      phase: 'plan-review',
      status: 'compiled',
      verdict: 'proceed',
    },
  );
  assert.match(result.receipt_id, /^[a-f0-9]{64}$/);
  assert.match(result.receipt_hash, /^[a-f0-9]{64}$/);
  const receiptBytes = readFileSync(join(setup.repo, result.receipt_path), 'utf8');
  const replay = JSON.parse(run(compileArgs(setup), setup.repo).stdout);
  assert.equal(replay.receipt_id, result.receipt_id);
  assert.equal(replay.receipt_hash, result.receipt_hash);
  assert.equal(readFileSync(join(setup.repo, result.receipt_path), 'utf8'), receiptBytes);

  writeFileSync(setup.contextPath, '# Context\n\nStale fixture context.\n', 'utf8');
  const stale = run(compileArgs(setup), setup.repo, 1);
  assert.match(stale.stderr, /E_RESULT_SUBJECT/);
  writeFileSync(setup.contextPath, '# Context\n\nExact fixture context.\n', 'utf8');

  writeFileSync(
    setup.artifactPath,
    setup.report
      .replace('Proceed to implementation', 'Do not proceed')
      .replace('verdict: proceed', 'verdict: do_not_proceed'),
    'utf8',
  );
  const invalid = run(compileArgs(setup), setup.repo, 1);
  assert.match(invalid.stderr, /E_RESULT_VERDICT/);

  writeFileSync(
    setup.artifactPath,
    setup.report.replace('Proceed to implementation', 'Proceed with fixes'),
    'utf8',
  );
  const mismatch = run(compileArgs(setup), setup.repo, 1);
  assert.match(mismatch.stderr, /E_RESULT_VERDICT_MISMATCH/);

  assert.equal(readFileSync(setup.statePath, 'utf8'), stateBefore);
  assert.equal(git(setup.repo, 'rev-parse', 'HEAD'), headBefore);
  assert.equal(
    git(setup.repo, 'status', '--porcelain=v1', '--untracked-files=all'),
    statusBefore,
  );
});
