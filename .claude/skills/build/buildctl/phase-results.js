import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { checkEvidence } from './evidence.js';
import { evaluateWorkflowCoverage, receiptIndex } from './coverage.js';
import { writeImmutableJson } from './immutable-json.js';
import {
  BuildctlError,
  canonicalJson,
  loadContract,
  parseMarkdownYamlSection,
  resolveCompilerVersion,
  resolveInsideRepo,
  sha256,
} from './plan-contract.js';
import {
  captureRepositoryIdentity,
  repositoryCleanStatus,
  repositoryFileScope,
} from './repository.js';
import { verifyTransitionReceipt } from './transition.js';
import { loadWorkflowState } from './workflow-state.js';

const HEX_SHA256 = /^[a-f0-9]{64}$/;
const BASE_REF = /^[a-f0-9]{40}$/;
const PREFIX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESULT_FIELDS = ['findings', 'phase', 'schema_version', 'subjects', 'verdict'];
const SUBJECT_FIELDS = ['name', 'sha256'];
const FINDING_FIELDS = ['consequence', 'evidence', 'fix', 'id', 'severity', 'summary'];
const BOOTSTRAP_FIELDS = [
  'accepted_contract_hash',
  'accepted_plan_sha256',
  'override',
  'phase',
  'reason',
  'review_artifact_sha256',
  'reviewed_contract_hash',
  'reviewed_plan_sha256',
  'reviewer',
];

const PHASES = {
  'plan-review': {
    allowed: {
      do_not_proceed: 'plan',
      proceed: 'implement',
      proceed_with_fixes: 'plan',
    },
    findingPrefix: 'PR',
    reportState: 'review',
    subjects: ['context', 'contract', 'plan', 'repository', 'requirements'],
  },
  verify: {
    allowed: {
      failed: 'implement',
      partial: 'architect-review',
      verified: 'architect-review',
    },
    findingPrefix: 'VR',
    reportState: 'verify',
    subjects: [
      'contract',
      'evidence-ledger',
      'implementation-summary',
      'plan',
      'repository',
      'requirements',
    ],
  },
  'architect-review': {
    allowed: {
      fail: 'implement',
      pass: 'complete',
      pass_with_notes: 'complete',
    },
    findingPrefix: 'AR',
    reportState: 'architect-review',
    subjects: [
      'contract',
      'implementation-summary',
      'plan',
      'repository',
      'verify',
      'verify-result',
    ],
  },
};

function fail(code, path, message) {
  throw new BuildctlError(code, message, {
    diagnostics: [{ code, message, path }],
  });
}

function object(value) {
  return Boolean(value) && !Array.isArray(value) && typeof value === 'object';
}

function exactKeys(value, expected, path) {
  if (!object(value)) fail('E_RESULT_SCHEMA', path, 'Expected a map.');
  const actual = Object.keys(value).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) {
    fail(
      'E_RESULT_SCHEMA',
      path,
      `Expected exactly ${[...expected].sort().join(', ')}; received ${actual.join(', ')}.`,
    );
  }
}

function nonempty(value, path) {
  if (typeof value !== 'string' || !value.trim()) {
    fail('E_RESULT_SCHEMA', path, 'Expected a non-empty string.');
  }
  return value;
}

