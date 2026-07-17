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

const DELIVERY_SLICE_FIELDS = [
  'id',
  'goal',
  'depends_on',
  'task_ids',
  'requirements',
  'must_haves',
  'verify',
  'done',
];

const DELIVERY_SLICE_ASSERTIONS = [
  'delivery-slices-valid',
  'catches-forward-slice-dependency',
  'catches-duplicate-or-missing-slice-membership',
  'catches-missing-slice-evidence',
  'catches-unjustified-foundation-slice',
];

const DELIVERY_SLICE_CONTRACT_TERMS = {
  'source/skills/impl-plan/SKILL.md': [
    'Execution manifest, Delivery slices, Parallel workstreams',
    'Each `S-###` entry has exactly `id`, `goal`, `depends_on`, `task_ids`, `requirements`, `must_haves`, `verify`, and `done`',
    'delivery slice → dependency waves → disjoint workstreams → `execution_manifest` tasks',
    'Wave 0 is global and excluded from slices',
    'every task in waves greater than 0 belongs to exactly one slice',
    '`depends_on` names only earlier slices',
    'Every task prerequisite must be Wave 0, in the same slice, or in a declared predecessor slice',
    'Ordinary work uses one slice',
    'dependency-ordered independently acceptable outcomes, materially distinct risk/recovery boundaries, or an integration checkpoint too broad to verify or recover coherently',
    'Task count, multiple workstreams, or one writer\'s runtime alone never force a split',
    'Each slice must be integrated and working at its boundary',
    'with exact evidence for its requirements and must-haves',
    'explains why a vertical slice is impossible, names the first consuming slice, and gives exact compatibility evidence',
  ],
  'source/skills/impl-plan/reference/plan-quality.md': [
    'Each entry has exactly `id`, `goal`, `depends_on`, `task_ids`, `requirements`, `must_haves`, `verify`, and `done`',
    'delivery slice → dependency waves → disjoint workstreams → execution-manifest tasks',
    'Wave 0 is global and must not appear in a slice',
    'Every task in waves greater than 0 belongs to exactly one slice',
    'Slice `depends_on` entries name existing earlier slices',
    'every task dependency must be in Wave 0, the same slice, or a declared predecessor slice',
    'Ordinary work uses one slice',
    'dependency-ordered independently acceptable outcomes, materially distinct risk/recovery boundaries, or an integration checkpoint too broad to verify or recover coherently',
    'Task count, multiple workstreams, and one writer\'s runtime are not sufficient reasons to split',
    'integrated and working at its boundary',
    'backed by exact verification for its named requirements and observable must-haves',
    'explains why a vertical slice is impossible, names its first consuming slice, and provides exact compatibility evidence',
  ],
  'source/skills/review-plan/SKILL.md': [
    'Wave 0 validation design, Delivery slices, Execution manifest',
    'What existing behavior changes, Delivery slices, Execution manifest',
    'Every slice must contain exactly these eight fields: `id`, `goal`, `depends_on`, `task_ids`, `requirements`, `must_haves`, `verify`, and `done`',
    '`delivery slice -> waves -> workstreams -> tasks`',
    'Wave 0 is validation design and belongs to no delivery slice',
    'Every manifest task with `wave > 0` must belong to exactly one slice',
    'Slice `depends_on` may name only declared earlier slices',
    'every task dependency must remain inside its own slice or its slice\'s transitive predecessor closure',
    'Judge slicing by delivery boundaries, not volume',
    'An unbounded single slice is **Important** when the plan contains multiple independently acceptable outcomes or distinct risk, recovery, or integration boundaries',
    'Artificial fragmentation is also **Important**',
    'horizontal file/layer splits, task count, multiple workstreams, or one writer runtime alone do not justify splitting',
    'verification that does not prove the slice goal is **Important**',
    'explains why a vertical first slice is impossible, names the first consuming slice, and provides compatibility evidence',
    'otherwise flag it as **Important**',
    'A missing, duplicate, unknown, or Wave 0 membership is **Critical**',
    'unsafe hierarchy or membership is **Critical**',
    'Forward references and cycles are **Critical**',
    'Any dependency leakage is **Critical**',
    'Missing fields, non-observable `goal`/`must_haves`/`done`',
  ],
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

function fencedYaml(content, root) {
  const blocks = [...content.matchAll(/```yaml\n([\s\S]*?)```/g)].map((match) => match[1]);
  const block = blocks.find((candidate) => candidate.split('\n').some(
    (line) => line === `${root}:`,
  ));
  assert.ok(block, `must include a fenced yaml ${root} block`);
  return block;
}

function parseYamlEntries(content, root) {
  const lines = fencedYaml(content, root).split('\n');
  const rootIndex = lines.indexOf(`${root}:`);
  const entries = [];
  let current = null;

  for (const line of lines.slice(rootIndex + 1)) {
    const firstField = line.match(/^  - ([a-z_]+):\s*(.*)$/);
    if (firstField) {
      current = { [firstField[1]]: firstField[2] };
      entries.push(current);
      continue;
    }
    const field = line.match(/^    ([a-z_]+):\s*(.*)$/);
    if (field && current) current[field[1]] = field[2];
  }

  return entries;
}

function yamlScalar(value) {
  return value.startsWith('"') ? JSON.parse(value) : value;
}

function yamlList(value) {
  assert.match(value, /^\[.*\]$/, `expected inline YAML list, received ${value}`);
  return JSON.parse(value);
}

function assertDeliverySliceContractsContents(planner, quality, reviewer) {
  const slices = parseYamlEntries(planner, 'delivery_slices');
  assert.equal(slices.length, 1, 'impl-plan sample must contain exactly one ordinary slice');
  assert.equal(yamlScalar(slices[0].id), 'S-001');
  assert.deepEqual(Object.keys(slices[0]).sort(), [...DELIVERY_SLICE_FIELDS].sort());

  const contents = {
    'source/skills/impl-plan/SKILL.md': planner,
    'source/skills/impl-plan/reference/plan-quality.md': quality,
    'source/skills/review-plan/SKILL.md': reviewer,
  };
  for (const [path, terms] of Object.entries(DELIVERY_SLICE_CONTRACT_TERMS)) {
    assertRequiredTerms(contents[path], terms, path);
  }

  assert.match(reviewer, /Missing fields, non-observable `goal`\/`must_haves`\/`done`, or verification that does not prove the slice goal is \*\*Important\*\*/);
  assert.match(reviewer, /unsafe hierarchy or membership is \*\*Critical\*\*/);
  assert.match(reviewer, /Any dependency leakage is \*\*Critical\*\*/);
}

function assertDeliverySliceContracts() {
  assertDeliverySliceContractsContents(
    readRel('source/skills/impl-plan/SKILL.md'),
    readRel('source/skills/impl-plan/reference/plan-quality.md'),
    readRel('source/skills/review-plan/SKILL.md'),
  );
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

test('portable planning and review skills retain the delivery-slice contract', () => {
  assertDeliverySliceContracts();
});

test('delivery-slice eval metadata and fixtures stay deterministic', () => {
  const evals = JSON.parse(readRel('source/skills/eval/evals.json')).evals;
  const grading = readRel('source/skills/eval/reference/grading.md');
  const clean = readRel('source/skills/eval/fixtures/clean-plan.md');
  const flawed = readRel('source/skills/eval/fixtures/flawed-delivery-slices-plan.md');

  for (const assertionId of DELIVERY_SLICE_ASSERTIONS) {
    const references = evals.flatMap((entry) => entry.assertions).filter(
      (candidate) => candidate === assertionId,
    );
    assert.equal(references.length, 1, `${assertionId} must have exactly one eval reference`);
    const headings = [...grading.matchAll(/^### ([a-z0-9-]+)$/gm)].filter(
      (match) => match[1] === assertionId,
    );
    assert.equal(headings.length, 1, `${assertionId} must have exactly one grading heading`);
  }

  const focusedEval = evals.find((entry) => entry.id === 'review-plan-catches-delivery-slice-flaws');
  assert.ok(focusedEval, 'focused delivery-slice review eval must exist');
  assert.equal(focusedEval.input_fixture, 'fixtures/flawed-delivery-slices-plan.md');
  assert.deepEqual(
    focusedEval.assertions.filter((id) => DELIVERY_SLICE_ASSERTIONS.includes(id)),
    DELIVERY_SLICE_ASSERTIONS.slice(1),
  );

  const cleanTasks = parseYamlEntries(clean, 'execution_manifest');
  const cleanSlices = parseYamlEntries(clean, 'delivery_slices');
  assert.equal(cleanSlices.length, 1);
  assert.equal(yamlScalar(cleanSlices[0].id), 'S-001');
  assert.deepEqual(Object.keys(cleanSlices[0]).sort(), [...DELIVERY_SLICE_FIELDS].sort());
  assert.deepEqual(yamlList(cleanSlices[0].task_ids), ['T-002', 'T-003']);
  const cleanMembership = cleanSlices.flatMap((slice) => yamlList(slice.task_ids));
  const waveZeroIds = cleanTasks.filter((task) => Number(task.wave) === 0).map(
    (task) => yamlScalar(task.id),
  );
  const implementationIds = cleanTasks.filter((task) => Number(task.wave) > 0).map(
    (task) => yamlScalar(task.id),
  );
  assert.deepEqual(waveZeroIds, ['T-001']);
  assert.deepEqual(implementationIds, ['T-002', 'T-003']);
  assert.ok(waveZeroIds.every((id) => !cleanMembership.includes(id)), 'Wave 0 must stay global');
  for (const id of implementationIds) {
    assert.equal(cleanMembership.filter((member) => member === id).length, 1, `${id} must appear once`);
  }

  const flawedSlices = parseYamlEntries(flawed, 'delivery_slices');
  const first = flawedSlices.find((slice) => yamlScalar(slice.id) === 'S-001');
  assert.ok(first, 'flawed fixture must contain S-001');
  assert.deepEqual(yamlList(first.depends_on), ['S-002']);
  const flawedMembership = flawedSlices.flatMap((slice) => yamlList(slice.task_ids));
  assert.equal(flawedMembership.filter((id) => id === 'T-002').length, 2);
  assert.equal(flawedMembership.filter((id) => id === 'T-003').length, 0);
  assert.deepEqual(yamlList(first.must_haves), []);
  assert.equal(yamlScalar(first.verify), 'inspect the changes');
  assert.equal(yamlScalar(first.done), 'foundation complete');
  assert.match(yamlScalar(first.goal), /Foundation-only/);
  assert.match(flawed, /No vertical-impossibility rationale, first consuming slice, or compatibility check is supplied/);
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

for (const [path, terms] of Object.entries(DELIVERY_SLICE_CONTRACT_TERMS)) {
  for (const phrase of terms) {
    test(`delivery-slice contract rejects removal of ${phrase}`, () => {
      const paths = Object.keys(DELIVERY_SLICE_CONTRACT_TERMS);
      const originals = paths.map(readRel);
      const index = paths.indexOf(path);
      assert.ok(originals[index].includes(phrase), `delivery-slice fixture missing ${phrase}`);
      const fixture = [...originals];
      fixture[index] = fixture[index].replace(phrase, '');
      assert.throws(() => assertDeliverySliceContractsContents(...fixture));
    });
  }
}

for (const field of DELIVERY_SLICE_FIELDS) {
  test(`delivery-slice sample rejects removal of ${field}`, () => {
    const planner = readRel('source/skills/impl-plan/SKILL.md');
    const sample = fencedYaml(planner, 'delivery_slices');
    const indentation = field === 'id' ? '  - ' : '    ';
    const line = new RegExp(`^${indentation}${field}:.*\\n`, 'm');
    assert.match(sample, line, `delivery-slice sample missing ${field}`);
    assert.throws(() => assertDeliverySliceContractsContents(
      planner.replace(sample, sample.replace(line, '')),
      readRel('source/skills/impl-plan/reference/plan-quality.md'),
      readRel('source/skills/review-plan/SKILL.md'),
    ));
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
