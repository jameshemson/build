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
root's exactly one fresh final ledger and Phase 4 receipt judgment; safety, security, or data rigor; scope changes; or user-only decisions.

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

Under Build-default, root invokes the documented `impl-plan` and `architect-review` contracts
inline. Explicit custom routes may delegate them as their phase clauses specify. Root dispatches
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

## buildctl authority and fallback

Resolve the sibling `buildctl/cli.js` relative to this skill (or the package `buildctl` bin; source checkouts may use `source/skills/build/buildctl/cli.js`) and run it with Node >=20. A runnable `validate-plan` diagnostic or `run-evidence --check-only` failure is authoritative and never selects fallback; runnable `check-counters` and `complete-slice` diagnostics are equally authoritative. Only when the runtime cannot be located or executed, append `buildctl_fallback` with timestamp, phase, reason, and detail, then use the prompt-only Plan/Verify/counter/slice protocol. Markdown/YAML remains authored authority; `contract.json`, ledgers, and receipts are generated. buildctl never writes workflow state or mutates git. `complete-slice` may authorize exactly four state patch operations in an immutable receipt; root alone validates and applies that allowed patch and owns every general phase transition. `check-counters` evaluates root-recorded typed events.

## Phase 1: Plan

For a fresh workflow, root runs `git status --porcelain`. If it is non-empty, stop and
show the dirty paths: branch creation requires a clean tree. Only after a clean result,
root captures `base_ref` with `git rev-parse HEAD`, records the current branch, and runs
`git switch -c build/{slug}`. Create `.build/plans/` only after this preflight succeeds.

Immediately create an initial `phase: plan` state with identity, git refs, provisional
complexity, all six agent routes, model routes, empty inventories, `completed_tasks: []`,
`delivery_slices: []`, `active_slice: null`, `completed_slices: []`, `checkpoint_commits: []`,
`transition_references: []`, `transition_history: []`, `counter_events: []`, `agent_progress: {}`,
`phase_result_references: []`, `phase_result_bootstrap: []`, and JSON `base_ref`/`workflow_artifact_prefix`,
and initial history. Fresh workflows set `evidence_mode` to `typed` and start with `bindings: []`. It must exist before the first dispatch so progress, fallback, failure,
and resume evidence can be recorded from the start.

Apply the complexity fan-out limits to route-selected read-only exploration of architecture,
affected code, and tests. Root synthesizes their evidence. Build-default Plan runs `impl-plan`
inline with the marker `[orchestrated]`; a non-null custom `plan` route instead delegates
`impl-plan` through the effective `plan` route with the same marker. Require canonical `REQ-*`, `D-*`, and `A-*`, Wave 0 evidence,
a complete typed `execution_manifest`, `bindings` coverage, and `delivery_slices`, and the hierarchy delivery slice ->
dependency waves -> disjoint workstreams -> `execution_manifest` tasks.

Root determines final complexity, then writes and validates `{slug}-context.md`,
`{slug}-requirements.md`, and `{slug}-plan.md`. Run `buildctl validate-plan --plan .build/plans/{slug}-plan.md --out .build/contracts/{slug}/contract.json`; on success record `compiled_contract` path, plan/contract hashes, and compiler version. A runnable failure keeps `phase: plan`. Last, update state with final complexity,
model routes, evidence mode, typed binding summary, inventories, manifest summary, and `phase: review`.

## Phase 2: Review

Read state plus context, requirements, and plan. Run `review-plan` in a fresh-context agent
with the effective `review` route. Save `{slug}-review.md` before state changes.

Before the first post-integration buildctl state read, normalize a legacy bare-hex `base_ref` and
result fields through the schema. Run `compile-result` on the saved report; a runnable diagnostic
is authoritative. Root verifies the receipt, appends `{phase,receipt_id}` to
`phase_result_references`, and applies only its allowed next phase: `Proceed to implementation`
must validate and persist the accepted slice definitions and first declared-order dependency-ready
`active_slice` before implementation dispatch and transition to `implement`; `Proceed with fixes` or
`Do not proceed` records all findings as `rework_notes` and returns to `plan` for revision,
recompilation, and fresh review. Re-run `validate-plan` after every review edit. Count every review-to-plan return; revise without repeating exploration
unless architecture, file scope, or significant risk changed. Preserve historical
`review_fixes_applied`; missing verdict uses the phase-agent breaker.

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

For inline work and every delegated implementation prompt, apply Occam's Razor within the accepted
plan: choose the simplest implementation that fully satisfies it, using existing project mechanisms
when appropriate while preserving clear responsibilities and established boundaries. Do not
introduce a material unplanned abstraction, configuration surface, extension point, dependency, or
infrastructure component for hypothetical needs; treat one as `SCOPE_CHANGE` if it becomes necessary.

Wave 0 collects the fastest targeted evidence; run a full baseline only to diagnose a
suspected pre-existing failure. Workers run scoped owned-file/task checks and never the full suite
unless assigned a named slow gate and runtime. Root runs each exact wave/slice integration command
once, deduplicated across batches. Slice evidence is provisional and never substitutes for final verification.

