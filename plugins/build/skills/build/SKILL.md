---
name: build
description: Codex-native structured build workflow - plan, review, implement, verify, architect review.
---

Drive the user's requested change through exactly five active phases: `plan`, `review`,
`implement`, `verify`, and `architect-review`. `complete` and `aborted` are terminal
states, not phases. Continue autonomously until a terminal state, a circuit breaker,
or a choice that only the user can make.

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
state based only on chat history.

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

## Complexity and model routing

Before planning, classify `provisional_complexity` from the request and targeted reads.
After the plan names files, risks, dependencies, and workstreams, set final `complexity`
to `simple`, `standard`, or `complex` and refresh `model_routes`:

| Complexity | Typical shape | Plan / review | Implement | Explore / verify |
|---|---|---|---|---|
| `simple` | 1-2 files, mechanical, one workstream | `gpt-5.6-sol`, `medium` | `gpt-5.6-luna`, `max` | `gpt-5.6-luna`, `max` |
| `standard` | 3-5 files or moderate integration | `gpt-5.6-sol`, `high` | `gpt-5.6-sol`, `medium` | `gpt-5.6-luna`, `max` |
| `complex` | 6+ files, multiple workstreams, high risk, or cross-cutting | `gpt-5.6-sol`, `xhigh` | `gpt-5.6-sol`, `high` | `gpt-5.6-luna`, `max` |

Risk overrides file count upward; never downgrade high-risk data, auth, security, or
destructive work below `complex`. Build-default plan, review, mid-review, and
architect-review use `xhigh` effort for complex work. Architect-review also upgrades
Build-default effort to `xhigh` for broad diffs, PARTIAL verification, plan deviations,
or auth/data/public-API changes; a small fully verified simple diff uses `high`.

Exploration fan-out follows the current provisional or final classification: simple uses
no explorer, standard uses at most two, and complex uses at most three. Every explorer
has the default five-minute runtime; use partial evidence when that deadline expires.

Request these routes when spawning agents. If a model or effort override is unavailable,
continue with the best available agent or inline execution. Append a `model_fallback`
entry containing phase, requested route, actual route, reason, and timestamp before
using it. Historical fallback entries are never cleared. Lack of an override is not a
reason to skip a phase.

Every phase companion, explorer, writer, reviewer, and mid-review dispatch applies its effective role route. For a non-null `requested_agent`, request that exact agent type, omit Build model and effort, set `fork_turns: "none"`, and record its `model_routes` route as the literal `profile-owned`; never combine named selection with a Build model/effort override. For null/build-default, never attempt named selection and never create `agent_selection_fallback`; request the complexity-table model/effort (or execute inline) with `fork_turns: "none"` because this is an explicit model/effort request.

If a requested non-null selection is absent because the selector is unavailable, or is rejected, first append `agent_selection_fallback` with `timestamp`, `phase`, `role`, `requested_agent`, `actual_agent`, `fallback_route`, `reason`, and `detail`. Use `actual_agent: unknown` if unreported; `fallback_route` names the Build model/effort route or inline; use `selector-unavailable` for a selector schema limitation or `selection-rejected` for the exact rejection, with that limitation/rejection in `detail`. Append this entry before requesting the Build model route. `model_fallback` remains independent and is appended only if that subsequent model/effort request is unavailable. A later execution failure follows normal `agent_failures` handling, never agent-selection fallback.

## Companion-skill delegation

Delegate each companion skill to a subagent with the route above and a bounded prompt:

- plan: `impl-plan`
- review: `review-plan`
- verify: `verify`
- architect-review: `architect-review`

Tell the subagent to invoke the named skill and return its complete output to root.
If skill invocation is unavailable or fails twice, run that skill's documented contract inline,
log both failures in `agent_failures`, and produce the same required verdict.
Root, not the companion or subagent, saves the returned artifact and updates state.

Every writer dispatch must require one status: `DONE`, `DONE_WITH_CONCERNS`,
`NEEDS_CONTEXT`, `BLOCKED`, or `SCOPE_CHANGE`, plus a final check against its assigned
files, behaviors, tests, and must-haves. Provide missing context and retry
`NEEDS_CONTEXT`; log concerns; escalate `BLOCKED`; send `SCOPE_CHANGE` to re-planning.
Implementation workers must not invoke `impl-plan`, `review-plan`, `verify`,
`architect-review`, or another workflow skill. They run only the exact scoped commands
in their dispatch and return a terminal status immediately after those commands finish.

## Agent progress protocol

Every dispatch names an agent label, task IDs, owned files, the next expected command,
and a runtime. Default runtime is five minutes for an explorer and ten minutes for a
writer or companion (including reviewer and mid-review). A longer runtime is allowed
only for a named slow command with an explicit duration. At dispatch, root records these
`agent_progress` fields using ISO-8601 timestamps with timezone: `dispatched_at`, an
immutable `deadline_at` computed once, `last_checked_at`, `last_evidence_at`,
`evidence_free_checks`, and `deadline_status_requested_at: null`. Status replies and root
polling never extend `deadline_at`.

Require these milestone messages at boundaries, not periodic heartbeats:

- `STARTED`: task IDs and owned files accepted;
- `EDITING`: files changed and next action;
- `VERIFYING`: exact command and start time;
- terminal status: final files, command result, and concerns.

