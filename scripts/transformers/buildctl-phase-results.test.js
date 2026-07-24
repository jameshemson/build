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
import {
  loadContract,
  sha256,
} from '../../source/skills/build/buildctl/plan-contract.js';
import { runEvidence } from '../../source/skills/build/buildctl/evidence.js';
import {
  createTransitionReceipt,
  transitionReceiptId,
  writeTransitionReceipt,
} from '../../source/skills/build/buildctl/transition.js';
import { parseWorkflowState } from '../../source/skills/build/buildctl/workflow-state.js';
import { ROOT } from './utils.js';

const CLI = join(ROOT, 'source/skills/build/buildctl/cli.js');
const VALID_PLAN = join(ROOT, 'scripts/fixtures/buildctl/kemet-lite/valid-plan.yaml');
const REVIEW_FIXTURE = join(
  ROOT,
  'scripts/fixtures/buildctl/phase-results/plan-review.md',
);
const VERIFY_FIXTURE = join(ROOT, 'scripts/fixtures/buildctl/phase-results/verify.md');
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

async function makePlanReviewRepo({ failedEvidence = false } = {}) {
  const repo = mkdtempSync(join(tmpdir(), 'buildctl-phase-result-'));
  sandboxes.push(repo);
  run(['git', 'init', '-q'], repo);
  git(repo, 'config', 'user.email', 'buildctl@example.test');
  git(repo, 'config', 'user.name', 'Buildctl Test');
  writeFileSync(join(repo, '.gitignore'), '.build/\n', 'utf8');
  writeFileSync(join(repo, 'package.json'), '{"type":"module"}\n', 'utf8');
  writeFileSync(
    join(repo, 'plan.yaml'),
    readFileSync(VALID_PLAN, 'utf8')
      .replaceAll(
        'node --test test/legacy-pose.test.js',
        failedEvidence
          ? 'node -e \\"process.stderr.write(\'failed-evidence\');process.exit(1)\\"'
          : 'node -e \\"process.stdout.write(\'observed\')\\"',
      )
      .replace(
        ' :: adopts a legacy building pose',
        failedEvidence ? ' :: failed-evidence' : ' :: observed',
      ),
    'utf8',
  );
  mkdirSync(join(repo, 'src'), { recursive: true });
  writeFileSync(join(repo, 'src/legacy-pose.js'), 'export const adopted = true;\n', 'utf8');
  mkdirSync(join(repo, 'test'), { recursive: true });
  writeFileSync(
    join(repo, 'test/legacy-pose.test.js'),
    "import test from 'node:test';\ntest('adopts a legacy building pose', () => { console.log('adopts a legacy building pose'); });\n",
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

async function makeVerifyRepo({
  bootstrap = false,
  failedEvidence = false,
  outOfPlan = false,
  plannedUnchanged = false,
} = {}) {
  const setup = await makePlanReviewRepo({ failedEvidence });
  const reviewResult = bootstrap
    ? null
    : JSON.parse(run(compileArgs(setup), setup.repo).stdout);
  const baseRef = git(setup.repo, 'rev-parse', 'HEAD');
  writeFileSync(
    join(setup.repo, 'src/legacy-pose.js'),
    'export const adopted = "verified";\n',
    'utf8',
  );
  if (!plannedUnchanged) {
    writeFileSync(
      join(setup.repo, 'test/legacy-pose.test.js'),
      [
        "import test from 'node:test';",
        "import assert from 'node:assert/strict';",
        "import { adopted } from '../src/legacy-pose.js';",
        "test('adopts a legacy building pose', () => { console.log('adopts a legacy building pose'); assert.equal(adopted, 'verified'); });",
        '',
      ].join('\n'),
      'utf8',
    );
  }
  if (outOfPlan) writeFileSync(join(setup.repo, 'outside-plan.js'), 'export const drift = true;\n');
  git(setup.repo, 'add', '.');
  git(setup.repo, 'commit', '-qm', 'feature');

  const evidenceDir = join(setup.repo, '.build/evidence/plan');
  const evidence = await runEvidence({
    contractPath: setup.contractPath,
    evidenceDir,
    repoRoot: setup.repo,
  });
  const evidenceReceipt = JSON.parse(readFileSync(evidence.ledger.receipts[0].path, 'utf8'));
  assert.match(`${evidenceReceipt.stdout.tail}\n${evidenceReceipt.stderr.tail}`,
    failedEvidence ? /failed-evidence/ : /observed/);
  const contract = loadContract({
    contractPath: setup.contractPath,
    cwd: setup.repo,
  }).contract;
  const identity = await captureRepositoryIdentity({
    repoRoot: setup.repo,
    evidenceDir,
  });
  const decision = {
    authorization: 'allowed',
    checkpoint_commit: git(setup.repo, 'rev-parse', 'HEAD'),
    evidence_commands: evidence.ledger.commands,
    expected_repository_fingerprint: identity.fingerprint,
    expected_state_hash: sha256('completion-state'),
    judgment_ids: ['slice:S-001:must-have:0'],
    ledger_hash: evidence.ledger.ledger_hash,
    next_slice_id: null,
    resolved_requirements: ['REQ-001'],
    slice_id: 'S-001',
  };
  const receiptInput = {
    authorizedDecision: decision,
    compilerVersion: contract.compiler.version,
    expectedStateHash: decision.expected_state_hash,
    repositoryAfter: identity,
    repositoryBefore: identity,
    subjects: [{ name: 'plan', sha256: contract.source.sha256 }],
    transitionKind: 'complete_slice',
  };
  const completionReceiptId = transitionReceiptId(receiptInput);
  const completionReceipt = createTransitionReceipt({
    ...receiptInput,
    patch: [
      { op: 'append_completed_slice', value: 'S-001' },
      { op: 'set_active_slice', value: null },
      { op: 'append_transition_reference', value: { receipt_id: completionReceiptId } },
      {
        op: 'append_history_template',
        value: {
          event: 'slice_completed',
          receipt_id: completionReceiptId,
          slice_id: 'S-001',
        },
      },
    ],
  });
  writeTransitionReceipt({
    receipt: completionReceipt,
    receiptsDir: '.build/transition-receipts',
    repoRoot: setup.repo,
  });

  const summaryPath = join(setup.repo, '.build/plans/receipt-fixture-implementation-summary.md');
  writeFileSync(summaryPath, '# Summary\n\nAll fixture work is integrated.\n', 'utf8');
  const verifyState = [
    'slug: "plan"',
    `base_ref: ${JSON.stringify(baseRef)}`,
    'phase: "verify"',
    'workflow_artifact_prefix: "receipt-fixture"',
    `phase_result_references: ${JSON.stringify(reviewResult ? [{
      phase: 'plan-review',
      receipt_id: reviewResult.receipt_id,
    }] : [])}`,
    `phase_result_bootstrap: ${JSON.stringify(bootstrap ? [{
      accepted_contract_hash: contract.contract_hash,
      accepted_plan_sha256: contract.source.sha256,
      override: 'user-directed-no-rereview',
      phase: 'plan-review',
      reason: 'precompiler-plan-review',
      review_artifact_sha256: sha256('precompiler review'),
      reviewed_contract_hash: sha256('reviewed contract'),
      reviewed_plan_sha256: sha256('reviewed plan'),
      reviewer: 'Fixture Reviewer',
    }] : [])}`,
    'active_slice: null',
    'completed_slices: ["S-001"]',
    'completed_tasks: ["T-001"]',
    `checkpoint_commits: ${JSON.stringify([{
      slice_id: 'S-001',
      commit: git(setup.repo, 'rev-parse', 'HEAD'),
    }])}`,
    `transition_references: ${JSON.stringify([{ receipt_id: completionReceiptId }])}`,
    'transition_history: []',
    'counter_events: []',
    '',
  ].join('\n');
  writeFileSync(setup.statePath, verifyState, 'utf8');
  const reportValues = {
    PLAN_SHA256: sha256(readFileSync(join(setup.repo, 'plan.yaml'))),
    CONTRACT_SHA256: sha256(readFileSync(setup.contractPath)),
    REQUIREMENTS_SHA256: sha256(readFileSync(
      join(setup.repo, '.build/plans/receipt-fixture-requirements.md'),
    )),
    SUMMARY_SHA256: sha256(readFileSync(summaryPath)),
    LEDGER_SHA256: sha256(readFileSync(join(evidenceDir, 'ledger.json'))),
    REPOSITORY_SHA256: identity.fingerprint,
  };
  const verifyReport = replaceAll(readFileSync(VERIFY_FIXTURE, 'utf8'), reportValues);
  writeFileSync(setup.artifactPath, verifyReport, 'utf8');
  return {
    ...setup,
    artifactPath: setup.artifactPath,
    evidenceCommand: contract.evidence_commands[0].command,
    evidenceDir,
    report: verifyReport,
    state: verifyState,
  };
}

function compileVerifyArgs(setup) {
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
    setup.evidenceDir,
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

test('phase-result verify: coverage and planned file-scope gaps cannot compile as verified', async () => {
  const current = await makeVerifyRepo();
  const verified = JSON.parse(run(compileVerifyArgs(current), current.repo).stdout);
  assert.equal(verified.phase, 'verify');
  assert.equal(verified.verdict, 'verified');
  assert.equal(verified.allowed_next_phase, 'architect-review');

  const recompiled = await makeVerifyRepo();
  const originalContract = loadContract({
    contractPath: recompiled.contractPath,
    cwd: recompiled.repo,
  }).contract;
  const recompiledPlanPath = join(
    recompiled.repo,
    '.build/recompiled/plan.yaml',
  );
  const recompiledContractPath = join(
    recompiled.repo,
    '.build/contracts/plan/recompiled-contract.json',
  );
  mkdirSync(join(recompiled.repo, '.build/recompiled'), { recursive: true });
  writeFileSync(
    recompiledPlanPath,
    readFileSync(join(recompiled.repo, 'plan.yaml')),
  );
  run([
    process.execPath,
    CLI,
    'validate-plan',
    '--plan',
    recompiledPlanPath,
    '--out',
    recompiledContractPath,
  ], recompiled.repo);
  const nextContract = loadContract({
    contractPath: recompiledContractPath,
    cwd: recompiled.repo,
  }).contract;
  assert.equal(nextContract.source.sha256, originalContract.source.sha256);
  assert.notEqual(nextContract.contract_hash, originalContract.contract_hash);
  const ledgerPath = join(recompiled.evidenceDir, 'ledger.json');
  const oldContractSubject = sha256(readFileSync(recompiled.contractPath));
  const oldLedgerSubject = sha256(readFileSync(ledgerPath));
  await runEvidence({
    contractPath: recompiledContractPath,
    evidenceDir: recompiled.evidenceDir,
    force: true,
    repoRoot: recompiled.repo,
  });
  writeFileSync(
    recompiled.artifactPath,
    recompiled.report
      .replace(oldContractSubject, sha256(readFileSync(recompiledContractPath)))
      .replace(oldLedgerSubject, sha256(readFileSync(ledgerPath))),
    'utf8',
  );
  recompiled.contractPath = recompiledContractPath;
  const afterRecompile = JSON.parse(
    run(compileVerifyArgs(recompiled), recompiled.repo).stdout,
  );
  assert.equal(afterRecompile.verdict, 'verified');

  const unchanged = await makeVerifyRepo({ plannedUnchanged: true });
  const blocked = run(compileVerifyArgs(unchanged), unchanged.repo, 1);
  assert.match(blocked.stderr, /E_RESULT_VERDICT/);
  writeFileSync(
    unchanged.artifactPath,
    unchanged.report
      .replace('VERIFIED - all available checks pass', 'PARTIAL - planned path unchanged')
      .replace('verdict: verified', 'verdict: partial')
      .replace(
        'findings: []',
        [
          'findings:',
          '  - id: VR-001',
          '    severity: important',
          '    summary: "A planned path is unchanged."',
          '    evidence: "test/legacy-pose.test.js is absent from the base-to-HEAD diff."',
          '    consequence: "The planned scope is not fully evidenced."',
          '    fix: "Confirm or change test/legacy-pose.test.js before verification."',
        ].join('\n'),
      ),
    'utf8',
  );
  const partial = JSON.parse(run(compileVerifyArgs(unchanged), unchanged.repo).stdout);
  assert.equal(partial.verdict, 'partial');
  assert.equal(partial.allowed_next_phase, 'architect-review');

  const bootstrapped = await makeVerifyRepo({ bootstrap: true });
  const bootstrapBlocked = run(compileVerifyArgs(bootstrapped), bootstrapped.repo, 1);
  assert.match(bootstrapBlocked.stderr, /E_RESULT_VERDICT/);
  writeFileSync(
    bootstrapped.artifactPath,
    bootstrapped.report
      .replace('VERIFIED - all available checks pass', 'PARTIAL - Plan Review receipt bootstrap')
      .replace('verdict: verified', 'verdict: partial')
      .replace(
        'findings: []',
        [
          'findings:',
          '  - id: VR-001',
          '    severity: important',
          '    summary: "The generated Plan Review receipt is absent."',
          '    evidence: "The accepted pre-S-001 review is recorded only as bootstrap data."',
          '    consequence: "Plan Review acceptance is visible but not generated by buildctl."',
          '    fix: "Retain the Plan Review receipt bootstrap finding for this release."',
        ].join('\n'),
      ),
    'utf8',
  );
  const bootstrapPartial = JSON.parse(
    run(compileVerifyArgs(bootstrapped), bootstrapped.repo).stdout,
  );
  assert.equal(bootstrapPartial.verdict, 'partial');
  const bootstrapReceipt = JSON.parse(readFileSync(
    join(bootstrapped.repo, bootstrapPartial.receipt_path),
    'utf8',
  ));
  assert.equal(
    bootstrapReceipt.mechanical_facts.prior_plan_review.bootstrap.reason,
    'precompiler-plan-review',
  );

  const failedEvidence = await makeVerifyRepo({ failedEvidence: true });
  const failedBlocked = run(compileVerifyArgs(failedEvidence), failedEvidence.repo, 1);
  assert.match(failedBlocked.stderr, /E_RESULT_VERDICT/);
  writeFileSync(
    failedEvidence.artifactPath,
    failedEvidence.report
      .replace('VERIFIED - all available checks pass', 'FAILED - evidence command failed')
      .replace('verdict: verified', 'verdict: failed')
      .replace(
        'findings: []',
        [
          'findings:',
          '  - id: VR-001',
          '    severity: important',
          '    summary: "A final evidence command failed."',
          `    evidence: ${JSON.stringify(failedEvidence.evidenceCommand)}`,
          '    consequence: "The implementation cannot be verified."',
          '    fix: "Return to implementation and make the failed command pass."',
        ].join('\n'),
      ),
    'utf8',
  );
  const failed = JSON.parse(run(
    compileVerifyArgs(failedEvidence),
    failedEvidence.repo,
  ).stdout);
  assert.equal(failed.verdict, 'failed');
  assert.equal(failed.allowed_next_phase, 'implement');

  const drift = await makeVerifyRepo({ outOfPlan: true });
  const outOfPlan = run(compileVerifyArgs(drift), drift.repo, 1);
  assert.match(outOfPlan.stderr, /E_RESULT_SCOPE/);
  assert.equal(readFileSync(drift.statePath, 'utf8'), drift.state);
  assert.equal(git(drift.repo, 'status', '--porcelain=v1', '--untracked-files=all'), '');

  const invalidBase = await makeVerifyRepo();
  writeFileSync(
    invalidBase.statePath,
    invalidBase.state.replace(/base_ref: "[a-f0-9]{40}"/, `base_ref: "${'0'.repeat(40)}"`),
    'utf8',
  );
  assert.match(
    run(compileVerifyArgs(invalidBase), invalidBase.repo, 1).stderr,
    /E_RESULT_BASE_REF/,
  );

  const dirty = await makeVerifyRepo();
  writeFileSync(join(dirty.repo, 'src/legacy-pose.js'), 'export const dirty = true;\n');
  assert.match(run(compileVerifyArgs(dirty), dirty.repo, 1).stderr, /E_RESULT_DIRTY/);

  const tamperedPrior = await makeVerifyRepo();
  const priorReference = parseWorkflowState(tamperedPrior.state).phase_result_references[0];
  const priorPath = join(
    tamperedPrior.repo,
    '.build/result-receipts',
    `${priorReference.receipt_id}.json`,
  );
  const priorReceipt = JSON.parse(readFileSync(priorPath, 'utf8'));
  writeFileSync(priorPath, JSON.stringify({ ...priorReceipt, verdict: 'do_not_proceed' }));
  assert.match(
    run(compileVerifyArgs(tamperedPrior), tamperedPrior.repo, 1).stderr,
    /E_RESULT_PRIOR_RECEIPT/,
  );
});