For each slice the exact order is: persist `active_slice`; dispatch only its tasks; integrate
its exact `verify`/`must_haves` evidence; update `{slug}-implementation-summary.md`; root makes
the checkpoint commit; record the checkpoint's full SHA in `checkpoint_commits` and the exact
`Completion checkpoint: {"slice_id":"S-###","commit":"<40-lowercase-hex>"}` summary marker;
then run post-checkpoint `run-evidence` for every slice command and author current structural,
manual, and slice judgment YAML without auto-stamping acceptance. Run `complete-slice`; a blocked
result keeps the same active slice. For `proposed`, root validates the receipt and applies only
`append_completed_slice`, `set_active_slice`, `append_transition_reference`, and
`append_history_template`, then reruns the same command and requires `already_applied`; the
authorized patch already performed slice completion and next-slice activation, so never append to `completed_slices` or set `active_slice` again for that receipt. Append wave
task IDs to `completed_tasks` only after integration passes. In a recorded genuinely-unexecutable
buildctl fallback, use the prior prompt-owned checkpoint path and disclose it; runnable compiler,
counter, evidence, or completion diagnostics remain authoritative. A failure keeps the same active
slice and blocks every successor. Only after every slice is completed may root validate the final implementation summary. Root then runs `buildctl run-evidence` over every compiled exact command
plus the repository-required final full-suite command, records the generated `evidence_ledger`,
and only then may transition to `verify`; a valid failed-command ledger still proceeds for Verify
judgment, while runner errors remain in implementation. In recorded prompt fallback, defer
exact-command execution to Verify.

Use read-only mid-review agents with the effective `review` route after major
standard/complex waves. RETHINK or a valid
`SCOPE_CHANGE` records rework evidence and transitions to `plan`; it never edits state
directly.

## Phase 4: Verify

Read state, requirements, plan, and implementation summary. Only after every slice is completed,
run `verify` in a fresh-context agent as the fresh whole-workflow authority. With compiled evidence, Verify runs only `run-evidence --check-only` and judges receipt freshness, exact-command consumers, expected observations, requirement/must-have coverage, and debt without executing evidence commands. Prompt fallback retains the prior exact-command protocol. Root's final evidence ledger owns each compiled exact command and the fresh full-suite result; Phase 4 owns receipt coverage and the debt scan.
Save `{slug}-verify.md` before changing state.

When runnable, run `compile-result` against the saved report and current state/contract/evidence; buildctl owns whole-workflow coverage and file scope while Verify authors semantic judgment without re-executing evidence commands. A runnable diagnostic blocks and never selects fallback. Require the current immutable result, then root appends `{phase,receipt_id}` to `phase_result_references`, records verdict and gaps/failures plus history, and applies only its allowed next phase: transition to `architect-review` for VERIFIED/PARTIAL or `implement` for FAILED. Recorded runtime absence uses the authored mapping and disclosure; missing verdict applies the phase-agent circuit breaker.

## Phase 5: Architect review

Read all artifacts. Architect Review remains the whole-diff authority: root computes the
review target from `base_ref` and owns the git diff; slice evidence never substitutes.
Run the `architect-review` contract inline with the target and verify verdict. A non-null
custom `architect-review` route may explicitly delegate it.
Save `{slug}-architect-review.md` before changing state.

When runnable, run `compile-result` against the saved review; it requires the current accepted Verify result and exact final diff, and a runnable diagnostic blocks without fallback. Root validates the immutable receipt, appends `{phase,receipt_id}` to `phase_result_references`, records verdict/findings and history, and applies only its allowed next phase: transition to terminal `complete` for PASS/PASS_WITH_NOTES, or `implement` with `architect_fixes` for FAIL and fresh Verify. Recorded runtime absence uses the authored mapping and disclosure; missing verdict applies the phase-agent circuit breaker.

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

Before every dispatch or transition, append the underlying typed occurrence to `counter_events`
and run `buildctl check-counters --state .build/plans/{slug}-state.md`. Root owns whether an event
occurred; buildctl owns deterministic counting. `halt` is authoritative. Only recorded genuine
runtime unavailability uses the prompt counts below:

- Same workstream: at most two redispatches; then halt with `agent-retry-limit`.
- Fresh judgment: retry once for an error, timeout, or missing verdict; a second failure
  halts with `phase-agent-failure` unless the user explicitly changes the boundary.
- Agent handoff: enforce the terminal-only deadline protocol above; silence alone never
  triggers a retry, and interruption occurs only at the immutable hard deadline.
- Same phase re-entry: more than three returns halts with `phase-loop-limit`.
- Plan-review: every review-to-plan return counts; more than three total plan iterations halts with `plan-review-limit`.
- Scope change: the third report halts with `scope-change-limit`.
- No durable progress across two consecutive retries halts with `no-progress-limit`.
- Any proposed concurrent writer overlap halts dispatch until ownership is disjoint.

When a breaker fires, root writes `halted: true`, `halt_reason`, and `halt_context`, logs
the evidence in `agent_failures` or history, and asks the user for the smallest decision
needed. Never increase a limit, skip a phase, or hide a failure.