function authoredResult(source) {
  let result;
  try {
    result = parseMarkdownYamlSection(source, 'Machine result');
  } catch (error) {
    fail('E_RESULT_SCHEMA', 'artifact.machine_result', error.message);
  }
  exactKeys(result, RESULT_FIELDS, 'artifact.machine_result');
  if (result.schema_version !== 1) {
    fail('E_RESULT_SCHEMA', 'artifact.machine_result.schema_version', 'Expected schema_version 1.');
  }
  const phase = nonempty(result.phase, 'artifact.machine_result.phase');
  const rules = PHASES[phase];
  if (!rules) fail('E_RESULT_PHASE', 'artifact.machine_result.phase', `Unsupported phase ${phase}.`);
  if (!Object.hasOwn(rules.allowed, result.verdict)) {
    fail(
      'E_RESULT_VERDICT',
      'artifact.machine_result.verdict',
      `Unsupported ${phase} verdict ${String(result.verdict)}.`,
    );
  }
  if (!Array.isArray(result.subjects)) {
    fail('E_RESULT_SCHEMA', 'artifact.machine_result.subjects', 'Expected a subject list.');
  }
  if (!Array.isArray(result.findings)) {
    fail('E_RESULT_SCHEMA', 'artifact.machine_result.findings', 'Expected a finding list.');
  }
  const subjects = result.subjects.map((subject, index) => {
    const path = `artifact.machine_result.subjects[${index}]`;
    exactKeys(subject, SUBJECT_FIELDS, path);
    nonempty(subject.name, `${path}.name`);
    if (!HEX_SHA256.test(subject.sha256)) {
      fail('E_RESULT_SCHEMA', `${path}.sha256`, 'Expected 64 lowercase hexadecimal characters.');
    }
    return { name: subject.name, sha256: subject.sha256 };
  }).sort((left, right) => left.name.localeCompare(right.name));
  const names = subjects.map((subject) => subject.name);
  if (JSON.stringify(names) !== JSON.stringify(rules.subjects)) {
    fail(
      'E_RESULT_SUBJECT',
      'artifact.machine_result.subjects',
      `Expected exact subject set ${rules.subjects.join(', ')}; received ${names.join(', ')}.`,
    );
  }
  const findings = result.findings.map((finding, index) => {
    const path = `artifact.machine_result.findings[${index}]`;
    exactKeys(finding, FINDING_FIELDS, path);
    const expectedId = `${rules.findingPrefix}-${String(index + 1).padStart(3, '0')}`;
    if (finding.id !== expectedId) {
      fail('E_RESULT_FINDING', `${path}.id`, `Expected stable finding ID ${expectedId}.`);
    }
    if (!['critical', 'important', 'minor'].includes(finding.severity)) {
      fail('E_RESULT_FINDING', `${path}.severity`, 'Unsupported finding severity.');
    }
    for (const field of ['summary', 'evidence', 'consequence', 'fix']) {
      nonempty(finding[field], `${path}.${field}`);
    }
    return {
      consequence: finding.consequence,
      evidence: finding.evidence,
      fix: finding.fix,
      id: finding.id,
      severity: finding.severity,
      summary: finding.summary,
    };
  });
  return {
    findings,
    phase,
    rules,
    schema_version: 1,
    subjects,
    verdict: result.verdict,
  };
}

function proseVerdict(source, phase) {
  const mappings = phase === 'verify'
    ? [
      [/^FAILED(?:\s+-|$)/, 'failed'],
      [/^PARTIAL(?:\s+-|$)/, 'partial'],
      [/^VERIFIED(?:\s+-|$)/, 'verified'],
    ]
    : phase === 'architect-review'
      ? [
        [/^FAIL$/, 'fail'],
        [/^PASS_WITH_NOTES$/, 'pass_with_notes'],
        [/^PASS$/, 'pass'],
      ]
      : [
      [/^Do not proceed$/, 'do_not_proceed'],
      [/^Proceed to implementation$/, 'proceed'],
      [/^Proceed with fixes$/, 'proceed_with_fixes'],
      ];
  const matches = [];
  for (const line of source.split(/\r?\n/).map((value) => value.trim().replace(/\.$/, ''))) {
    for (const [pattern, verdict] of mappings) {
      if (pattern.test(line)) matches.push(verdict);
    }
  }
  if (matches.length !== 1) {
    fail(
      'E_RESULT_VERDICT_MISMATCH',
      'artifact.prose_verdict',
      `Expected exactly one human-readable verdict line; found ${matches.length}.`,
    );
  }
  return matches[0];
}

