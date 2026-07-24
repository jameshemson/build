import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { ROOT } from './utils.js';

const CLI = join(ROOT, 'source/skills/build/buildctl/cli.js');
const VALID_PLAN = join(ROOT, 'scripts/fixtures/buildctl/kemet-lite/valid-plan.yaml');
const FIXTURES = join(ROOT, 'scripts/fixtures/buildctl/complete-slice');
const sandboxes = [];

afterEach(() => {
  for (const path of sandboxes.splice(0)) rmSync(path, { recursive: true, force: true });
});

function command(cmd, cwd) {
  const result = spawnSync(cmd[0], cmd.slice(1), { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `${cmd.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

function makeRepo({ planSource = readFileSync(VALID_PLAN, 'utf8') } = {}) {
  const repo = mkdtempSync(join(tmpdir(), 'buildctl-transition-'));
  sandboxes.push(repo);
  command(['git', 'init', '-q'], repo);
  command(['git', 'config', 'user.email', 'buildctl@example.test'], repo);
  command(['git', 'config', 'user.name', 'Buildctl Test'], repo);
  writeFileSync(join(repo, '.gitignore'), '.build/\n', 'utf8');
  writeFileSync(join(repo, 'package.json'), '{"type":"module"}\n', 'utf8');
  writeFileSync(
    join(repo, 'plan.yaml'),
    planSource
      .replaceAll(
        'node --test test/legacy-pose.test.js',
        'node -e \\"process.stdout.write(\'observed\')\\"',
      )
      .replace(' :: adopts a legacy building pose', ' :: observed'),
    'utf8',
  );
  mkdirSync(join(repo, 'src'), { recursive: true });
  writeFileSync(join(repo, 'src/legacy-pose.js'), 'export const adopted = true;\n', 'utf8');
  mkdirSync(join(repo, 'test'), { recursive: true });
  writeFileSync(join(repo, 'test/legacy-pose.test.js'), [
    "import test from 'node:test';",
    "import assert from 'node:assert/strict';",
    "import { adopted } from '../src/legacy-pose.js';",
    "test('adopts a legacy building pose', () => assert.equal(adopted, true));",
    '',
  ].join('\n'), 'utf8');
  command(['git', 'add', '.'], repo);
  command(['git', 'commit', '-qm', 'fixture'], repo);
  const contractPath = join(repo, '.build/contracts/transition/contract.json');
  command([process.execPath, CLI, 'validate-plan', '--plan', 'plan.yaml', '--out', contractPath], repo);
  return { repo, contractPath, evidenceDir: join(repo, '.build/evidence/transition') };
}

function nodeCommand(script) {
  return `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`;
}

function fixture(name) {
  return JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));
}

function workflowState(events) {
  return [
    'slug: "counter-fixture"',
    'phase: "implement"',
    'active_slice: "S-001"',
    'completed_slices: []',
    'completed_tasks: []',
    'checkpoint_commits: []',
    'transition_references: []',
    'transition_history: []',
    `counter_events: ${JSON.stringify(events)}`,
    '',
  ].join('\n');
}

function completionState({ checkpoint, completedTasks = ['T-001'], transition = {} }) {
  const activeSlice = Object.hasOwn(transition, 'activeSlice')
    ? transition.activeSlice
    : 'S-001';
  return [
    'slug: "plan"',
    'phase: "implement"',
    `active_slice: ${JSON.stringify(activeSlice)}`,
    `completed_slices: ${JSON.stringify(transition.completedSlices || [])}`,
    `completed_tasks: ${JSON.stringify(completedTasks)}`,
    `checkpoint_commits: ${JSON.stringify([{ slice_id: 'S-001', commit: checkpoint }])}`,
    `transition_references: ${JSON.stringify(transition.references || [])}`,
    `transition_history: ${JSON.stringify(transition.history || [])}`,
    'counter_events: []',
    'history:',
    '  - [fixture] preserved prose',
    '',
  ].join('\n');
}

function judgmentYaml({ sliceId, fingerprint, requirements, manualEvidence }) {
  const lines = [
    'schema_version: 1',
    `slice_id: ${JSON.stringify(sliceId)}`,
    `repository_fingerprint: ${JSON.stringify(fingerprint)}`,
    'judgments:',
  ];
  for (const requirement of requirements) {
    lines.push(`  - id: ${JSON.stringify(requirement.id)}`);
    lines.push(`    obligation_sha256: ${JSON.stringify(requirement.obligation_sha256)}`);
    lines.push(`    evidence_kind: ${JSON.stringify(requirement.evidence_kind)}`);
    lines.push('    verdict: "accepted"');
    lines.push('    judged_by: "fixture-reviewer"');
    lines.push('    rationale: "Fixture judgment is present and current."');
    if (requirement.evidence_kind === 'manual-receipt') {
      lines.push(`    evidence_path: ${JSON.stringify(manualEvidence.path)}`);
      lines.push(`    evidence_sha256: ${JSON.stringify(manualEvidence.sha256)}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

async function prepareCompletion({ planSource = readFileSync(VALID_PLAN, 'utf8') } = {}) {
  const setup = makeRepo({ planSource });
  const [{ runEvidence }, { loadContract, sha256 }, completion] = await Promise.all([
    import('../../source/skills/build/buildctl/evidence.js'),
    import('../../source/skills/build/buildctl/plan-contract.js'),
    import('../../source/skills/build/buildctl/completion.js'),
  ]);
  const evidence = await runEvidence({
    repoRoot: setup.repo,
    contractPath: setup.contractPath,
    evidenceDir: setup.evidenceDir,
  });
  const checkpoint = command(['git', 'rev-parse', 'HEAD'], setup.repo);
  const statePath = join(setup.repo, '.build/plans/valid-state.md');
  const summaryPath = join(setup.repo, '.build/plans/valid-implementation-summary.md');
  const judgmentsPath = join(setup.repo, '.build/judgments/valid/S-001.yaml');
  mkdirSync(join(setup.repo, '.build/plans'), { recursive: true });
  mkdirSync(join(setup.repo, '.build/judgments/valid'), { recursive: true });
  writeFileSync(statePath, completionState({ checkpoint }), 'utf8');
  writeFileSync(
    summaryPath,
    `# Summary\n\nCompletion checkpoint: ${JSON.stringify({ slice_id: 'S-001', commit: checkpoint })}\n`,
    'utf8',
  );
  const contract = loadContract({ contractPath: setup.contractPath, cwd: setup.repo }).contract;
  const requirements = completion.completionJudgmentRequirements(contract, 'S-001');
  const manualPath = join(setup.repo, '.build/receipts/manual.md');
  mkdirSync(join(setup.repo, '.build/receipts'), { recursive: true });
  writeFileSync(manualPath, '# Accepted manual observation\n', 'utf8');
  const manualEvidence = {
    path: '.build/receipts/manual.md',
    sha256: sha256(readFileSync(manualPath)),
  };
  writeFileSync(judgmentsPath, judgmentYaml({
    fingerprint: evidence.ledger.repository.fingerprint,
    manualEvidence,
    requirements,
    sliceId: 'S-001',
  }), 'utf8');
  return {
    ...setup,
    checkpoint,
    contract,
    evidence,
    judgmentsPath,
    manualEvidence,
    requirements,
    statePath,
    summaryPath,
  };
}

function applyCompletionPatch(statePath, patch, checkpoint) {
  const values = {
    active_slice: 'S-001',
    completed_slices: [],
    transition_references: [],
    transition_history: [],
  };
  for (const operation of patch) {
    if (operation.op === 'append_completed_slice') values.completed_slices.push(operation.value);
    else if (operation.op === 'set_active_slice') values.active_slice = operation.value;
    else if (operation.op === 'append_transition_reference') {
      values.transition_references.push(operation.value);
    } else if (operation.op === 'append_history_template') {
      values.transition_history.push(operation.value);
    }
  }
  writeFileSync(statePath, completionState({
    checkpoint,
    transition: {
      activeSlice: values.active_slice,
      completedSlices: values.completed_slices,
      history: values.transition_history,
      references: values.transition_references,
    },
  }), 'utf8');
}

function applyProposal(state, patch) {
  const next = structuredClone(state);
  for (const operation of patch) {
    if (operation.op === 'append_completed_slice') next.completed_slices.push(operation.value);
    else if (operation.op === 'set_active_slice') next.active_slice = operation.value;
    else if (operation.op === 'append_transition_reference') {
      next.transition_references.push(operation.value);
    } else if (operation.op === 'append_history_template') {
      next.history_templates.push(operation.value);
    } else {
      throw new Error(`Unexpected test patch operation: ${operation.op}`);
    }
  }
  return next;
}

test('immutable: canonical writes are idempotent and collision-safe', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'buildctl-immutable-'));
  sandboxes.push(directory);
  const path = join(directory, 'nested', 'receipt.json');
  const { writeImmutableJson } = await import('../../source/skills/build/buildctl/immutable-json.js');

  assert.equal(writeImmutableJson(path, { z: 1, a: { d: 2, b: 1 } }), path);
  const bytes = readFileSync(path, 'utf8');
  assert.equal(bytes, '{\n  "a": {\n    "b": 1,\n    "d": 2\n  },\n  "z": 1\n}\n');
  assert.equal(writeImmutableJson(path, { a: { b: 1, d: 2 }, z: 1 }), path);
  assert.equal(readFileSync(path, 'utf8'), bytes);
  assert.deepEqual(readdirSync(join(directory, 'nested')), ['receipt.json']);
  assert.throws(
    () => writeImmutableJson(path, { a: 2 }),
    (error) => error.code === 'E_IMMUTABLE_JSON_COLLISION',
  );
});

