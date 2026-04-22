# Implementation Plan: Add Status Command

## File structure mapping

| File | New/Modified | Responsibility | Depends on |
|------|-------------|----------------|------------|
| `.claude/skills/status/SKILL.md` | New | Status skill — reads and displays current workflow state | None |
| `CLAUDE.md` | Modified | Add status skill to structure documentation | `.claude/skills/status/SKILL.md` |
| `README.md` | Modified | Add status skill to skills table | `.claude/skills/status/SKILL.md` |

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

## Parallel workstreams

| Workstream | Files | Complexity | Depends on |
|-----------|-------|------------|------------|
| status-skill | `.claude/skills/status/SKILL.md` | simple | None |
| docs | `CLAUDE.md`, `README.md` | simple | status-skill |

## Implementation order

1. Create `.claude/skills/status/SKILL.md` with frontmatter and instructions as described above
2. Add status skill entry to `CLAUDE.md` structure section
3. Add status skill row to `README.md` skills table

## Verification

- Run `/build:status` with no active workflow — confirm "No active workflow" message
- Create a test state file in `.build/plans/test-state.md` with known values, run `/build:status`, confirm output matches
- Create a halted state file, run `/build:status`, confirm halt reason and context are displayed
- Delete test state files after verification
