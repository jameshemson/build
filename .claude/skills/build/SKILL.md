---
name: build
description: Structured build workflow - plan, review, implement, verify, architect review. Drives the entire cycle autonomously.
user-invocable: true
argument-hint: "<feature description>"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Agent, Skill, TaskCreate, TaskUpdate, TaskGet, TaskList, TaskOutput
---

You are orchestrating a structured build workflow. You act like Claude Code itself - use agents for parallel work, use tasks for tracking, be autonomous but structured. **You drive the entire workflow from start to finish without stopping to ask the user to switch sessions or models.** Use agents with model overrides to run phases that need a different model.

## First: Read State

Look in `.build/plans/` for `*-state.md` files (ignore `archive/`). Field formats and lifecycle rules are defined in [state schema](reference/state-schema.md).

- **No state file**: fresh workflow. Generate a short slug from $ARGUMENTS (e.g. "holding-page", "auth-refactor"). If the slug collides with an existing state file or archive directory, append `-2` (then `-3`, …). Start at Phase 1.
- **One state file**: read it. If $ARGUMENTS is empty or describes the same work as its `task:` field, resume at the recorded phase. When resuming, compare `git branch --show-current` with the state's `branch:` field; if they differ, check out the workflow branch before doing anything else. If state has no `branch:` field (pre-upgrade workflow), note that and continue on the current branch. If $ARGUMENTS describes different work, leave that workflow untouched and start a fresh one with a new slug.
- **Multiple state files**: read each `task:` field. Resume the one $ARGUMENTS describes. If $ARGUMENTS is non-empty and matches none, start a fresh workflow. If $ARGUMENTS is empty, list the in-flight workflows and ask the user which to resume — choosing between live workflows is the user's call, not a session-switch stop.

All files for a workflow use the slug as a prefix:
- `{slug}-state.md` - workflow state
- `{slug}-context.md` - repo conventions, user constraints, discovered patterns, assumptions, out-of-scope notes
- `{slug}-requirements.md` - canonical requirements, decisions, assumptions, acceptance criteria, must_haves
- `{slug}-plan.md` - implementation plan
- `{slug}-review.md` - review notes
- `{slug}-implementation-summary.md` - completed waves, task IDs, files changed, deviations, blockers
- `{slug}-verify.md` - verification report
- `{slug}-architect-review.md` - architect review findings

Also read the artifacts required for the current phase - these carry context from previous phases. Always write the artifact the next phase needs before updating state to that phase.

Create the `.build/plans/` directory if it doesn't exist.

---

## Phase 1: Plan

**Trigger**: No state file, or state says `phase: plan`

1. **Git preflight**: Run `git status --porcelain`. If output is non-empty, stop and show the user the dirty files — the workflow needs a clean tree so `base_ref` diffs and worktree merges contain only workflow changes. (This stop and the multiple-workflow choice are the only allowed pre-start stops.) Then run `git rev-parse HEAD` to capture `base_ref`, and create the workflow branch: `git checkout -b build/{slug}`.
2. **Parallel codebase exploration**: Deploy multiple Explore agents simultaneously to understand the codebase. Split by concern area, e.g.:
   - Agent 1: Architecture, project structure, build system, existing patterns
   - Agent 2: The specific area(s) of code relevant to $ARGUMENTS
   - Agent 3: Existing tests, test patterns, CI configuration
   - Add more agents if the task spans multiple domains (frontend/backend, multiple services, etc.)
   Wait for all agents to return before proceeding.
3. Invoke `/build:impl-plan` via the Skill tool for: [orchestrated] $ARGUMENTS
4. The plan MUST include:
   - **Requirements and Decisions**: `REQ-*`, `D-*`, and `A-*` inventories with acceptance criteria.
   - **Execution Manifest**: `execution_manifest` tasks with `id`, `wave`, `depends_on`, `files_modified`, `requirements`, `must_haves`, `verify`, and `done`.
   - **Wave 0 Validation Design**: tests, fixtures, commands, or manual evidence for each `REQ-*` before feature implementation.
   - **Workflow Artifacts**: which `{slug}-*.md` files each phase writes and reads.
   - **Parallel Workstreams**: Identify which implementation steps are independent and can be assigned to separate agents during Phase 3. Group related work into named workstreams.
   - **Test Strategy**: What tests to write at each step, framework/tooling, manual vs automated.
   - **Dependencies**: Which workstreams must complete before others can start.
