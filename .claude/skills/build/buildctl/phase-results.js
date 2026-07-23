import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
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
import { captureRepositoryIdentity } from './repository.js';
import { loadWorkflowState } from './workflow-state.js';

const HEX_SHA256 = /^[a-f0-9]{64}$/;
const BASE_REF = /^[a-f0-9]{40}$/;
const PREFIX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESULT_FIELDS = ['findings', 'phase', 'schema_version', 'subjects', 'verdict'];
const SUBJECT_FIELDS = ['name', 'sha256'];
const FINDING_FIELDS = ['consequence', 'evidence', 'fix', 'id', 'severity', 'summary'];

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

function proseVerdict(source) {
  const matches = source.split(/\r?\n/).map((line) => line.trim().replace(/\.$/, '')).filter(
    (line) => [
      'Do not proceed',
      'Proceed to implementation',
      'Proceed with fixes',
    ].includes(line),
  );
  if (matches.length !== 1) {
    fail(
      'E_RESULT_VERDICT_MISMATCH',
      'artifact.prose_verdict',
      `Expected exactly one human-readable verdict line; found ${matches.length}.`,
    );
  }
  return {
    'Do not proceed': 'do_not_proceed',
    'Proceed to implementation': 'proceed',
    'Proceed with fixes': 'proceed_with_fixes',
  }[matches[0]];
}

function checkVerdict(result, source) {
  if (proseVerdict(source) !== result.verdict) {
    fail(
      'E_RESULT_VERDICT_MISMATCH',
      'artifact.machine_result.verdict',
      'Machine verdict does not match the human-readable verdict.',
    );
  }
  const severities = new Set(result.findings.map((finding) => finding.severity));
  const compatible = result.verdict === 'proceed'
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

function receiptCore({
  artifact,
  authored,
  contract,
  repository,
  state,
  subjects,
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
    mechanical_facts: {
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
  const subjects = {
    contract: sha256(readFileSync(loaded.contractPath)),
    context: sha256(readFileSync(paths.context)),
    plan: sha256(readFileSync(paths.plan)),
    repository: repository.fingerprint,
    requirements: sha256(readFileSync(paths.requirements)),
  };
  assertSubjects(authored, subjects);
  const core = receiptCore({
    artifact: { path: artifactFile, source },
    authored,
    contract: loaded.contract,
    repository,
    state,
    subjects,
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