function checkVerdict(result, source) {
  if (proseVerdict(source, result.phase) !== result.verdict) {
    fail(
      'E_RESULT_VERDICT_MISMATCH',
      'artifact.machine_result.verdict',
      'Machine verdict does not match the human-readable verdict.',
    );
  }
  const severities = new Set(result.findings.map((finding) => finding.severity));
  const compatible = result.phase === 'verify'
    ? result.verdict === 'verified'
      ? !severities.has('critical') && !severities.has('important')
      : result.verdict === 'partial'
        ? !severities.has('critical') && severities.has('important')
        : severities.has('critical') || severities.has('important')
    : result.phase === 'architect-review'
      ? result.verdict === 'pass'
        ? !severities.has('critical') && !severities.has('important')
        : result.verdict === 'pass_with_notes'
          ? !severities.has('critical') && !severities.has('important')
            && severities.has('minor')
          : severities.has('critical') || severities.has('important')
      : result.verdict === 'proceed'
        ? !severities.has('critical') && !severities.has('important')
        : result.verdict === 'proceed_with_fixes'
          ? !severities.has('critical') && severities.has('important')
          : severities.has('critical');
  if (!compatible) {
    fail(
      'E_RESULT_VERDICT',
      'artifact.machine_result.verdict',
      `Verdict ${result.verdict} is incompatible with finding severities.`,
    );
  }
}

function artifactPaths({ contract, state, repoRoot }) {
  const prefix = state.values.workflow_artifact_prefix || state.values.slug;
  if (typeof prefix !== 'string' || !PREFIX.test(prefix)) {
    fail(
      'E_RESULT_STATE',
      'state.workflow_artifact_prefix',
      'workflow_artifact_prefix must be a safe kebab-case artifact prefix.',
    );
  }
  const plans = join('.build', 'plans');
  return {
    context: resolveInsideRepo(
      join(plans, `${prefix}-context.md`),
      repoRoot,
      'workflow context',
      { mustExist: true },
    ),
    plan: resolveInsideRepo(contract.source.path, repoRoot, 'contract source plan', {
      mustExist: true,
    }),
    requirements: resolveInsideRepo(
      join(plans, `${prefix}-requirements.md`),
      repoRoot,
      'workflow requirements',
      { mustExist: true },
    ),
  };
}

function subjectMap(subjects) {
  return Object.fromEntries(subjects.map(({ name, sha256: hash }) => [name, hash]));
}

function assertSubjects(authored, computed) {
  const actual = subjectMap(authored.subjects);
  const diagnostics = Object.keys(computed).sort().flatMap((name) => (
    actual[name] === computed[name] ? [] : [{
      code: 'E_RESULT_SUBJECT',
      message: `Authored ${name} hash is stale; expected ${computed[name]}.`,
      path: `artifact.machine_result.subjects.${name}`,
    }]
  ));
  if (diagnostics.length > 0) {
    throw new BuildctlError('E_RESULT_SUBJECT', 'Authored result subjects are stale.', {
      diagnostics,
    });
  }
}

function readJson(path, code, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(code, label, `Cannot parse ${label}: ${error.message}`);
  }
}

export function verifyPhaseResultReceipt(receipt) {
  if (!object(receipt) || !HEX_SHA256.test(receipt.receipt_id)
    || !HEX_SHA256.test(receipt.receipt_hash)) {
    fail('E_RESULT_PRIOR_RECEIPT', 'prior_result', 'Malformed phase-result receipt.');
  }
  const withoutHash = structuredClone(receipt);
  delete withoutHash.receipt_hash;
  if (receipt.receipt_hash !== sha256(canonicalJson(withoutHash))) {
    fail('E_RESULT_PRIOR_RECEIPT', 'prior_result.receipt_hash', 'Receipt hash mismatch.');
  }
  const core = structuredClone(withoutHash);
  delete core.receipt_id;
  if (receipt.receipt_id !== sha256(canonicalJson(core))) {
    fail('E_RESULT_PRIOR_RECEIPT', 'prior_result.receipt_id', 'Receipt ID mismatch.');
  }
  return receipt.receipt_hash;
}