Root maintains `agent_progress`; agents never write it. At intervals of no more than 60
seconds while any agent runs, root checks/lists agents, inspects each assigned-file diff,
updates state, and reports to the user. Each agent row contains `label | stage |
elapsed/deadline | command | last evidence`; a bare waiting message is insufficient.
Among timestamps, polling updates only `last_checked_at`; an evidence-free poll also
increments `evidence_free_checks`. Only an agent milestone/status reply or a new
assigned-file diff updates `last_evidence_at` and resets that counter. Changed files are
activity, not completion.

After two consecutive evidence-free checks, root sends a structured status request with
the task IDs, last stage, command, assigned-file diff evidence, missing milestone, and
immutable deadline. This request does not slide the deadline. At `deadline_at`, every
agent—writer with or without edits, explorer, companion, reviewer, or mid-review—gets
exactly one deadline status request, recorded in `deadline_status_requested_at`, followed
by exactly one 60-second grace interval. If no terminal handoff arrives, interrupt it and
record `handoff-timeout`. Preserve and freshly verify writer edits, retain partial
explorer evidence, and apply retry-then-inline to phase companions. Never redo work that
the diff and fresh evidence prove; redispatch only a named missing must-have.

On integration, append the terminal outcome to history before removing the live entry.
Legacy `agent_progress` entries missing supervision fields are orphaned handoffs: never
fabricate timestamps. Record reconciliation, inspect and preserve their assigned diffs,
obtain fresh scoped evidence, then complete them or redispatch only a named missing
must-have. This is a deterministic prompt/state contract, not a host-harness timing
guarantee.

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
and initial history. It must exist before the first dispatch so progress, fallback, failure,
and resume evidence can be recorded from the start.

Apply the complexity fan-out limits to route-selected read-only exploration of architecture,
affected code, and tests. Root synthesizes their evidence and delegates `impl-plan` with
the marker `[orchestrated]`. Require canonical `REQ-*`, `D-*`, and `A-*`, Wave 0 evidence,
a complete `execution_manifest` and `delivery_slices`, and the hierarchy delivery slice ->
dependency waves -> disjoint workstreams -> `execution_manifest` tasks.

Root determines final complexity, then writes and validates `{slug}-context.md`,
`{slug}-requirements.md`, and `{slug}-plan.md`. Last, update state with final complexity,
model routes, inventories, manifest summary, and `phase: review`.

## Phase 2: Review

Read state plus context, requirements, and plan. Delegate `review-plan` with the effective
`review` route. Save `{slug}-review.md` before state changes.

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
manifest dependencies, and same-wave ownership.
Also require every manifest ID in exactly one named workstream, every workstream ID to exist in
the manifest, and each workstream's file set to equal the union of its member `files_modified`.
Only the `active_slice` task IDs and their workstream batches may dispatch. Group each
workstream's ready frontier into the fewest bounded batches. Give each batch one or more IDs, their
internal topological order, and the union of owned files. Manifest IDs remain planning, evidence,
and completion units, not dispatch units. Never spawn one writer per manifest task.
Split only for external dependency, overlap, or runtime; concurrent unions must be disjoint.
Dispatch every batch through the effective `implement` route. A successful non-null custom selection remains `profile-owned` and omits Build model/effort. Only a null/build-default route or a recorded `agent_selection_fallback` may request the complexity-table model/effort. Serialize dependencies/overlap; root owns shared files, git operations, commits, and integration.

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
delegate `verify` with its effective route as the fresh whole-workflow authority. Phase 4 owns one fresh full-suite result, each unique plan-declared command, must-have coverage, and the debt scan.
Save `{slug}-verify.md` before changing state.

- `VERIFIED`: record verdict and transition to `architect-review`.
- `FAILED`: record `verification_failures` and transition to `implement`.
- `PARTIAL`: record verdict plus every `uncovered_requirements` gap, then transition to
  `architect-review`; gaps remain visible through completion.
- Missing verdict: apply the phase-agent circuit breaker.

## Phase 5: Architect review

Read all artifacts. Architect Review remains the whole-diff authority: root computes the
review target from `base_ref` and owns the git diff; slice evidence never substitutes.
Delegate `architect-review` with its effective route and the target and verify verdict.
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
- Phase agent: retry once for an error/missing verdict, then execute inline.
- Agent handoff: enforce the deterministic deadline protocol above for every agent;
  interrupt after its single deadline request and 60-second grace interval.
- Agent visibility: never exceed one 60-second monitoring interval without refreshing
  `agent_progress` and reporting a concise phase/agent update while work is active.
- Same phase re-entry: more than three returns halts with `phase-loop-limit`.
- Plan-review: more than three total plan iterations halts with `plan-review-limit`.
- Scope change: the third report halts with `scope-change-limit`.
- No durable progress across two consecutive retries halts with `no-progress-limit`.
- Any proposed concurrent writer overlap halts dispatch until ownership is disjoint.

When a breaker fires, root writes `halted: true`, `halt_reason`, and `halt_context`, logs
the evidence in `agent_failures` or history, and asks the user for the smallest decision
needed. Never increase a limit, skip a phase, or hide a failure.