test('immutable: evidence receipt bytes, identity, and collision diagnostics stay compatible', async () => {
  const { repo, contractPath, evidenceDir } = makeRepo();
  const [{ canonicalJson, sha256 }, { runEvidence }] = await Promise.all([
    import('../../source/skills/build/buildctl/plan-contract.js'),
    import('../../source/skills/build/buildctl/evidence.js'),
  ]);
  const exact = nodeCommand("process.stdout.write('stable')");
  const first = await runEvidence({ repoRoot: repo, contractPath, evidenceDir, commands: [exact] });
  const path = first.ledger.receipts[0].path;
  const bytes = readFileSync(path, 'utf8');
  const receipt = JSON.parse(bytes);
  const expectedId = sha256([
    receipt.contract_hash,
    receipt.command,
    receipt.repository_before.fingerprint,
    receipt.repository_after.fingerprint,
    receipt.output_sha256,
    String(receipt.exit_code),
    receipt.signal || '',
    String(receipt.max_output_bytes),
  ].join('\0'));
  assert.equal(basename(path), `${expectedId}.json`);
  assert.equal(bytes, canonicalJson(receipt));
  const core = structuredClone(receipt);
  delete core.receipt_hash;
  assert.equal(receipt.receipt_hash, sha256(canonicalJson(core)));

  writeFileSync(path, `${bytes.trimEnd()} `, 'utf8');
  await assert.rejects(
    runEvidence({ repoRoot: repo, contractPath, evidenceDir, commands: [exact], force: true }),
    (error) => error.code === 'E_RECEIPT_COLLISION'
      && error.message === `Immutable receipt collision at ${path}.`,
  );
});