function completionReceipts({ contract, repoRoot, state }) {
  const references = Array.isArray(state.values.transition_references)
    ? state.values.transition_references
    : [];
  const directory = resolveInsideRepo(
    join('.build', 'transition-receipts'),
    repoRoot,
    'transition receipts directory',
  );
  const receipts = new Map();
  for (const [index, reference] of references.entries()) {
    if (!object(reference) || !HEX_SHA256.test(reference.receipt_id)) {
      fail(
        'E_RESULT_COMPLETION_RECEIPT',
        `state.transition_references[${index}]`,
        'Malformed completion receipt reference.',
      );
    }
    const path = join(directory, `${reference.receipt_id}.json`);
    if (!existsSync(path)) {
      fail(
        'E_RESULT_COMPLETION_RECEIPT',
        `state.transition_references[${index}]`,
        `Missing completion receipt ${reference.receipt_id}.`,
      );
    }
    const receipt = readJson(path, 'E_RESULT_COMPLETION_RECEIPT', path);
    try {
      verifyTransitionReceipt(receipt);
    } catch (error) {
      fail('E_RESULT_COMPLETION_RECEIPT', path, error.message);
    }
    if (receipt.receipt_id !== reference.receipt_id) {
      fail('E_RESULT_COMPLETION_RECEIPT', path, 'Completion receipt ID does not match state.');
    }
    const plan = receipt.subjects.find((subject) => subject.name === 'plan');
    if (plan?.sha256 !== contract.source.sha256) {
      fail('E_RESULT_COMPLETION_RECEIPT', path, 'Completion receipt plan subject is stale.');
    }
    const sliceId = receipt.authorized_decision?.slice_id;
    if (receipts.has(sliceId)) {
      fail('E_RESULT_COMPLETION_RECEIPT', path, `Duplicate completion receipt for ${sliceId}.`);
    }
    receipts.set(sliceId, receipt);
  }
  return receipts;
}

function latestPhaseReference(state, phase, { required = false } = {}) {
  const references = Array.isArray(state.values.phase_result_references)
    ? state.values.phase_result_references
    : [];
  let latest = null;
  for (const [index, reference] of references.entries()) {
    if (reference?.phase !== phase) continue;
    if (!HEX_SHA256.test(reference.receipt_id || '')) {
      fail(
        'E_RESULT_PRIOR_RECEIPT',
        `state.phase_result_references[${index}]`,
        `Malformed ${phase} result reference.`,
      );
    }
    latest = reference;
  }
  if (required && !latest) {
    fail(
      'E_RESULT_PRIOR_RECEIPT',
      'state.phase_result_references',
      `Expected a valid referenced ${phase} result.`,
    );
  }
  return latest;
}

