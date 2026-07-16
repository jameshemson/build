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
    'agent_routes',
    'agent_selection_fallback',
    'Build agent routing',
    'profile-owned',
    'fork_turns: "none"',
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
    'effective `implement` route',
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
    'policy literal',
    'unreferenced-actionable',
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

function assertAbstractionJustificationContents(planner, quality, reviewer, architect) {
  const approach = planner.match(/### Approach\n([\s\S]*?)(?=\n### )/);
  assert.ok(approach, 'impl-plan must retain an Approach section');
  assert.match(approach[1], /When the plan proposes a new interface[\s\S]*factory[\s\S]*design pattern[\s\S]*abstraction layer/);
  assert.match(approach[1], /frontend[\s\S]*backend[\s\S]*CLI[\s\S]*tooling/);
  assert.match(approach[1], /present pain or a real axis of variation[\s\S]*simpler alternative and why it is insufficient[\s\S]*added indirection or maintenance cost/);
  assert.match(approach[1], /test seam[\s\S]*second real implementation[\s\S]*deliberate architectural boundary[\s\S]*qualitative examples, not a numeric threshold/);
  assert.match(approach[1], /Future flexibility alone is insufficient/);

  const selfReview = quality.match(/## Self-Review Checklist\n([\s\S]*)/);
  assert.ok(selfReview, 'plan-quality must retain the canonical Self-Review Checklist');
  assert.match(selfReview[1], /Abstraction justification/);
  assert.match(selfReview[1], /new interface[\s\S]*factory[\s\S]*design pattern[\s\S]*abstraction layer/);
  assert.match(selfReview[1], /frontend[\s\S]*backend[\s\S]*CLI[\s\S]*tooling/);
  assert.match(selfReview[1], /present pain or a real axis of variation[\s\S]*simpler alternative and why it is insufficient[\s\S]*added indirection or maintenance cost/);
  assert.match(selfReview[1], /test seam[\s\S]*second real implementation[\s\S]*deliberate architectural boundary[\s\S]*qualitative examples, not a numeric threshold/);
  assert.match(selfReview[1], /Future flexibility alone is insufficient/);

  assert.match(reviewer, /Inspect the plan's Approach[\s\S]*new interface[\s\S]*factory[\s\S]*design pattern[\s\S]*abstraction layer/);
  assert.match(reviewer, /frontend[\s\S]*backend[\s\S]*CLI[\s\S]*tooling/);
  assert.match(reviewer, /present pain or a real axis of variation[\s\S]*simpler alternative and why it is insufficient[\s\S]*added indirection or maintenance cost/);
  assert.match(reviewer, /Treat test seams[\s\S]*a second real implementation[\s\S]*a deliberate architectural boundary[\s\S]*qualitative examples[\s\S]*numeric threshold/);
  assert.match(reviewer, /Future flexibility alone is insufficient/);
  assert.match(reviewer, /Missing, incomplete, or speculative-only evidence is \*\*Important\*\*/);

  const lenses = architect.match(/## Review lenses\n([\s\S]*?)(?=\n## Manifest fidelity)/);
  assert.ok(lenses, 'architect-review must retain its Review lenses section');
  assert.deepEqual(
    [...lenses[1].matchAll(/^(\d+)\. /gm)].map((match) => Number(match[1])),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    'architect-review must retain exactly ten numbered review lenses',
  );
  const lensSeven = lenses[1].match(/^7\. ([\s\S]*?)(?=\n8\. )/m);
  assert.ok(lensSeven, 'architect-review lens 7 must retain the abstraction gate');
  assert.match(lensSeven[1], /constructs introduced in the review target/);
  assert.match(lensSeven[1], /new interface[\s\S]*factory[\s\S]*design pattern[\s\S]*abstraction layer/);
  assert.match(lensSeven[1], /frontend[\s\S]*backend[\s\S]*CLI[\s\S]*tooling/);
  assert.match(lensSeven[1], /present pain or a real axis of variation[\s\S]*simpler alternative and why it is insufficient[\s\S]*added indirection or maintenance cost/);
  assert.match(lensSeven[1], /A test seam, a second real implementation, and a deliberate architectural boundary are qualitative examples, not a numeric threshold\./);
  assert.match(lensSeven[1], /Future flexibility alone is insufficient/);
  assert.match(lensSeven[1], /unjustified abstraction is \*\*Important\*\*/);
}

function assertAbstractionJustification() {
  assertAbstractionJustificationContents(
    readRel('source/skills/impl-plan/SKILL.md'),
    readRel('source/skills/impl-plan/reference/plan-quality.md'),
    readRel('source/skills/review-plan/SKILL.md'),
    readRel('source/skills/architect-review/SKILL.md'),
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

function assertVerifyDebtClassification(content) {
  assert.match(content, /A \*\*policy literal\*\* uses the marker as input data/);
  assert.match(content, /scanner pattern, lint\/validation rule, explicit test\s+fixture, or documentation list of forbidden markers/);
  assert.match(content, /Quoting, backticks, or prose alone do\s+not make an unfinished-work marker a policy literal/);
  assert.match(content, /Policy literals need no issue ref/);
  assert.match(content, /unreferenced-actionable/);
  assert.match(content, /If any actionable marker is\s+unreferenced[\s\S]*final verdict is `FAILED`/);
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

test('portable review contracts gate new abstractions on current evidence', () => {
  assertAbstractionJustification();
});

test('verify uses one fresh exact-command ledger across all evidence sources', () => {
  assertVerifyCommandLedger(readRel('source/skills/verify/SKILL.md'));
});

test('verify distinguishes policy literals from actionable debt markers', () => {
  assertVerifyDebtClassification(readRel('source/skills/verify/SKILL.md'));
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

for (const [path, phrase] of [
  ['source/skills/impl-plan/SKILL.md', 'present pain or a real axis of variation'],
  ['source/skills/impl-plan/SKILL.md', 'qualitative examples, not a numeric threshold'],
  ['source/skills/impl-plan/reference/plan-quality.md', 'simpler alternative and why it is insufficient'],
  ['source/skills/impl-plan/reference/plan-quality.md', 'Future flexibility alone is insufficient'],
  ['source/skills/review-plan/SKILL.md', 'Inspect the plan\'s Approach'],
  ['source/skills/review-plan/SKILL.md', 'Treat test seams'],
  ['source/skills/review-plan/SKILL.md', 'Missing, incomplete, or speculative-only evidence is **Important**'],
  ['source/skills/architect-review/SKILL.md', 'constructs introduced in the review target'],
  ['source/skills/architect-review/SKILL.md', 'A test seam, a second real implementation, and a deliberate architectural boundary are qualitative examples, not a numeric threshold.'],
  ['source/skills/architect-review/SKILL.md', 'unjustified abstraction is **Important**'],
]) {
  test(`abstraction contract rejects removal of ${phrase}`, () => {
    const paths = [
      'source/skills/impl-plan/SKILL.md',
      'source/skills/impl-plan/reference/plan-quality.md',
      'source/skills/review-plan/SKILL.md',
      'source/skills/architect-review/SKILL.md',
    ];
    const originals = paths.map(readRel);
    const index = paths.indexOf(path);
    assert.ok(originals[index].includes(phrase), `abstraction fixture missing ${phrase}`);
    const fixture = [...originals];
    fixture[index] = fixture[index].replace(phrase, '');
    assert.throws(() => assertAbstractionJustificationContents(...fixture));
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

for (const phrase of [
  'uses the marker as input data',
  'Policy literals need no issue ref',
  'unreferenced-actionable',
  'If any actionable marker is',
]) {
  test(`debt classification rejects removal of ${phrase}`, () => {
    const content = readRel('source/skills/verify/SKILL.md');
    assert.ok(content.includes(phrase), `debt fixture missing ${phrase}`);
    assert.throws(() => assertVerifyDebtClassification(content.replaceAll(phrase, '')));
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
