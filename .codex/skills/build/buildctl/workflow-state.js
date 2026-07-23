import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import {
  BuildctlError,
  findGitRoot,
  resolveInsideRepo,
  sha256,
} from './plan-contract.js';

const MACHINE_FIELDS = new Set([
  'active_slice',
  'base_ref',
  'checkpoint_commits',
  'completed_slices',
  'completed_tasks',
  'counter_events',
  'phase',
  'phase_result_bootstrap',
  'phase_result_references',
  'slug',
  'transition_history',
  'transition_references',
  'workflow_artifact_prefix',
]);

function fail(code, message) {
  throw new BuildctlError(code, message);
}

export function parseWorkflowState(source, { required = [] } = {}) {
  if (typeof source !== 'string') fail('E_STATE_SCHEMA', 'Workflow state must be text.');
  const values = {};
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    const match = /^([a-z_]+):[ \t]*(.*)$/.exec(line);
    if (!match || !MACHINE_FIELDS.has(match[1])) continue;
    const [, field, encoded] = match;
    if (Object.hasOwn(values, field)) {
      fail('E_STATE_DUPLICATE_FIELD', `Duplicate workflow state field ${field}.`);
    }
    if (!encoded) fail('E_STATE_JSON', `${field} must be a one-line JSON value.`);
    if (field === 'base_ref' && /^[a-f0-9]{40}$/.test(encoded)) {
      values[field] = encoded;
      continue;
    }
    try {
      values[field] = JSON.parse(encoded);
    } catch (error) {
      fail('E_STATE_JSON', `${field} on line ${index + 1} is not valid JSON: ${error.message}`);
    }
  }
  for (const field of required) {
    if (!MACHINE_FIELDS.has(field)) fail('E_STATE_SCHEMA', `Unsupported required field ${field}.`);
    if (!Object.hasOwn(values, field)) {
      fail('E_STATE_FIELD_MISSING', `Workflow state field ${field} is required.`);
    }
  }
  return values;
}

export function loadWorkflowState({ statePath, cwd = process.cwd(), required = [] } = {}) {
  if (!statePath) fail('E_ARGUMENT', 'statePath is required.');
  const repoRoot = findGitRoot(cwd);
  const path = resolveInsideRepo(statePath, repoRoot, 'workflow state', { mustExist: true });
  const source = readFileSync(path, 'utf8');
  return {
    path,
    relativePath: relative(repoRoot, path).split('\\').join('/'),
    repoRoot,
    sha256: sha256(Buffer.from(source)),
    source,
    values: parseWorkflowState(source, { required }),
  };
}
