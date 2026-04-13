---
name: build
description: Structured build workflow - plan, review, implement, verify, architect review. Drives the entire cycle autonomously.
user-invocable: true
argument-hint: "<feature description>"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Agent, Skill, TaskCreate, TaskUpdate, TaskGet, TaskList, TaskOutput
---

You are orchestrating a structured build workflow. You act like Claude Code itself - use agents for parallel work, use tasks for tracking, be autonomous but structured. **You drive the entire workflow from start to finish without stopping to ask the user to switch sessions or models.** Use agents with model overrides to run phases that need a different model.

## First: Read State

Look in `.build/plans/` for any `*-state.md` file. If one exists, read it to determine the current phase and the workflow slug (the filename prefix, e.g. `holding-page` from `holding-page-state.md`).

If no state file exists, this is a fresh workflow - generate a short slug from $ARGUMENTS (e.g. "holding-page", "auth-refactor", "api-v2") and start at Phase 1. All files for this workflow use the slug as a prefix:
- `{slug}-state.md` - workflow state
- `{slug}-plan.md` - implementation plan
- `{slug}-review.md` - review notes

Also read the plan and review files if they exist - these carry context from previous phases.

Create the `.build/plans/` directory if it doesn't exist.

---

## Phase 1: Plan

**Trigger**: No state file, or state says `phase: plan`

1. **Parallel codebase exploration**: Deploy multiple Explore agents simultaneously to understand the codebase. Split by concern area, e.g.:
   - Agent 1: Architecture, project structure, build system, existing patterns
   - Agent 2: The specific area(s) of code relevant to $ARGUMENTS
   - Agent 3: Existing tests, test patterns, CI configuration
   - Add more agents if the task spans multiple domains (frontend/backend, multiple services, etc.)
   Wait for all agents to return before proceeding.
2. Invoke `/build:impl-plan` via the Skill tool for: $ARGUMENTS
3. The plan MUST include:
   - **Parallel Workstreams**: Identify which implementation steps are independent and can be assigned to separate agents during Phase 3. Group related work into named workstreams.
   - **Test Strategy**: What tests to write at each step, framework/tooling, manual vs automated.
   - **Dependencies**: Which workstreams must complete before others can start.
4. Save the plan to `.build/plans/{slug}-plan.md`
5. Write `.build/plans/{slug}-state.md`:

```
slug: {slug}
phase: review
task: [one-line description]
started: [YYYY-MM-DD]
last_updated: [YYYY-MM-DD]
complexity: [simple|complex]
workstreams: [list of named parallel workstreams from the plan]
history:
  - [YYYY-MM-DD HH:MM] Plan created
```

Set complexity to `complex` if the plan touches 5+ files or has multiple independent workstreams.

