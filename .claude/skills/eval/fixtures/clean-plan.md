# Implementation Plan: Add Status Command

## File structure mapping

| File | New/Modified | Responsibility | Depends on |
|------|-------------|----------------|------------|
| `.claude/skills/status/SKILL.md` | New | Status skill — reads and displays current workflow state | None |
| `CLAUDE.md` | Modified | Add status skill to structure documentation | `.claude/skills/status/SKILL.md` |
| `README.md` | Modified | Add status skill to skills table | `.claude/skills/status/SKILL.md` |

## Discovery level

`quick_verify` — single new skill file plus two one-line documentation edits; the read-only protocol and output format are fully specified in this plan.

## Requirements and decisions

- **REQ-001**: The status command reads `.build/plans/*-state.md` and prints a formatted summary of the active workflow state.
- **REQ-002**: CLAUDE.md and README.md document the new skill in the structure section and skills table respectively.
- **D-001**: The skill is read-only — no writes, no state mutation.
- **A-001**: State file format is defined by the orchestrator and treated as stable for this plan.

## Problem

Users have no quick way to check what phase a build workflow is in without manually reading the state file in `.build/plans/`.

## Approach

Add a `/build:status` skill that reads the current `*-state.md` file from `.build/plans/`, parses the YAML-like fields, and prints a formatted summary: current phase, task description, when it started, workstream progress, and any blockers or rework notes.

This is a read-only skill — it changes nothing, just reports. It follows the same pattern as verify (read state, report what you find) but for workflow state instead of code quality.

## Who uses this and how

**User mid-workflow**: Runs `/build:status` to see which phase they're in and what's left. Useful after resuming a session where the previous one was interrupted.

**User with no active workflow**: Runs `/build:status`, gets "No active workflow. Run /build to start one." The skill checks for `.build/plans/` directory and `*-state.md` files.

**User with a halted workflow**: Runs `/build:status`, sees the halt reason and which circuit breaker fired, plus the halt context. Helps them decide how to resume.

**User with an archived workflow**: Only active state files are shown. Archived workflows in `.build/plans/archive/` are not listed unless the user passes `--all` (out of scope for v1).

## Files to change

### `.claude/skills/status/SKILL.md` (New, ~50 lines)
Frontmatter: `name: status`, `description: Show current build workflow state`, `user-invocable: true`, `allowed-tools: Read, Glob`. No model override — lightweight read-only skill.

Instructions:
1. Glob for `.build/plans/*-state.md`. If no matches, print "No active workflow" and exit.
2. If multiple state files exist, list all with their slug and phase, then read the most recently modified one.
3. Read the state file and extract: slug, phase, task, started, last_updated, complexity, workstreams, and any optional fields (rework_notes, halted, halt_reason, halt_context, verification_failures, architect_fixes).
4. Print a formatted summary:
   ```
   Workflow: {slug}
   Task: {task}
   Phase: {phase} (started {started}, last updated {last_updated})
   Complexity: {complexity}
   Workstreams: {workstreams as comma-separated list}
   ```
5. If halted: print `Status: HALTED — {halt_reason}` and the halt context.
6. If rework_notes exist: print `Rework needed: {notes}`.
7. If verification_failures exist: print `Verification failures: {failures}`.
8. If architect_fixes exist: print `Architect fixes needed: {fixes}`.
9. Print the last 5 history entries.

### `CLAUDE.md` (Modified, +1 line)
Add to the Structure section: `- .claude/skills/status/ - Status display. Shows current workflow state.`

### `README.md` (Modified, +1 line in skills table)
Add row: `| /build:status | Shows current build workflow phase, progress, and any blockers |`

## Data impact

None. Read-only skill — reads existing `.build/plans/*-state.md` files, writes nothing.

## What existing behavior changes

Nothing. New skill, read-only, no side effects on existing files or workflows.

## New dependencies

None.

## Access control and authorization

N/A — local CLI skill, no endpoints, no auth.

## Abuse and edge cases

- **Malformed state file**: If the state file has invalid YAML or missing fields, the skill should print what it can parse and note which fields are missing rather than failing entirely.
- **Very long history**: If the history section has hundreds of entries, only print the last 5 with a note "(N more entries, see state file for full history)".
- **Multiple active workflows**: Print a summary line for each, then show details for the most recent.

