import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  BuildctlError,
  canonicalJson,
  loadContract,
  parseYaml,
  resolveInsideRepo,
  sha256,
} from './plan-contract.js';
import {
  checkEvidence,
  evidenceReceiptStableFor,
  readEvidenceReceipt,
} from './evidence.js';
import { captureRepositoryIdentity, repositoryCleanStatus } from './repository.js';
import {
  createTransitionReceipt,
  proposeCompletion,
  transitionReceiptId,
  verifyTransitionReceipt,
  writeTransitionReceipt,
} from './transition.js';
import { loadWorkflowState } from './workflow-state.js';

const HASH = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const SUMMARY_PREFIX = 'Completion checkpoint: ';

function fail(code, message) {
  throw new BuildctlError(code, message);
}

function diagnostic(code, path, message) {
  return { code, path, message };
}

function blocked(diagnostics) {
  diagnostics.sort((left, right) => left.code.localeCompare(right.code)
    || left.path.localeCompare(right.path)
    || left.message.localeCompare(right.message));
  return { diagnostics, patch: [], status: 'blocked' };
}

function array(value, path, diagnostics) {
  if (Array.isArray(value)) return value;
  diagnostics.push(diagnostic('E_STATE_SCHEMA', path, 'Expected an array.'));
  return [];
}

function string(value, path, diagnostics, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value === 'string' && value) return value;
  diagnostics.push(diagnostic('E_STATE_SCHEMA', path, 'Expected a non-empty string.'));
  return null;
}

function file(repoRoot, path, label, { mustExist = true } = {}) {
  const resolved = resolveInsideRepo(path, repoRoot, label, { mustExist });
  const source = mustExist || existsSync(resolved) ? readFileSync(resolved) : null;
  return {
    path: resolved,
    relativePath: relative(repoRoot, resolved).split('\\').join('/'),
    sha256: source ? sha256(source) : null,
    source,
  };
}

function subject(name, artifact) {
  return { name, sha256: artifact.sha256 };
}

function completionMarker(summarySource, sliceId, checkpoint, diagnostics) {
  const markers = summarySource.toString('utf8').split(/\r?\n/)
    .filter((line) => line.startsWith(SUMMARY_PREFIX));
  const current = [];
  for (const [index, line] of markers.entries()) {
    try {
      const value = JSON.parse(line.slice(SUMMARY_PREFIX.length));
      if (value?.slice_id === sliceId) current.push(value);
    } catch (error) {
      diagnostics.push(diagnostic(
        'E_SUMMARY_CHECKPOINT',
        `summary.marker[${index}]`,
        `Invalid completion checkpoint JSON: ${error.message}`,
      ));
    }
  }
  if (current.length !== 1 || current[0]?.commit !== checkpoint) {
    diagnostics.push(diagnostic(
      'E_SUMMARY_CHECKPOINT',
      'summary.completion_checkpoint',
      `Expected exactly ${SUMMARY_PREFIX}{"slice_id":"${sliceId}","commit":"${checkpoint}"}.`,
    ));
  }
}

function obligationHash(value) {
  return sha256(canonicalJson(value));
}

export function completionJudgmentRequirements(contract, sliceId) {
  const slice = contract.delivery_slices.find((entry) => entry.id === sliceId);
  if (!slice) fail('E_SLICE_UNKNOWN', `Contract does not declare slice ${sliceId}.`);
  const tasks = new Map(contract.execution_manifest.map((task) => [task.id, task]));
  const required = [];
  for (const binding of contract.bindings.filter((entry) => slice.task_ids.includes(entry.task_id))) {
    const task = tasks.get(binding.task_id);
    const mustHave = task?.must_haves.find((entry) => entry.id === binding.must_have_id);
    if (!mustHave) fail('E_CONTRACT_BINDING', `Binding ${binding.id} has no owning must-have.`);
    if (!['structural', 'manual-receipt'].includes(mustHave.evidence.kind)) continue;
    required.push({
      evidence_kind: mustHave.evidence.kind,
      id: `binding:${binding.id}`,
      obligation_sha256: obligationHash({ binding, must_have: mustHave }),
      task_id: task.id,
    });
  }
  slice.must_haves.forEach((claim, index) => required.push({
    evidence_kind: 'slice',
    id: `slice:${slice.id}:must-have:${index}`,
    obligation_sha256: obligationHash({ claim, index, slice_id: slice.id }),
    slice_id: slice.id,
  }));
  return required;
}

