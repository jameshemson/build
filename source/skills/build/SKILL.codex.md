---
name: build
description: Codex-native structured build workflow - plan, review, implement, verify, architect review.
---

Drive the user's requested change through exactly five active phases: `plan`, `review`,
`implement`, `verify`, and `architect-review`. `complete` and `aborted` are terminal
states, not phases. Continue autonomously until a terminal state, a circuit breaker,
or a choice that only the user can make.

Use the least-expansive reasonable interpretation. Investigate uncertainty only when resolving it could materially change the requested outcome, scope, authority, or significant risk. Report a finding only when supported by evidence, a
plausible material consequence, and a specific in-scope fix. Gather the smallest sufficient fresh evidence for the claims
actually made. Stop when the requested outcome exists, required direct verification passes, and nothing unresolved can
materially change the result. Boundedness never skips required phases; worker, integration, slice, and final authorities;
Phase 4's exactly one fresh full suite; safety, security, or data rigor; scope changes; or user-only decisions.

Read [the state schema](reference/state-schema.md) before starting. The schema owns
field formats and lifecycle rules.

## Root-only mutation boundary

You are the root orchestrator. Only root may:

- read or write `.build/` workflow state and artifacts;
- create, switch, merge, commit, or otherwise mutate git branches;
- integrate workstream results and archive a workflow.

Subagents share root's workspace. They must never edit `.build/`, run git mutation
commands, commit, or archive artifacts. Root must inline every requirement, relevant
context, file path, must-have, and verification command in a dispatch; never send an
agent to a `.build/` path. Read-only agents may overlap. Concurrent writer agents are
allowed only when their assigned file sets are disjoint. If any files overlap, combine
the work into one writer or run the writers sequentially. Root owns shared integration
files.

## Resume, state, and agent-route selection

State selection remains the first read-only operation: inspect
`.build/plans/*-state.md`, excluding `archive/`, before any other workflow action.

- No matching state: derive a collision-free slug and begin a fresh workflow.
- One matching state: inventory its recorded phase, branch-switch need, stale fields, and
  unknown fields without acting on them.
- Multiple states: match the user's request to `task`. With no unique match, ask the
  user to choose; do not guess. A different request starts a new slug without touching
  live workflows.
- `halted: true`: inventory whether the user asked to resume and the halt cause is resolved;
  do not remove or record anything yet.

Before routing validation, resume work is inventory only. On resume, validate that every artifact
required by the recorded phase exists, identify the last durable artifact, and reconcile
`delivery_slices`/`active_slice`/`completed_slices` through the state schema; never advance
state based only on chat history. A missing mode on resume is `legacy-untyped`; unchanged tasks
continue, but reopened tasks must upgrade to typed must-haves and bindings.

The invocation and effective `AGENTS.md` may each contain at most one literal
`## Build agent routing` block. Its body ends immediately before the next H2 heading or at EOF.
Blank lines are allowed; every nonblank line must match `^- ([^:]+):[ \t]*(.*?)[ \t]*$`, and at
least one mapping line is required. Trim only horizontal padding around the captured value.
Preserve all remaining case, punctuation, quotes, and internal whitespace. The only public keys, in state order, are `plan`, `review`, `explore`, `implement`, `verify`, and `architect-review`; `review` also governs mid-review.
Reject the entire source mapping for a duplicate block, duplicate key, unknown key, non-list/nonblank content, or a value blank after trimming; name the source and offending key when one exists.

Validate every applicable mapping completely before any mutation. On a fresh workflow,
resolve every key independently with precedence invocation > effective `AGENTS.md` > Build default;
the Build default is `{ requested_agent: null, source: build-default }`. With no mapping in either source, all six keys therefore use that null Build default. Snapshot all six `agent_routes` records before delegation. On resume, the saved `agent_routes` snapshot wins. Changes to `AGENTS.md` never alter a live snapshot. An invalid current invocation mapping leaves both state and history byte-for-byte unchanged; branch and artifacts are unchanged too.

