import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ROOT } from './utils.js';

const REQUIRED_TERMS = {
  'source/skills/impl-plan/SKILL.md': [
    'Discovery level',
    'quick_verify',
    'standard_research',
    'deep_dive',
    'Requirements and decisions',
    'Wave 0 validation design',
    'execution_manifest',
    'files_modified',
    'must_haves',
    'depends_on',
    'Workflow artifacts',
    'UI contract',
    'model: opus',
    'Tier: compact',
    'Task IDs',
    'evidence and completion units',
    'Saving the plan',
  ],
  'source/skills/review-plan/SKILL.md': [
    'REQ-',
    'D-',
    'Wave 0',
    'execution_manifest',
    'wave graph',
    'files_modified',
    'must_haves',
    'required artifact',
    'Tier: compact',
    'one writer per manifest task',
    'concurrent writer agents',
  ],
  'source/skills/build/SKILL.md': [
    'base_ref',
    'git rev-parse HEAD',
    'execution_manifest',
    'completed_tasks',
    'depends_on',
    '{slug}-context.md',
    '{slug}-requirements.md',
    '{slug}-implementation-summary.md',
    'state-schema.md',
    'Multiple state files',
    'aborted',
    'git status --porcelain',
    'build/{slug}',
    'Never push',
    'Proceed with fixes',
    'uncovered_requirements',
    'review_fixes_applied',
  ],
  'source/skills/build/SKILL.codex.md': [
    'exactly five active phases',
    'Root-only mutation boundary',
    'git status --porcelain',
    'git rev-parse HEAD',
    'git switch -c build/{slug}',
    'provisional_complexity',
    'simple',
    'standard',
    'complex',
    'model_routes',
    'model_fallback',
    'gpt-5.6-sol',
    'gpt-5.6-luna',
    '`xhigh`',
    '`max`',
    'Companion-skill delegation',
    'run that skill\'s documented contract inline',
    'Concurrent writer agents',
    'Agent progress protocol',
    'agent_progress',
    'deadline_status_requested_at',
    'exactly one 60-second grace interval',
    'Never spawn one writer per manifest task',
    'STARTED',
    'EDITING',
    'VERIFYING',
    'handoff-timeout',
    'Implementation workers must not invoke',
    'Artifact-before-state invariant',
    'Immediately create an initial `phase: plan` state',
    'routed implementation model and effort',
    'requested model',
    'routes and every `model_fallback`',
    'Resume',
    'Abort',
    'Circuit breakers',
    'Never merge to the user\'s branch',
  ],
  'source/skills/verify/SKILL.md': [
    'execution_manifest',
    'uncovered requirements',
    'PARTIAL',
    'must_haves',
    '{slug}-implementation-summary.md',
    'N/A - standalone verification',
    'same conversation',
    'stale or unrelated',
    'exact-command ledger',
    'same invocation',
    'task IDs',
    'git status --short',
    'git diff --name-only',
    'vitest run',
  ],
  'source/skills/architect-review/SKILL.md': [
    'base_ref',
    'files_modified',
    'review target',
    'git status --short',
    'git diff HEAD',
    '## Verification Report',
    'skipped tests',
    'assertion-free tests',
    'tautological',
    '{slug}-architect-review.md',
    'current conversation',
    'standalone review',
    'Archived plans',
    'stale or unrelated',
    'model: opus',
    'Forces FAIL',
  ],
};

const HARD_LINE_LIMITS = {
  'source/skills/build/SKILL.md': 320,
  'source/skills/build/SKILL.codex.md': 300,
  'source/skills/impl-plan/SKILL.md': 230,
  'source/skills/review-plan/SKILL.md': 160,
  'source/skills/verify/SKILL.md': 150,
  'source/skills/architect-review/SKILL.md': 130,
  'source/skills/impl-plan/reference/plan-quality.md': 220,
};

function readRel(path) {
  return readFileSync(join(ROOT, path), 'utf8');
}

function lineCount(content) {
  return content.split('\n').length - (content.endsWith('\n') ? 1 : 0);
}

function assertRequiredTerms(content, terms, path) {
  for (const term of terms) {
    assert.ok(
      content.includes(term),
      `${path} must include required contract term ${JSON.stringify(term)}`,
    );
  }
}

function assertWorkstreamRoutingContents(planner, quality, reviewer) {
  assert.match(planner, /Task IDs[\s\S]*evidence and completion units[\s\S]*fewest safe workstream batches/);
  assert.match(quality, /exactly one workstream[\s\S]*union of `files_modified`[\s\S]*disjoint file unions/);
  assert.match(reviewer, /Missing, duplicate, or unknown task membership is \*\*Important\*\*/);
  assert.match(reviewer, /extra or missing file is \*\*Critical\*\*/);
  assert.match(reviewer, /one writer per manifest task[\s\S]*\*\*Important\*\*/);
}

function assertWorkstreamRouting() {
  assertWorkstreamRoutingContents(
    readRel('source/skills/impl-plan/SKILL.md'),
    readRel('source/skills/impl-plan/reference/plan-quality.md'),
    readRel('source/skills/review-plan/SKILL.md'),
  );
}

