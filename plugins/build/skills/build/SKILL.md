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

## Resume and state selection: always read state first

Inspect `.build/plans/*-state.md`, excluding `archive/`, before any other workflow
action.

- No matching state: derive a collision-free slug and begin a fresh workflow.
- One matching state: resume its recorded phase. Check `branch`; root switches to it
  before phase work. Reconcile stale fields per the schema and preserve unknown fields.
- Multiple states: match the user's request to `task`. With no unique match, ask the
  user to choose; do not guess. A different request starts a new slug without touching
  live workflows.
- `halted: true`: resume only when the user asks and the halt cause is resolved. Record
  the recovery, remove the halt triplet, then continue from `phase`.

On resume, validate that every artifact required by the recorded phase exists. Recover
from the last durable artifact; never advance state based only on chat history.

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
destructive work below `complex`. Plan, review, mid-review, and architect-review use
`xhigh` for complex work. Architect-review also uses Sol/`xhigh` for broad diffs,
PARTIAL verification, plan deviations, or auth/data/public-API changes; a small fully
verified simple diff uses Sol/`high`.

Exploration fan-out follows the current provisional or final classification: simple uses
no explorer, standard uses at most two, and complex uses at most three. Every explorer
has the default five-minute runtime; use partial evidence when that deadline expires.

Request these routes when spawning agents. If a model or effort override is unavailable,
continue with the best available agent or inline execution. Append a `model_fallback`
entry containing phase, requested route, actual route, reason, and timestamp before
using it. Historical fallback entries are never cleared. Lack of an override is not a
reason to skip a phase.

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
complexity and model routes, empty inventories, `completed_tasks: []`,
`agent_progress: {}`, and initial history. This durable state must exist before the first
explorer or companion dispatch so progress, fallback, failure, and resume evidence can be
recorded from the start.

Apply the complexity fan-out limits to Luna/`max` read-only exploration of architecture,
affected code, and tests. Root synthesizes their evidence and delegates `impl-plan` with
the marker `[orchestrated]`. Require canonical `REQ-*`, `D-*`, and `A-*`, Wave 0 evidence,
a complete `execution_manifest`, and disjoint same-wave `files_modified`.

Root determines final complexity, then writes and validates `{slug}-context.md`,
`{slug}-requirements.md`, and `{slug}-plan.md`. Last, update state with final complexity,
model routes, inventories, manifest summary, and `phase: review`.

## Phase 2: Review

Read state plus context, requirements, and plan. Delegate `review-plan` at the routed Sol
effort. Save `{slug}-review.md` before state changes.

- `Proceed to implementation`: transition to `implement`.
- `Proceed with fixes`: root revises and validates plan/requirements, records
  `review_fixes_applied`, then transitions to `implement`.
- `Do not proceed`: record Critical findings as `rework_notes`, transition to `plan`,
  and re-plan.
- Missing verdict: apply the phase-agent circuit breaker.

## Phase 3: Implement

Read every prior artifact. Validate manifest dependencies and same-wave file ownership
before dispatch. Also require every manifest ID in exactly one named workstream, every
workstream ID to exist in the manifest, and each workstream's file set to equal the union
of its member tasks' `files_modified`. Manifest IDs are planning, evidence, and completion
units, not dispatch units. Never spawn one writer per manifest task. Group each
workstream's ready frontier into the fewest bounded batches. Give each batch one or more IDs, their internal
topological order, and the union of owned files. Split a batch only for an unresolved
external dependency, union overlap, or runtime budget; concurrent batch unions must be
disjoint. Dispatch at the routed implementation model and effort and serialize dependencies
or overlap. Root handles shared files, git operations, commits, and integration checks.

Wave 0 collects the fastest targeted evidence. Run a full baseline only to diagnose a
suspected pre-existing failure. Workers run scoped owned-file/task checks and never the
full suite unless a dispatch explicitly assigns a named slow gate and runtime budget.
After each completed wave, root runs each exact integration command once; deduplicate
identical commands within and across batches. Phase 4 owns one fresh full-suite result
and each unique plan-declared command; evidence from earlier layers never substitutes.

After the wave's integration commands pass, write/update
`{slug}-implementation-summary.md` and append its task IDs to `completed_tasks`. On a
failed check, keep `phase: implement` and record the failure. Once all tasks and must-haves
have evidence, validate the final implementation summary, then transition to `verify`.

Use read-only mid-review agents after major standard/complex waves. RETHINK or a valid
`SCOPE_CHANGE` records rework evidence and transitions to `plan`; it never edits state
directly.

## Phase 4: Verify

Read state, requirements, plan, and implementation summary. Delegate `verify` to Luna at
`max`, requiring exactly one fresh full-suite result, each unique plan-declared command,
must-have coverage, and the debt scan. Save `{slug}-verify.md` before changing state.

- `VERIFIED`: record verdict and transition to `architect-review`.
- `FAILED`: record `verification_failures` and transition to `implement`.
- `PARTIAL`: record verdict plus every `uncovered_requirements` gap, then transition to
  `architect-review`; gaps remain visible through completion.
- Missing verdict: apply the phase-agent circuit breaker.

## Phase 5: Architect review

Read all artifacts. Root computes the review target from `base_ref`; it owns the git diff.
Delegate `architect-review` at the routed Sol effort with the target and verify verdict.
Save `{slug}-architect-review.md` before changing state.

- `PASS` or `PASS_WITH_NOTES`: transition to terminal `complete`.
- `FAIL`: record `architect_fixes` and transition to `implement` for fixes and re-verify.
- Missing verdict: apply the phase-agent circuit breaker.

At `complete`, summarize delivered work, tests, decisions, branch, the requested model
routes and every `model_fallback` (or explicitly `none`), and the user's merge command.
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