5. Save the full plan to `.build/plans/{slug}-plan.md`.
6. Write `.build/plans/{slug}-context.md` with repo conventions, user constraints, discovered patterns, assumptions, and out-of-scope notes from the plan.
7. Write `.build/plans/{slug}-requirements.md` with canonical `REQ-*`, `D-*`, `A-*`, acceptance criteria, and `must_haves`.
8. Write `.build/plans/{slug}-state.md`. `base_ref` and `branch` were captured during the git preflight; write both into state:

```
slug: {slug}
base_ref: {full git SHA from git rev-parse HEAD}
branch: build/{slug}
phase: review
task: [one-line description]
started: [YYYY-MM-DD]
last_updated: [YYYY-MM-DD]
complexity: [simple|complex]
requirements: [REQ-* list]
decisions: [D-* list]
assumptions_confirmed: [A-* list with status inferred|confirmed]
workstreams: [list of named parallel workstreams from the plan]
execution_manifest: [summary of task IDs, waves, depends_on, files_modified]
completed_tasks: []
history:
  - [YYYY-MM-DD HH:MM] Plan created
```

Set complexity to `complex` if the plan touches 5+ files or has multiple independent workstreams.

9. **Auto-continue**: Proceed directly to Phase 2 in this session. `/build:review-plan` pins its own model and context (`model: sonnet`, `context: fork`), so no agent wrapper is needed.

---

## Phase 2: Review

**Trigger**: State says `phase: review`

1. Read `.build/plans/{slug}-state.md`, `{slug}-context.md`, `{slug}-requirements.md`, and `{slug}-plan.md`
2. Invoke `/build:review-plan` via the Skill tool, passing the plan path
3. Save the review to `.build/plans/{slug}-review.md`
4. Map the review's one-line verdict:
   - **"Proceed to implementation"**: update state to `phase: implement`.
   - **"Proceed with fixes"**: revise `{slug}-plan.md` now, addressing every Important finding; record each change under `review_fixes_applied:` in state and append a history entry; then `phase: implement`. Do not re-run the full review — the mid-review gate covers the revisions.
   - **"Do not proceed"**: update state to `phase: plan` with `rework_notes:` listing each Critical finding, and re-enter Phase 1.
   - **No verdict line found**: treat as a phase-agent failure (see Circuit breakers).
5. Append to history, then continue to the phase the state now names.

---

## Phase 3: Implement

**Trigger**: State says `phase: implement`

1. Read `.build/plans/{slug}-state.md`, `{slug}-requirements.md`, `{slug}-context.md`, `{slug}-plan.md`, and `{slug}-review.md`. If there are rework notes from a previous review, address those first.
2. Create tasks for each implementation step from the plan. Mark them as you go.
3. **Deploy agents per workstream**: Prefer the plan's `execution_manifest`. Route tasks by `wave`, `depends_on`, and `files_modified`. If the manifest is absent or malformed, report that and fall back to the prose implementation order and parallel workstreams:
   - Each independent workstream gets its own agent running in an **isolated worktree** (`isolation: "worktree"`)
   - Give each agent only its assigned task IDs, files, `must_haves`, verification commands, and what "done" looks like
   - **Worktrees cannot see `.build/`**: workflow artifacts are normally gitignored, so they do not exist inside isolated worktrees. Dispatch prompts must inline every requirement, file path, must-have, and verification command the agent needs — never tell a workstream agent to read a `.build/plans/` file. Agents must not create or edit anything under `.build/`.
   - **Spec compliance**: Each agent must verify its output against its assigned spec from the plan before reporting done. Include in every dispatch prompt: "Before reporting DONE, check your work against the plan's spec for this workstream. Every file, behavior, and test listed in your spec must be accounted for. If you built something the spec didn't ask for, or skipped something it did, report that."
   - **Agent status reporting**: Include this in every agent dispatch prompt: "When finished, report your status as one of: DONE (all work complete, tests pass, spec satisfied), DONE_WITH_CONCERNS (complete but flagging doubts), NEEDS_CONTEXT (missing information, cannot proceed), BLOCKED (cannot complete, explain why), SCOPE_CHANGE (the plan is wrong or incomplete - you discovered something that changes the approach. Describe what you found and why the plan can't proceed as written)."
   - Run agents for independent workstreams in parallel (single message, multiple Agent tool calls)
   - For workstreams with dependencies, wait for the dependency to complete before launching the dependent agent
   - On resume, skip task IDs already in `completed_tasks` unless `verification_failures`, `architect_fixes`, or `rework_notes` names those task IDs
   - `completed_tasks` is task-ID memory only. It does not detect post-completion file reverts or edits; if files are reverted, clear the affected task IDs from state or add `rework_notes` naming them before resuming.
   - **Model guidance**: Prefer sonnet for single-file mechanical tasks with clear specs. Prefer fable — or opus when fable is unavailable — for multi-file integration, design judgment, or complex logic. This is guidance, not rigid - use judgment.
   - Use background agents for: running tests, linting, typechecking
