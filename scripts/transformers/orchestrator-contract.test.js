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
  '`agent_routes` | exactly six records',
  '`requested_agent: <opaque-name> | null`',
  '`source: invocation | AGENTS.md | build-default`',
  '`model_routes` | map of phase or role to requested model + effort',
  'literal `profile-owned`',
  'literal `active-session`',
  '`model_fallback` | append-only entries',
  'never (audit trail); omit when no fallback occurred',
  '`agent_selection_fallback` | append-only entries',
  '`selector-unavailable` or `selection-rejected`',
  'Resume inspection before routing validation is read-only',
  'Invalid routing preserves branch, state, history, and artifacts unchanged',
  '`agent_progress` | map keyed by agent label',
  '`supervision_mode: terminal-only`',
  '`dispatched_at`',
  'immutable `deadline_at`',
  '`terminal_status`',
  '`interrupt_outcome`',
  'orphaned handoff',
  '`compiled_contract` | generated contract path',
  '`evidence_ledger` | generated ledger path/hash',
  '`buildctl_fallback` | append-only entries',
  'runnable compiler, counter, evidence, and completion diagnostics never append fallback',
  '`checkpoint_commits` | one-line JSON array',
  '`transition_references` | one-line JSON array',
  '`transition_history` | one-line JSON array',
  '`counter_events` | append-only one-line JSON array',
  '`complete-slice` is the first program-owned transition decision',
  'Root is the only state and git writer',
];

const TYPED_STATE_EVIDENCE = [
  '`evidence_mode` | `typed` or `legacy-untyped`',
  '`bindings` | typed binding summary',
];

const TYPED_ORCHESTRATOR_EVIDENCE = [
  ['fresh typed state', 'Fresh workflows set `evidence_mode` to `typed` and start with `bindings: []`'],
  ['legacy classification', 'A missing mode on resume is `legacy-untyped`'],
  ['reopened-task upgrade', 'reopened tasks must upgrade to typed must-haves and bindings'],
  ['typed dispatch payload', 'each must-have `id`, `claim`, evidence `kind`, and `ref`'],
  ['structural boundary', 'changed files prove only structural claims'],
];

const BUILDCTL_ORCHESTRATOR_EVIDENCE = [
  ['bundled runtime resolution', 'Resolve the sibling `buildctl/cli.js` relative to this skill'],
  ['strict fallback boundary', 'A runnable `validate-plan` diagnostic or `run-evidence --check-only` failure is authoritative and never selects fallback'],
  ['generated authority separation', 'Markdown/YAML remains authored authority; `contract.json`, ledgers, and receipts are generated'],
  ['no mutation authority', 'buildctl never writes workflow state or mutates git'],
  ['bounded completion authority', '`complete-slice` may authorize exactly four state patch operations in an immutable receipt'],
  ['root applies completion', 'root alone validates and applies that allowed patch and owns every general phase transition'],
  ['state-fed counters', '`check-counters` evaluates root-recorded typed events'],
  ['plan compilation gate', '`buildctl validate-plan --plan .build/plans/{slug}-plan.md --out .build/contracts/{slug}/contract.json`'],
  ['review recompilation gate', 'Re-run `validate-plan` after every review edit'],
  ['root evidence execution', 'Root then runs `buildctl run-evidence` over every compiled exact command'],
  ['failed ledger judgment', 'a valid failed-command ledger still proceeds for Verify judgment'],
  ['receipt-only Verify', 'Verify runs only `run-evidence --check-only`'],
  ['no Verify command execution', 'without executing evidence commands'],
];

const ROUTING_KEYS = ['plan', 'review', 'explore', 'implement', 'verify', 'architect-review'];