test('envelope: canonical subjects and opaque decisions produce deterministic receipts', async () => {
  const {
    createTransitionReceipt,
    transitionReceiptId,
    verifyTransitionReceipt,
  } = await import('../../source/skills/build/buildctl/transition.js');
  const authorizedDecision = fixture('authorized-decision.json');
  const repository = { fingerprint: 'd'.repeat(64), head_commit: '1'.repeat(40) };
  const input = {
    authorizedDecision,
    compilerVersion: '1.12.1+codex.local-20260722-061608',
    expectedStateHash: 'a'.repeat(64),
    repositoryAfter: repository,
    repositoryBefore: repository,
    schemaVersion: 1,
    subjects: [
      { name: 'zeta', sha256: 'f'.repeat(64) },
      { name: 'alpha', sha256: 'e'.repeat(64) },
    ],
    transitionKind: 'complete_slice',
  };
  const receiptId = transitionReceiptId(input);
  const patch = [
    { op: 'append_completed_slice', value: 'S-002' },
    { op: 'set_active_slice', value: null },
    { op: 'append_transition_reference', value: { receipt_id: receiptId } },
    { op: 'append_history_template', value: { event: 'slice_completed', slice_id: 'S-002' } },
  ];
  const receipt = createTransitionReceipt({ ...input, patch });

  assert.equal(receipt.receipt_id, receiptId);
  assert.deepEqual(receipt.subjects.map((subject) => subject.name), ['alpha', 'zeta']);
  assert.equal(verifyTransitionReceipt(receipt), receipt.receipt_hash);
  assert.equal(
    createTransitionReceipt({ ...input, subjects: [...input.subjects].reverse(), patch }).receipt_hash,
    receipt.receipt_hash,
  );
  const changed = structuredClone(authorizedDecision);
  changed.opaque_note = { any: ['value'] };
  assert.notEqual(transitionReceiptId({ ...input, authorizedDecision: changed }), receiptId);

  const unicodeSubjects = [
    { name: 'é', sha256: '1'.repeat(64) },
    { name: 'é', sha256: '2'.repeat(64) },
  ];
  assert.equal(
    transitionReceiptId({ ...input, subjects: unicodeSubjects }),
    transitionReceiptId({ ...input, subjects: [...unicodeSubjects].reverse() }),
  );
});

test('envelope: immutable writes reject collisions and malformed transport fields', async () => {
  const {
    createTransitionReceipt,
    transitionReceiptId,
    writeTransitionReceipt,
  } = await import('../../source/skills/build/buildctl/transition.js');
  const repoRoot = mkdtempSync(join(tmpdir(), 'buildctl-transition-receipt-'));
  sandboxes.push(repoRoot);
  const repository = { fingerprint: 'd'.repeat(64) };
  const input = {
    authorizedDecision: fixture('authorized-decision.json'),
    compilerVersion: '1.12.1',
    expectedStateHash: 'a'.repeat(64),
    repositoryAfter: repository,
    repositoryBefore: repository,
    subjects: [
      { name: 'state-z', sha256: 'e'.repeat(64) },
      { name: 'state-a', sha256: 'f'.repeat(64) },
    ],
    transitionKind: 'complete_slice',
  };
  const receiptId = transitionReceiptId(input);
  const patch = [
    { op: 'append_completed_slice', value: 'S-002' },
    { op: 'set_active_slice', value: null },
    { op: 'append_transition_reference', value: { receipt_id: receiptId } },
    { op: 'append_history_template', value: { event: 'slice_completed' } },
  ];
  const receipt = createTransitionReceipt({ ...input, patch });
  const path = writeTransitionReceipt({ receipt, repoRoot });
  assert.equal(writeTransitionReceipt({ receipt, repoRoot }), path);

  const { canonicalJson, sha256 } = await import(
    '../../source/skills/build/buildctl/plan-contract.js'
  );
  const reordered = structuredClone(receipt);
  reordered.subjects.reverse();
  delete reordered.receipt_hash;
  reordered.receipt_hash = sha256(canonicalJson(reordered));
  const { verifyTransitionReceipt } = await import(
    '../../source/skills/build/buildctl/transition.js'
  );
  assert.throws(
    () => verifyTransitionReceipt(reordered),
    (error) => error.code === 'E_TRANSITION_SUBJECT_ORDER',
  );

  const changedPatch = structuredClone(patch);
  changedPatch[3].value.event = 'different';
  const collision = createTransitionReceipt({ ...input, patch: changedPatch });
  assert.equal(collision.receipt_id, receipt.receipt_id);
  assert.throws(
    () => writeTransitionReceipt({ receipt: collision, repoRoot }),
    (error) => error.code === 'E_TRANSITION_COLLISION',
  );
  assert.throws(
    () => createTransitionReceipt({ ...input, expectedStateHash: 'not-a-hash', patch }),
    (error) => error.code === 'E_TRANSITION_HASH',
  );
  assert.throws(
    () => createTransitionReceipt({
      ...input,
      subjects: [input.subjects[0], input.subjects[0]],
      patch,
    }),
    (error) => error.code === 'E_TRANSITION_SUBJECT',
  );
});

