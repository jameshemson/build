import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ROOT } from './utils.js';

const ORCHESTRATOR_PATH = 'source/skills/build/SKILL.codex.md';
const SCHEMA_PATH = 'source/skills/build/reference/state-schema.md';

const STATE_EVIDENCE = [
  '`provisional_complexity` | `simple`, `standard`, or `complex`',
  '`complexity` | final `simple`, `standard`, or `complex`',
  '`model_routes` | map of phase or role to requested model + effort',
  '`model_fallback` | append-only entries',
  'never (audit trail); omit when no fallback occurred',
  '`agent_progress` | map keyed by agent label',
  '`STARTED`/`EDITING`/`VERIFYING` stage',
  '`dispatched_at`',
  'immutable `deadline_at`',
  '`last_checked_at`',
  '`last_evidence_at`',
  '`evidence_free_checks`',
  '`deadline_status_requested_at`, initialized to `null`',
  'orphaned handoff',
];

const BEHAVIORS = [
  ['five-phase state machine', 'exactly five active phases'],
  ['root-only mutation ownership', 'Only root may:'],
  ['clean-tree branch preflight', 'branch creation requires a clean tree'],
  ['initial state before delegation', 'Immediately create an initial `phase: plan` state'],
  ['resume protocol', 'On resume, validate that every artifact'],
  ['abort protocol', 'Never delete workflow evidence'],
  ['circuit breakers', 'Never increase a limit, skip a phase, or hide a failure'],
  ['companion delegation', 'Tell the subagent to invoke the named skill'],
  ['inline companion fallback', "run that skill's documented contract inline"],
  ['disjoint shared-workspace writers', 'Concurrent writer agents are\nallowed only when their assigned file sets are disjoint'],
  ['adaptive route table', '| `complex` | 6+ files, multiple workstreams, high risk, or cross-cutting | `gpt-5.6-sol`, `xhigh` | `gpt-5.6-sol`, `high` | `gpt-5.6-luna`, `max` |'],
  ['model fallback lifecycle', 'Historical fallback entries are never cleared'],
  ['implementation skill recursion guard', 'Implementation workers must not invoke `impl-plan`'],
  ['adaptive implementation dispatch', 'routed implementation model and effort'],
  ['structured agent progress', 'Require these milestone messages at boundaries'],
  ['bounded progress monitoring', 'At intervals of no more than 60'],
  ['universal deadline supervision', 'writer with or without edits, explorer, companion, reviewer, or mid-review'],
  ['fixed deadline grace', 'exactly one 60-second grace interval'],
  ['workstream batching', 'Never spawn one writer per manifest task.'],
  ['root workstream membership validation', 'every manifest ID in exactly one named workstream'],
  ['layered test ownership', 'Wave 0 collects the fastest targeted evidence'],
  ['artifact-before-state transitions', 'Always write and validate the artifact needed by the next phase before updating\n`phase`'],
  ['completion route disclosure', 'requested model\nroutes and every `model_fallback` (or explicitly `none`)'],
];

function readRel(path) {
  return readFileSync(join(ROOT, path), 'utf8');
}

function assertInOrder(content, needles, message) {
  let cursor = -1;
  for (const needle of needles) {
    const next = content.indexOf(needle, cursor + 1);
    assert.ok(next >= 0, `${message}: missing ${JSON.stringify(needle)}`);
    assert.ok(next > cursor, `${message}: ${JSON.stringify(needle)} is out of order`);
    cursor = next;
  }
}