4. **Handle agent statuses**:
   - **DONE**: Proceed. Merge the workstream's changes.
   - **DONE_WITH_CONCERNS**: Log the concerns. Continue, but surface them in mid-review or architect review.
   - **NEEDS_CONTEXT**: Provide the missing information and re-dispatch the agent.
   - **BLOCKED**: Escalate to the user immediately. Do not guess or work around it.
   - **SCOPE_CHANGE**: Halt all running agents for the affected workstreams. Log the discovery to the state file under `scope_changes:` with the agent's description of what was found. If the scope change affects other workstreams (shared assumptions, shared interfaces), halt those too. Update state to `phase: plan` with `rework_notes:` describing the scope change. Return to Phase 1 to revise the plan. Do not continue implementing against a known-broken plan.
5. **Test as you build** - every agent must write and pass tests for its workstream. Do not batch tests to the end. After each wave completes and its wave-level verification passes, write or update `.build/plans/{slug}-implementation-summary.md` with provisional wave results, files changed, verification commands run, deviations, blockers, and remaining task IDs. Do not append to `completed_tasks` until the wave's worktrees have been merged and integrated verification has passed.
6. **Merge and integrate**: After parallel agents return, integrate their work using this protocol:
   - Merge each worktree's changes sequentially, in dependency order from the plan (workstreams that others depend on merge first).
   - If a merge succeeds cleanly, continue to the next worktree.
   - If a merge produces conflicts:
     a. Log which files conflict and which workstreams produced them to the state file under `merge_conflicts:`.
     b. If conflicts are in non-overlapping sections of the same file, git's default merge handles them - accept the auto-resolution.
     c. If conflicts require judgment (overlapping changes to the same lines), spawn a fable agent (opus when fable is unavailable) with both worktrees' diffs, the plan context for the affected workstreams, and instructions to resolve the conflict. The agent must explain its resolution choices in its response. If the resolution agent fails, escalate to the user rather than retrying - merge conflicts requiring human judgment are a reasonable escalation point.
     d. After all merges complete, run the full test suite to verify the integrated code works. If tests fail, treat as a verification failure (return to implement phase for the affected area).
   - After a wave's worktrees are merged and integrated verification passes in the main worktree, append that wave's task IDs to `completed_tasks` and update `.build/plans/{slug}-implementation-summary.md` with final integrated status. Store task IDs only, such as `T-001`; do not store checksums or commit IDs.
7. **Mid-review gate**: After all workstreams complete and merge (before verify), spawn a **Sonnet agent** for mid-review (Phase 3b). Pass it the plan, review, state, requirements, context, and implementation-summary paths plus a summary of what was built. For complex changes (state says `complexity: complex`), also run mid-reviews after each major workstream completes. When the agent returns, address any fixes needed. If it returns RETHINK, treat as a scope change — return to Phase 1 with rework notes.
8. Commit working chunks with clear messages as you go.
9. When all implementation is done and tests pass:
   - Update `.build/plans/{slug}-implementation-summary.md` with final implementation state, completed waves, completed task IDs, files changed, deviations from plan, blockers, and verification commands run during implementation
   - Update state to `phase: verify`
   - Append to history
   - **Auto-continue**: Proceed to Phase 3c (Verify).