function loadJudgments({ path, repoRoot, sliceId, repositoryFingerprint, required, diagnostics }) {
  const artifact = file(repoRoot, path, 'completion judgments', { mustExist: false });
  const expected = new Map(required.map((entry) => [entry.id, entry]));
  const accepted = new Set();
  const extraSubjects = [];
  if (!artifact.source) {
    for (const item of required) diagnostics.push(diagnostic(
      'E_JUDGMENT_MISSING',
      `judgments.${item.id}`,
      `Required judgment ${item.id} with obligation_sha256 ${item.obligation_sha256}.`,
    ));
    return { accepted, artifact, extraSubjects };
  }
  let document;
  try {
    document = parseYaml(artifact.source.toString('utf8'));
  } catch (error) {
    diagnostics.push(diagnostic('E_JUDGMENT_SCHEMA', 'judgments', error.message));
    return { accepted, artifact, extraSubjects };
  }
  if (document?.schema_version !== 1 || document?.slice_id !== sliceId) {
    diagnostics.push(diagnostic(
      'E_JUDGMENT_SCHEMA',
      'judgments',
      `Expected schema_version 1 and slice_id ${sliceId}.`,
    ));
  }
  if (document?.repository_fingerprint !== repositoryFingerprint) {
    diagnostics.push(diagnostic(
      'E_JUDGMENT_STALE',
      'judgments.repository_fingerprint',
      `Expected ${repositoryFingerprint}.`,
    ));
  }
  const entries = Array.isArray(document?.judgments) ? document.judgments : [];
  if (!Array.isArray(document?.judgments)) {
    diagnostics.push(diagnostic('E_JUDGMENT_SCHEMA', 'judgments.judgments', 'Expected an array.'));
  }
  const seen = new Set();
  for (const [index, entry] of entries.entries()) {
    const pathPrefix = `judgments.judgments[${index}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      diagnostics.push(diagnostic('E_JUDGMENT_SCHEMA', pathPrefix, 'Expected an object.'));
      continue;
    }
    const requirement = expected.get(entry.id);
    if (!requirement || seen.has(entry.id)) {
      diagnostics.push(diagnostic(
        seen.has(entry.id) ? 'E_JUDGMENT_DUPLICATE' : 'E_JUDGMENT_UNEXPECTED',
        `${pathPrefix}.id`,
        String(entry.id),
      ));
      continue;
    }
    seen.add(entry.id);
    const keys = Object.keys(entry).sort();
    const baseKeys = [
      'evidence_kind', 'id', 'judged_by', 'obligation_sha256', 'rationale', 'verdict',
    ];
    const expectedKeys = requirement.evidence_kind === 'manual-receipt'
      ? [...baseKeys, 'evidence_path', 'evidence_sha256'].sort()
      : baseKeys.sort();
    let valid = canonicalJson(keys) === canonicalJson(expectedKeys)
      && entry.obligation_sha256 === requirement.obligation_sha256
      && entry.evidence_kind === requirement.evidence_kind
      && entry.verdict === 'accepted'
      && typeof entry.judged_by === 'string' && Boolean(entry.judged_by)
      && typeof entry.rationale === 'string' && Boolean(entry.rationale);
    if (requirement.evidence_kind === 'manual-receipt') {
      try {
        const evidence = file(repoRoot, entry.evidence_path, `${pathPrefix}.evidence_path`);
        valid = valid && entry.evidence_sha256 === evidence.sha256;
        extraSubjects.push(subject(`manual:${entry.id}`, evidence));
      } catch (error) {
        valid = false;
        diagnostics.push(diagnostic(error.code || 'E_JUDGMENT_EVIDENCE', pathPrefix, error.message));
      }
    }
    if (valid) accepted.add(entry.id);
    else diagnostics.push(diagnostic(
      'E_JUDGMENT_INVALID',
      pathPrefix,
      `Expected accepted ${requirement.evidence_kind} judgment ${requirement.id} with obligation_sha256 ${requirement.obligation_sha256}.`,
    ));
  }
  for (const item of required) {
    if (!accepted.has(item.id) && !seen.has(item.id)) diagnostics.push(diagnostic(
      'E_JUDGMENT_MISSING',
      `judgments.${item.id}`,
      `Required judgment ${item.id} with obligation_sha256 ${item.obligation_sha256}.`,
    ));
  }
  return { accepted, artifact, extraSubjects };
}

function receiptIndex({ ledger, contract, identity, repoRoot, diagnostics }) {
  const receipts = new Map();
  for (const [index, reference] of (ledger?.receipts || []).entries()) {
    try {
      const path = resolveInsideRepo(
        reference.path,
        repoRoot,
        `ledger.receipts[${index}].path`,
        { mustExist: true },
      );
      const receipt = readEvidenceReceipt(path);
      if (receipts.has(reference.command)) {
        diagnostics.push(diagnostic(
          'E_COMPLETION_RECEIPT_DUPLICATE',
          `ledger.receipts[${index}]`,
          reference.command,
        ));
      } else if (evidenceReceiptStableFor(
        receipt,
        reference.command,
        identity,
        contract,
        ledger.max_output_bytes,
      )) {
        receipts.set(reference.command, receipt);
      }
    } catch (error) {
      diagnostics.push(diagnostic(
        error.code || 'E_COMPLETION_RECEIPT',
        `ledger.receipts[${index}]`,
        error.message,
      ));
    }
  }
  return receipts;
}

function splitEvidenceRef(ref, path, diagnostics) {
  const delimiter = ref.lastIndexOf(' :: ');
  if (delimiter <= 0 || delimiter === ref.length - 4) {
    diagnostics.push(diagnostic(
      'E_EXPECTED_OBSERVATION_SCHEMA',
      path,
      'Expected <exact command> :: <literal observation>.',
    ));
    return null;
  }
  return { command: ref.slice(0, delimiter), observation: ref.slice(delimiter + 4) };
}

function commandConsumer(contract, command, predicate) {
  const evidence = contract.evidence_commands.find((entry) => entry.command === command);
  return evidence?.consumers.some(predicate) || false;
}

function evaluateCoverage({ contract, slice, receipts, judgments, diagnostics }) {
  const tasks = contract.execution_manifest.filter((task) => slice.task_ids.includes(task.id));
  const resolvedRequirements = new Set();
  const requiredCommands = new Set(slice.verify);
  for (const task of tasks) {
    requiredCommands.add(task.verify);
    const binding = contract.bindings.find((entry) => entry.task_id === task.id);
    const mustHave = task.must_haves.find((entry) => entry.id === binding?.must_have_id);
    let resolved = Boolean(binding && mustHave);
    if (!resolved) diagnostics.push(diagnostic(
      'E_COMPLETION_BINDING',
      `tasks.${task.id}`,
      'Task has no exact binding/must-have chain.',
    ));
    if (resolved && ['behavioral-test', 'command-assertion'].includes(mustHave.evidence.kind)) {
      const parsed = splitEvidenceRef(
        mustHave.evidence.ref,
        `tasks.${task.id}.must_haves.${mustHave.id}.evidence.ref`,
        diagnostics,
      );
      resolved = Boolean(parsed);
      if (parsed) {
        requiredCommands.add(parsed.command);
        const receipt = receipts.get(parsed.command);
        const consumed = commandConsumer(contract, parsed.command, (consumer) =>
          consumer.authority === 'task'
          && consumer.task_id === task.id
          && consumer.must_have_ids?.includes(mustHave.id));
        const output = receipt ? `${receipt.stdout.tail}\n${receipt.stderr.tail}` : '';
        if (!receipt || !consumed || !output.includes(parsed.observation)) {
          resolved = false;
          diagnostics.push(diagnostic(
            !receipt ? 'E_COMPLETION_RECEIPT_MISSING'
              : !consumed ? 'E_COMPLETION_CONSUMER'
                : 'E_EXPECTED_OBSERVATION',
            `tasks.${task.id}.must_haves.${mustHave.id}`,
            !receipt ? parsed.command
              : !consumed ? `No exact consumer for ${parsed.command}.`
                : `Expected literal ${JSON.stringify(parsed.observation)} in stored output.`,
          ));
        }
      }
    } else if (resolved) {
      resolved = judgments.has(`binding:${binding.id}`);
    }
    if (resolved) for (const requirement of task.requirements) resolvedRequirements.add(requirement);
    const taskConsumed = commandConsumer(contract, task.verify, (consumer) =>
      consumer.authority === 'task' && consumer.task_id === task.id);
    if (!taskConsumed) diagnostics.push(diagnostic(
      'E_COMPLETION_CONSUMER',
      `tasks.${task.id}.verify`,
      `No task consumer for ${task.verify}.`,
    ));
  }
  for (const [index, claim] of slice.must_haves.entries()) {
    const id = `slice:${slice.id}:must-have:${index}`;
    if (!judgments.has(id)) diagnostics.push(diagnostic(
      'E_JUDGMENT_MISSING',
      `slice.must_haves[${index}]`,
      `Slice judgment ${id} is not accepted for ${JSON.stringify(claim)}.`,
    ));
  }
  for (const requirement of slice.requirements) {
    if (!resolvedRequirements.has(requirement)) diagnostics.push(diagnostic(
      'E_COMPLETION_REQUIREMENT',
      `slice.requirements.${requirement}`,
      'No resolved task must-have covers this requirement.',
    ));
  }
  for (const command of requiredCommands) {
    if (!receipts.has(command)) diagnostics.push(diagnostic(
      'E_COMPLETION_RECEIPT_MISSING',
      'slice.commands',
      command,
    ));
  }
  for (const command of slice.verify) {
    if (!commandConsumer(contract, command, (consumer) =>
      consumer.authority === 'slice' && consumer.slice_id === slice.id)) {
      diagnostics.push(diagnostic(
        'E_COMPLETION_CONSUMER',
        'slice.verify',
        `No slice consumer for ${command}.`,
      ));
    }
  }
  return { requiredCommands: [...requiredCommands].sort(), resolvedRequirements };
}

function nextSlice(contract, completed, current) {
  const finished = new Set([...completed, current]);
  return contract.delivery_slices.find((slice) =>
    !finished.has(slice.id) && slice.depends_on.every((dependency) => finished.has(dependency)))?.id
    || null;
}

function stateProjection(state, identity) {
  return {
    active_slice: state.values.active_slice,
    completed_slices: state.values.completed_slices,
    history_templates: state.values.transition_history,
    repository_fingerprint: identity.fingerprint,
    state_hash: state.sha256,
    transition_references: state.values.transition_references,
  };
}

function appliedReplay({ state, identity, receiptsDir, repoRoot }) {
  const references = state.values.transition_references;
  if (!Array.isArray(references) || references.length === 0) return null;
  const reference = references[references.length - 1];
  if (!reference || typeof reference.receipt_id !== 'string' || !HASH.test(reference.receipt_id)) {
    return blocked([diagnostic(
      'E_TRANSITION_REFERENCE',
      'state.transition_references',
      'Last transition reference is malformed.',
    )]);
  }
  const path = join(receiptsDir, `${reference.receipt_id}.json`);
  if (!existsSync(path)) return blocked([diagnostic(
    'E_TRANSITION_REFERENCE',
    'state.transition_references',
    `Referenced transition receipt does not exist: ${path}.`,
  )]);
  const receipt = JSON.parse(readFileSync(path, 'utf8'));
  verifyTransitionReceipt(receipt);
  if (receipt.repository_after.fingerprint !== identity.fingerprint) return null;
  const proposal = proposeCompletion({
    authorizedDecision: receipt.authorized_decision,
    state: stateProjection(state, identity),
    transitionReference: reference,
  });
  if (proposal.status !== 'already_applied') return proposal;
  return {
    diagnostics: [],
    patch: [],
    receipt_hash: receipt.receipt_hash,
    receipt_id: receipt.receipt_id,
    receipt_path: relative(repoRoot, path).split('\\').join('/'),
    status: 'already_applied',
  };
}

function validateCompletionState({ contract, identity, root, state }) {
  const diagnostics = [];
  const activeSlice = string(state.values.active_slice, 'state.active_slice', diagnostics);
  const completedSlices = array(state.values.completed_slices, 'state.completed_slices', diagnostics);
  const completedTasks = array(state.values.completed_tasks, 'state.completed_tasks', diagnostics);
  const checkpoints = array(state.values.checkpoint_commits, 'state.checkpoint_commits', diagnostics);
  array(state.values.transition_references, 'state.transition_references', diagnostics);
  array(state.values.transition_history, 'state.transition_history', diagnostics);
  array(state.values.counter_events, 'state.counter_events', diagnostics);
  if (state.values.slug !== contract.slug) diagnostics.push(diagnostic(
    'E_COMPLETION_SLUG',
    'state.slug',
    `Expected ${contract.slug}; received ${String(state.values.slug)}.`,
  ));
  if (state.values.phase !== 'implement') diagnostics.push(diagnostic(
    'E_COMPLETION_PHASE',
    'state.phase',
    `Expected implement; received ${String(state.values.phase)}.`,
  ));
  const slice = contract.delivery_slices.find((entry) => entry.id === activeSlice);
  if (!slice) diagnostics.push(diagnostic(
    'E_SLICE_UNKNOWN',
    'state.active_slice',
    `Contract does not declare ${String(activeSlice)}.`,
  ));
  if (slice && completedSlices.includes(slice.id)) diagnostics.push(diagnostic(
    'E_TRANSITION_COMPLETION_CONFLICT',
    'state.completed_slices',
    `Slice ${slice.id} is already completed without a current transition reference.`,
  ));
  if (slice) for (const taskId of slice.task_ids) {
    if (!completedTasks.includes(taskId)) diagnostics.push(diagnostic(
      'E_COMPLETION_TASK',
      `state.completed_tasks.${taskId}`,
      `Active slice task ${taskId} is incomplete.`,
    ));
  }
  const matchingCheckpoints = slice ? checkpoints.filter((entry) => entry?.slice_id === slice.id) : [];
  const checkpoint = matchingCheckpoints.length === 1 ? matchingCheckpoints[0].commit : null;
  if (!COMMIT.test(checkpoint || '')) diagnostics.push(diagnostic(
    'E_COMPLETION_CHECKPOINT',
    'state.checkpoint_commits',
    `Expected exactly one full checkpoint commit for ${String(activeSlice)}.`,
  ));
  if (checkpoint && checkpoint !== identity.head_commit) diagnostics.push(diagnostic(
    'E_COMPLETION_CHECKPOINT',
    'repository.head_commit',
    `Expected checkpoint ${checkpoint}; received ${identity.head_commit}.`,
  ));
  const clean = repositoryCleanStatus({ repoRoot: root });
  if (!clean.clean) diagnostics.push(diagnostic(
    'E_COMPLETION_DIRTY',
    'repository.status',
    `Repository is not clean (status ${clean.status_sha256}).`,
  ));
  return { activeSlice, checkpoint, completedSlices, diagnostics, slice };
}

async function validateCompletionEvidence({
  activeSlice,
  checkpoint,
  contract,
  diagnostics,
  directory,
  identity,
  judgmentsPath,
  loaded,
  root,
  slice,
  summaryPath,
}) {
  const summary = file(root, summaryPath, 'implementation summary');
  if (slice && checkpoint) completionMarker(summary.source, slice.id, checkpoint, diagnostics);
  const evidence = await checkEvidence({
    repoRoot: root,
    contractPath: loaded.contractPath,
    evidenceDir: directory,
  });
  diagnostics.push(...evidence.diagnostics);
  const receipts = receiptIndex({
    contract,
    diagnostics,
    identity,
    ledger: evidence.ledger,
    repoRoot: root,
  });
  const judgmentRequirements = slice ? completionJudgmentRequirements(contract, slice.id) : [];
  const judgments = loadJudgments({
    diagnostics,
    path: judgmentsPath,
    repoRoot: root,
    repositoryFingerprint: identity.fingerprint,
    required: judgmentRequirements,
    sliceId: activeSlice,
  });
  const coverage = slice ? evaluateCoverage({
    contract,
    diagnostics,
    judgments: judgments.accepted,
    receipts,
    slice,
  }) : { requiredCommands: [], resolvedRequirements: new Set() };
  return { coverage, evidence, judgments, summary };
}

function emitCompletionProposal({
  checkpoint,
  completedSlices,
  contract,
  coverage,
  directory,
  evidence,
  identity,
  judgments,
  loaded,
  receiptDirectory,
  root,
  slice,
  state,
  summary,
}) {
  const ledger = file(root, join(directory, 'ledger.json'), 'evidence ledger');
  const contractArtifact = file(root, loaded.contractPath, 'contract');
  const plan = file(root, loaded.planPath, 'source plan');
  const subjects = [
    { name: 'state', sha256: state.sha256 },
    subject('plan', plan),
    subject('contract', contractArtifact),
    subject('implementation-summary', summary),
    subject('evidence-ledger', ledger),
    subject('judgments', judgments.artifact),
    ...judgments.extraSubjects,
  ];
  const decision = {
    authorization: 'allowed',
    checkpoint_commit: checkpoint,
    evidence_commands: coverage.requiredCommands,
    expected_repository_fingerprint: identity.fingerprint,
    expected_state_hash: state.sha256,
    judgment_ids: [...judgments.accepted].sort(),
    ledger_hash: evidence.ledger.ledger_hash,
    next_slice_id: nextSlice(contract, completedSlices, slice.id),
    resolved_requirements: [...coverage.resolvedRequirements].sort(),
    slice_id: slice.id,
  };
  const receiptId = transitionReceiptId({
    authorizedDecision: decision,
    compilerVersion: contract.compiler.version,
    expectedStateHash: state.sha256,
    repositoryAfter: identity,
    repositoryBefore: identity,
    subjects,
    transitionKind: 'complete_slice',
  });
  const transitionReference = { receipt_id: receiptId };
  const proposal = proposeCompletion({
    authorizedDecision: decision,
    state: stateProjection(state, identity),
    transitionReference,
  });
  if (proposal.status !== 'proposed') return proposal;
  const receipt = createTransitionReceipt({
    authorizedDecision: decision,
    compilerVersion: contract.compiler.version,
    expectedStateHash: state.sha256,
    patch: proposal.patch,
    repositoryAfter: identity,
    repositoryBefore: identity,
    subjects,
    transitionKind: 'complete_slice',
  });
  const receiptPath = writeTransitionReceipt({
    receipt,
    repoRoot: root,
    receiptsDir: receiptDirectory,
  });
  return {
    diagnostics: [],
    patch: proposal.patch,
    receipt_hash: receipt.receipt_hash,
    receipt_id: receipt.receipt_id,
    receipt_path: relative(root, receiptPath).split('\\').join('/'),
    status: 'proposed',
  };
}

export async function completeSlice({
  repoRoot = process.cwd(),
  statePath,
  contractPath,
  summaryPath,
  judgmentsPath,
  evidenceDir,
  receiptsDir = '.build/transition-receipts',
} = {}) {
  const loaded = loadContract({ contractPath, cwd: repoRoot });
  const root = loaded.repoRoot;
  const contract = loaded.contract;
  const state = loadWorkflowState({
    cwd: root,
    statePath,
    required: [
      'slug', 'phase', 'active_slice', 'completed_slices', 'completed_tasks',
      'checkpoint_commits', 'transition_references', 'transition_history', 'counter_events',
    ],
  });
  const directory = resolveInsideRepo(
    evidenceDir || join('.build', 'evidence', contract.slug),
    root,
    'evidence directory',
  );
  const receiptDirectory = resolveInsideRepo(receiptsDir, root, 'transition receipts directory');
  const identity = await captureRepositoryIdentity({ repoRoot: root, evidenceDir: directory });
  const replay = appliedReplay({
    state,
    identity,
    receiptsDir: receiptDirectory,
    repoRoot: root,
  });
  if (replay) return replay;

  const stateResult = validateCompletionState({ contract, identity, root, state });
  const evidenceResult = await validateCompletionEvidence({
    ...stateResult,
    contract,
    directory,
    identity,
    judgmentsPath,
    loaded,
    root,
    summaryPath,
  });
  if (stateResult.diagnostics.length > 0) return blocked(stateResult.diagnostics);
  return emitCompletionProposal({
    ...stateResult,
    ...evidenceResult,
    contract,
    directory,
    identity,
    loaded,
    receiptDirectory,
    root,
    state,
  });
}