test('proposal: authorized state produces only the exact narrow completion patch', async () => {
  const { proposeCompletion } = await import('../../source/skills/build/buildctl/transition.js');
  const state = fixture('state-projection-before.json');
  const authorizedDecision = fixture('authorized-decision.json');
  const transitionReference = { receipt_id: 'c'.repeat(64) };
  const result = proposeCompletion({ state, authorizedDecision, transitionReference });

  assert.equal(result.status, 'proposed', JSON.stringify(result.diagnostics));
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.patch.map((operation) => operation.op), [
    'append_completed_slice',
    'set_active_slice',
    'append_transition_reference',
    'append_history_template',
  ]);
  assert.deepEqual(applyProposal(state, result.patch), fixture('state-projection-after.json'));
  assert.deepEqual(state, fixture('state-projection-before.json'));
});

test('proposal: interruption replays the patch and recorded completion is already applied', async () => {
  const { proposeCompletion } = await import('../../source/skills/build/buildctl/transition.js');
  const authorizedDecision = fixture('authorized-decision.json');
  const transitionReference = { receipt_id: 'c'.repeat(64) };
  const input = {
    state: fixture('state-projection-before.json'),
    authorizedDecision,
    transitionReference,
  };
  const first = proposeCompletion(input);
  const replay = proposeCompletion(structuredClone(input));
  assert.deepEqual(replay, first);
  assert.deepEqual(proposeCompletion({
    ...input,
    state: fixture('state-projection-applied.json'),
  }), {
    diagnostics: [],
    patch: [],
    status: 'already_applied',
  });

  for (const mutation of ['missing', 'modified', 'duplicate']) {
    const partial = fixture('state-projection-applied.json');
    if (mutation === 'missing') partial.history_templates = [];
    if (mutation === 'modified') partial.history_templates[0].event = 'different';
    if (mutation === 'duplicate') partial.history_templates.push(partial.history_templates[0]);
    assert.equal(
      proposeCompletion({ ...input, state: partial }).diagnostics[0].code,
      'E_TRANSITION_REPLAY_CONFLICT',
      mutation,
    );
  }
});

test('proposal: state, repository, completion, and recorded replay drift block stably', async () => {
  const { proposeCompletion } = await import('../../source/skills/build/buildctl/transition.js');
  const state = fixture('state-projection-before.json');
  const authorizedDecision = fixture('authorized-decision.json');
  const transitionReference = { receipt_id: 'c'.repeat(64) };
  const drifted = structuredClone(state);
  drifted.state_hash = '1'.repeat(64);
  drifted.repository_fingerprint = '2'.repeat(64);
  assert.deepEqual(
    proposeCompletion({ state: drifted, authorizedDecision, transitionReference })
      .diagnostics.map((item) => item.code),
    ['E_TRANSITION_REPOSITORY_DRIFT', 'E_TRANSITION_STATE_DRIFT'],
  );

  const completed = structuredClone(state);
  completed.completed_slices.push('S-002');
  assert.equal(
    proposeCompletion({ state: completed, authorizedDecision, transitionReference })
      .diagnostics[0].code,
    'E_TRANSITION_COMPLETION_CONFLICT',
  );

  const conflicting = fixture('state-projection-applied.json');
  conflicting.active_slice = 'S-009';
  assert.equal(
    proposeCompletion({ state: conflicting, authorizedDecision, transitionReference })
      .diagnostics[0].code,
    'E_TRANSITION_REPLAY_CONFLICT',
  );
  const appliedRepositoryDrift = fixture('state-projection-applied.json');
  appliedRepositoryDrift.repository_fingerprint = '3'.repeat(64);
  assert.equal(
    proposeCompletion({
      state: appliedRepositoryDrift,
      authorizedDecision,
      transitionReference,
    }).diagnostics[0].code,
    'E_TRANSITION_REPOSITORY_DRIFT',
  );
});

test('counters: typed events deduplicate and stay allowed below all six boundaries', async () => {
  const { CIRCUIT_LIMITS, evaluateCircuitEvents } = await import(
    '../../source/skills/build/buildctl/counters.js'
  );
  const { events } = fixture('counter-events.json');
  const result = evaluateCircuitEvents(events);

  assert.equal(result.status, 'allow');
  assert.equal(result.unique_event_count, 12);
  assert.deepEqual(result.counters, {
    agent_retry: { 'workstream:a': 2 },
    fresh_judgment_retry: { 'judgment:verify': 1 },
    phase_reentry: { 'phase:implement': 3 },
    plan_review: { 'workflow:plan': 3 },
    scope_change: { 'workflow:scope': 2 },
    no_progress: { 'workflow:progress': 1 },
  });
  assert.deepEqual(result.limits, CIRCUIT_LIMITS);
  assert.deepEqual(result.diagnostics, []);
});

