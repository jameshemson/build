import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ROOT } from './utils.js';

const ORCHESTRATOR_PATH = 'source/skills/build/SKILL.codex.md';
const SCHEMA_PATH = 'source/skills/build/reference/state-schema.md';

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
  ['bounded progress monitoring', 'wait no longer than 60 seconds before listing agent status'],
  ['agent handoff watchdog', 'preserve its edits, record `handoff-timeout` in `agent_failures`'],
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
    'Run up to three parallel Luna/`max` read-only explorers',
  ], 'durable state before delegation');

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

test('production Codex source satisfies the orchestrator contract', () => {
  assertCodexOrchestrator(readRel(ORCHESTRATOR_PATH));
});

test('production state schema carries Codex routing lifecycles', () => {
  const schema = readRel(SCHEMA_PATH);
  for (const evidence of [
    '`provisional_complexity` | `simple`, `standard`, or `complex`',
    '`complexity` | final `simple`, `standard`, or `complex`',
    '`model_routes` | map of phase or role to requested model + effort',
    '`model_fallback` | append-only entries',
    'never (audit trail); omit when no fallback occurred',
    '`agent_progress` | map keyed by agent label',
    '`STARTED`/`EDITING`/`VERIFYING` stage',
  ]) {
    assert.ok(schema.includes(evidence), `state schema missing ${JSON.stringify(evidence)}`);
  }
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
