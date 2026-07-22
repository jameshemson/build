import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import {
  BuildctlError,
  canonicalJson,
  isSemanticVersion,
  resolveInsideRepo,
  sha256,
} from './plan-contract.js';
import { writeImmutableJson } from './immutable-json.js';

const HASH = /^[a-f0-9]{64}$/;
const TRANSITION_KINDS = new Set(['complete_slice']);
const PATCH_OPERATIONS = new Set([
  'append_completed_slice',
  'set_active_slice',
  'append_transition_reference',
  'append_history_template',
]);

function fail(code, message) {
  throw new BuildctlError(code, message);
}

function compareText(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('E_TRANSITION_SCHEMA', `${label} must be an object.`);
  }
  return structuredClone(value);
}

function hash(value, label) {
  if (typeof value !== 'string' || !HASH.test(value)) {
    fail('E_TRANSITION_HASH', `${label} must be a lowercase SHA-256 hash.`);
  }
  return value;
}

function kind(value) {
  if (!TRANSITION_KINDS.has(value)) {
    fail('E_TRANSITION_KIND', `Unsupported transition kind: ${JSON.stringify(value)}.`);
  }
  return value;
}

function version(value, label) {
  if (!isSemanticVersion(value)) {
    fail('E_TRANSITION_VERSION', `${label} must be a semantic version.`);
  }
  return value;
}

function schemaVersion(value) {
  if (!Number.isInteger(value) || value < 1) {
    fail('E_TRANSITION_VERSION', 'schemaVersion must be a positive integer.');
  }
  return value;
}

function subjects(value) {
  if (!Array.isArray(value) || value.length === 0) {
    fail('E_TRANSITION_SUBJECT', 'subjects must be a non-empty array.');
  }
  const seen = new Set();
  return value.map((entry, index) => {
    const subject = object(entry, `subjects[${index}]`);
    if (typeof subject.name !== 'string' || !subject.name) {
      fail('E_TRANSITION_SUBJECT', `subjects[${index}].name must be non-empty.`);
    }
    if (seen.has(subject.name)) {
      fail('E_TRANSITION_SUBJECT', `Duplicate transition subject: ${subject.name}.`);
    }
    seen.add(subject.name);
    return { name: subject.name, sha256: hash(subject.sha256, `subjects[${index}].sha256`) };
  }).sort((left, right) => compareText(left.name, right.name));
}

function repository(value, label) {
  const identity = object(value, label);
  hash(identity.fingerprint, `${label}.fingerprint`);
  return identity;
}

function patch(value) {
  if (!Array.isArray(value) || value.length === 0) {
    fail('E_TRANSITION_PATCH', 'patch must be a non-empty array.');
  }
  return value.map((entry, index) => {
    const operation = object(entry, `patch[${index}]`);
    if (!PATCH_OPERATIONS.has(operation.op)) {
      fail('E_TRANSITION_PATCH', `Unsupported patch operation: ${JSON.stringify(operation.op)}.`);
    }
    if (!Object.hasOwn(operation, 'value')) {
      fail('E_TRANSITION_PATCH', `patch[${index}].value is required.`);
    }
    return operation;
  });
}

function receiptCore(receipt) {
  const core = structuredClone(receipt);
  delete core.receipt_hash;
  return core;
}

export function transitionReceiptId({
  transitionKind,
  subjects: subjectValues,
  repositoryBefore,
  repositoryAfter,
  expectedStateHash,
  authorizedDecision,
  compilerVersion,
  schemaVersion: schema = 1,
}) {
  const identity = {
    authorized_decision_hash: sha256(canonicalJson(object(authorizedDecision, 'authorizedDecision'))),
    compiler_version: version(compilerVersion, 'compilerVersion'),
    expected_state_hash: hash(expectedStateHash, 'expectedStateHash'),
    repository_after: repository(repositoryAfter, 'repositoryAfter').fingerprint,
    repository_before: repository(repositoryBefore, 'repositoryBefore').fingerprint,
    schema_version: schemaVersion(schema),
    subjects: subjects(subjectValues),
    transition_kind: kind(transitionKind),
  };
  return sha256(canonicalJson(identity));
}