Only after all applicable current routing validates may root switch branches, reconcile stale fields, remove a halt triplet, recover artifacts, replace named agent routes or resolve legacy routes, or mutate state/history. Then a valid current invocation block replaces only its named keys with `source: invocation` and records the old and new records in `history`. A legacy state missing `agent_routes` resolves exactly once, only after all current input is valid, and records that resolution in `history`; artifact recovery starts from the last durable artifact.

Agent names are opaque. Never discover, validate, normalize, alias, create, copy, edit, install, bundle, or overwrite agent profiles; `default` is an ordinary selectable opaque name, not a sentinel.

## Complexity, model routing, and phase authority

Before planning, classify `provisional_complexity` from targeted reads. After the plan names
files, risks, dependencies, and workstreams, set final `complexity` to `simple`, `standard`,
or `complex`. Risk overrides file count upward; auth, security, destructive, or high-risk data
work is always `complex`.

Build-default Plan, Implement, and Architect Review run inline in root; Plan Review and Verify use fresh-context agents. Inline phases inherit the active root session; Build cannot downshift their model or effort, and records their `model_routes` value as the literal `active-session`. Recommend a `gpt-5.6-sol` session at `high` effort for normal complex Codex builds. This is cost guidance, not a host-enforced route.

Build-default fresh judgment routes are `gpt-5.6-sol`/`medium` for simple,
`gpt-5.6-sol`/`high` for standard, and `gpt-5.6-sol`/`xhigh` for complex. Read-only
exploration uses `gpt-5.6-luna`/`max`: simple uses no explorer, standard uses at most two,
and complex uses at most three. Every explorer has the default five-minute runtime; use
partial evidence when it expires.

Explicit non-null custom routes remain opt-in delegation for any phase. A valid non-null
custom route explicitly opts that phase into delegation. Every delegated explorer,
fresh-context judge, custom-routed phase, and mid-review dispatch applies its effective role route.
For a non-null `requested_agent`, request that exact agent type, omit Build model and effort,
set `fork_turns: "none"`, and record its `model_routes` route as the literal `profile-owned`;
never combine named selection with a Build model/effort override. For null/build-default,
never attempt named selection and never create `agent_selection_fallback`; inline phases use
root, while fresh phases request the route above with `fork_turns: "none"` because this is an
explicit model/effort request.

If a requested non-null selection is absent because the selector is unavailable, or is rejected,
first append `agent_selection_fallback` with `timestamp`, `phase`, `role`, `requested_agent`,
`actual_agent`, `fallback_route`, `reason`, and `detail`. Use `actual_agent: unknown` if unreported;
`fallback_route` names the Build model/effort route or inline; use `selector-unavailable` for a
selector schema limitation or `selection-rejected` for the exact rejection. Append this entry
before requesting the Build model route. `model_fallback` remains independent and is appended
only if that subsequent model/effort request is unavailable. Historical fallback entries are
never cleared. A later execution failure follows normal `agent_failures` handling, never
agent-selection fallback.

## Codex execution and supervision