test('counters: exact boundaries halt and malformed replay, kinds, or limits fail closed', async () => {
  const { CIRCUIT_LIMITS, evaluateCircuitEvents } = await import(
    '../../source/skills/build/buildctl/counters.js'
  );
  const { events, triggers } = fixture('counter-events.json');
  const halted = evaluateCircuitEvents([...events, ...triggers]);
  assert.equal(halted.status, 'halt');
  assert.deepEqual(halted.diagnostics.map((item) => [item.kind, item.scope, item.halt_reason]), [
    ['agent_retry', 'workstream:a', 'agent-retry-limit'],
    ['fresh_judgment_retry', 'judgment:verify', 'phase-agent-failure'],
    ['phase_reentry', 'phase:implement', 'phase-loop-limit'],
    ['plan_review', 'workflow:plan', 'plan-review-limit'],
    ['scope_change', 'workflow:scope', 'scope-change-limit'],
    ['no_progress', 'workflow:progress', 'no-progress-limit'],
  ]);

  const crossScope = evaluateCircuitEvents(['a', 'b', 'c'].map((scope, index) => ({
    action: 'increment',
    id: `cross-${index}`,
    kind: 'agent_retry',
    scope,
  })));
  assert.equal(crossScope.status, 'allow');
  assert.deepEqual(crossScope.counters.agent_retry, { a: 1, b: 1, c: 1 });

  const reset = evaluateCircuitEvents([
    { action: 'increment', id: 'streak-1', kind: 'no_progress', scope: 'workflow:a' },
    { action: 'reset', id: 'streak-reset', kind: 'no_progress', scope: 'workflow:a' },
    { action: 'increment', id: 'streak-2', kind: 'no_progress', scope: 'workflow:a' },
  ]);
  assert.equal(reset.status, 'allow');
  assert.equal(reset.counters.no_progress['workflow:a'], 1);

  const prototypeScopes = evaluateCircuitEvents(['__proto__', 'constructor'].flatMap((scope) =>
    [1, 2, 3].map((number) => ({
      action: 'increment',
      id: `prototype-${scope}-${number}`,
      kind: 'agent_retry',
      scope,
    }))));
  assert.equal(prototypeScopes.status, 'halt');
  assert.equal(prototypeScopes.counters.agent_retry.__proto__, 3);
  assert.equal(prototypeScopes.counters.agent_retry.constructor, 3);
  assert.deepEqual(
    prototypeScopes.diagnostics.map((item) => item.scope),
    ['__proto__', 'constructor'],
  );

  assert.throws(
    () => evaluateCircuitEvents([...events, {
      action: 'increment',
      id: 'agent-1',
      kind: 'scope_change',
      scope: 'workflow:scope',
    }]),
    (error) => error.code === 'E_COUNTER_EVENT_CONFLICT',
  );
  assert.throws(
    () => evaluateCircuitEvents([{
      action: 'increment',
      id: 'unknown-1',
      kind: 'unknown',
      scope: 'workflow:a',
    }]),
    (error) => error.code === 'E_COUNTER_KIND',
  );
  assert.throws(
    () => evaluateCircuitEvents([{
      action: 'reset',
      id: 'agent-reset',
      kind: 'agent_retry',
      scope: 'workstream:a',
    }]),
    (error) => error.code === 'E_COUNTER_EVENT_ACTION',
  );
  const invalidLimits = structuredClone(CIRCUIT_LIMITS);
  invalidLimits.no_progress.halt_at = 1.5;
  assert.throws(
    () => evaluateCircuitEvents([], { limits: invalidLimits }),
    (error) => error.code === 'E_COUNTER_LIMIT_SCHEMA',
  );
});

test('counter-cli: state events return allow and halt with exact exit status', () => {
  const { repo } = makeRepo();
  const statePath = join(repo, '.build/plans/counter-state.md');
  mkdirSync(join(repo, '.build/plans'), { recursive: true });
  const { events, triggers } = fixture('counter-events.json');
  writeFileSync(statePath, workflowState(events), 'utf8');

  const allowed = spawnSync(process.execPath, [CLI, 'check-counters', '--state', statePath], {
    cwd: repo,
    encoding: 'utf8',
  });
  assert.equal(allowed.status, 0, allowed.stderr);
  assert.equal(JSON.parse(allowed.stdout).status, 'allow');

  writeFileSync(statePath, workflowState([...events, ...triggers]), 'utf8');
  const halted = spawnSync(process.execPath, [CLI, 'check-counters', '--state', statePath], {
    cwd: repo,
    encoding: 'utf8',
  });
  assert.equal(halted.status, 1, halted.stderr);
  assert.equal(JSON.parse(halted.stdout).status, 'halt');
  assert.deepEqual(
    JSON.parse(halted.stdout).diagnostics.map((item) => item.halt_reason),
    [
      'agent-retry-limit',
      'phase-agent-failure',
      'phase-loop-limit',
      'plan-review-limit',
      'scope-change-limit',
      'no-progress-limit',
    ],
  );
});