function priorPlanReview({ contract, repoRoot, state }) {
  const reference = latestPhaseReference(state, 'plan-review');
  if (reference) {
    let path;
    try {
      path = resolveInsideRepo(
        join('.build', 'result-receipts', `${reference.receipt_id}.json`),
        repoRoot,
        'Plan Review result receipt',
        { mustExist: true },
      );
    } catch (error) {
      fail('E_RESULT_PRIOR_RECEIPT', 'state.phase_result_references', error.message);
    }
    const receipt = readJson(path, 'E_RESULT_PRIOR_RECEIPT', path);
    verifyPhaseResultReceipt(receipt);
    if (receipt.phase !== 'plan-review'
      || receipt.verdict !== 'proceed'
      || receipt.subjects?.plan !== contract.source.sha256) {
      fail('E_RESULT_PRIOR_RECEIPT', path, 'Plan Review result is stale, rejected, or wrong-phase.');
    }
    return { bootstrap: null, receipt_id: receipt.receipt_id };
  }
  const bootstraps = Array.isArray(state.values.phase_result_bootstrap)
    ? state.values.phase_result_bootstrap
    : [];
  const matchesBootstrap = bootstraps.filter((entry) =>
    entry?.phase === 'plan-review' && entry?.reason === 'precompiler-plan-review');
  if (matchesBootstrap.length > 1) {
    fail('E_RESULT_PRIOR_RECEIPT', 'state.phase_result_bootstrap', 'Duplicate Plan Review bootstraps.');
  }
  const bootstrap = matchesBootstrap[0];
  if (!bootstrap) return { bootstrap: null, receipt_id: null };
  try {
    exactKeys(bootstrap, BOOTSTRAP_FIELDS, 'state.phase_result_bootstrap');
  } catch (error) {
    fail('E_RESULT_PRIOR_RECEIPT', 'state.phase_result_bootstrap', error.message);
  }
  for (const name of [
    'accepted_contract_hash',
    'accepted_plan_sha256',
    'review_artifact_sha256',
    'reviewed_contract_hash',
    'reviewed_plan_sha256',
  ]) {
    if (!HEX_SHA256.test(bootstrap[name])) {
      fail('E_RESULT_PRIOR_RECEIPT', `state.phase_result_bootstrap.${name}`, 'Expected SHA-256.');
    }
  }
  for (const name of ['reviewer', 'override']) {
    if (typeof bootstrap[name] !== 'string' || !bootstrap[name].trim()) {
      fail(
        'E_RESULT_PRIOR_RECEIPT',
        `state.phase_result_bootstrap.${name}`,
        'Expected a non-empty string.',
      );
    }
  }
  if (bootstrap.accepted_plan_sha256 !== contract.source.sha256) {
    fail('E_RESULT_PRIOR_RECEIPT', 'state.phase_result_bootstrap', 'Bootstrap plan is stale.');
  }
  return { bootstrap, receipt_id: null };
}

function priorVerifyResult({
  contract,
  contractSha256,
  repository,
  repoRoot,
  state,
  verifyPath,
}) {
  const reference = latestPhaseReference(state, 'verify', { required: true });
  let path;
  try {
    path = resolveInsideRepo(
      join('.build', 'result-receipts', `${reference.receipt_id}.json`),
      repoRoot,
      'Verify result receipt',
      { mustExist: true },
    );
  } catch (error) {
    fail('E_RESULT_PRIOR_RECEIPT', 'state.phase_result_references', error.message);
  }
  const receipt = readJson(path, 'E_RESULT_PRIOR_RECEIPT', path);
  verifyPhaseResultReceipt(receipt);
  if (receipt.receipt_id !== reference.receipt_id
    || receipt.phase !== 'verify'
    || !['verified', 'partial'].includes(receipt.verdict)
    || receipt.subjects?.plan !== contract.source.sha256
    || receipt.subjects?.contract !== contractSha256) {
    fail('E_RESULT_PRIOR_RECEIPT', path, 'Verify result is stale, failed, or wrong-phase.');
  }
  const verifySha256 = sha256(readFileSync(verifyPath));
  if (receipt.artifact?.sha256 !== verifySha256
    || receipt.repository?.fingerprint !== repository.fingerprint) {
    fail(
      'E_RESULT_PRIOR_RECEIPT',
      path,
      'Verify report or reviewed repository changed after verification.',
    );
  }
  return receipt;
}

function findingsText(findings) {
  return findings.map((finding) =>
    [finding.summary, finding.evidence, finding.consequence, finding.fix].join('\n')).join('\n');
}