function assertVerifyCommandLedger(content) {
  const collect = content.indexOf('Collect every command candidate before executing anything');
  const execute = content.indexOf('### 3. Execute the ledger once');
  assert.ok(collect >= 0 && execute > collect, 'ledger candidates must be collected before execution');
  assert.match(content, /Key the ledger by the exact\s+command string; do not normalize/);
  assert.match(content, /union its detected categories, task IDs, `requirements`, and `must_haves`/);
  assert.match(content, /Run each exact command once/);
  assert.match(content, /same invocation[\s\S]*after the latest code, dependency, or content change/);
  assert.match(content, /prior-invocation output never substitutes/);
  assert.match(content, /git status --short[\s\S]*git diff --name-only/);
  assert.match(content, /later content change[\s\S]*earlier entries stale/);
}

test('source skills retain required execution-contract terms', () => {
  for (const [path, terms] of Object.entries(REQUIRED_TERMS)) {
    assertRequiredTerms(readRel(path), terms, path);
  }
});

test('required-term contract fails when a term is missing', () => {
  assert.throws(
    () => assertRequiredTerms('Discovery level\nexecution_manifest\n', [
      'Discovery level',
      'must_haves',
    ], 'fixture/SKILL.md'),
    /must include required contract term "must_haves"/,
  );
});

test('impl-plan execution_manifest example includes a routable task shape', () => {
  const content = readRel('source/skills/impl-plan/SKILL.md');
  const match = content.match(/```yaml\n([\s\S]*?execution_manifest:[\s\S]*?)```/);
  assert.ok(match, 'impl-plan must include a fenced yaml execution_manifest example');

  const manifest = match[1];
  for (const field of [
    '- id: T-001',
    'wave:',
    'depends_on:',
    'files_modified:',
    'requirements:',
    'must_haves:',
    'verify:',
    'done:',
  ]) {
    assert.ok(
      manifest.includes(field),
      `execution_manifest example must include ${JSON.stringify(field)}`,
    );
  }
});

test('portable planning contracts require exact task-to-workstream routing', () => {
  assertWorkstreamRouting();
});

test('verify uses one fresh exact-command ledger across all evidence sources', () => {
  assertVerifyCommandLedger(readRel('source/skills/verify/SKILL.md'));
});

for (const [path, phrase] of [
  ['source/skills/impl-plan/SKILL.md', 'Task IDs'],
  ['source/skills/impl-plan/SKILL.md', 'evidence and completion units'],
  ['source/skills/impl-plan/reference/plan-quality.md', 'exactly one workstream'],
  ['source/skills/review-plan/SKILL.md', 'one writer per manifest task'],
]) {
  test(`routing contract rejects removal of ${phrase}`, () => {
    const paths = [
      'source/skills/impl-plan/SKILL.md',
      'source/skills/impl-plan/reference/plan-quality.md',
      'source/skills/review-plan/SKILL.md',
    ];
    const originals = paths.map(readRel);
    const index = paths.indexOf(path);
    assert.ok(originals[index].includes(phrase), `routing fixture missing ${phrase}`);
    const fixture = [...originals];
    fixture[index] = fixture[index].replace(phrase, '');
    assert.throws(() => assertWorkstreamRoutingContents(...fixture));
  });
}

for (const phrase of [
  'Collect every command candidate before executing anything',
  'exact command once',
  'same invocation',
  'earlier entries stale',
]) {
  test(`verification ledger rejects removal of ${phrase}`, () => {
    const content = readRel('source/skills/verify/SKILL.md');
    assert.ok(content.includes(phrase), `ledger fixture missing ${phrase}`);
    assert.throws(() => assertVerifyCommandLedger(content.replace(phrase, '')));
  });
}

test('architect-review resolves chat/workflow context before stopping for missing verification', () => {
  const content = readRel('source/skills/architect-review/SKILL.md');
  const contextIndex = content.indexOf('First identify both the review target and verification evidence');
  const standaloneIndex = content.indexOf('Use the user\'s request as the review brief');
  const stopIndex = content.indexOf('Cannot review unverified work');

  assert.ok(contextIndex >= 0, 'architect-review must start by resolving review context');
  assert.ok(standaloneIndex >= 0, 'architect-review must define standalone chat review input');
  assert.ok(stopIndex >= 0, 'architect-review must retain the unverified-work stop');
  assert.ok(
    contextIndex < stopIndex,
    'architect-review must resolve context before the verification stop',
  );
  assert.ok(
    standaloneIndex < stopIndex,
    'architect-review must consider chat-provided review targets before the verification stop',
  );
});

test('source skills stay below hard prompt-size ceilings', () => {
  for (const [path, limit] of Object.entries(HARD_LINE_LIMITS)) {
    const lines = lineCount(readRel(path));
    assert.ok(
      lines <= limit,
      `${path} has ${lines} lines, exceeding hard ceiling ${limit}`,
    );
  }
});