const ROUTING_EVIDENCE = [
  ['exact route keys', 'The only public keys, in state order, are'],
  ['routing source boundaries', 'ends immediately before the next H2 heading or at EOF'],
  ['routing line grammar', '`^- ([^:]+):[ \\t]*(.*?)[ \\t]*$`'],
  ['routing rejection set', 'Reject the entire source mapping for a duplicate block, duplicate key, unknown key, non-list/nonblank content, or a value blank after trimming'],
  ['routing diagnostic identity', 'name the source and offending key when one exists'],
  ['routing value opacity', 'Preserve all remaining case, punctuation, quotes, and internal whitespace'],
  ['read-only route selection', 'State selection remains the first read-only operation'],
  ['mapping validation before mutation', 'Validate every applicable mapping completely before any mutation'],
  ['read-only resume inventory', 'Before routing validation, resume work is inventory only'],
  ['complete resume mutation barrier', 'Only after all applicable current routing validates may root switch branches, reconcile stale fields, remove a halt triplet, recover artifacts, replace named agent routes or resolve legacy routes, or mutate state/history.'],
  ['fresh route precedence', 'invocation > effective `AGENTS.md` > Build default'],
  ['no-map route boundary', 'With no mapping in either source, all six keys therefore use that null Build default'],
  ['six-record initial snapshot', 'Snapshot all six `agent_routes` records before delegation'],
  ['saved resume routes', 'saved `agent_routes` snapshot wins'],
  ['resume invocation override', 'replaces only its named keys with `source: invocation`'],
  ['resume route history', 'old and new records in `history`'],
  ['changed AGENTS ignored', 'Changes to `AGENTS.md` never alter a live snapshot'],
  ['invalid resume preservation', 'An invalid current invocation mapping leaves both state and history byte-for-byte unchanged'],
  ['legacy route resolution', 'A legacy state missing `agent_routes` resolves exactly once, only after all current input is valid'],
  ['opaque agent names', 'Agent names are opaque'],
  ['no profile mutation', 'Never discover, validate, normalize, alias, create, copy, edit, install, bundle, or overwrite agent profiles'],
  ['no reserved sentinel', '`default` is an ordinary selectable opaque name, not a sentinel'],
  ['custom route selection', 'request that exact agent type'],
  ['profile-owned model route', 'record its `model_routes` route as the literal `profile-owned`'],
  ['custom fork isolation', 'omit Build model and effort, set `fork_turns: "none"`'],
  ['no combined override', 'never combine named selection with a Build model/effort override'],
  ['build-default null boundary', 'never attempt named selection and never create `agent_selection_fallback`'],
  ['build-default fork isolation', 'with `fork_turns: "none"` because this is an explicit model/effort request'],
  ['selection absence or rejection', 'If a requested non-null selection is absent because the selector is unavailable, or is rejected'],
  ['selection fallback fields', '`timestamp`, `phase`, `role`, `requested_agent`, `actual_agent`, `fallback_route`, `reason`, and `detail`'],
  ['unreported actual agent', '`actual_agent: unknown` if unreported'],
  ['fallback route shape', '`fallback_route` names the Build model/effort route or inline'],
  ['selection fallback reasons', '`selector-unavailable` for a selector schema limitation or `selection-rejected` for the exact rejection'],
  ['selection fallback ordering', 'Append this entry before requesting the Build model route'],
  ['independent fallback ledgers', '`model_fallback` remains independent and is appended only if that subsequent model/effort request is unavailable'],
  ['execution failure distinction', 'A later execution failure follows normal `agent_failures` handling, never agent-selection fallback'],
  ['universal effective route', 'Every delegated explorer, fresh-context judge, custom-routed phase, and mid-review dispatch applies its effective role route'],
  ['successful custom implement boundary', 'A successful non-null custom selection remains `profile-owned` and omits Build model/effort.'],
  ['build-default phase authority boundary', 'inline phases use\nroot, while fresh phases request the route above'],
  ['completion agent disclosure', 'all six agent routes and sources, every `agent_selection_fallback` (or explicitly `none`)'],
  ['completion profile route disclosure', 'including literal `profile-owned` wherever selected'],
];