function architectFacts({
  contract,
  contractSha256,
  repository,
  state,
  verifyPath,
}) {
  const clean = repositoryCleanStatus({ repoRoot: state.repoRoot });
  if (!clean.clean) {
    fail('E_RESULT_DIRTY', 'repository', 'Architect Review result requires a clean worktree.');
  }
  const scope = repositoryFileScope({
    baseRef: state.values.base_ref,
    plannedPaths: contract.execution_manifest.flatMap((task) => task.files_modified),
    repoRoot: state.repoRoot,
  });
  if (scope.out_of_plan.length > 0) {
    fail(
      'E_RESULT_SCOPE',
      'repository.out_of_plan',
      `Changed paths are outside the plan: ${scope.out_of_plan.join(', ')}.`,
    );
  }
  const verifyResult = priorVerifyResult({
    contract,
    contractSha256,
    repository,
    repoRoot: state.repoRoot,
    state,
    verifyPath,
  });
  return {
    base_ref: state.values.base_ref,
    file_scope: scope,
    verify_result: {
      receipt_hash: verifyResult.receipt_hash,
      receipt_id: verifyResult.receipt_id,
      verdict: verifyResult.verdict,
    },
  };
}

async function verifyFacts({
  authored,
  contract,
  evidenceDir,
  loaded,
  paths,
  repository,
  state,
}) {
  const clean = repositoryCleanStatus({ repoRoot: state.repoRoot });
  if (!clean.clean) {
    fail('E_RESULT_DIRTY', 'repository', 'Verify result requires a clean worktree.');
  }
  const scope = repositoryFileScope({
    baseRef: state.values.base_ref,
    plannedPaths: contract.execution_manifest.flatMap((task) => task.files_modified),
    repoRoot: state.repoRoot,
  });
  if (scope.out_of_plan.length > 0) {
    fail(
      'E_RESULT_SCOPE',
      'repository.out_of_plan',
      `Changed paths are outside the plan: ${scope.out_of_plan.join(', ')}.`,
    );
  }
  const checked = await checkEvidence({
    contractPath: loaded.contractPath,
    evidenceDir,
    repoRoot: state.repoRoot,
  });
  const hardEvidence = checked.diagnostics.filter(
    (item) => item.code !== 'E_EVIDENCE_COMMAND_FAILED',
  );
  if (!checked.ledger || hardEvidence.length > 0) {
    throw new BuildctlError('E_RESULT_EVIDENCE', 'Evidence ledger is not current.', {
      diagnostics: hardEvidence.map((item) => ({
        code: 'E_RESULT_EVIDENCE',
        message: `${item.code}: ${item.message}`,
        path: item.path,
      })),
    });
  }
  const receiptDiagnostics = [];
  const receipts = receiptIndex({
    contract,
    diagnostics: receiptDiagnostics,
    identity: repository,
    ledger: checked.ledger,
    repoRoot: state.repoRoot,
  });
  if (receiptDiagnostics.length > 0) {
    throw new BuildctlError('E_RESULT_EVIDENCE', 'Evidence receipts are invalid.', {
      diagnostics: receiptDiagnostics.map((item) => ({
        code: 'E_RESULT_EVIDENCE',
        message: `${item.code}: ${item.message}`,
        path: item.path,
      })),
    });
  }
  const completions = completionReceipts({ contract, repoRoot: state.repoRoot, state });
  const coverage = evaluateWorkflowCoverage({
    completionReceipts: completions,
    contract,
    receipts,
  });
  const completed = new Set(
    Array.isArray(state.values.completed_slices) ? state.values.completed_slices : [],
  );
  for (const slice of contract.delivery_slices) {
    if (!completed.has(slice.id)) coverage.gaps.push(`slice:${slice.id}:not-completed`);
  }
  const prior = priorPlanReview({ contract, repoRoot: state.repoRoot, state });
  const requiredMentions = [...coverage.gaps];
  if (!prior.receipt_id) {
    requiredMentions.push(prior.bootstrap ? 'Plan Review receipt' : 'plan-review-result');
  }
  requiredMentions.push(...scope.planned_but_unchanged);
  const gaps = [...new Set([
    ...coverage.gaps,
    ...scope.planned_but_unchanged.map((path) => `planned-unchanged:${path}`),
    ...(!prior.receipt_id
      ? [prior.bootstrap ? 'prior:plan-review-receipt-bootstrap' : 'prior:plan-review-result']
      : []),
  ])].sort();
  const text = findingsText(authored.findings);
  if (coverage.failedCommands.length > 0) {
    if (authored.verdict !== 'failed'
      || coverage.failedCommands.some((command) => !text.includes(command))) {
      fail(
        'E_RESULT_VERDICT',
        'artifact.machine_result.verdict',
        'Failed evidence commands require failed verdict findings naming every command.',
      );
    }
  } else if (gaps.length > 0) {
    if (authored.verdict !== 'partial'
      || requiredMentions.some((mention) => !text.includes(mention))) {
      fail(
        'E_RESULT_VERDICT',
        'artifact.machine_result.verdict',
        `Mechanical gaps require partial findings naming every gap: ${gaps.join(', ')}.`,
      );
    }
  }
  return {
    evidence: {
      failed_commands: coverage.failedCommands,
      gaps,
      ledger_hash: checked.ledger.ledger_hash,
      required_commands: coverage.requiredCommands,
      resolved_requirements: coverage.resolvedRequirements,
    },
    file_scope: scope,
    prior_plan_review: prior,
  };
}