---

## Phase 3b: Mid-Review (Sonnet agent)

**Trigger**: Spawned inline during Phase 3 (step 7). This phase never appears in the state file's `phase:` field.

1. Read the plan, review, requirements, context, implementation summary if present, and state (which notes what's done/remaining)
2. Review changes made so far against the plan
3. Run tests, check for issues
4. **Rethink check**: Given what was learned during implementation (surprises, unexpected complexity, assumptions that turned out wrong), is the plan still the right approach? If the remaining work would be better served by a revised plan, return RETHINK with reasons.
5. Update state:
   - Good: `phase: implement`, note what's done and what's remaining
   - Issues: `phase: implement`, add `fixes_needed:` field
   - Structural problems: return RETHINK with what changed and why the current plan no longer fits
6. Append to history

**Return to caller**: PROCEED (with optional fixes), or RETHINK (plan is no longer valid, describe what changed).

---

## Phase 3c: Verify

**Trigger**: State says `phase: verify`

1. Read `.build/plans/{slug}-state.md`, `{slug}-requirements.md`, `{slug}-plan.md`, and `{slug}-implementation-summary.md`
2. Invoke `/build:verify` via the Skill tool
3. Save the verification report to `.build/plans/{slug}-verify.md` before changing phase.
4. If **VERIFIED**: Update state to `phase: architect-review`. Record `verify_verdict: VERIFIED`. Auto-continue to Phase 4.
5. If **FAILED**: Update state back to `phase: implement` with `verification_failures:` field listing what failed. Address failures and re-verify.
6. If **PARTIAL** (some checks unavailable, artifacts missing, uncovered requirements, or missing `must_haves` evidence): Note what's unavailable. Record `verify_verdict: PARTIAL` and the gap list under `uncovered_requirements:` in state. Proceed to Phase 4 - gaps are not hidden, and architect review must account for them.
7. Append to history

---

## Phase 4: Architect Review

**Trigger**: State says `phase: architect-review`

1. Read `.build/plans/{slug}-state.md`, `{slug}-requirements.md`, `{slug}-context.md`, `{slug}-plan.md`, `{slug}-review.md`, `{slug}-implementation-summary.md`, and `{slug}-verify.md`. Stop and report any missing artifact before reviewing.
2. Read the full diff since the workflow started. If `base_ref` exists in state, use `git diff {base_ref}...HEAD`; otherwise use `git diff HEAD` and report `base_ref unavailable`.
3. Invoke `/build:architect-review` via the Skill tool with explicit context: workflow slug, state path, `{slug}-verify.md` path, verification verdict, and review target `git diff {base_ref}...HEAD` (or `git diff HEAD` if `base_ref` is unavailable).
4. Save the review to `.build/plans/{slug}-architect-review.md` before changing phase.
5. Update state:
   - **PASS** or **PASS_WITH_NOTES**: `phase: complete`
   - **FAIL**: `phase: implement`, add `architect_fixes:` field with specific issues
6. Append to history

After the agent returns:
- **Passed**: Continue to Phase 5 (Complete).
- **Issues**: Re-enter Phase 3 to fix the architect's findings, then re-verify.

---

## Phase 5: Complete

**Trigger**: State says `phase: complete`

1. Summarise: what was built, what was tested, key decisions made, the workflow branch name, and the merge command for the user (e.g. `git checkout main && git merge build/{slug}`). Do not merge or push yourself. If `verify_verdict:` is PARTIAL, the summary MUST include an "Uncovered requirements" heading listing every uncovered `REQ-*` and missing must-have — completion never hides gaps.
2. Archive: move the `{slug}-*.md` files to `.build/plans/archive/[date]-{slug}/`

**Say**: "Workflow complete. [summary]"

---

## Aborting a workflow

When the user asks to stop or abandon the workflow: set `phase: aborted` with `halted: true` and `halt_reason: user-abort`, append a history entry, move the `{slug}-*.md` files to `.build/plans/archive/[date]-{slug}-aborted/` (if the directory already exists from a same-day abort, append `-2`), and summarize what was completed, what branch/commits exist, and what was left undone. Never delete state — an aborted workflow must remain reconstructable.

---

## Auto-continue between phases

Skills with pinned frontmatter (`/build:review-plan` → sonnet, `/build:verify`, `/build:architect-review` → opus) are invoked directly via the Skill tool — their frontmatter handles model and context, so no agent wrapper is needed. Spawn an Agent with a model override only where no skill frontmatter applies:

- **Sonnet agent** for: Mid-Review (Phase 3b)
- **Fable agents** (opus when unavailable) for: implementation workstreams that need design judgment (see Phase 3 model guidance)

Pass any spawned agent a summary of relevant context and file paths so it can work autonomously, wait for its result, and continue the workflow from its output.

**Never stop and ask the user to start a new session.** The build loop drives itself.

---

## Circuit breakers

- **Agent retry limit**: If an agent for the same workstream fails and is re-dispatched more than 2 times, stop retrying and escalate to the user. Log all failure reasons to the state file under `agent_failures:`. The problem is likely in the plan or the codebase, not a transient failure.
- **Phase agent failure**: If a spawned phase agent (e.g. mid-review) errors or returns output missing its required verdict, re-dispatch once with the expected output format restated verbatim. On a second failure, run that phase inline in the current session and log both failures under `agent_failures:`. A phase is never skipped because its agent failed.
- **Phase loop limit**: If the workflow cycles back to the same phase more than 3 times (e.g., implement -> verify -> fail -> implement -> verify -> fail -> implement), halt the workflow and escalate. Log the full cycle history. The problem is systemic.
- **Plan↔review limit**: If the workflow re-enters Phase 1 from Phase 2 ("Do not proceed") more than 2 times — more than 3 total plan iterations — halt and escalate, logging each review's Critical findings in the history. A plan stuck in a review spiral means the requirements are unstable or contradictory; another iteration won't fix that.
- **Scope change limit**: If SCOPE_CHANGE is reported more than twice in a single workflow, halt and escalate. The original feature description is likely underspecified - re-planning won't help without more input from the user.

When any circuit breaker fires, update the state file with `halted: true`, `halt_reason: [which breaker]`, and `halt_context: [summary of failures/changes]`. The user can resume by updating the state file after addressing the root cause.

---

## Rules

- **Always read state first.** Never assume which phase you're in.
- **Always update state last.** The state file is the source of truth across sessions.
- **Never stop to ask the user to switch sessions.** Use agents with model overrides instead.
- **Never skip phases.** The review exists for a reason. The verify gate exists for a reason.
- **Tests are mandatory.** Every phase that writes code must write or update tests. If tests don't pass at the end of your phase, you're not done.
- **Verify before architect review.** Phase 3c is not optional. No verification evidence = no architect review.
- **Handle agent statuses explicitly.** DONE, DONE_WITH_CONCERNS, NEEDS_CONTEXT, BLOCKED, SCOPE_CHANGE. Don't ignore concerns or work around blocks.
- **Use agents aggressively.** Parallel exploration, parallel implementation of independent pieces, background test runs, and phase transitions. Work like Claude Code works.
- **Commit often.** Small, working commits > one big commit at the end.
- **Keep history honest.** Every phase transition gets a timestamped entry. Include what happened, not just "phase changed".
- **Idempotent state writes.** Never rewrite a state field to the value it already holds, and never append a history entry identical to the previous one. Rework loops must not accumulate state noise.
- **Respect circuit breakers.** Retry limits exist to prevent runaway agents burning tokens on a broken approach. When a limit is hit, escalate to the user with full context of what failed and why - don't work around it or increase the limit.
- **The schema is the contract.** Field formats and who-writes/who-clears rules live in [state schema](reference/state-schema.md). Reconcile stale fields before acting on them.
- **Never push or open PRs.** The workflow ends on the local `build/{slug}` branch; publishing is the user's decision.
- **Workstream agents never touch `.build/`.** Artifacts are orchestrator-owned and invisible inside worktrees.