const BEHAVIORS = [
  ['five-phase state machine', 'exactly five active phases'],
  ['root-only mutation ownership', 'Only root may:'],
  ['clean-tree branch preflight', 'branch creation requires a clean tree'],
  ['initial state before delegation', 'Immediately create an initial `phase: plan` state'],
  ['resume protocol', 'On resume, validate that every artifact'],
  ['abort protocol', 'Never delete workflow evidence'],
  ['circuit breakers', 'Never increase a limit, skip a phase, or hide a failure'],
  ['provider phase authority', 'Build-default Plan, Implement, and Architect Review run inline in root; Plan Review and Verify use fresh-context agents'],
  ['custom route delegation', 'A valid non-null custom route explicitly opts that phase into delegation'],
  ['custom plan route boundary', 'a non-null custom `plan` route instead delegates\n`impl-plan` through the effective `plan` route'],
  ['disjoint shared-workspace writers', 'Concurrent writer agents are\nallowed only when their assigned file sets are disjoint'],
  ['root session recommendation', 'Recommend a `gpt-5.6-sol` session at `high` effort for normal complex Codex builds'],
  ['inline route disclosure', 'records their `model_routes` value as the literal `active-session`'],
  ['model fallback lifecycle', 'Historical fallback entries are never cleared'],
  ['implementation skill recursion guard', 'Implementation workers must not invoke `impl-plan`'],
  ['inline implementation default', 'Build-default implementation remains inline even when the plan has multiple batches'],
  ['terminal-only supervision', 'Silence is unknown, not failure evidence'],
  ['fresh judgment deadline', '20-minute hard deadline'],
  ['no child status prompts', 'send no child status prompts'],
  ['hard-expiry interrupt', 'interrupt only at hard expiry'],
  ['workstream batching', 'Never spawn one writer per manifest task.'],
  ['root workstream membership validation', 'every manifest ID in exactly one named workstream'],
  ['layered test ownership', 'Wave 0 collects the fastest targeted evidence'],
  ['artifact-before-state transitions', 'Always write and validate the artifact needed by the next phase before updating\n`phase`'],
  ['completion route disclosure', 'requested model routes and every `model_fallback` (or explicitly `none`)'],
];

const SLICE_ORCHESTRATOR_EVIDENCE = [
  ['initial fields before planning', '`delivery_slices: []`, `active_slice: null`, `completed_slices: []`'],
  ['resume through state schema', '`delivery_slices`/`active_slice`/`completed_slices` through the state schema'],
  ['accepted slice persistence', 'validate and persist the accepted slice definitions'],
  ['accepted-plan activation', 'first declared-order dependency-ready `active_slice` before implementation dispatch'],
  ['slice hierarchy', 'slice -> dependency waves -> disjoint workstreams -> `execution_manifest` tasks hierarchy'],
  ['active-only dispatch', 'Only the `active_slice` task IDs and their workstream batches may dispatch.'],
  ['failure successor block', 'A failure keeps the same active slice and blocks every successor.'],
  ['provisional slice evidence', 'Slice evidence is provisional and never substitutes for final verification.'],
  ['fresh whole-workflow Verify', 'run `verify` in a fresh-context agent as the fresh whole-workflow authority'],
  ['whole-diff Architect Review', 'Architect Review remains the whole-diff authority'],
];

const SLICE_STATE_EVIDENCE = [
  ['fresh slice initialization', 'Every fresh plan-phase state starts with one-line JSON `delivery_slices: []`, `active_slice: null`, `completed_slices: []`, `checkpoint_commits: []`, `transition_references: []`, `transition_history: []`, and `counter_events: []`'],
  ['accepted active slice before dispatch', 'After plan acceptance, persist the first declared-order incomplete slice whose `depends_on` IDs are all completed as `active_slice` before dispatch'],
  ['active task dispatch boundary', "only tasks in that slice's `task_ids` may dispatch"],
  ['checkpoint evidence and commit record', 'only after exact provisional evidence and summary, the root checkpoint commit, its full SHA in `checkpoint_commits` and exact summary marker, post-checkpoint fresh evidence receipts, and current accepted judgments'],
  ['idempotent crash reconciliation', 'immutable receipt and transition reference identity make an identical replay a no-op; a collision or drift blocks rather than duplicating completion or history'],
  ['task failure slice mapping', 'Map every named `T-###` failure or rework item through slice `task_ids`'],
  ['transitive reopen and clearing', 'Reopening a completed owning slice also reopens every transitive dependent: remove their IDs from `completed_slices`, remove all of their task IDs from `completed_tasks`, and activate the earliest reopened slice'],
  ['completed slice immutability', 'During ordinary re-plan, completed slice definitions and task membership are immutable; changes to either require reopening first'],
  ['legacy compatibility slice', 'place all remaining manifest tasks into one stable compatibility `S-###` slice and activate it'],
  ['legacy no-empty path', 'If no tasks remain, create no empty slice; initialize the three fields to their empty/null values, validate the implementation summary, and proceed to Verify only when that summary is complete'],
];

