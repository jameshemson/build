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
const ARCHITECT_FIXTURE = join(
  ROOT,
  'scripts/fixtures/buildctl/phase-results/architect-review.md',
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
  rejectedReview = false,
  rereview = false,
  weakenedTest = false,
} = {}) {
  const setup = await makePlanReviewRepo({ failedEvidence });
  const reviewResults = [];
  if (!bootstrap) {
    reviewResults.push(JSON.parse(run(compileArgs(setup), setup.repo).stdout));
    if (rereview || rejectedReview) {
      const nextReport = setup.report
        .replace(
          'Proceed to implementation',
          rejectedReview ? 'Do not proceed' : 'Proceed to implementation',
        )
        .replace('verdict: proceed', `verdict: ${rejectedReview ? 'do_not_proceed' : 'proceed'}`)
        .replace(
          'findings: []',
          [
            'findings:',
            '  - id: PR-001',
            `    severity: ${rejectedReview ? 'critical' : 'minor'}`,
            `    summary: "${rejectedReview ? 'The revised plan is rejected.' : 'The revised plan retains a minor note.'}"`,
            '    evidence: "The second immutable review fixture is distinct from the first."',
            `    consequence: "${rejectedReview ? 'Implementation is not authorized.' : 'The accepted plan retains a non-blocking note.'}"`,
            `    fix: "${rejectedReview ? 'Return to planning before implementation.' : 'Track the note after implementation.'}"`,
          ].join('\n'),
        );
      writeFileSync(setup.artifactPath, nextReport, 'utf8');
      reviewResults.push(JSON.parse(run(compileArgs(setup), setup.repo).stdout));
      assert.notEqual(reviewResults[0].receipt_id, reviewResults[1].receipt_id);
    }
  }
  if (weakenedTest) {
    // Land a stronger version of the planned test file before base_ref, so the
    // feature commit's ordinary version is a measurable loss of assertions.
    writeFileSync(
      join(setup.repo, 'test/legacy-pose.test.js'),
      [
        "import test from 'node:test';",
        "import assert from 'node:assert/strict';",
        "import { adopted } from '../src/legacy-pose.js';",
        "test('adopts a legacy building pose', () => {",
        "  console.log('adopts a legacy building pose');",
        "  assert.equal(adopted, 'verified');",
        '  assert.ok(adopted.length > 0);',
        '});',
        '',
      ].join('\n'),
      'utf8',
    );
    git(setup.repo, 'add', '.');
    git(setup.repo, 'commit', '-qm', 'wave 0 test');
  }
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
    `phase_result_references: ${JSON.stringify(reviewResults.map((result) => ({
      phase: 'plan-review',
      receipt_id: result.receipt_id,
    })))}`,
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
  const verifyArtifactPath = join(
    setup.repo,
    '.build/plans/receipt-fixture-verify.md',
  );
  writeFileSync(verifyArtifactPath, verifyReport, 'utf8');
  return {
    ...setup,
    artifactPath: verifyArtifactPath,
    evidenceCommand: contract.evidence_commands[0].command,
    evidenceDir,
    report: verifyReport,
    reviewResults,
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

async function makeArchitectRepo({ reverify = false } = {}) {
  const setup = await makeVerifyRepo();
  const verifyResults = [
    JSON.parse(run(compileVerifyArgs(setup), setup.repo).stdout),
  ];
  if (reverify) {
    const nextReport = setup.report.replace(
      'findings: []',
      [
        'findings:',
        '  - id: VR-001',
        '    severity: minor',
        '    summary: "The second Verify result retains a minor note."',
        '    evidence: "The second immutable Verify fixture is distinct from the first."',
        '    consequence: "The verified implementation retains a non-blocking note."',
        '    fix: "Track the note after completion."',
      ].join('\n'),
    );
    writeFileSync(setup.artifactPath, nextReport, 'utf8');
    verifyResults.push(JSON.parse(run(compileVerifyArgs(setup), setup.repo).stdout));
    assert.notEqual(verifyResults[0].receipt_id, verifyResults[1].receipt_id);
  }
  const verifyResult = verifyResults.at(-1);
  const verifyReceipt = JSON.parse(readFileSync(
    join(setup.repo, verifyResult.receipt_path),
    'utf8',
  ));
  const parsed = parseWorkflowState(setup.state);
  const references = [
    ...parsed.phase_result_references,
    ...verifyResults.map((result) => ({ phase: 'verify', receipt_id: result.receipt_id })),
  ];
  const architectState = setup.state
    .replace('phase: "verify"', 'phase: "architect-review"')
    .replace(
      /^phase_result_references: .*$/m,
      `phase_result_references: ${JSON.stringify(references)}`,
    );
  writeFileSync(setup.statePath, architectState, 'utf8');
  const repository = await captureRepositoryIdentity({
    repoRoot: setup.repo,
    evidenceDir: setup.evidenceDir,
  });
  const summaryPath = join(
    setup.repo,
    '.build/plans/receipt-fixture-implementation-summary.md',
  );
  const architectPath = join(
    setup.repo,
    '.build/plans/receipt-fixture-architect-review.md',
  );
  const values = {
    PLAN_SHA256: sha256(readFileSync(join(setup.repo, 'plan.yaml'))),
    CONTRACT_SHA256: sha256(readFileSync(setup.contractPath)),
    SUMMARY_SHA256: sha256(readFileSync(summaryPath)),
    REPOSITORY_SHA256: repository.fingerprint,
    VERIFY_SHA256: sha256(readFileSync(setup.artifactPath)),
    VERIFY_RESULT_SHA256: verifyReceipt.receipt_hash,
  };
  const report = replaceAll(readFileSync(ARCHITECT_FIXTURE, 'utf8'), values);
  writeFileSync(architectPath, report, 'utf8');
  return {
    ...setup,
    artifactPath: architectPath,
    architectState,
    report,
    verifyResults,
    verifyArtifactPath: setup.artifactPath,
    verifyReceiptPath: join(setup.repo, verifyResult.receipt_path),
  };
}

function compileArchitectArgs(setup) {
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

test('phase-result verify: an in-plan test file that lost assertions cannot compile as verified', async () => {
  const weakened = await makeVerifyRepo({ weakenedTest: true });
  // The path is in the plan, so file scope stays clean and the must-have
  // observation still matches; only the shrink gap stands between the weakened
  // test and a verified verdict.
  const blocked = run(compileVerifyArgs(weakened), weakened.repo, 1);
  assert.match(blocked.stderr, /E_RESULT_VERDICT/);
  assert.match(blocked.stderr, /test-shrink:test\/legacy-pose\.test\.js/);

  const clean = await makeVerifyRepo();
  const verified = JSON.parse(run(compileVerifyArgs(clean), clean.repo).stdout);
  assert.equal(verified.verdict, 'verified');
  const receipt = JSON.parse(readFileSync(join(clean.repo, verified.receipt_path), 'utf8'));
  assert.deepEqual(receipt.mechanical_facts.test_shrink.shrunk, []);
  assert.equal(
    receipt.mechanical_facts.test_shrink.bounds.unit,
    'lines matching assertion_pattern',
  );
});

test('phase-result verify: coverage and planned file-scope gaps cannot compile as verified', async () => {
  const current = await makeVerifyRepo();
  const verified = JSON.parse(run(compileVerifyArgs(current), current.repo).stdout);
  assert.equal(verified.phase, 'verify');
  assert.equal(verified.verdict, 'verified');
  assert.equal(verified.allowed_next_phase, 'architect-review');

  const repeatedReview = await makeVerifyRepo({ rereview: true });
  const repeatedReviewState = parseWorkflowState(repeatedReview.state);
  const reviewReferences = repeatedReviewState.phase_result_references.filter(
    (entry) => entry.phase === 'plan-review',
  );
  assert.equal(reviewReferences.length, 2);
  assert.notEqual(reviewReferences[0].receipt_id, reviewReferences[1].receipt_id);
  const afterRereview = JSON.parse(
    run(compileVerifyArgs(repeatedReview), repeatedReview.repo).stdout,
  );
  assert.equal(afterRereview.verdict, 'verified');
  const afterRereviewReceipt = JSON.parse(readFileSync(
    join(repeatedReview.repo, afterRereview.receipt_path),
    'utf8',
  ));
  assert.equal(
    afterRereviewReceipt.mechanical_facts.prior_plan_review.receipt_id,
    reviewReferences[1].receipt_id,
  );

  const rejectedReview = await makeVerifyRepo({ rejectedReview: true });
  assert.match(
    run(compileVerifyArgs(rejectedReview), rejectedReview.repo, 1).stderr,
    /E_RESULT_PRIOR_RECEIPT/,
  );

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

test('phase-result architect-review: stale Verify results and changed diffs block pass', async () => {
  const current = await makeArchitectRepo();
  const stateBefore = readFileSync(current.statePath, 'utf8');
  const headBefore = git(current.repo, 'rev-parse', 'HEAD');
  const compiled = JSON.parse(
    run(compileArchitectArgs(current), current.repo).stdout,
  );
  assert.equal(compiled.phase, 'architect-review');
  assert.equal(compiled.verdict, 'pass');
  assert.equal(compiled.allowed_next_phase, 'complete');
  const receiptBytes = readFileSync(join(current.repo, compiled.receipt_path), 'utf8');
  const replay = JSON.parse(run(compileArchitectArgs(current), current.repo).stdout);
  assert.equal(replay.receipt_id, compiled.receipt_id);
  assert.equal(readFileSync(join(current.repo, replay.receipt_path), 'utf8'), receiptBytes);

  const repeatedVerify = await makeArchitectRepo({ reverify: true });
  const repeatedVerifyState = parseWorkflowState(repeatedVerify.architectState);
  const verifyReferences = repeatedVerifyState.phase_result_references.filter(
    (entry) => entry.phase === 'verify',
  );
  assert.equal(verifyReferences.length, 2);
  assert.notEqual(verifyReferences[0].receipt_id, verifyReferences[1].receipt_id);
  const afterReverify = JSON.parse(
    run(compileArchitectArgs(repeatedVerify), repeatedVerify.repo).stdout,
  );
  assert.equal(afterReverify.verdict, 'pass');
  const afterReverifyReceipt = JSON.parse(readFileSync(
    join(repeatedVerify.repo, afterReverify.receipt_path),
    'utf8',
  ));
  assert.equal(
    afterReverifyReceipt.mechanical_facts.verify_result.receipt_id,
    verifyReferences[1].receipt_id,
  );

  const wrongPrior = await makeArchitectRepo();
  const wrongState = parseWorkflowState(wrongPrior.architectState);
  const planReviewReference = wrongState.phase_result_references.find(
    (entry) => entry.phase === 'plan-review',
  );
  writeFileSync(
    wrongPrior.statePath,
    wrongPrior.architectState.replace(
      /"phase":"verify","receipt_id":"[a-f0-9]{64}"/,
      `"phase":"verify","receipt_id":"${planReviewReference.receipt_id}"`,
    ),
  );
  assert.match(
    run(compileArchitectArgs(wrongPrior), wrongPrior.repo, 1).stderr,
    /E_RESULT_PRIOR_RECEIPT/,
  );

  const staleVerify = await makeArchitectRepo();
  writeFileSync(staleVerify.verifyArtifactPath, `${staleVerify.report}\nchanged verify\n`);
  assert.match(
    run(compileArchitectArgs(staleVerify), staleVerify.repo, 1).stderr,
    /E_RESULT_PRIOR_RECEIPT/,
  );

  const changedDiff = await makeArchitectRepo();
  writeFileSync(
    join(changedDiff.repo, 'src/legacy-pose.js'),
    'export const adopted = "changed-after-verify";\n',
  );
  git(changedDiff.repo, 'add', 'src/legacy-pose.js');
  git(changedDiff.repo, 'commit', '-qm', 'changed after verify');
  assert.match(
    run(compileArchitectArgs(changedDiff), changedDiff.repo, 1).stderr,
    /E_RESULT_PRIOR_RECEIPT/,
  );

  const invalid = await makeArchitectRepo();
  writeFileSync(
    invalid.artifactPath,
    invalid.report
      .replace('No findings.', '- Important: unresolved issue.')
      .replace(
        'findings: []',
        [
          'findings:',
          '  - id: AR-001',
          '    severity: important',
          '    summary: "An important issue remains."',
          '    evidence: "The fixture names the unresolved issue."',
          '    consequence: "Shipping would retain a correctness risk."',
          '    fix: "Return to implementation and resolve the issue."',
        ].join('\n'),
      ),
    'utf8',
  );
  assert.match(
    run(compileArchitectArgs(invalid), invalid.repo, 1).stderr,
    /E_RESULT_VERDICT/,
  );

  const mismatch = await makeArchitectRepo();
  writeFileSync(mismatch.artifactPath, mismatch.report.replace(/^PASS$/m, 'FAIL'));
  assert.match(
    run(compileArchitectArgs(mismatch), mismatch.repo, 1).stderr,
    /E_RESULT_VERDICT_MISMATCH/,
  );

  assert.equal(readFileSync(current.statePath, 'utf8'), stateBefore);
  assert.equal(git(current.repo, 'rev-parse', 'HEAD'), headBefore);
});