6. **Auto-continue**: Spawn a **Sonnet agent** to run Phase 2 (Review). Pass it the plan file path and instructions to review it. See [Auto-continue](#auto-continue-between-phases).

---

## Phase 2: Review (Sonnet agent)

**Trigger**: State says `phase: review`

1. Read `.build/plans/{slug}-plan.md`
2. Invoke `/build:review-plan` via the Skill tool
3. Save review to `.build/plans/{slug}-review.md`
4. Update state:
   - No critical issues: `phase: implement`
   - Critical issues: `phase: plan`, note what needs rework under a `rework_notes:` field
5. Append to history

**Return to caller**: whether review passed or needs rework, and a summary of findings.

After the Sonnet agent returns:
- **Passed**: Continue to Phase 3 (Implement) in the current session.
- **Rework**: Re-enter Phase 1 to revise the plan, addressing the rework notes.

---

## Phase 3: Implement

**Trigger**: State says `phase: implement`

1. Read the plan and review. If there are rework notes from a previous review, address those first.
2. Create tasks for each implementation step from the plan. Mark them as you go.
3. **Deploy agents per workstream**: Look at the plan's parallel workstreams and spin up agents simultaneously:
   - Each independent workstream gets its own agent running in an **isolated worktree** (`isolation: "worktree"`)
   - Give each agent a clear scope: which files to create/modify, which tests to write, and what "done" looks like
   - **Agent status reporting**: Include this in every agent dispatch prompt: "When finished, report your status as one of: DONE (all work complete, tests pass), DONE_WITH_CONCERNS (complete but flagging doubts), NEEDS_CONTEXT (missing information, cannot proceed), BLOCKED (cannot complete, explain why)."
   - Run agents for independent workstreams in parallel (single message, multiple Agent tool calls)
   - For workstreams with dependencies, wait for the dependency to complete before launching the dependent agent
   - **Model guidance**: Prefer sonnet for single-file mechanical tasks with clear specs. Prefer opus for multi-file integration, design judgment, or complex logic. This is guidance, not rigid - use judgment.
   - Use background agents for: running tests, linting, typechecking
4. **Handle agent statuses**:
   - **DONE**: Proceed. Merge the workstream's changes.
   - **DONE_WITH_CONCERNS**: Log the concerns. Continue, but surface them in mid-review or architect review.
   - **NEEDS_CONTEXT**: Provide the missing information and re-dispatch the agent.
   - **BLOCKED**: Escalate to the user immediately. Do not guess or work around it.
5. **Test as you build** - every agent must write and pass tests for its workstream. Do not batch tests to the end.
6. **Merge and integrate**: After parallel agents return, integrate their work. Run the full test suite to catch integration issues.
7. **For complex changes** (state says `complexity: complex`):
   - After completing each major workstream, spawn a **Sonnet agent** for mid-review (Phase 3b)
   - Pass it the plan, review, and state file paths plus a summary of what's done/remaining
   - When the agent returns, address any fixes needed and continue implementing
8. Commit working chunks with clear messages as you go.
9. When all implementation is done and tests pass:
   - Update state to `phase: verify`
   - Append to history
   - **Auto-continue**: Proceed to Phase 3c (Verify).

---

## Phase 3b: Mid-Review (Sonnet agent)

**Trigger**: State says `phase: mid-review`, or spawned inline during Phase 3

1. Read the plan, review, and state (which notes what's done/remaining)
2. Review changes made so far against the plan
3. Run tests, check for issues
4. Update state:
   - Good: `phase: implement`, note what's done and what's remaining
   - Issues: `phase: implement`, add `fixes_needed:` field
5. Append to history

**Return to caller**: whether progress looks good or issues need fixing, with specifics.

---

## Phase 3c: Verify

**Trigger**: State says `phase: verify`

1. Invoke `/build:verify` via the Skill tool
2. If **VERIFIED**: Update state to `phase: architect-review`. Auto-continue to Phase 4.
3. If **FAILED**: Update state back to `phase: implement` with `verification_failures:` field listing what failed. Address failures and re-verify.
4. If **PARTIAL** (some checks unavailable): Note what's unavailable. Proceed to Phase 4 - missing check categories are not blockers, but the architect reviewer should know.
5. Save the verification report to `.build/plans/{slug}-verify.md`
6. Append to history

---

## Phase 4: Architect Review

**Trigger**: State says `phase: architect-review`

1. Read the full diff since the workflow started (use git log/diff against the base)
2. Read the original plan and review for intent
3. Read the verification report from Phase 3c
4. Invoke `/build:architect-review` via the Skill tool
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

1. Summarise: what was built, what was tested, key decisions made
2. Archive: move the `{slug}-*.md` files to `.build/plans/archive/[date]-{slug}/`
3. If the project keeps session digests, save one

**Say**: "Workflow complete. [summary]"

---

## Auto-continue between phases

When a phase completes and the next phase needs a different model, **spawn an Agent** rather than asking the user to switch sessions:

```
Agent(
  model: "sonnet",   // or "opus" for implementation phases
  prompt: "Read .build/plans/{slug}-state.md and run the current phase of /build. [context summary]"
)
```

- **Sonnet** for: Review (Phase 2), Mid-Review (Phase 3b)
- **Opus** for: Plan (Phase 1), Implement (Phase 3), fixes after review
- Pass the agent a summary of relevant context and file paths so it can work autonomously
- Wait for the agent result and continue the workflow based on its output

**Never stop and ask the user to start a new session.** The build loop drives itself.

---

## Rules

- **Always read state first.** Never assume which phase you're in.
- **Always update state last.** The state file is the source of truth across sessions.
- **Never stop to ask the user to switch sessions.** Use agents with model overrides instead.
- **Never skip phases.** The review exists for a reason. The verify gate exists for a reason.
- **Tests are mandatory.** Every phase that writes code must write or update tests. If tests don't pass at the end of your phase, you're not done.
- **Verify before architect review.** Phase 3c is not optional. No verification evidence = no architect review.
- **Handle agent statuses explicitly.** DONE, DONE_WITH_CONCERNS, NEEDS_CONTEXT, BLOCKED. Don't ignore concerns or work around blocks.
- **Use agents aggressively.** Parallel exploration, parallel implementation of independent pieces, background test runs, and phase transitions. Work like Claude Code works.
- **Commit often.** Small, working commits > one big commit at the end.
- **Keep history honest.** Every phase transition gets a timestamped entry. Include what happened, not just "phase changed".