const SLICE_CHECKPOINT_COMPONENTS = [
  ['exact evidence', 'its exact `verify`/`must_haves` evidence'],
  ['implementation summary', 'update `{slug}-implementation-summary.md`'],
  ['root ownership', 'root makes'],
  ['checkpoint commit', 'the checkpoint commit'],
  ['checkpoint record', 'record the checkpoint'],
  ['post-checkpoint evidence', 'post-checkpoint `run-evidence`'],
  ['judgment artifact', 'judgment YAML'],
  ['completion decision', 'Run `complete-slice`'],
  ['root allowed patch', 'root validates the receipt and applies only'],
  ['slice completion', 'append the slice to `completed_slices`'],
  ['next activation', 'activate the next dependency-ready slice'],
];

const BOUNDED_EVIDENCE_CLAUSES = [
  {
    name: 'least-expansive interpretation',
    tokens: ['least-expansive reasonable interpretation'],
  },
  {
    name: 'material-delta investigation gate',
    tokens: [
      'investigate uncertainty only when',
      'materially change',
      'requested outcome',
      'scope',
      'authority',
      'significant risk',
    ],
  },
  {
    name: 'evidence consequence and fix finding gate',
    tokens: [
      'report a finding only when',
      'evidence',
      'plausible material consequence',
      'specific in-scope fix',
    ],
  },
  {
    name: 'claim-sized fresh evidence',
    tokens: ['smallest sufficient fresh evidence', 'claims actually made'],
  },
  {
    name: 'material completion stop',
    tokens: [
      'stop when',
      'requested outcome exists',
      'required direct verification passes',
      'nothing unresolved can materially change the result',
    ],
  },
  {
    name: 'boundedness mandatory-authority exception',
    tokens: [
      'boundedness never skips',
      'required phases',
      'worker',
      'integration',
      'slice',
      'final authorities',
      'exactly one fresh final ledger',
      'phase 4',
      'receipt judgment',
      'safety',
      'security',
      'data rigor',
      'scope change',
      'user-only decisions',
    ],
  },
];

const BOUNDED_CLAUSE_MAX_SPAN = 900;

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

function normalizePromptContract(content) {
  return content.replace(/\s+/g, ' ').trim().toLowerCase();
}

function normalizeContractWhitespace(content) {
  return content.replace(/\s+/g, ' ').trim();
}

function assertBoundedClause(content, clause, context = 'Codex orchestrator', after = -1) {
  const normalized = normalizePromptContract(content);
  let cursor = after;
  let first = -1;
  let lastEnd = -1;
  for (const token of clause.tokens) {
    const next = normalized.indexOf(token, cursor + 1);
    assert.ok(next >= 0, `${context} missing ${clause.name}: ${JSON.stringify(token)}`);
    if (first < 0) first = next;
    cursor = next;
    lastEnd = next + token.length;
  }
  assert.ok(
    lastEnd - first <= BOUNDED_CLAUSE_MAX_SPAN,
    `${context} has unbounded ${clause.name} clause`,
  );
  return lastEnd;
}

function assertBoundedEvidenceContract(content) {
  let cursor = -1;
  for (const clause of BOUNDED_EVIDENCE_CLAUSES) {
    cursor = assertBoundedClause(content, clause, 'Codex orchestrator', cursor);
  }
}