test('counter-cli: malformed state and conflicting replay fail without state or git mutation', () => {
  const { repo } = makeRepo();
  const statePath = join(repo, '.build/plans/counter-state.md');
  mkdirSync(join(repo, '.build/plans'), { recursive: true });
  const conflicting = [
    { action: 'increment', id: 'same', kind: 'agent_retry', scope: 'workstream:a' },
    { action: 'increment', id: 'same', kind: 'scope_change', scope: 'workflow:a' },
  ];
  writeFileSync(statePath, workflowState(conflicting), 'utf8');
  const beforeState = readFileSync(statePath, 'utf8');
  const beforeGit = command(['git', 'status', '--porcelain=v1'], repo);
  const conflict = spawnSync(process.execPath, [CLI, 'check-counters', '--state', statePath], {
    cwd: repo,
    encoding: 'utf8',
  });
  assert.equal(conflict.status, 1);
  assert.match(conflict.stderr, /E_COUNTER_EVENT_CONFLICT/);
  assert.equal(readFileSync(statePath, 'utf8'), beforeState);
  assert.equal(command(['git', 'status', '--porcelain=v1'], repo), beforeGit);

  writeFileSync(statePath, `${beforeState}counter_events: []\n`, 'utf8');
  const duplicate = spawnSync(process.execPath, [CLI, 'check-counters', '--state', statePath], {
    cwd: repo,
    encoding: 'utf8',
  });
  assert.equal(duplicate.status, 1);
  assert.match(duplicate.stderr, /E_STATE_DUPLICATE_FIELD/);
});

test('complete-slice: covered clean checkpoint emits only an immutable narrow proposal', async () => {
  const setup = await prepareCompletion();
  const { completeSlice } = await import('../../source/skills/build/buildctl/completion.js');
  const evidenceReceipt = JSON.parse(readFileSync(setup.evidence.ledger.receipts[0].path, 'utf8'));
  assert.match(`${evidenceReceipt.stdout.tail}\n${evidenceReceipt.stderr.tail}`, /observed/);
  const stateBefore = readFileSync(setup.statePath, 'utf8');
  const gitBefore = command(['git', 'status', '--porcelain=v1'], setup.repo);
  const result = await completeSlice({
    repoRoot: setup.repo,
    contractPath: setup.contractPath,
    evidenceDir: setup.evidenceDir,
    judgmentsPath: setup.judgmentsPath,
    statePath: setup.statePath,
    summaryPath: setup.summaryPath,
  });

  assert.equal(result.status, 'proposed', JSON.stringify(result.diagnostics));
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.patch.map((operation) => operation.op), [
    'append_completed_slice',
    'set_active_slice',
    'append_transition_reference',
    'append_history_template',
  ]);
  assert.ok(existsSync(join(setup.repo, result.receipt_path)));
  assert.equal(readFileSync(setup.statePath, 'utf8'), stateBefore);
  assert.equal(command(['git', 'status', '--porcelain=v1'], setup.repo), gitBefore);
});

test('complete-slice: missing expected output and incomplete task block by name', async () => {
  const source = readFileSync(VALID_PLAN, 'utf8').replace(
    ' :: adopts a legacy building pose" }',
    ' :: observation that never appears" }',
  );
  const setup = await prepareCompletion({ planSource: source });
  const { completeSlice } = await import('../../source/skills/build/buildctl/completion.js');
  let result = await completeSlice({
    repoRoot: setup.repo,
    contractPath: setup.contractPath,
    evidenceDir: setup.evidenceDir,
    judgmentsPath: setup.judgmentsPath,
    statePath: setup.statePath,
    summaryPath: setup.summaryPath,
  });
  assert.equal(result.status, 'blocked');
  assert.ok(result.diagnostics.some((item) => item.code === 'E_EXPECTED_OBSERVATION'));

  writeFileSync(setup.statePath, completionState({
    checkpoint: setup.checkpoint,
    completedTasks: [],
  }), 'utf8');
  result = await completeSlice({
    repoRoot: setup.repo,
    contractPath: setup.contractPath,
    evidenceDir: setup.evidenceDir,
    judgmentsPath: setup.judgmentsPath,
    statePath: setup.statePath,
    summaryPath: setup.summaryPath,
  });
  assert.ok(result.diagnostics.some((item) => item.code === 'E_COMPLETION_TASK'));
});

