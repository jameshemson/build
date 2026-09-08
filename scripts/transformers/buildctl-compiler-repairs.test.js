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
import * as completion from '../../source/skills/build/buildctl/completion.js';
import { evaluateWorkflowCoverage, receiptIndex } from '../../source/skills/build/buildctl/coverage.js';
import { runEvidence } from '../../source/skills/build/buildctl/evidence.js';
import {
  compilePlan,
  loadContract,
  sha256,
} from '../../source/skills/build/buildctl/plan-contract.js';
import { compilePhaseResult } from '../../source/skills/build/buildctl/phase-results.js';
import { captureRepositoryIdentity } from '../../source/skills/build/buildctl/repository.js';
import {
  createTransitionReceipt,
  transitionReceiptId,
  writeTransitionReceipt,
} from '../../source/skills/build/buildctl/transition.js';

const EVIDENCE_COMMAND = 'node check.js';
const sandboxes = [];

afterEach(() => {
  for (const path of sandboxes.splice(0)) rmSync(path, { recursive: true, force: true });
});

function run(command, cwd) {
  const result = spawnSync(command[0], command.slice(1), { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `${command.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

function git(repo, ...args) {
  return run(['git', ...args], repo);
}

function replaceTokens(source, values) {
  let result = source;
  for (const [name, value] of Object.entries(values)) result = result.replaceAll(`__${name}__`, value);
  return result;
}

function planSource(overrides = {}) {
  const values = {
    assumptions: '[A-001, A-002]',
    binding: 'Relevant slice behavior',
    decisions: '[D-002]',
    depends: '[T-001]',
    predecessorGoal: 'deliver predecessor work',
    requirements: '[REQ-002]',
    sliceGoal: 'deliver relevant work',
    taskClaim: 'relevant slice behavior remains verified',
    unrelatedDone: 'unrelated global validation passes',
    ...overrides,
  };
  return `approach: |\n  [B-000] Unrelated global validation.\n  [B-001] Required global validation.\n  [B-002] Predecessor implementation.\n  [B-003] Relevant slice implementation.\nrequirements: [REQ-000, REQ-001, REQ-002, REQ-003]\ndecisions: [D-000, D-001, D-002, D-003]\nassumptions: ${values.assumptions}\nevidence_mode: typed\nbindings:\n  - { id: B-000, kind: behavior, name: "Unrelated global validation", task_id: T-000, must_have_id: MH-000 }\n  - { id: B-001, kind: behavior, name: "Required global validation", task_id: T-001, must_have_id: MH-001 }\n  - { id: B-002, kind: behavior, name: "Predecessor implementation", task_id: T-002, must_have_id: MH-002 }\n  - { id: B-003, kind: behavior, name: "${values.binding}", task_id: T-003, must_have_id: MH-003 }\nexecution_manifest:\n  - id: T-000\n    wave: 0\n    depends_on: []\n    workstream: repairs\n    files_modified: [plan.yaml]\n    requirements: [REQ-000]\n    decisions: [D-000]\n    must_haves:\n      - { id: MH-000, claim: "unrelated global validation", evidence: { kind: behavioral-test, ref: "${EVIDENCE_COMMAND} :: unrelated-ok" } }\n    verify: "${EVIDENCE_COMMAND}"\n    done: "${values.unrelatedDone}"\n  - id: T-001\n    wave: 0\n    depends_on: []\n    workstream: repairs\n    files_modified: []\n    requirements: [REQ-001]\n    decisions: [D-001]\n    must_haves:\n      - { id: MH-001, claim: "required global validation", evidence: { kind: behavioral-test, ref: "${EVIDENCE_COMMAND} :: prerequisite-ok" } }\n    verify: "${EVIDENCE_COMMAND}"\n    done: "required global validation passes"\n  - id: T-002\n    wave: 1\n    depends_on: []\n    workstream: repairs\n    files_modified: [src/predecessor.js]\n    requirements: [REQ-001]\n    decisions: [D-001]\n    must_haves:\n      - { id: MH-002, claim: "predecessor behavior", evidence: { kind: behavioral-test, ref: "${EVIDENCE_COMMAND} :: slice-ok" } }\n    verify: "${EVIDENCE_COMMAND}"\n    done: "predecessor behavior passes"\n  - id: T-003\n    wave: 2\n    depends_on: ${values.depends}\n    workstream: repairs\n    files_modified: [src/work.js]\n    requirements: ${values.requirements}\n    decisions: ${values.decisions}\n    must_haves:\n      - { id: MH-003, claim: "${values.taskClaim}", evidence: { kind: behavioral-test, ref: "${EVIDENCE_COMMAND} :: slice-ok" } }\n    verify: "${EVIDENCE_COMMAND}"\n    done: "relevant behavior passes"\ndelivery_slices:\n  - id: S-000\n    goal: "${values.predecessorGoal}"\n    depends_on: []\n    task_ids: [T-002]\n    requirements: [REQ-001]\n    must_haves: ["predecessor is integrated"]\n    verify: ["${EVIDENCE_COMMAND}"]\n    done: "predecessor is complete"\n  - id: S-001\n    goal: "${values.sliceGoal}"\n    depends_on: [S-000]\n    task_ids: [T-003]\n    requirements: ${values.requirements}\n    must_haves: ["relevant work is integrated"]\n    verify: ["${EVIDENCE_COMMAND}"]\n    done: "relevant work is complete"\n`;
}

function stateSource({ baseRef, checkpoint0, checkpoint1, phase, reviewId, references = [] }) {
  return [
    'slug: "plan"',
    `base_ref: ${baseRef}`,
    `phase: "${phase}"`,
    'workflow_artifact_prefix: "repairs"',
    `phase_result_references: ${JSON.stringify(reviewId ? [{ phase: 'plan-review', receipt_id: reviewId }] : [])}`,
    'phase_result_bootstrap: []',
    'active_slice: null',
    'completed_slices: ["S-000", "S-001"]',
    'completed_tasks: ["T-000", "T-001", "T-002", "T-003"]',
    `checkpoint_commits: ${JSON.stringify([
      { slice_id: 'S-000', commit: checkpoint0 },
      { slice_id: 'S-001', commit: checkpoint1 },
    ])}`,
    `transition_references: ${JSON.stringify(references.map((receipt_id) => ({ receipt_id })))}`,
    'transition_history: []',
    'counter_events: []',
    '',
  ].join('\n');
}

function validPlanSource(overrides = {}) {
  return planSource(overrides)
    .replace('files_modified: []', 'files_modified: [src/global.js]')
    .replace(
      'requirements: [REQ-000]\n    decisions: [D-000]',
      'requirements: [REQ-000, REQ-002, REQ-003]\n    decisions: [D-000, D-002, D-003]',
    );
}

function resultReport(phase, subjects) {
  const [title, verdict] = {
    verify: ['# Verification Report\n\nVERIFIED - all available checks pass', 'verified'],
    'plan-review': ['# Plan Review\n\nProceed to implementation', 'proceed'],
    'architect-review': ['# Architect Review\n\nPASS', 'pass'],
  }[phase];
  const entries = Object.entries(subjects)
    .map(([name, hash]) => `  - { name: ${JSON.stringify(name)}, sha256: "${hash}" }`)
    .join('\n');
  return `${title}\n\n## Machine result\n\n\`\`\`yaml\nschema_version: 1\nphase: ${phase}\nverdict: ${verdict}\nsubjects:\n${entries}\nfindings: []\n\`\`\`\n`;
}

function writeJudgments(path, contract, sliceId, repositoryFingerprint) {
  const requirements = completion.completionJudgmentRequirements(contract, sliceId);
  const lines = [
    'schema_version: 1',
    `slice_id: "${sliceId}"`,
    `repository_fingerprint: "${repositoryFingerprint}"`,
    'judgments:',
  ];
  for (const item of requirements) {
    lines.push(`  - id: "${item.id}"`);
    lines.push(`    obligation_sha256: "${item.obligation_sha256}"`);
    lines.push(`    evidence_kind: "${item.evidence_kind}"`);
    lines.push('    verdict: "accepted"');
    lines.push('    judged_by: "compiler-repairs-test"');
    lines.push('    rationale: "The focused fixture satisfies this obligation."');
  }
  writeFileSync(path, `${lines.join('\n')}\n`, 'utf8');
}

async function authorPlanReview(setup, contract) {
  const repository = await captureRepositoryIdentity({
    repoRoot: setup.repo,
    evidenceDir: setup.evidenceDir,
  });
  const subjects = {
    plan: sha256(readFileSync(setup.planPath)),
    contract: sha256(readFileSync(setup.contractPath)),
    context: sha256(readFileSync(setup.contextPath)),
    requirements: sha256(readFileSync(setup.requirementsPath)),
    repository: repository.fingerprint,
  };
  writeFileSync(setup.reviewPath, resultReport('plan-review', subjects), 'utf8');
  writeFileSync(setup.statePath, stateSource({
    baseRef: setup.baseRef,
    checkpoint0: setup.checkpoint0,
    checkpoint1: setup.checkpoint1,
    phase: 'review',
  }), 'utf8');
  return compilePhaseResult({
    artifactPath: setup.reviewPath,
    contractPath: setup.contractPath,
    cwd: setup.repo,
    evidenceDir: setup.evidenceDir,
    statePath: setup.statePath,
  });
}

async function complete(setup, contract, sliceId, checkpoint, completedSlices, references) {
  const identity = await captureRepositoryIdentity({ repoRoot: setup.repo, evidenceDir: setup.evidenceDir });
  writeJudgments(setup.judgmentsPath, contract, sliceId, identity.fingerprint);
  writeFileSync(
    setup.summaryPath,
    `# Summary\n\nCompletion checkpoint: ${JSON.stringify({ slice_id: sliceId, commit: checkpoint })}\n`,
    'utf8',
  );
  const state = stateSource({
    baseRef: setup.baseRef,
    checkpoint0: setup.checkpoint0,
    checkpoint1: setup.checkpoint1,
    phase: 'implement',
    references,
  }).replace('active_slice: null', `active_slice: "${sliceId}"`)
    .replace('completed_slices: ["S-000", "S-001"]', `completed_slices: ${JSON.stringify(completedSlices)}`);
  writeFileSync(setup.statePath, state, 'utf8');
  const result = await completion.completeSlice({
    repoRoot: setup.repo,
    statePath: setup.statePath,
    contractPath: setup.contractPath,
    summaryPath: setup.summaryPath,
    judgmentsPath: setup.judgmentsPath,
    evidenceDir: setup.evidenceDir,
  });
  assert.equal(result.status, 'proposed', JSON.stringify(result.diagnostics));
  return result.receipt_id;
}

async function makeCompletedRepo() {
  const repo = mkdtempSync(join(tmpdir(), 'buildctl-compiler-repairs-'));
  sandboxes.push(repo);
  run(['git', 'init', '-q'], repo);
  git(repo, 'config', 'user.email', 'buildctl@example.test');
  git(repo, 'config', 'user.name', 'Buildctl Test');
  writeFileSync(join(repo, '.gitignore'), '.build/\n', 'utf8');
  writeFileSync(join(repo, 'package.json'), '{"type":"module"}\n', 'utf8');
  writeFileSync(
    join(repo, 'check.js'),
    "process.stdout.write('unrelated-ok prerequisite-ok slice-ok');\n",
    'utf8',
  );
  const planPath = join(repo, 'plan.yaml');
  writeFileSync(planPath, 'fixture: base\n', 'utf8');
  mkdirSync(join(repo, 'src'), { recursive: true });
  writeFileSync(join(repo, 'src/predecessor.js'), 'export const predecessor = false;\n', 'utf8');
  writeFileSync(join(repo, 'src/global.js'), 'export const global = false;\n', 'utf8');
  writeFileSync(join(repo, 'src/work.js'), 'export const work = false;\n', 'utf8');
  git(repo, 'add', '.');
  git(repo, 'commit', '-qm', 'fixture base');
  const baseRef = git(repo, 'rev-parse', 'HEAD');
  writeFileSync(planPath, validPlanSource(), 'utf8');
  writeFileSync(join(repo, 'src/predecessor.js'), 'export const predecessor = true;\n', 'utf8');
  writeFileSync(join(repo, 'src/global.js'), 'export const global = true;\n', 'utf8');
  git(repo, 'add', 'plan.yaml', 'src/predecessor.js', 'src/global.js');
  git(repo, 'commit', '-qm', 'predecessor implementation');
  const checkpoint0 = git(repo, 'rev-parse', 'HEAD');

  const plans = join(repo, '.build/plans');
  mkdirSync(plans, { recursive: true });
  const setup = {
    baseRef,
    checkpoint0,
    checkpoint1: checkpoint0,
    contextPath: join(plans, 'repairs-context.md'),
    contractPath: join(repo, '.build/contracts/plan/contract.json'),
    evidenceDir: join(repo, '.build/evidence/plan'),
    judgmentsPath: join(repo, '.build/judgments/plan/current.yaml'),
    planPath,
    repo,
    requirementsPath: join(plans, 'repairs-requirements.md'),
    reviewPath: join(plans, 'repairs-review.md'),
    statePath: join(plans, 'repairs-state.md'),
    summaryPath: join(plans, 'repairs-implementation-summary.md'),
    verifyPath: join(plans, 'repairs-verify.md'),
  };
  mkdirSync(join(repo, '.build/judgments/plan'), { recursive: true });
  writeFileSync(setup.contextPath, '# Context\n\nCompiler repair fixture.\n', 'utf8');
  writeFileSync(setup.requirementsPath, '# Requirements\n\nREQ-000 through REQ-003.\n', 'utf8');
  let contract;
  try {
    contract = compilePlan({ planPath, outputPath: setup.contractPath, cwd: repo }).contract;
  } catch (error) {
    error.message += ` ${JSON.stringify(error.diagnostics)}`;
    throw error;
  }
  await runEvidence({ contractPath: setup.contractPath, evidenceDir: setup.evidenceDir, repoRoot: repo });
  const receipt0 = await complete(setup, contract, 'S-000', checkpoint0, [], []);

  writeFileSync(join(repo, 'src/work.js'), 'export const work = true;\n', 'utf8');
  git(repo, 'add', 'src/work.js');
  git(repo, 'commit', '-qm', 'relevant implementation');
  setup.checkpoint1 = git(repo, 'rev-parse', 'HEAD');
  await runEvidence({
    contractPath: setup.contractPath,
    evidenceDir: setup.evidenceDir,
    repoRoot: repo,
    force: true,
  });
  const receipt1 = await complete(setup, contract, 'S-001', setup.checkpoint1, ['S-000'], [receipt0]);
  setup.receipts = [receipt0, receipt1];
  return setup;
}

async function compileVerify(setup, source, options = {}) {
  const references = options.references ?? setup.receipts;
  const evidenceOptions = Object.hasOwn(options, 'evidenceDir')
    ? options.evidenceDir === undefined ? {} : { evidenceDir: options.evidenceDir }
    : { evidenceDir: setup.evidenceDir };
  writeFileSync(setup.planPath, source, 'utf8');
  git(setup.repo, 'add', 'plan.yaml');
  if (git(setup.repo, 'status', '--porcelain')) git(setup.repo, 'commit', '-qm', 'authored replan');
  const contract = compilePlan({
    planPath: setup.planPath,
    outputPath: setup.contractPath,
    cwd: setup.repo,
  }).contract;
  const review = await authorPlanReview(setup, contract);
  const evidence = await runEvidence({
    contractPath: setup.contractPath,
    evidenceDir: setup.evidenceDir,
    repoRoot: setup.repo,
    force: true,
  });
  writeFileSync(setup.statePath, stateSource({
    baseRef: setup.baseRef,
    checkpoint0: setup.checkpoint0,
    checkpoint1: setup.checkpoint1,
    phase: 'verify',
    references,
    reviewId: review.receipt_id,
  }), 'utf8');
  const repository = await captureRepositoryIdentity({ repoRoot: setup.repo, evidenceDir: setup.evidenceDir });
  writeFileSync(setup.verifyPath, resultReport('verify', {
    plan: sha256(readFileSync(setup.planPath)),
    contract: sha256(readFileSync(setup.contractPath)),
    requirements: sha256(readFileSync(setup.requirementsPath)),
    'implementation-summary': sha256(readFileSync(setup.summaryPath)),
    'evidence-ledger': sha256(readFileSync(join(setup.evidenceDir, 'ledger.json'))),
    repository: repository.fingerprint,
  }), 'utf8');
  return compilePhaseResult({
    artifactPath: setup.verifyPath,
    contractPath: setup.contractPath,
    cwd: setup.repo,
    ...evidenceOptions,
    statePath: setup.statePath,
  });
}

async function compileDefaultArchitect(setup, verify) {
  const state = readFileSync(setup.statePath, 'utf8')
    .replace('phase: "verify"', 'phase: "architect-review"')
    .replace(/^phase_result_references: (.*)$/m, (_, value) =>
      `phase_result_references: ${JSON.stringify([
        ...JSON.parse(value), { phase: 'verify', receipt_id: verify.receipt_id },
      ])}`);
  writeFileSync(setup.statePath, state, 'utf8');
  const repository = await captureRepositoryIdentity({
    repoRoot: setup.repo, evidenceDir: setup.evidenceDir,
  });
  const artifactPath = join(setup.repo, '.build/plans/repairs-architect-review.md');
  writeFileSync(artifactPath, resultReport('architect-review', {
    plan: sha256(readFileSync(setup.planPath)),
    contract: sha256(readFileSync(setup.contractPath)),
    'implementation-summary': sha256(readFileSync(setup.summaryPath)),
    repository: repository.fingerprint,
    verify: sha256(readFileSync(setup.verifyPath)),
    'verify-result': verify.receipt_hash,
  }), 'utf8');
  return compilePhaseResult({
    artifactPath,
    contractPath: setup.contractPath,
    cwd: setup.repo,
    statePath: setup.statePath,
  });
}

function receipt(command, output = 'unrelated-ok prerequisite-ok slice-ok') {
  return {
    command,
    exit_code: 0,
    signal: null,
    stdout: { tail: output },
    stderr: { tail: '' },
  };
}

test('compiler repairs: evidence directories', async () => {
  const setup = await makeCompletedRepo();
  const contract = loadContract({ contractPath: setup.contractPath, cwd: setup.repo }).contract;
  const explicitReview = await authorPlanReview(setup, contract);
  assert.equal(explicitReview.verdict, 'proceed');
  const defaultReview = await compilePhaseResult({
    artifactPath: setup.reviewPath,
    contractPath: setup.contractPath,
    cwd: setup.repo,
    statePath: setup.statePath,
  });
  assert.equal(defaultReview.verdict, 'proceed');
  const source = validPlanSource({ unrelatedDone: 'directory replan' });
  const explicit = await compileVerify(setup, source);
  assert.equal(explicit.verdict, 'verified');
  const defaulted = await compileVerify(setup, source, { evidenceDir: undefined });
  assert.equal(defaulted.verdict, 'verified');
  const architect = await compileDefaultArchitect(setup, defaulted);
  assert.equal(architect.verdict, 'pass');
  const identity = await captureRepositoryIdentity({ repoRoot: setup.repo, evidenceDir: setup.evidenceDir });
  assert.equal(identity.excluded_evidence_path, '.build/evidence/plan');
  for (const result of [defaultReview, defaulted, architect]) {
    const saved = JSON.parse(readFileSync(join(setup.repo, result.receipt_path), 'utf8'));
    assert.equal(saved.repository.excluded_evidence_path, '.build/evidence/plan');
    if (result !== defaultReview) assert.equal(saved.subjects.repository, identity.fingerprint);
  }
  setup.evidenceDir = join(setup.repo, '.build/custom-evidence');
  const custom = await compileVerify(setup, source, { evidenceDir: '.build/custom-evidence' });
  assert.equal(custom.verdict, 'verified');
  const savedCustom = JSON.parse(readFileSync(join(setup.repo, custom.receipt_path), 'utf8'));
  assert.equal(savedCustom.repository.excluded_evidence_path, '.build/custom-evidence');
  console.log('compiler repairs: evidence directories complete');
});

test('compiler repairs: global Wave 0', async () => {
  const contract = compileCoverageContract();
  const receipts = new Map([[EVIDENCE_COMMAND, receipt(EVIDENCE_COMMAND)]]);
  const completionReceipts = new Map([['S-001', {
    authorized_decision: { judgment_ids: ['slice:S-001:must-have:0'] },
  }]]);
  const valid = evaluateWorkflowCoverage({ completionReceipts, contract, receipts });
  assert.deepEqual(valid.gaps, []);
  assert.deepEqual(valid.failedCommands, []);
  assert.deepEqual(valid.resolvedRequirements, ['REQ-000', 'REQ-002']);
  const structural = structuredClone(contract);
  structural.execution_manifest[0].must_haves[0].evidence = {
    kind: 'structural', ref: 'src/global.js exports the global fixture.',
  };
  assert.deepEqual(evaluateWorkflowCoverage({
    completionReceipts, contract: structural, receipts,
  }).gaps, []);

  for (const [name, changedReceipts, expectedGap] of [
    ['missing receipt', new Map(), 'task:T-000:verify-receipt'],
    ['failed receipt', new Map([[EVIDENCE_COMMAND, { ...receipt(EVIDENCE_COMMAND), exit_code: 1 }]]), null],
    ['signaled receipt', new Map([[EVIDENCE_COMMAND, { ...receipt(EVIDENCE_COMMAND), signal: 'SIGTERM' }]]), null],
    ['missing observation', new Map([[EVIDENCE_COMMAND, receipt(EVIDENCE_COMMAND, 'slice-ok')]]), 'task:T-000:expected-observation'],
  ]) {
    const result = evaluateWorkflowCoverage({ completionReceipts, contract, receipts: changedReceipts });
    assert.ok(result.gaps.length || result.failedCommands.length, name);
    if (expectedGap) assert.ok(result.gaps.includes(expectedGap), name);
  }
  const noConsumer = structuredClone(contract);
  noConsumer.evidence_commands[0].consumers = noConsumer.evidence_commands[0].consumers
    .filter((consumer) => consumer.task_id !== 'T-000');
  assert.ok(evaluateWorkflowCoverage({ completionReceipts, contract: noConsumer, receipts })
    .gaps.includes('task:T-000:verify-consumer'));
  const noMustHaveConsumer = structuredClone(contract);
  noMustHaveConsumer.evidence_commands[0].consumers
    .find((consumer) => consumer.task_id === 'T-000').must_have_ids = [];
  const consumerGaps = evaluateWorkflowCoverage({
    completionReceipts, contract: noMustHaveConsumer, receipts,
  }).gaps;
  assert.ok(consumerGaps.includes('task:T-000:must-have-consumer'));
  assert.ok(!consumerGaps.includes('task:T-000:verify-consumer'));
  const setup = await makeCompletedRepo();
  const loaded = loadContract({ contractPath: setup.contractPath, cwd: setup.repo });
  const realContract = loaded.contract;
  const ledger = JSON.parse(readFileSync(join(setup.evidenceDir, 'ledger.json'), 'utf8'));
  const diagnostics = [];
  const current = await captureRepositoryIdentity({ repoRoot: setup.repo, evidenceDir: setup.evidenceDir });
  assert.equal(receiptIndex({
    contract: realContract, diagnostics, identity: current, ledger, repoRoot: loaded.repoRoot,
  }).size, 1);
  writeFileSync(join(setup.repo, 'src/global.js'), 'export const global = "changed";\n', 'utf8');
  const changed = await captureRepositoryIdentity({ repoRoot: setup.repo, evidenceDir: setup.evidenceDir });
  const stale = receiptIndex({
    contract: realContract, diagnostics, identity: changed, ledger, repoRoot: loaded.repoRoot,
  });
  assert.notEqual(changed.fingerprint, current.fingerprint);
  assert.equal(stale.size, 0);
  assert.deepEqual(diagnostics, []);
  assert.ok(evaluateWorkflowCoverage({ completionReceipts, contract: realContract, receipts: stale })
    .gaps.includes('task:T-000:verify-receipt'));
  const noHigherCompletion = evaluateWorkflowCoverage({
    completionReceipts: new Map(),
    contract,
    receipts,
  });
  assert.ok(noHigherCompletion.gaps.includes('slice:S-001:completion-receipt'));
  console.log('compiler repairs: global Wave 0 complete');
});

function compileCoverageContract() {
  const task = (id, wave, requirement, observation) => ({
    decisions: [`D-${id.slice(2)}`], depends_on: [], done: 'done', files_modified: [], id,
    must_haves: [{ claim: 'claim', evidence: { kind: 'behavioral-test', ref: `${EVIDENCE_COMMAND} :: ${observation}` }, id: `MH-${id.slice(2)}` }],
    requirements: [requirement], verify: EVIDENCE_COMMAND, wave, workstream: 'fixture',
  });
  const tasks = [task('T-000', 0, 'REQ-000', 'unrelated-ok'), task('T-002', 1, 'REQ-002', 'slice-ok')];
  const consumers = tasks.map((entry) => ({
    authority: 'task', must_have_ids: [entry.must_haves[0].id], requirements: entry.requirements, task_id: entry.id,
  }));
  return {
    bindings: tasks.map((entry) => ({ id: `B-${entry.id.slice(2)}`, kind: 'behavior', must_have_id: entry.must_haves[0].id, name: 'binding', task_id: entry.id })),
    delivery_slices: [{ depends_on: [], done: 'done', goal: 'goal', id: 'S-001', must_haves: ['claim'], requirements: ['REQ-002'], task_ids: ['T-002'], verify: [EVIDENCE_COMMAND] }],
    evidence_commands: [{ command: EVIDENCE_COMMAND, consumers: [...consumers, { authority: 'slice', requirements: ['REQ-002'], slice_id: 'S-001' }] }],
    execution_manifest: tasks,
  };
}

test('compiler repairs: unchanged completion reuse', async () => {
  const setup = await makeCompletedRepo();
  const unchanged = await compileVerify(setup, validPlanSource({ unrelatedDone: 'unrelated validation changed' }));
  assert.equal(unchanged.verdict, 'verified');
  assert.equal(typeof completion.completionScopeHash, 'function');

  const mutations = [
    ['task claim', validPlanSource({ taskClaim: 'relevant slice behavior changed' })],
    ['task evidence', validPlanSource().replace(':: slice-ok" } }\n    verify:', ':: prerequisite-ok" } }\n    verify:')],
    ['task verify', validPlanSource().replaceAll('node check.js', 'node ./check.js')],
    ['task files', validPlanSource().replace('files_modified: [src/work.js]', 'files_modified: [src/work.js, src/extra.js]')],
    ['binding', validPlanSource({ binding: 'Changed relevant binding' })],
    ['requirement membership', validPlanSource({ requirements: '[REQ-003]' })],
    ['decision membership', validPlanSource({ decisions: '[D-003]' })],
    ['task dependency', validPlanSource({ depends: '[]' })],
    ['slice', validPlanSource({ sliceGoal: 'changed relevant slice goal' })],
    ['predecessor slice', validPlanSource({ predecessorGoal: 'changed predecessor slice goal' })],
    ['assumptions', validPlanSource({ assumptions: '[A-001, A-003]' })],
  ];
  for (const [name, source] of mutations) {
    await assert.rejects(
      compileVerify(setup, source),
      (error) => {
        assert.equal(
          error.code,
          'E_RESULT_COMPLETION_RECEIPT',
          `${name}: ${error.message} ${JSON.stringify(error.diagnostics)}`,
        );
        return true;
      },
      name,
    );
  }

  const exact = await makeCompletedRepo();
  const legacyIds = makeLegacyReceipts(exact);
  const legacyExact = await compileVerify(exact, validPlanSource(), { references: legacyIds });
  assert.equal(legacyExact.verdict, 'verified');
  await assert.rejects(
    compileVerify(exact, validPlanSource({ unrelatedDone: 'legacy unrelated replan' }), { references: legacyIds }),
    (error) => error.code === 'E_RESULT_COMPLETION_RECEIPT',
  );
  const unknown = await makeCompletedRepo();
  const unknownIds = makeLegacyReceipts(unknown, 'completion-scope-v2');
  await assert.rejects(
    compileVerify(unknown, validPlanSource({ unrelatedDone: 'unknown proof replan' }), { references: unknownIds }),
    (error) => error.code === 'E_RESULT_COMPLETION_RECEIPT',
  );
  const proofTamper = await makeCompletedRepo();
  const proofIds = proofTamper.receipts.map((id) => rewriteReceipt(proofTamper, id, (input) => ({
    ...input,
    subjects: input.subjects.map((subject) => subject.name === 'completion-scope-v1'
      ? { ...subject, sha256: '0'.repeat(64) } : subject),
  })));
  await assert.rejects(
    compileVerify(proofTamper, validPlanSource(), { references: proofIds }),
    (error) => error.code === 'E_RESULT_COMPLETION_RECEIPT',
  );

  const tampered = await makeCompletedRepo();
  const path = join(tampered.repo, '.build/transition-receipts', `${tampered.receipts[1]}.json`);
  const envelope = JSON.parse(readFileSync(path, 'utf8'));
  envelope.authorized_decision.slice_id = 'S-999';
  writeFileSync(path, `${JSON.stringify(envelope)}\n`, 'utf8');
  await assert.rejects(
    compileVerify(tampered, validPlanSource()),
    (error) => error.code === 'E_RESULT_COMPLETION_RECEIPT',
  );

  const checkpoint = await makeCompletedRepo();
  const badState = stateSource({
    baseRef: checkpoint.baseRef,
    checkpoint0: checkpoint.checkpoint0,
    checkpoint1: checkpoint.checkpoint0,
    phase: 'verify',
    references: checkpoint.receipts,
  });
  await assert.rejects(
    compileVerifyWithState(checkpoint, validPlanSource(), badState),
    (error) => error.code === 'E_RESULT_COMPLETION_RECEIPT',
  );

  const nonancestor = await makeCompletedRepo();
  const branch = git(nonancestor.repo, 'branch', '--show-current');
  git(nonancestor.repo, 'switch', '-q', '-c', 'nonancestor', nonancestor.checkpoint0);
  writeFileSync(join(nonancestor.repo, 'src/work.js'), 'export const work = "side";\n', 'utf8');
  git(nonancestor.repo, 'add', 'src/work.js');
  git(nonancestor.repo, 'commit', '-qm', 'nonancestor checkpoint');
  const sideCommit = git(nonancestor.repo, 'rev-parse', 'HEAD');
  const sideIdentity = await captureRepositoryIdentity({
    repoRoot: nonancestor.repo, evidenceDir: nonancestor.evidenceDir,
  });
  git(nonancestor.repo, 'switch', '-q', branch);
  const nonancestorId = rewriteReceipt(nonancestor, nonancestor.receipts[1], (input) => ({
    ...input,
    authorizedDecision: {
      ...input.authorizedDecision,
      checkpoint_commit: sideCommit,
      expected_repository_fingerprint: sideIdentity.fingerprint,
    },
    repositoryAfter: sideIdentity,
    repositoryBefore: sideIdentity,
  }));
  const nonancestorState = stateSource({
    baseRef: nonancestor.baseRef,
    checkpoint0: nonancestor.checkpoint0,
    checkpoint1: sideCommit,
    phase: 'verify',
    references: [nonancestor.receipts[0], nonancestorId],
  });
  await assert.rejects(
    compileVerifyWithState(nonancestor, validPlanSource(), nonancestorState),
    (error) => error.code === 'E_RESULT_COMPLETION_RECEIPT',
  );
  console.log('compiler repairs: unchanged completion reuse complete');
});

function makeLegacyReceipts(setup, replacementName = null) {
  return setup.receipts.map((id) => {
    return rewriteReceipt(setup, id, (input) => ({
      ...input,
      subjects: input.subjects.flatMap((subject) => subject.name === 'completion-scope-v1'
        ? replacementName ? [{ ...subject, name: replacementName }] : [] : [subject]),
    }));
  });
}

function rewriteReceipt(setup, id, mutate) {
  const path = join(setup.repo, '.build/transition-receipts', `${id}.json`);
  const current = JSON.parse(readFileSync(path, 'utf8'));
  const input = mutate({
    authorizedDecision: current.authorized_decision,
    compilerVersion: current.compiler_version,
    expectedStateHash: current.expected_state_hash,
    repositoryAfter: current.repository_after,
    repositoryBefore: current.repository_before,
    subjects: current.subjects,
    transitionKind: current.transition_kind,
  });
  const receiptId = transitionReceiptId(input);
  const patch = current.patch.map((operation) => operation.op === 'append_transition_reference'
    ? { ...operation, value: { receipt_id: receiptId } } : operation);
  const rewritten = createTransitionReceipt({ ...input, patch });
  writeTransitionReceipt({ receipt: rewritten, repoRoot: setup.repo });
  return receiptId;
}

async function compileVerifyWithState(setup, source, state) {
  await compileVerify(setup, source);
  writeFileSync(setup.statePath, state, 'utf8');
  return compilePhaseResult({
    artifactPath: setup.verifyPath,
    contractPath: setup.contractPath,
    cwd: setup.repo,
    evidenceDir: setup.evidenceDir,
    statePath: setup.statePath,
  });
}