function assertResumeRoutingContract(content) {
  assertInOrder(content, [
    'State selection remains the first read-only operation',
    'Validate every applicable mapping completely before any mutation',
    '`git status --porcelain`',
  ], 'route validation before mutation');

  const resumeSection = content.slice(
    content.indexOf('## Resume, state, and agent-route selection'),
    content.indexOf('## Complexity and model routing'),
  );
  const resumeValidation = resumeSection.indexOf(
    'Validate every applicable mapping completely before any mutation',
  );
  assert.ok(resumeValidation >= 0, 'resume section must completely validate routing');
  const preValidation = resumeSection.slice(0, resumeValidation);
  for (const mutation of [
    'root switches to it',
    'Reconcile stale fields',
    'remove the halt triplet',
    'Recover from the last durable artifact',
  ]) {
    assert.ok(
      !preValidation.includes(mutation),
      `resume pre-validation inventory must not instruct mutation: ${mutation}`,
    );
  }
  assertInOrder(resumeSection, [
    'State selection remains the first read-only operation',
    'Before routing validation, resume work is inventory only',
    'Validate every applicable mapping completely before any mutation',
    'Only after all applicable current routing validates may root switch branches, reconcile stale fields, remove a halt triplet, recover artifacts, replace named agent routes or resolve legacy routes, or mutate state/history.',
  ], 'read-only selection and complete resume mutation barrier');

  const keyClause = content.match(/The only public keys, in state order, are ([^;]+);/)?.[1];
  assert.ok(keyClause, 'orchestrator must declare its public routing keys');
  const declaredKeys = [...keyClause.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
  assert.deepEqual(declaredKeys, ROUTING_KEYS, 'orchestrator must declare exact public routing keys');
  assert.match(content, /; `review` also governs mid-review\./);
}

function assertTerminalSupervisionContract(content) {
  const progress = content.slice(
    content.indexOf('## Codex execution and supervision'),
    content.indexOf('## Artifact-before-state invariant'),
  );
  for (const evidence of [
    '`dispatched_at`',
    '`deadline_at`',
    '`supervision_mode: terminal-only`',
    '`terminal_status`',
    '`interrupt_outcome`',
  ]) {
    assert.ok(progress.includes(evidence), `terminal supervision must persist ${evidence}`);
  }
  assert.match(progress, /Silence is unknown, not failure evidence/);
  assert.match(progress, /send no child status prompts/);
  assert.match(progress, /Fresh-context Plan Review and Verify agents get a 20-minute hard deadline/);
  assertInOrder(progress, [
    'At `deadline_at`',
    'interrupt only at hard expiry',
    'one fresh retry',
  ], 'terminal-only deadline sequence');
  for (const forbidden of [
    'STARTED',
    'EDITING',
    'VERIFYING',
    'evidence_free_checks',
    'deadline_status_requested_at',
    'structured status request',
    '60-second grace',
  ]) {
    assert.ok(!progress.includes(forbidden), `terminal supervision must omit ${forbidden}`);
  }
}

function assertDispatchModelArtifactContract(content) {
  assert.match(content, /simple uses\s+no explorer, standard uses at most two,\s+and complex uses at most three/);
  assert.match(content, /Every explorer\s+has the default five-minute runtime/);
  assert.match(content, /Group each\s+workstream's ready frontier[\s\S]*fewest bounded batches/);
  assert.match(content, /every manifest ID in exactly one named workstream[\s\S]*every\s+workstream ID to exist[\s\S]*file set to equal the union/);
  assert.match(content, /one or more IDs[\s\S]*union of owned files/);
  assert.match(content, /Workers run scoped owned-file\/task checks[\s\S]*never the\s+full suite/);
  assert.match(content, /Root's final evidence ledger owns each compiled exact command and the fresh full-suite result/);

  assert.match(content, /Build-default Plan, Implement, and Architect Review run inline in root; Plan Review and Verify use fresh-context agents/);
  assert.match(content, /Explicit non-null custom routes remain opt-in delegation for any phase/);
  assert.match(content, /Inline phases inherit the active root session; Build cannot downshift their model or effort/);
  assert.match(content, /Recommend a `gpt-5\.6-sol` session at `high` effort for normal complex Codex builds/);

  const implementPhase = content.slice(
    content.indexOf('## Phase 3: Implement'),
    content.indexOf('## Phase 4: Verify'),
  );
  assert.ok(
    !implementPhase.includes('routed Sol effort'),
    'orchestrator must not hard-code Sol in adaptive implementation dispatch',
  );
  assert.match(implementPhase, /Build-default implementation remains inline even when the plan has multiple batches/);
  assert.match(implementPhase, /[Ss]uccessful non-null\s+custom selection remains `profile-owned` and omits Build model\/effort/);
  assert.match(implementPhase, /A\s+non-null custom `implement` route may delegate a bounded, disjoint batch/);
  for (const [start, end, forbidden] of [
    ['## Phase 1: Plan', '## Phase 2: Review', /Luna|Sol/],
    ['## Phase 2: Review', '## Phase 3: Implement', /Luna|Sol/],
    ['## Phase 4: Verify', '## Phase 5: Architect review', /Luna|Sol/],
    ['## Phase 5: Architect review', '## Abort', /Luna|Sol/],
  ]) {
    const section = content.slice(content.indexOf(start), content.indexOf(end));
    assert.doesNotMatch(section, forbidden, `${start} must use the effective route, not a profile name`);
  }

  assertInOrder(normalizeContractWhitespace(content), [
    'agent_selection_fallback` with `timestamp`',
    'Append this entry before requesting the Build model route',
    '`model_fallback` remains independent',
  ], 'selection fallback before model fallback');

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

function assertDeliverySliceOrchestratorContract(content) {
  const normalized = normalizeContractWhitespace(content);
  for (const [behavior, evidence] of SLICE_ORCHESTRATOR_EVIDENCE) {
    assert.ok(
      normalized.includes(normalizeContractWhitespace(evidence)),
      `delivery-slice orchestrator missing ${behavior}`,
    );
  }
  const implement = content.slice(
    content.indexOf('## Phase 3: Implement'),
    content.indexOf('## Phase 4: Verify'),
  );
  assertInOrder(
    implement,
    SLICE_CHECKPOINT_COMPONENTS.map(([, evidence]) => evidence),
    'delivery-slice checkpoint order',
  );
}

export function assertCodexOrchestrator(content) {
  const normalized = normalizeContractWhitespace(content);
  for (const [behavior, evidence] of BEHAVIORS) {
    assert.ok(
      normalized.includes(normalizeContractWhitespace(evidence)),
      `orchestrator must retain ${behavior}`,
    );
  }
  for (const [behavior, evidence] of ROUTING_EVIDENCE) {
    assert.ok(
      normalized.includes(normalizeContractWhitespace(evidence)),
      `orchestrator must retain ${behavior}`,
    );
  }
  for (const [behavior, evidence] of TYPED_ORCHESTRATOR_EVIDENCE) {
    assert.ok(
      normalized.includes(normalizeContractWhitespace(evidence)),
      `orchestrator must retain typed evidence ${behavior}`,
    );
  }
  for (const [behavior, evidence] of BUILDCTL_ORCHESTRATOR_EVIDENCE) {
    assert.ok(
      normalized.includes(normalizeContractWhitespace(evidence)),
      `orchestrator must retain buildctl ${behavior}`,
    );
  }

  const phases = [...content.matchAll(/^## Phase \d+: (.+)$/gm)].map((match) => match[1]);
  assert.deepEqual(phases, ['Plan', 'Review', 'Implement', 'Verify', 'Architect review']);
  assertInOrder(content, [
    '`git status --porcelain`', '`git rev-parse HEAD`', '`git switch -c build/{slug}`',
  ], 'clean-tree preflight');
  assertInOrder(content, [
    '`git switch -c build/{slug}`',
    'Immediately create an initial `phase: plan` state',
    'Apply the complexity fan-out limits to route-selected read-only exploration',
  ], 'durable state before delegation');

  assertResumeRoutingContract(content);
  assertTerminalSupervisionContract(content);
  assertDispatchModelArtifactContract(content);
  assertDeliverySliceOrchestratorContract(content);
  assertBoundedEvidenceContract(content);
}

function withoutBehavior(content, evidence) {
  const pattern = evidence
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+');
  const match = new RegExp(pattern).exec(content);
  assert.ok(match, `fixture evidence missing: ${evidence}`);
  return content.slice(0, match.index) + content.slice(match.index + match[0].length);
}

function assertStateSchema(schema) {
  for (const evidence of STATE_EVIDENCE) {
    assert.ok(schema.includes(evidence), `state schema missing ${JSON.stringify(evidence)}`);
  }
  assert.match(schema, /Fresh workflows resolve each key independently[\s\S]*invocation > effective `AGENTS\.md` > Build default/);
  assert.match(schema, /On resume, saved routes win[\s\S]*valid invocation block[\s\S]*only named keys[\s\S]*old and new records/);
  assert.match(schema, /Changed `AGENTS\.md` content is ignored[\s\S]*Invalid input preserves state and history unchanged/);
  assert.match(schema, /legacy file missing `agent_routes`[\s\S]*exactly once[\s\S]*valid/);
  assert.match(schema, /agent_selection_fallback[\s\S]*append-only[\s\S]*before Build-default dispatch/);
  assertInOrder(schema, [
    'Resume inspection before routing validation is read-only',
    'Complete every applicable current routing mapping before switching branches',
    'Invalid routing preserves branch, state, history, and artifacts unchanged',
  ], 'state-schema resume validation barrier');
  for (const [behavior, evidence] of SLICE_STATE_EVIDENCE) {
    assert.ok(schema.includes(evidence), `delivery-slice state schema missing ${behavior}`);
  }
  assert.match(schema, /\| `delivery_slices` \|[^\n]*initial value `\[\]`/);
  assert.match(schema, /\| `active_slice` \|[^\n]*initial value `null`/);
  assert.match(schema, /\| `completed_slices` \|[^\n]*initial value `\[\]`/);
}

function assertTypedStateSchema(schema) {
  for (const evidence of TYPED_STATE_EVIDENCE) {
    assert.ok(schema.includes(evidence), `typed state schema missing ${JSON.stringify(evidence)}`);
  }
}

test('production Codex source satisfies the orchestrator contract', () => {
  assertCodexOrchestrator(readRel(ORCHESTRATOR_PATH));
});

test('production state schema carries Codex routing lifecycles', () => {
  assertStateSchema(readRel(SCHEMA_PATH));
});

test('production state schema carries typed evidence mode and bindings', () => {
  assertTypedStateSchema(readRel(SCHEMA_PATH));
});

test('v1.13 orchestrators retain completion authorization and state-fed counters', () => {
  const source = readRel(ORCHESTRATOR_PATH);
  const schema = readRel(SCHEMA_PATH);
  for (const term of [
    '`buildctl check-counters --state .build/plans/{slug}-state.md`',
    '`complete-slice`',
    '`already_applied`',
    '`append_completed_slice`',
    '`append_transition_reference`',
  ]) assert.ok(source.includes(term), `Codex orchestrator missing ${term}`);
  for (const term of ['checkpoint_commits', 'transition_references', 'counter_events']) {
    assert.ok(schema.includes(term), `state schema missing ${term}`);
  }
});

test('Codex orchestrator source stays within its 300-line compression budget', () => {
  const lines = readRel(ORCHESTRATOR_PATH).trimEnd().split(/\r?\n/).length;
  assert.ok(lines <= 300, `Codex orchestrator has ${lines} lines; maximum is 300`);
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

for (const [behavior, evidence] of BUILDCTL_ORCHESTRATOR_EVIDENCE) {
  test(`negative buildctl fixture removing ${behavior} is rejected`, () => {
    const fixture = withoutBehavior(readRel(ORCHESTRATOR_PATH), evidence);
    assert.throws(() => assertCodexOrchestrator(fixture), new RegExp(`buildctl ${behavior}`));
  });
}

for (const [behavior, evidence] of ROUTING_EVIDENCE) {
  test(`negative fixture removing ${behavior} is rejected by orchestrator contract`, () => {
    const fixture = withoutBehavior(readRel(ORCHESTRATOR_PATH), evidence);
    assert.throws(() => assertCodexOrchestrator(fixture), new RegExp(behavior));
  });
}

for (const [behavior, evidence] of TYPED_ORCHESTRATOR_EVIDENCE) {
  test(`negative typed orchestrator fixture removing ${behavior} is rejected`, () => {
    const fixture = withoutBehavior(readRel(ORCHESTRATOR_PATH), evidence);
    assert.throws(
      () => assertCodexOrchestrator(fixture),
      new RegExp(`typed evidence ${behavior}`),
    );
  });
}

for (const [behavior, evidence] of SLICE_ORCHESTRATOR_EVIDENCE) {
  test(`negative slice fixture removing ${behavior} is rejected`, () => {
    const fixture = withoutBehavior(readRel(ORCHESTRATOR_PATH), evidence);
    assert.throws(
      () => assertCodexOrchestrator(fixture),
      /delivery-slice orchestrator missing/,
    );
  });
}

for (const [component, evidence] of SLICE_CHECKPOINT_COMPONENTS) {
  test(`negative slice fixture removing checkpoint ${component} is rejected`, () => {
    const content = readRel(ORCHESTRATOR_PATH);
    const fixture = withoutBehavior(content, evidence);
    assert.throws(
      () => assertDeliverySliceOrchestratorContract(fixture),
      /delivery-slice checkpoint order/,
    );
  });
}

for (const clause of BOUNDED_EVIDENCE_CLAUSES) {
  test(`negative bounded-evidence fixture removing ${clause.name} is rejected`, () => {
    const normalized = normalizePromptContract(readRel(ORCHESTRATOR_PATH));
    const anchor = clause.tokens[0];
    assert.ok(normalized.includes(anchor), `bounded-evidence fixture missing ${anchor}`);
    const fixture = normalized.replaceAll(anchor, '');
    assert.throws(
      () => assertBoundedEvidenceContract(fixture),
      new RegExp(clause.name),
    );
  });
}

for (const [behavior, evidence] of SLICE_STATE_EVIDENCE) {
  test(`negative state slice fixture removing ${behavior} is rejected`, () => {
    const schema = readRel(SCHEMA_PATH);
    const fixture = withoutBehavior(schema, evidence);
    assert.throws(
      () => assertStateSchema(fixture),
      /delivery-slice state schema missing/,
    );
  });
}

for (const field of ['delivery_slices', 'active_slice', 'completed_slices']) {
  test(`negative state slice fixture removing ${field} field row is rejected`, () => {
    const schema = readRel(SCHEMA_PATH);
    const rowKey = `| \`${field}\` |`;
    const fixture = withoutBehavior(schema, rowKey);
    assert.throws(() => assertStateSchema(fixture));
  });
}

test('negative fixture declaring a seventh public routing key is rejected', () => {
  const content = readRel(ORCHESTRATOR_PATH);
  const fixture = content.replace(
    '`verify`, and `architect-review`; `review` also governs mid-review.',
    '`verify`, `architect-review`, and `deploy`; `review` also governs mid-review.',
  );
  assert.notEqual(fixture, content, 'seventh-key fixture must alter the production key clause');
  assert.throws(() => assertCodexOrchestrator(fixture), /exact public routing keys/);
});

for (const field of [
  '`dispatched_at`',
  'immutable `deadline_at`',
  '`supervision_mode: terminal-only`',
  '`terminal_status`',
  '`interrupt_outcome`',
]) {
  test(`negative state fixture removing ${field} is rejected`, () => {
    const schema = readRel(SCHEMA_PATH);
    assert.ok(schema.includes(field), `state fixture missing ${field}`);
    const fixture = schema.replaceAll(field, '');
    assert.throws(() => assertStateSchema(fixture), /state schema missing/);
  });
}

for (const evidence of TYPED_STATE_EVIDENCE) {
  test(`negative typed state fixture removing ${evidence} is rejected`, () => {
    const schema = readRel(SCHEMA_PATH);
    assert.ok(schema.includes(evidence), `typed state fixture missing ${evidence}`);
    assert.throws(
      () => assertTypedStateSchema(schema.replaceAll(evidence, '')),
      /typed state schema missing/,
    );
  });
}

for (const evidence of STATE_EVIDENCE.filter((item) =>
  item.includes('agent_route') || item.includes('requested_agent') ||
  item.includes('source:') || item.includes('profile-owned') ||
  item.includes('agent_selection') || item.includes('selector-unavailable') ||
  item.includes('Resume inspection') || item.includes('Invalid routing preserves')
)) {
  test(`negative state routing fixture removing ${evidence} is rejected`, () => {
    const schema = readRel(SCHEMA_PATH);
    assert.ok(schema.includes(evidence), `state fixture missing ${evidence}`);
    assert.throws(() => assertStateSchema(schema.replaceAll(evidence, '')), /state schema missing/);
  });
}
