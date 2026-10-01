import { BuildctlError, canonicalJson } from './plan-contract.js';

export const CIRCUIT_LIMITS = Object.freeze({
  agent_retry: Object.freeze({ halt_at: 3, halt_reason: 'agent-retry-limit' }),
  fresh_judgment_retry: Object.freeze({ halt_at: 2, halt_reason: 'phase-agent-failure' }),
  phase_reentry: Object.freeze({ halt_at: 4, halt_reason: 'phase-loop-limit' }),
  plan_review: Object.freeze({ halt_at: 4, halt_reason: 'plan-review-limit' }),
  scope_change: Object.freeze({ halt_at: 3, halt_reason: 'scope-change-limit' }),
  no_progress: Object.freeze({ halt_at: 2, halt_reason: 'no-progress-limit' }),
});

const KINDS = Object.keys(CIRCUIT_LIMITS);
const ACTIONS = new Set(['extend', 'increment', 'reset']);
const EXTENDABLE = new Set(['plan_review', 'phase_reentry', 'fresh_judgment_retry']);

function compareText(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function fail(code, message) {
  throw new BuildctlError(code, message);
}

function normalizedLimits(value) {
  const source = value === undefined ? CIRCUIT_LIMITS : value;
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    fail('E_COUNTER_LIMIT_SCHEMA', 'limits must be an object.');
  }
  const keys = Object.keys(source).sort();
  if (canonicalJson(keys) !== canonicalJson([...KINDS].sort())) {
    fail('E_COUNTER_LIMIT_SCHEMA', `limits must define exactly: ${KINDS.join(', ')}.`);
  }
  return Object.fromEntries(KINDS.map((kind) => {
    const entry = source[kind];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      fail('E_COUNTER_LIMIT_SCHEMA', `limits.${kind} must be an object.`);
    }
    if (!Number.isInteger(entry.halt_at) || entry.halt_at < 1) {
      fail('E_COUNTER_LIMIT_SCHEMA', `limits.${kind}.halt_at must be a positive integer.`);
    }
    if (typeof entry.halt_reason !== 'string' || !entry.halt_reason) {
      fail('E_COUNTER_LIMIT_SCHEMA', `limits.${kind}.halt_reason must be non-empty.`);
    }
    return [kind, { halt_at: entry.halt_at, halt_reason: entry.halt_reason }];
  }));
}

function validatedEvent(value, index, exactLimits) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('E_COUNTER_EVENT_SCHEMA', `events[${index}] must be an object.`);
  }
  const event = structuredClone(value);
  if (typeof event.id !== 'string' || !event.id) {
    fail('E_COUNTER_EVENT_SCHEMA', `events[${index}].id must be non-empty.`);
  }
  if (!Object.hasOwn(exactLimits, event.kind)) {
    fail('E_COUNTER_KIND', `Unsupported counter event kind: ${JSON.stringify(event.kind)}.`);
  }
  if (!ACTIONS.has(event.action)) {
    fail('E_COUNTER_EVENT_ACTION', `Unsupported counter event action: ${JSON.stringify(event.action)}.`);
  }
  if (event.action === 'reset' && event.kind !== 'no_progress') {
    fail('E_COUNTER_EVENT_ACTION', 'Only no_progress events may reset a consecutive streak.');
  }
  if (event.action === 'extend') validateExtend(event, index);
  if (typeof event.scope !== 'string' || !event.scope) {
    fail('E_COUNTER_EVENT_SCHEMA', `events[${index}].scope must be non-empty.`);
  }
  return event;
}

function validateExtend(event, index) {
  if (!EXTENDABLE.has(event.kind)) {
    fail(
      'E_COUNTER_EVENT_ACTION',
      'Only plan_review, phase_reentry, and fresh_judgment_retry events may extend a limit.',
    );
  }
  if (typeof event.authorization !== 'string' || !event.authorization) {
    fail('E_COUNTER_EVENT_SCHEMA', `events[${index}].authorization must be non-empty for extend.`);
  }
}

function applyEvent(event, counters, extensions) {
  const table = event.action === 'extend' ? extensions : counters;
  const current = table[event.kind].get(event.scope) || 0;
  table[event.kind].set(event.scope, event.action === 'reset' ? 0 : current + 1);
}

function sortedEntries(map) {
  return [...map.entries()].sort(([left], [right]) => compareText(left, right));
}

function limitDiagnostics(counters, extensions, exactLimits) {
  const haltAt = (kind, scope) => exactLimits[kind].halt_at + (extensions[kind].get(scope) || 0);
  return KINDS.flatMap((kind) => sortedEntries(counters[kind])
    .map(([scope, count]) => [scope, count, haltAt(kind, scope)])
    .filter(([, count, threshold]) => count >= threshold)
    .map(([scope, count, threshold]) => ({
      code: 'E_COUNTER_LIMIT',
      count,
      halt_at: threshold,
      halt_reason: exactLimits[kind].halt_reason,
      kind,
      scope,
    })));
}

export function evaluateCircuitEvents(events, { limits } = {}) {
  if (!Array.isArray(events)) fail('E_COUNTER_EVENT_SCHEMA', 'events must be an array.');
  const exactLimits = normalizedLimits(limits);
  const counters = Object.fromEntries(KINDS.map((kind) => [kind, new Map()]));
  const extensions = Object.fromEntries(KINDS.map((kind) => [kind, new Map()]));
  const seen = new Map();

  for (const [index, value] of events.entries()) {
    const event = validatedEvent(value, index, exactLimits);
    const content = canonicalJson(event);
    if (seen.has(event.id)) {
      if (seen.get(event.id) !== content) {
        fail('E_COUNTER_EVENT_CONFLICT', `Counter event ID ${event.id} has conflicting content.`);
      }
      continue;
    }
    seen.set(event.id, content);
    applyEvent(event, counters, extensions);
  }

  const diagnostics = limitDiagnostics(counters, extensions, exactLimits);
  const serializedCounters = Object.fromEntries(KINDS.map((kind) => [
    kind,
    Object.fromEntries(sortedEntries(counters[kind])),
  ]));
  return {
    counters: serializedCounters,
    diagnostics,
    limits: exactLimits,
    status: diagnostics.length > 0 ? 'halt' : 'allow',
    unique_event_count: seen.size,
  };
}