Root invokes the documented `impl-plan` and `architect-review` contracts inline. It dispatches
`review-plan` and `verify` as fresh-context judgments. Root saves every artifact and updates state.
Implementation workers must not invoke `impl-plan`, `review-plan`, `verify`, `architect-review`,
or another workflow skill; a custom-routed writer returns only a terminal `DONE`,
`DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, `BLOCKED`, or `SCOPE_CHANGE` handoff.

Every dispatch names an agent label, task IDs, owned files, current command, and runtime. Record
`agent_progress` with `supervision_mode: terminal-only`, `dispatched_at`, immutable `deadline_at`,
`terminal_status`, and `interrupt_outcome`. Silence is unknown, not failure evidence. Wait for
terminal events and send no child status prompts; user-facing progress comes from root-owned work
and host-observed terminal state, not child milestone bookkeeping.

Fresh-context Plan Review and Verify agents get a 20-minute hard deadline. At `deadline_at`,
interrupt only at hard expiry, record `handoff-timeout`, then allow at most one fresh retry. A
second Plan Review failure blocks implementation; never replace independent review with inline
self-review unless the user explicitly overrides that boundary. A named slow command may declare
a longer deadline before dispatch, never after it starts.

On integration, record the terminal outcome before removing the live entry. Legacy
`agent_progress` rows are orphaned handoffs: preserve known fields and assigned diffs, never
invent timestamps or liveness evidence, and obtain fresh scoped evidence before completion.
This is a deterministic prompt/state contract, not a host-harness timing guarantee.

## Artifact-before-state invariant

Always write and validate the artifact needed by the next phase before updating
`phase`. State is updated last. If artifact writing fails, remain in the current phase.
Each transition appends one non-duplicate timestamped history entry. Never silently
drop unknown state fields.

Workflow artifacts are `.build/plans/{slug}-{context,requirements,plan,review,
implementation-summary,verify,architect-review}.md` plus `{slug}-state.md`.

## Phase 1: Plan

For a fresh workflow, root runs `git status --porcelain`. If it is non-empty, stop and
show the dirty paths: branch creation requires a clean tree. Only after a clean result,
root captures `base_ref` with `git rev-parse HEAD`, records the current branch, and runs
`git switch -c build/{slug}`. Create `.build/plans/` only after this preflight succeeds.

Immediately create an initial `phase: plan` state with identity, git refs, provisional
complexity, all six agent routes, model routes, empty inventories, `completed_tasks: []`,
`delivery_slices: []`, `active_slice: null`, `completed_slices: []`, `agent_progress: {}`,
and initial history. Fresh workflows set `evidence_mode` to `typed` and start with `bindings: []`. It must exist before the first dispatch so progress, fallback, failure,
and resume evidence can be recorded from the start.

Apply the complexity fan-out limits to route-selected read-only exploration of architecture,
affected code, and tests. Root synthesizes their evidence and runs `impl-plan` inline with
the marker `[orchestrated]`. Require canonical `REQ-*`, `D-*`, and `A-*`, Wave 0 evidence,
a complete typed `execution_manifest`, `bindings` coverage, and `delivery_slices`, and the hierarchy delivery slice ->
dependency waves -> disjoint workstreams -> `execution_manifest` tasks.

Root determines final complexity, then writes and validates `{slug}-context.md`,
`{slug}-requirements.md`, and `{slug}-plan.md`. Last, update state with final complexity,
model routes, evidence mode, typed binding summary, inventories, manifest summary, and `phase: review`.

## Phase 2: Review

Read state plus context, requirements, and plan. Run `review-plan` in a fresh-context agent
with the effective `review` route. Save `{slug}-review.md` before state changes.

For either proceed verdict, after any fixes, validate and persist the accepted slice definitions
and first declared-order dependency-ready `active_slice` before implementation dispatch.

- `Proceed to implementation`: transition to `implement`.
- `Proceed with fixes`: root revises and validates plan/requirements, records
  `review_fixes_applied`, then transitions to `implement`.
- `Do not proceed`: record Critical findings as `rework_notes`, transition to `plan`,
  and re-plan.
- Missing verdict: apply the phase-agent circuit breaker.

## Phase 3: Implement

Read every prior artifact and reconcile the active slice through the schema. Validate the delivery
slice -> dependency waves -> disjoint workstreams -> `execution_manifest` tasks hierarchy,
manifest dependencies, same-wave ownership, and that every dispatch includes each must-have `id`, `claim`, evidence `kind`, and `ref`. Structural evidence and changed files prove only structural claims.
Also require every manifest ID in exactly one named workstream, every workstream ID to exist in
the manifest, and each workstream's file set to equal the union of its member `files_modified`.
Only the `active_slice` task IDs and their workstream batches may dispatch. Group each
workstream's ready frontier into the fewest bounded batches. Give each batch one or more IDs, their
internal topological order, and the union of owned files. Manifest IDs remain planning, evidence,
and completion units, not dispatch units. Never spawn one writer per manifest task.
Split only for external dependency, overlap, or runtime; concurrent unions must be disjoint.
Build-default implementation remains inline even when the plan has multiple batches. A
non-null custom `implement` route may delegate a bounded, disjoint batch. Dispatch it through the
effective `implement` route. A successful non-null
custom selection remains `profile-owned` and omits Build model/effort. Serialize dependencies
and overlap; root owns shared files, git operations, commits, and integration.

Wave 0 collects the fastest targeted evidence; run a full baseline only to diagnose a
suspected pre-existing failure. Workers run scoped owned-file/task checks and never the full suite
unless assigned a named slow gate and runtime. Root runs each exact wave/slice integration command
once, deduplicated across batches. Slice evidence is provisional and never substitutes for final verification.

For each slice the exact order is: persist `active_slice`; dispatch only its tasks; integrate
its exact `verify`/`must_haves` evidence; update `{slug}-implementation-summary.md`; root makes
the checkpoint commit; record the checkpoint and append the slice to `completed_slices`; then
activate the next dependency-ready slice. Append wave task IDs to `completed_tasks` only after
integration passes. A failure keeps the same active slice and blocks every successor. Only after
every slice is completed may root validate the final implementation summary and transition to `verify`.

Use read-only mid-review agents with the effective `review` route after major
standard/complex waves. RETHINK or a valid
`SCOPE_CHANGE` records rework evidence and transitions to `plan`; it never edits state
directly.

## Phase 4: Verify

Read state, requirements, plan, and implementation summary. Only after every slice is completed,
run `verify` in a fresh-context agent as the fresh whole-workflow authority. Phase 4 owns one fresh full-suite result, each unique plan-declared command, must-have coverage, and the debt scan.
Save `{slug}-verify.md` before changing state.

- `VERIFIED`: record verdict and transition to `architect-review`.
- `FAILED`: record `verification_failures` and transition to `implement`.
- `PARTIAL`: record verdict plus every `uncovered_requirements` gap, then transition to
  `architect-review`; gaps remain visible through completion.
- Missing verdict: apply the phase-agent circuit breaker.

## Phase 5: Architect review

Read all artifacts. Architect Review remains the whole-diff authority: root computes the
review target from `base_ref` and owns the git diff; slice evidence never substitutes.
Run the `architect-review` contract inline with the target and verify verdict. A non-null
custom `architect-review` route may explicitly delegate it.
Save `{slug}-architect-review.md` before changing state.

- `PASS` or `PASS_WITH_NOTES`: transition to terminal `complete`.
- `FAIL`: record `architect_fixes` and transition to `implement` for fixes and re-verify.
- Missing verdict: apply the phase-agent circuit breaker.

At `complete`, summarize delivered work, tests, decisions, branch, all six agent routes and sources, every `agent_selection_fallback` (or explicitly `none`), requested model routes and every `model_fallback` (or explicitly `none`), including literal `profile-owned` wherever selected, and the user's merge command.
Surface all PARTIAL gaps under `Uncovered requirements`. Root archives all slug artifacts
under `.build/plans/archive/{date}-{slug}/`. Never merge to the user's branch, push, or
open a PR.

## Abort

When the user asks to stop, root writes an abort summary of completed work, remaining
tasks, branch, and commits. Then set `phase: aborted`, `halted: true`, and
`halt_reason: user-abort`, append history, and archive all artifacts under a unique
`{date}-{slug}-aborted/` directory. Never delete workflow evidence.

## Circuit breakers

Before every dispatch or transition, count prior history and failures:

- Same workstream: at most two redispatches; then halt with `agent-retry-limit`.
- Fresh judgment: retry once for an error, timeout, or missing verdict; a second failure
  halts with `phase-agent-failure` unless the user explicitly changes the boundary.
- Agent handoff: enforce the terminal-only deadline protocol above; silence alone never
  triggers a retry, and interruption occurs only at the immutable hard deadline.
- Same phase re-entry: more than three returns halts with `phase-loop-limit`.
- Plan-review: more than three total plan iterations halts with `plan-review-limit`.
- Scope change: the third report halts with `scope-change-limit`.
- No durable progress across two consecutive retries halts with `no-progress-limit`.
- Any proposed concurrent writer overlap halts dispatch until ownership is disjoint.

When a breaker fires, root writes `halted: true`, `halt_reason`, and `halt_context`, logs
the evidence in `agent_failures` or history, and asks the user for the smallest decision
needed. Never increase a limit, skip a phase, or hide a failure.