test('complete-slice: structural and manual lanes require current subject-bound judgments', async () => {
  const base = readFileSync(VALID_PLAN, 'utf8');
  const structural = await prepareCompletion({
    planSource: base
      .replace('kind: behavior, name:', 'kind: invariant, name:')
      .replace('kind: behavioral-test', 'kind: structural'),
  });
  const { completeSlice } = await import('../../source/skills/build/buildctl/completion.js');
  writeFileSync(structural.judgmentsPath, judgmentYaml({
    fingerprint: structural.evidence.ledger.repository.fingerprint,
    manualEvidence: structural.manualEvidence,
    requirements: structural.requirements.filter((entry) => entry.evidence_kind === 'slice'),
    sliceId: 'S-001',
  }), 'utf8');
  let result = await completeSlice({
    repoRoot: structural.repo,
    contractPath: structural.contractPath,
    evidenceDir: structural.evidenceDir,
    judgmentsPath: structural.judgmentsPath,
    statePath: structural.statePath,
    summaryPath: structural.summaryPath,
  });
  assert.equal(result.status, 'blocked');
  const missing = result.diagnostics.find((item) => item.code === 'E_JUDGMENT_MISSING');
  assert.match(missing.message, /binding:B-001/);
  assert.match(missing.message, /obligation_sha256 [a-f0-9]{64}/);

  const staleYaml = judgmentYaml({
    fingerprint: '0'.repeat(64),
    manualEvidence: structural.manualEvidence,
    requirements: structural.requirements,
    sliceId: 'S-001',
  });
  writeFileSync(structural.judgmentsPath, staleYaml, 'utf8');
  result = await completeSlice({
    repoRoot: structural.repo,
    contractPath: structural.contractPath,
    evidenceDir: structural.evidenceDir,
    judgmentsPath: structural.judgmentsPath,
    statePath: structural.statePath,
    summaryPath: structural.summaryPath,
  });
  assert.ok(result.diagnostics.some((item) => item.code === 'E_JUDGMENT_STALE'));

  const manual = await prepareCompletion({
    planSource: base
      .replace('kind: behavior, name:', 'kind: invariant, name:')
      .replace('kind: behavioral-test', 'kind: manual-receipt'),
  });
  result = await completeSlice({
    repoRoot: manual.repo,
    contractPath: manual.contractPath,
    evidenceDir: manual.evidenceDir,
    judgmentsPath: manual.judgmentsPath,
    statePath: manual.statePath,
    summaryPath: manual.summaryPath,
  });
  assert.equal(result.status, 'proposed', JSON.stringify(result.diagnostics));
  const receipt = JSON.parse(readFileSync(join(manual.repo, result.receipt_path), 'utf8'));
  assert.ok(receipt.subjects.some((item) => item.name === 'manual:binding:B-001'));
});

test('complete-slice: stale summary checkpoint ledger and dirty repository block stably', async () => {
  const { completeSlice } = await import('../../source/skills/build/buildctl/completion.js');

  const summary = await prepareCompletion();
  writeFileSync(summary.summaryPath, '# Summary without marker\n', 'utf8');
  let result = await completeSlice({
    repoRoot: summary.repo,
    contractPath: summary.contractPath,
    evidenceDir: summary.evidenceDir,
    judgmentsPath: summary.judgmentsPath,
    statePath: summary.statePath,
    summaryPath: summary.summaryPath,
  });
  assert.ok(result.diagnostics.some((item) => item.code === 'E_SUMMARY_CHECKPOINT'));

  const checkpoint = await prepareCompletion();
  writeFileSync(checkpoint.statePath, completionState({ checkpoint: '0'.repeat(40) }), 'utf8');
  result = await completeSlice({
    repoRoot: checkpoint.repo,
    contractPath: checkpoint.contractPath,
    evidenceDir: checkpoint.evidenceDir,
    judgmentsPath: checkpoint.judgmentsPath,
    statePath: checkpoint.statePath,
    summaryPath: checkpoint.summaryPath,
  });
  assert.ok(result.diagnostics.some((item) => item.code === 'E_COMPLETION_CHECKPOINT'));

  const dirty = await prepareCompletion();
  writeFileSync(join(dirty.repo, 'src/legacy-pose.js'), 'export const adopted = false;\n', 'utf8');
  result = await completeSlice({
    repoRoot: dirty.repo,
    contractPath: dirty.contractPath,
    evidenceDir: dirty.evidenceDir,
    judgmentsPath: dirty.judgmentsPath,
    statePath: dirty.statePath,
    summaryPath: dirty.summaryPath,
  });
  assert.ok(result.diagnostics.some((item) => item.code === 'E_COMPLETION_DIRTY'));
  assert.ok(result.diagnostics.some((item) => item.code === 'E_RECEIPT_STALE'));
});

test('complete-slice: receipt interruption replays and applied state is an exact no-op', async () => {
  const setup = await prepareCompletion();
  const { completeSlice } = await import('../../source/skills/build/buildctl/completion.js');
  const options = {
    repoRoot: setup.repo,
    contractPath: setup.contractPath,
    evidenceDir: setup.evidenceDir,
    judgmentsPath: setup.judgmentsPath,
    statePath: setup.statePath,
    summaryPath: setup.summaryPath,
  };
  const first = await completeSlice(options);
  const interruptedReplay = await completeSlice(options);
  assert.equal(first.status, 'proposed');
  assert.deepEqual(interruptedReplay, first);

  applyCompletionPatch(setup.statePath, first.patch, setup.checkpoint);
  const applied = await completeSlice(options);
  assert.equal(applied.status, 'already_applied');
  assert.deepEqual(applied.patch, []);
  assert.equal(applied.receipt_id, first.receipt_id);
  assert.equal(applied.receipt_path, first.receipt_path);
});