## Out of scope

- Listing archived workflows (would need `--all` flag support)
- Modifying workflow state (that's the orchestrator's job)
- Displaying plan or review content (just state — use `cat` for the full files)

## Risks and rollback

1. **State file format changes**: If the orchestrator changes the state file format, this skill's parsing breaks. Low risk — the format is simple YAML-like key-value pairs. Rollback: delete `.claude/skills/status/`.

## Observability & monitoring

N/A — local CLI skill, no production deployment.

## Open questions

None. The state file format is defined by the orchestrator's SKILL.md and is stable.

## Wave 0 validation design

REQ-001 is proven by manually invoking `/build:status` with no active workflow before any doc edits — expected output is "No active workflow." This confirms the skill executes before T-003 writes documentation.

REQ-002 has no pre-implementation evidence; T-003 is the implementation. Evidence is the two one-line additions visible in CLAUDE.md and README.md after T-003 completes.

## Execution manifest

```yaml
execution_manifest:
  - id: T-001
    wave: 0
    depends_on: []
    files_modified: []
    requirements: ["REQ-001"]
    must_haves: ["manual invoke of /build:status returns 'No active workflow'"]
    verify: "Manual: invoke /build:status with no active workflow; confirm output contains 'No active workflow'"
    done: "REQ-001 baseline confirmed before documentation is written"
  - id: T-002
    wave: 1
    depends_on: ["T-001"]
    files_modified: [".claude/skills/status/SKILL.md"]
    requirements: ["REQ-001"]
    must_haves: ["SKILL.md exists with frontmatter name: status and allowed-tools: Read, Glob", "all 9 numbered instruction steps present"]
    verify: "Read .claude/skills/status/SKILL.md; confirm name field is 'status' and 9 instruction steps are present"
    done: "Status skill file created matching specification"
  - id: T-003
    wave: 2
    depends_on: ["T-002"]
    files_modified: ["CLAUDE.md", "README.md"]
    requirements: ["REQ-002"]
    must_haves: ["CLAUDE.md contains status skill entry in Structure section", "README.md contains /build:status row in skills table"]
    verify: "grep -c 'status' CLAUDE.md (expect >=1); grep -c '/build:status' README.md (expect 1)"
    done: "Documentation updated with status skill"
```

## Workflow artifacts

N/A — standalone plan. User saves this file if durable context is needed.

## UI contract

N/A — no UI files changed.

## Delivery slices

```yaml
delivery_slices:
  - id: S-001
    goal: "Users can run /build:status to inspect active workflow state, and the command is documented in CLAUDE.md and README.md"
    depends_on: []
    task_ids: ["T-002", "T-003"]
    requirements: ["REQ-001", "REQ-002"]
    must_haves: ["status skill reports the no-workflow and active-workflow states", "CLAUDE.md and README.md document /build:status"]
    verify: "Invoke /build:status with no state and with a known test state, then confirm grep -c '/build:status' README.md returns 1 and grep -c 'status' CLAUDE.md returns at least 1"
    done: "The status command reports known state values and both documentation files contain their required status entries"
```

Wave 0 task `T-001` is global. The only implementation tasks, `T-002` and `T-003`, belong exactly once to `S-001`.

## Parallel workstreams

| Workstream | Task IDs | Files | Complexity | Depends on |
|-----------|----------|-------|------------|------------|
| status-skill | `T-002` | `.claude/skills/status/SKILL.md` | simple | None |
| docs | `T-003` | `CLAUDE.md`, `README.md` | simple | status-skill |

## Implementation order

1. Create `.claude/skills/status/SKILL.md` with frontmatter and instructions as described above
2. Add status skill entry to `CLAUDE.md` structure section
3. Add status skill row to `README.md` skills table

## Verification

- Run `/build:status` with no active workflow — confirm "No active workflow" message (covers REQ-001)
- Create a test state file in `.build/plans/test-state.md` with known values, run `/build:status`, confirm output matches (covers REQ-001)
- Create a halted state file, run `/build:status`, confirm halt reason and context are displayed (covers REQ-001)
- Delete test state files after verification
- Confirm CLAUDE.md and README.md contain the new entries (covers REQ-002)