export function assertCodexOrchestrator(content) {
  for (const [behavior, evidence] of BEHAVIORS) {
    assert.ok(content.includes(evidence), `orchestrator must retain ${behavior}`);
  }

  const phases = [...content.matchAll(/^## Phase \d+: (.+)$/gm)].map((match) => match[1]);
  assert.deepEqual(phases, ['Plan', 'Review', 'Implement', 'Verify', 'Architect review']);

  assertInOrder(content, [
    '`git status --porcelain`',
    '`git rev-parse HEAD`',
    '`git switch -c build/{slug}`',
  ], 'clean-tree preflight');
  assertInOrder(content, [
    '`git switch -c build/{slug}`',
    'Immediately create an initial `phase: plan` state',
    'Apply the complexity fan-out limits to Luna/`max` read-only exploration',
  ], 'durable state before delegation');

  const progress = content.slice(
    content.indexOf('## Agent progress protocol'),
    content.indexOf('## Artifact-before-state invariant'),
  );
  for (const field of [
    'dispatched_at',
    'deadline_at',
    'last_checked_at',
    'last_evidence_at',
    'evidence_free_checks',
    'deadline_status_requested_at',
  ]) {
    assert.ok(progress.includes('`' + field + '`'), `agent progress must persist ${field}`);
  }
  assert.match(progress, /`deadline_status_requested_at: null`/);
  assert.doesNotMatch(progress, /optional `deadline_status_requested_at`/);
  assert.match(progress, /After two consecutive evidence-free checks[\s\S]*structured status request/);
  assert.match(progress, /Status replies and[\s\S]*root\s+polling never extend `deadline_at`/);
  assertInOrder(progress, [
    'At `deadline_at`',
    'exactly one deadline status request',
    'exactly one 60-second grace interval',
    'interrupt it',
  ], 'deadline watchdog sequence');
  assert.doesNotMatch(progress, /If an agent has made/);
  assert.doesNotMatch(progress, /bounded grace interval/);

  assert.match(content, /simple uses\s+no explorer, standard uses at most two, and complex uses at most three/);
  assert.match(content, /Every explorer\s+has the default five-minute runtime/);
  assert.match(content, /Group each\s+workstream's ready frontier[\s\S]*fewest bounded batches/);
  assert.match(content, /every manifest ID in exactly one named workstream[\s\S]*every\s+workstream ID to exist[\s\S]*file set to equal the union/);
  assert.match(content, /one or more IDs[\s\S]*union of owned files/);
  assert.match(content, /Workers run scoped owned-file\/task checks[\s\S]*never the\s+full suite/);
  assert.match(content, /Phase 4 owns one fresh full-suite result/);

  for (const [phase, skill] of [
    ['plan', 'impl-plan'],
    ['review', 'review-plan'],
    ['verify', 'verify'],
    ['architect-review', 'architect-review'],
  ]) {
    assert.ok(
      content.includes('- ' + phase + ': `' + skill + '`'),
      `orchestrator must delegate ${skill}`,
    );
  }

  for (const [complexity, planEffort, implementModel, implementEffort] of [
    ['simple', 'medium', 'gpt-5.6-luna', 'max'],
    ['standard', 'high', 'gpt-5.6-sol', 'medium'],
    ['complex', 'xhigh', 'gpt-5.6-sol', 'high'],
  ]) {
    assert.match(content, new RegExp(
      '\\| `' + complexity + '` .*\\| `gpt-5\\.6-sol`, `' + planEffort + '` \\| `' +
        implementModel.replaceAll('.', '\\.') + '`, `' + implementEffort +
        '` \\| `gpt-5\\.6-luna`, `max` \\|',
    ), `orchestrator must route ${complexity}`);
  }

  const implementPhase = content.slice(
    content.indexOf('## Phase 3: Implement'),
    content.indexOf('## Phase 4: Verify'),
  );
  assert.ok(
    !implementPhase.includes('routed Sol effort'),
    'orchestrator must not hard-code Sol in adaptive implementation dispatch',
  );

  assertInOrder(content, [
    'Save `{slug}-review.md` before state changes.',
    'transition to `implement`',
  ], 'review artifact transition');
  assertInOrder(content, [
    'validate the final implementation summary',
    'transition to `verify`',
  ], 'implementation artifact transition');
  assertInOrder(content, [
    'Save `{slug}-verify.md` before changing state.',
    'transition to `architect-review`',
  ], 'verify artifact transition');
  assertInOrder(content, [
    'Save `{slug}-architect-review.md` before changing state.',
    'transition to terminal `complete`',
  ], 'architect artifact transition');
}

function withoutBehavior(content, evidence) {
  assert.ok(content.includes(evidence), `fixture evidence missing: ${evidence}`);
  return content.replace(evidence, '');
}

function assertStateSchema(schema) {
  for (const evidence of STATE_EVIDENCE) {
    assert.ok(schema.includes(evidence), `state schema missing ${JSON.stringify(evidence)}`);
  }
}

test('production Codex source satisfies the orchestrator contract', () => {
  assertCodexOrchestrator(readRel(ORCHESTRATOR_PATH));
});

test('production state schema carries Codex routing lifecycles', () => {
  assertStateSchema(readRel(SCHEMA_PATH));
});

test('installed-skill smoke requires terminal complete state', () => {
  const smoke = readRel('scripts/smoke-codex-build.js');
  assert.ok(smoke.includes("const phase = state.content.match(/^phase:\\s*(\\S+)/m)?.[1] ?? null"));
  assert.ok(smoke.includes("if (phase !== 'complete')"));
  assert.ok(smoke.includes('workflow_phase: phase'));
});

for (const [behavior, evidence] of BEHAVIORS) {
  test(`negative fixture removing ${behavior} is rejected by orchestrator contract`, () => {
    const fixture = withoutBehavior(readRel(ORCHESTRATOR_PATH), evidence);
    assert.throws(() => assertCodexOrchestrator(fixture), new RegExp(behavior));
  });
}

test('negative fixture making the deadline request field optional is rejected', () => {
  const content = readRel(ORCHESTRATOR_PATH);
  const fixture = content.replace(
    '`deadline_status_requested_at: null`',
    'optional `deadline_status_requested_at`',
  );
  assert.throws(() => assertCodexOrchestrator(fixture), /deadline_status_requested_at: null/);
});

for (const field of [
  '`dispatched_at`',
  'immutable `deadline_at`',
  '`last_checked_at`',
  '`last_evidence_at`',
  '`evidence_free_checks`',
  '`deadline_status_requested_at`, initialized to `null`',
]) {
  test(`negative state fixture removing ${field} is rejected`, () => {
    const schema = readRel(SCHEMA_PATH);
    assert.ok(schema.includes(field), `state fixture missing ${field}`);
    const fixture = schema.replaceAll(field, '');
    assert.throws(() => assertStateSchema(fixture), /state schema missing/);
  });
}