test('complete-slice: CLI returns proposed or blocked JSON without applying state or git', async () => {
  const setup = await prepareCompletion();
  const args = [
    CLI,
    'complete-slice',
    '--state', setup.statePath,
    '--contract', setup.contractPath,
    '--summary', setup.summaryPath,
    '--judgments', setup.judgmentsPath,
    '--evidence-dir', setup.evidenceDir,
  ];
  const stateBefore = readFileSync(setup.statePath, 'utf8');
  const gitBefore = command(['git', 'status', '--porcelain=v1'], setup.repo);
  const proposed = spawnSync(process.execPath, args, { cwd: setup.repo, encoding: 'utf8' });
  assert.equal(proposed.status, 0, proposed.stderr);
  assert.equal(JSON.parse(proposed.stdout).status, 'proposed');
  assert.equal(readFileSync(setup.statePath, 'utf8'), stateBefore);
  assert.equal(command(['git', 'status', '--porcelain=v1'], setup.repo), gitBefore);

  writeFileSync(setup.judgmentsPath, [
    'schema_version: 1',
    'slice_id: "S-001"',
    `repository_fingerprint: ${JSON.stringify(setup.evidence.ledger.repository.fingerprint)}`,
    'judgments: []',
    '',
  ].join('\n'), 'utf8');
  const blockedResult = spawnSync(process.execPath, args, { cwd: setup.repo, encoding: 'utf8' });
  assert.equal(blockedResult.status, 1, blockedResult.stderr);
  assert.equal(JSON.parse(blockedResult.stdout).status, 'blocked');
  assert.equal(readFileSync(setup.statePath, 'utf8'), stateBefore);
  assert.equal(command(['git', 'status', '--porcelain=v1'], setup.repo), gitBefore);
});

test('isolation: foundation modules contain no locked predicate or mutation dependencies', async () => {
  const paths = [
    join(ROOT, 'source/skills/build/buildctl/transition.js'),
    join(ROOT, 'source/skills/build/buildctl/counters.js'),
  ];
  const forbidden = [
    'authored markdown',
    'bindings',
    'evidence consumers',
    'evidence_consumers',
    'expected observations',
    'expected_observations',
    'implementation summary',
    'manual judgment',
    'manual_judgment',
    'must-haves',
    'must_haves',
    'parseyaml',
    'requirements file',
    'structural judgment',
    'structural_judgment',
  ];
  for (const path of paths) {
    const source = readFileSync(path, 'utf8').toLowerCase();
    for (const term of forbidden) assert.equal(source.includes(term), false, `${path}: ${term}`);
    assert.doesNotMatch(source, /node:child_process|\bspawn(?:sync)?\b|\bexec(?:sync)?\b|\.git\b/);
  }
  const { proposeCompletion } = await import('../../source/skills/build/buildctl/transition.js');
  assert.doesNotMatch(
    proposeCompletion.toString(),
    /writeImmutableJson|writeFile|renameSync|resolveInsideRepo|child_process|\bgit\b/,
  );
});

test('isolation: generated runtimes stay synchronized with public completion but no OpenCode authority', async () => {
  const sourceDir = join(ROOT, 'source/skills/build/buildctl');
  const runtimeFiles = [
    'cli.js',
    'completion.js',
    'counters.js',
    'coverage.js',
    'evidence.js',
    'immutable-json.js',
    'phase-results.js',
    'plan-contract.js',
    'repository.js',
    'transition.js',
    'validation.js',
    'workflow-state.js',
  ];
  const providerDirs = [
    '.claude/skills/build/buildctl',
    '.agents/skills/build/buildctl',
    'plugins/build/skills/build/buildctl',
    '.codex/skills/build/buildctl',
  ];
  for (const relativeDir of providerDirs) {
    const directory = join(ROOT, relativeDir);
    assert.deepEqual(readdirSync(directory).sort(), runtimeFiles);
    for (const name of runtimeFiles) {
      assert.equal(
        readFileSync(join(directory, name), 'utf8'),
        readFileSync(join(sourceDir, name), 'utf8'),
        `${relativeDir}/${name}`,
      );
    }
  }
  assert.equal(existsSync(join(ROOT, '.opencode/skills/build/buildctl')), false);
  const cliSource = readFileSync(join(sourceDir, 'cli.js'), 'utf8');
  assert.equal(cliSource.includes('complete-slice'), true);
  assert.equal(cliSource.includes('check-counters'), true);
  const { VERSION_CARRIERS } = await import('./version-carriers.js');
  const versions = VERSION_CARRIERS.map((carrier) => {
    const value = JSON.parse(readFileSync(join(ROOT, carrier.path), 'utf8'));
    return carrier.get(value);
  });
  assert.equal(new Set(versions).size, 1, 'all version carriers must agree');
});

test('isolation: dogfood example names the gate but is explicitly non-authoritative', () => {
  const example = fixture('dogfood-observation.example.json');
  assert.equal(example.schema_version, 1);
  assert.equal(example.authoritative, false);
  assert.equal(example.example_only, true);
  assert.deepEqual(example.run_order, ['ordinary', 'kemet']);
  assert.deepEqual(example.required_observations, [
    'release_version',
    'main_commit',
    'clean_status_before',
    'clean_status_after',
    'started_at',
    'ended_at',
    'phase_sequence',
    'retry_events',
    'slice_checkpoints',
    'repository_identities',
    'contract_identity',
    'ledger_identity',
    'receipt_identities',
    'evidence_consumers',
    'manual_judgments',
    'structural_judgments',
    'resume_source',
    'prospective_predicate_results',
    'final_verify',
    'architect_review',
    'artifact_paths',
    'artifact_hashes',
    'final_verdict',
  ]);
  assert.equal(Object.hasOwn(example, 'runs'), false);
});