export function createTransitionReceipt({
  transitionKind,
  subjects: subjectValues,
  repositoryBefore,
  repositoryAfter,
  expectedStateHash,
  authorizedDecision,
  patch: patchValues,
  compilerVersion,
  schemaVersion: schema = 1,
}) {
  const input = {
    transitionKind,
    subjects: subjectValues,
    repositoryBefore,
    repositoryAfter,
    expectedStateHash,
    authorizedDecision,
    compilerVersion,
    schemaVersion: schema,
  };
  const receiptId = transitionReceiptId(input);
  const exactPatch = patch(patchValues);
  const reference = exactPatch.find((operation) => operation.op === 'append_transition_reference');
  if (reference?.value?.receipt_id !== receiptId) {
    fail('E_TRANSITION_REFERENCE', 'Patch transition reference must match the receipt ID.');
  }
  const receipt = {
    authorized_decision: object(authorizedDecision, 'authorizedDecision'),
    compiler_version: version(compilerVersion, 'compilerVersion'),
    expected_state_hash: hash(expectedStateHash, 'expectedStateHash'),
    patch: exactPatch,
    receipt_id: receiptId,
    repository_after: repository(repositoryAfter, 'repositoryAfter'),
    repository_before: repository(repositoryBefore, 'repositoryBefore'),
    schema_version: schemaVersion(schema),
    subjects: subjects(subjectValues),
    transition_kind: kind(transitionKind),
  };
  receipt.receipt_hash = sha256(canonicalJson(receipt));
  return receipt;
}

export function verifyTransitionReceipt(receipt) {
  const supplied = object(receipt, 'receipt');
  const expected = createTransitionReceipt({
    authorizedDecision: supplied.authorized_decision,
    compilerVersion: supplied.compiler_version,
    expectedStateHash: supplied.expected_state_hash,
    patch: supplied.patch,
    repositoryAfter: supplied.repository_after,
    repositoryBefore: supplied.repository_before,
    schemaVersion: supplied.schema_version,
    subjects: supplied.subjects,
    transitionKind: supplied.transition_kind,
  });
  if (supplied.receipt_id !== expected.receipt_id) {
    fail('E_TRANSITION_ID', `Transition receipt ID mismatch: expected ${expected.receipt_id}.`);
  }
  if (canonicalJson(supplied.subjects) !== canonicalJson(expected.subjects)) {
    fail('E_TRANSITION_SUBJECT_ORDER', 'Transition receipt subjects are not canonically ordered.');
  }
  const expectedHash = sha256(canonicalJson(receiptCore(supplied)));
  if (supplied.receipt_hash !== expectedHash) {
    fail('E_TRANSITION_RECEIPT_HASH', `Transition receipt hash mismatch: expected ${expectedHash}.`);
  }
  return expectedHash;
}

export function writeTransitionReceipt({
  receipt,
  repoRoot = process.cwd(),
  receiptsDir = '.build/transition-receipts',
} = {}) {
  verifyTransitionReceipt(receipt);
  const root = realpathSync(repoRoot);
  const directory = resolveInsideRepo(receiptsDir, root, 'transition receipts directory');
  const path = join(directory, `${receipt.receipt_id}.json`);
  return writeImmutableJson(path, receipt, {
    collisionCode: 'E_TRANSITION_COLLISION',
    collisionMessage: `Immutable transition receipt collision at ${path}.`,
  });
}

function diagnostic(code, path, message) {
  return { code, path, message };
}

function blocked(diagnostics) {
  diagnostics.sort((left, right) =>
    compareText(left.code, right.code)
      || compareText(left.path, right.path)
      || compareText(left.message, right.message));
  return { diagnostics, patch: [], status: 'blocked' };
}

function sliceId(value, label, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || !value) {
    fail('E_TRANSITION_SCHEMA', `${label} must be ${nullable ? 'null or ' : ''}a non-empty string.`);
  }
  return value;
}

