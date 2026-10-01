import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BuildctlError } from '../../source/skills/build/buildctl/plan-contract.js';
import {
  CIRCUIT_LIMITS,
  evaluateCircuitEvents,
} from '../../source/skills/build/buildctl/counters.js';

function increments(kind, scope, count, prefix = `${kind}-${scope}`) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index + 1}`,
    kind,
    scope,
    action: 'increment',
  }));
}

function extend(kind, scope, id = `extend-${kind}-${scope}`, authorization = 'One more round') {
  return { id, kind, scope, action: 'extend', authorization };
}

function throwsCode(events, code) {
  assert.throws(
    () => evaluateCircuitEvents(events),
    (error) => error instanceof BuildctlError && error.code === code,
  );
}

test('counter extend: four plan_review increments halt at the base limit', () => {
  const result = evaluateCircuitEvents(increments('plan_review', 'plan', 4));
  assert.equal(result.status, 'halt');
  assert.equal(result.diagnostics.length, 1);
  const [diagnostic] = result.diagnostics;
  assert.equal(diagnostic.kind, 'plan_review');
  assert.equal(diagnostic.scope, 'plan');
  assert.equal(diagnostic.halt_at, 4);
  assert.equal(diagnostic.halt_reason, 'plan-review-limit');
});

test('counter extend: one extend raises the plan_review threshold by one in any order', () => {
  const grant = extend('plan_review', 'plan');
  const four = increments('plan_review', 'plan', 4);
  const five = increments('plan_review', 'plan', 5);

  assert.equal(evaluateCircuitEvents([grant, ...four]).status, 'allow');
  assert.equal(evaluateCircuitEvents([...four, grant]).status, 'allow');

  for (const events of [[grant, ...five], [...five, grant]]) {
    const result = evaluateCircuitEvents(events);
    assert.equal(result.status, 'halt');
    assert.equal(result.diagnostics.length, 1);
    assert.equal(result.diagnostics[0].kind, 'plan_review');
    assert.equal(result.diagnostics[0].scope, 'plan');
    assert.equal(result.diagnostics[0].halt_at, 5);
    assert.equal(result.diagnostics[0].halt_reason, 'plan-review-limit');
  }
});

test('counter extend: an extend on one scope does not raise another scope', () => {
  const result = evaluateCircuitEvents([
    extend('plan_review', 'plan'),
    ...increments('plan_review', 'other', 4),
  ]);
  assert.equal(result.status, 'halt');
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0].scope, 'other');
  assert.equal(result.diagnostics[0].halt_at, 4);
});

test('counter extend: only plan_review, phase_reentry, and fresh_judgment_retry accept extend', () => {
  const retryGrant = extend('fresh_judgment_retry', 'judgment:verify');
  const allowed = evaluateCircuitEvents([
    retryGrant,
    ...increments('fresh_judgment_retry', 'judgment:verify', 2),
  ]);
  assert.equal(allowed.status, 'allow');
  const halted = evaluateCircuitEvents([
    retryGrant,
    ...increments('fresh_judgment_retry', 'judgment:verify', 3),
  ]);
  assert.equal(halted.status, 'halt');
  assert.equal(halted.diagnostics[0].kind, 'fresh_judgment_retry');
  assert.equal(halted.diagnostics[0].halt_at, 3);

  const reentryGrant = extend('phase_reentry', 'phase:implement');
  assert.equal(evaluateCircuitEvents([
    reentryGrant,
    ...increments('phase_reentry', 'phase:implement', 4),
  ]).status, 'allow');
  const reentryHalt = evaluateCircuitEvents([
    reentryGrant,
    ...increments('phase_reentry', 'phase:implement', 5),
  ]);
  assert.equal(reentryHalt.status, 'halt');
  assert.equal(reentryHalt.diagnostics[0].halt_at, 5);

  for (const kind of ['agent_retry', 'scope_change', 'no_progress']) {
    throwsCode([extend(kind, 'workflow:a')], 'E_COUNTER_EVENT_ACTION');
  }
});

test('counter extend: extend requires a non-empty authorization', () => {
  const { authorization: _omitted, ...missing } = extend('plan_review', 'plan');
  throwsCode([missing], 'E_COUNTER_EVENT_SCHEMA');
  throwsCode([extend('plan_review', 'plan', 'extend-empty', '')], 'E_COUNTER_EVENT_SCHEMA');
});

test('counter extend: duplicate extend IDs count once and conflicting replay fails', () => {
  const grant = extend('plan_review', 'plan', 'extend-dup');
  const replay = extend('plan_review', 'plan', 'extend-dup');

  const allowed = evaluateCircuitEvents([...increments('plan_review', 'plan', 4), grant, replay]);
  assert.equal(allowed.status, 'allow');
  const halted = evaluateCircuitEvents([...increments('plan_review', 'plan', 5), grant, replay]);
  assert.equal(halted.status, 'halt');
  assert.equal(halted.diagnostics[0].halt_at, 5);

  throwsCode(
    [grant, extend('plan_review', 'plan', 'extend-dup', 'A different reason')],
    'E_COUNTER_EVENT_CONFLICT',
  );
});

test('counter extend: base limits and result shape are unchanged', () => {
  assert.deepEqual(CIRCUIT_LIMITS, {
    agent_retry: { halt_at: 3, halt_reason: 'agent-retry-limit' },
    fresh_judgment_retry: { halt_at: 2, halt_reason: 'phase-agent-failure' },
    phase_reentry: { halt_at: 4, halt_reason: 'phase-loop-limit' },
    plan_review: { halt_at: 4, halt_reason: 'plan-review-limit' },
    scope_change: { halt_at: 3, halt_reason: 'scope-change-limit' },
    no_progress: { halt_at: 2, halt_reason: 'no-progress-limit' },
  });
  const expectedKeys = ['counters', 'diagnostics', 'limits', 'status', 'unique_event_count'];
  assert.deepEqual(Object.keys(evaluateCircuitEvents([])), expectedKeys);
  const extended = evaluateCircuitEvents([
    extend('plan_review', 'plan'),
    ...increments('plan_review', 'plan', 2),
  ]);
  assert.deepEqual(Object.keys(extended), expectedKeys);
  assert.deepEqual(extended.limits, CIRCUIT_LIMITS);
  console.log('counter extend complete');
});