function receiptCore({
  artifact,
  authored,
  contract,
  repository,
  state,
  subjects,
  mechanicalFacts,
}) {
  const counts = { critical: 0, important: 0, minor: 0 };
  for (const finding of authored.findings) counts[finding.severity] += 1;
  return {
    allowed_next_phase: authored.rules.allowed[authored.verdict],
    artifact: {
      path: relative(state.repoRoot, artifact.path).split('\\').join('/'),
      sha256: sha256(artifact.source),
    },
    authored_result: {
      findings: authored.findings,
      phase: authored.phase,
      schema_version: authored.schema_version,
      subjects: authored.subjects,
      verdict: authored.verdict,
    },
    compiler_version: resolveCompilerVersion(),
    contract: {
      contract_hash: contract.contract_hash,
      source_plan_sha256: contract.source.sha256,
    },
    mechanical_facts: mechanicalFacts || {
      base_ref: state.values.base_ref,
      finding_counts: counts,
      repository_fingerprint: repository.fingerprint,
      state_phase: state.values.phase,
      subjects_current: true,
    },
    phase: authored.phase,
    repository,
    schema_version: 1,
    state: {
      path: state.relativePath,
      sha256: state.sha256,
    },
    subjects,
    verdict: authored.verdict,
  };
}

export async function compilePhaseResult({
  artifactPath,
  contractPath,
  cwd = process.cwd(),
  evidenceDir,
  receiptsDir,
  statePath,
} = {}) {
  const loaded = loadContract({ contractPath, cwd });
  const state = loadWorkflowState({
    cwd,
    statePath,
    required: ['base_ref', 'phase', 'slug'],
  });
  if (state.values.slug !== loaded.contract.slug) {
    fail(
      'E_RESULT_STATE',
      'state.slug',
      `State slug ${String(state.values.slug)} does not match contract ${loaded.contract.slug}.`,
    );
  }
  if (!BASE_REF.test(state.values.base_ref)) {
    fail('E_RESULT_STATE', 'state.base_ref', 'base_ref must be a full lowercase Git SHA.');
  }
  const artifactFile = resolveInsideRepo(
    artifactPath,
    state.repoRoot,
    'phase result artifact',
    { mustExist: true },
  );
  const source = readFileSync(artifactFile, 'utf8');
  const authored = authoredResult(source);
  if (state.values.phase !== authored.rules.reportState) {
    fail(
      'E_RESULT_PHASE',
      'state.phase',
      `Phase ${authored.phase} requires workflow state ${authored.rules.reportState}.`,
    );
  }
  checkVerdict(authored, source);
  const paths = artifactPaths({
    contract: loaded.contract,
    repoRoot: state.repoRoot,
    state,
  });
  const repository = await captureRepositoryIdentity({
    evidenceDir,
    repoRoot: state.repoRoot,
  });
  let subjects;
  let mechanicalFacts;
  if (authored.phase === 'architect-review') {
    const prefix = state.values.workflow_artifact_prefix || state.values.slug;
    const summary = resolveInsideRepo(
      join('.build', 'plans', `${prefix}-implementation-summary.md`),
      state.repoRoot,
      'implementation summary',
      { mustExist: true },
    );
    const verify = resolveInsideRepo(
      join('.build', 'plans', `${prefix}-verify.md`),
      state.repoRoot,
      'Verify report',
      { mustExist: true },
    );
    const contractSha256 = sha256(readFileSync(loaded.contractPath));
    mechanicalFacts = architectFacts({
      contract: loaded.contract,
      contractSha256,
      repository,
      state,
      verifyPath: verify,
    });
    subjects = {
      contract: contractSha256,
      'implementation-summary': sha256(readFileSync(summary)),
      plan: sha256(readFileSync(paths.plan)),
      repository: repository.fingerprint,
      verify: sha256(readFileSync(verify)),
      'verify-result': mechanicalFacts.verify_result.receipt_hash,
    };
  } else if (authored.phase === 'verify') {
    const summary = resolveInsideRepo(
      join('.build', 'plans', `${state.values.workflow_artifact_prefix || state.values.slug}-implementation-summary.md`),
      state.repoRoot,
      'implementation summary',
      { mustExist: true },
    );
    const ledger = resolveInsideRepo(
      join(evidenceDir || join('.build', 'evidence', loaded.contract.slug), 'ledger.json'),
      state.repoRoot,
      'evidence ledger',
      { mustExist: true },
    );
    subjects = {
      contract: sha256(readFileSync(loaded.contractPath)),
      'evidence-ledger': sha256(readFileSync(ledger)),
      'implementation-summary': sha256(readFileSync(summary)),
      plan: sha256(readFileSync(paths.plan)),
      repository: repository.fingerprint,
      requirements: sha256(readFileSync(paths.requirements)),
    };
    mechanicalFacts = await verifyFacts({
      authored,
      contract: loaded.contract,
      evidenceDir,
      loaded,
      paths,
      repository,
      state,
    });
  } else {
    subjects = {
      contract: sha256(readFileSync(loaded.contractPath)),
      context: sha256(readFileSync(paths.context)),
      plan: sha256(readFileSync(paths.plan)),
      repository: repository.fingerprint,
      requirements: sha256(readFileSync(paths.requirements)),
    };
  }
  assertSubjects(authored, subjects);
  const core = receiptCore({
    artifact: { path: artifactFile, source },
    authored,
    contract: loaded.contract,
    repository,
    state,
    subjects,
    mechanicalFacts,
  });
  const receiptId = sha256(canonicalJson(core));
  const withId = { ...core, receipt_id: receiptId };
  const receipt = {
    ...withId,
    receipt_hash: sha256(canonicalJson(withId)),
  };
  const directory = resolveInsideRepo(
    receiptsDir || join('.build', 'result-receipts'),
    state.repoRoot,
    'result receipts directory',
  );
  const receiptPath = join(directory, `${receiptId}.json`);
  writeImmutableJson(receiptPath, receipt, {
    collisionCode: 'E_RESULT_RECEIPT_COLLISION',
    collisionMessage: `Immutable phase-result receipt collision at ${receiptPath}.`,
  });
  return {
    allowed_next_phase: receipt.allowed_next_phase,
    phase: receipt.phase,
    receipt_hash: receipt.receipt_hash,
    receipt_id: receipt.receipt_id,
    receipt_path: relative(state.repoRoot, receiptPath).split('\\').join('/'),
    status: 'compiled',
    verdict: receipt.verdict,
  };
}