export function proposeCompletion({ state, authorizedDecision, transitionReference } = {}) {
  const projection = object(state, 'state');
  const decision = object(authorizedDecision, 'authorizedDecision');
  const reference = object(transitionReference, 'transitionReference');
  const receiptId = hash(reference.receipt_id, 'transitionReference.receipt_id');
  const activeSlice = sliceId(projection.active_slice, 'state.active_slice', { nullable: true });
  const completed = Array.isArray(projection.completed_slices)
    ? projection.completed_slices.map((value, index) => sliceId(value, `state.completed_slices[${index}]`))
    : fail('E_TRANSITION_SCHEMA', 'state.completed_slices must be an array.');
  const references = Array.isArray(projection.transition_references)
    ? projection.transition_references.map((value, index) => object(
      value,
      `state.transition_references[${index}]`,
    ))
    : fail('E_TRANSITION_SCHEMA', 'state.transition_references must be an array.');
  const historyTemplates = Array.isArray(projection.history_templates)
    ? projection.history_templates.map((value, index) => object(
      value,
      `state.history_templates[${index}]`,
    ))
    : fail('E_TRANSITION_SCHEMA', 'state.history_templates must be an array.');
  const currentStateHash = hash(projection.state_hash, 'state.state_hash');
  const currentRepository = hash(
    projection.repository_fingerprint,
    'state.repository_fingerprint',
  );
  const currentSlice = sliceId(decision.slice_id, 'authorizedDecision.slice_id');
  const nextSlice = sliceId(
    decision.next_slice_id,
    'authorizedDecision.next_slice_id',
    { nullable: true },
  );
  const expectedStateHash = hash(
    decision.expected_state_hash,
    'authorizedDecision.expected_state_hash',
  );
  const expectedRepository = hash(
    decision.expected_repository_fingerprint,
    'authorizedDecision.expected_repository_fingerprint',
  );
  const expectedHistory = {
    event: 'slice_completed',
    receipt_id: receiptId,
    slice_id: currentSlice,
  };
  if (decision.authorization !== 'allowed') {
    return blocked([diagnostic(
      'E_TRANSITION_NOT_AUTHORIZED',
      'authorizedDecision.authorization',
      'Completion decision is not authorized.',
    )]);
  }

  const recorded = references.filter((value) => value.receipt_id === receiptId);
  if (recorded.length > 0) {
    if (currentRepository !== expectedRepository) {
      return blocked([diagnostic(
        'E_TRANSITION_REPOSITORY_DRIFT',
        'state.repository_fingerprint',
        `Expected ${expectedRepository}; received ${currentRepository}.`,
      )]);
    }
    const exactReference = recorded.length === 1
      && canonicalJson(recorded[0]) === canonicalJson(reference);
    const completionCount = completed.filter((value) => value === currentSlice).length;
    const historyCount = historyTemplates.filter((value) =>
      canonicalJson(value) === canonicalJson(expectedHistory)).length;
    const relatedHistoryCount = historyTemplates.filter((value) =>
      value.receipt_id === receiptId).length;
    if (
      exactReference
      && completionCount === 1
      && activeSlice === nextSlice
      && historyCount === 1
      && relatedHistoryCount === 1
    ) {
      return { diagnostics: [], patch: [], status: 'already_applied' };
    }
    return blocked([diagnostic(
      'E_TRANSITION_REPLAY_CONFLICT',
      'state.transition_references',
      'Recorded transition does not match the authorized completion state.',
    )]);
  }

  const drift = [];
  if (currentStateHash !== expectedStateHash) {
    drift.push(diagnostic(
      'E_TRANSITION_STATE_DRIFT',
      'state.state_hash',
      `Expected ${expectedStateHash}; received ${currentStateHash}.`,
    ));
  }
  if (currentRepository !== expectedRepository) {
    drift.push(diagnostic(
      'E_TRANSITION_REPOSITORY_DRIFT',
      'state.repository_fingerprint',
      `Expected ${expectedRepository}; received ${currentRepository}.`,
    ));
  }
  if (drift.length > 0) return blocked(drift);
  if (activeSlice !== currentSlice) {
    return blocked([diagnostic(
      'E_TRANSITION_ACTIVE_CONFLICT',
      'state.active_slice',
      `Expected active slice ${currentSlice}; received ${String(activeSlice)}.`,
    )]);
  }
  if (completed.includes(currentSlice)) {
    return blocked([diagnostic(
      'E_TRANSITION_COMPLETION_CONFLICT',
      'state.completed_slices',
      `Slice ${currentSlice} is completed without the authorized transition reference.`,
    )]);
  }

  return {
    diagnostics: [],
    patch: [
      { op: 'append_completed_slice', value: currentSlice },
      { op: 'set_active_slice', value: nextSlice },
      { op: 'append_transition_reference', value: reference },
      {
        op: 'append_history_template',
        value: expectedHistory,
      },
    ],
    status: 'proposed',
  };
}
