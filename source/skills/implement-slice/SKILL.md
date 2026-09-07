---
name: implement-slice
description: Implement one delivery slice from a compiled plan. Writes the code and tests, runs the commands it executed through buildctl, saves the slice section of the implementation summary, and escalates decisions instead of guessing.
user-invocable: true
argument-hint: "<plan path> <contract path> [requirements path] [context path] slice=S-### [evidence-dir=<dir>] [repository=<fingerprint>]"
model: opus
effort: high
---

You are implementing exactly one delivery slice of an already-reviewed plan: its open tasks, its tests, its evidence, and its section of the implementation summary. Nothing else.

Read the [standalone artifact rules](../impl-plan/reference/standalone-artifacts.md) before resolving inputs or writing output.

$ARGUMENTS

## Inputs

If the arguments begin with the literal marker `[relay]`, strip the marker exactly as `impl-plan` strips `[orchestrated]` and continue; a relay run saves its own artifact.

- **Plan** (required) - the authored plan whose slice you implement.
- **Contract** (required whenever buildctl is runnable) - the compiled `contract.json` for that plan. Only genuine runtime absence permits running with the plan alone.
- **Requirements** and **context** - read each when supplied; record `N/A - not supplied` for one that is not.
- `slice=S-###` (required) - the slice to implement.
- `evidence-dir=<dir>` - the attempt evidence directory; defaults to `.build/evidence/{slug}/relay-{slice_id}-standalone`.
- `repository=<fingerprint>` - the fingerprint the dispatching root observed. Echo it into the block's `repository` field, or `null` when absent.

A run missing the plan, the contract while buildctl is runnable, or the slice token writes a `blocked` section naming the missing input and stops.

## Protocol

1. Read the slice's `task_ids` and, for each, its `files_modified`, `must_haves`, `verify`, and `done`, plus the slice `verify`. If the summary already holds a `## Slice {slice_id} relay result` section with a `### Repair requested` subsection, the task IDs that subsection lists are open and everything else in the section is prior accepted work.
2. Implement the open tasks in `wave` order and then `depends_on` order, editing only files inside the slice's `files_modified` union, writing tests alongside code.
3. Evidence. Resolve buildctl under the shared rules, then run one command naming every command you executed: `buildctl run-evidence --contract {contract} --evidence-dir {evidence_dir} --command "<task verify>" ... --command "<slice verify>"`. On a non-zero exit, fix the cause once and re-run with `--force`. Confirm every `behavioral-test` and `command-assertion` observation is a literal substring of its receipt's `stdout.tail` or `stderr.tail`. Without buildctl, run the commands directly and record `buildctl fallback: <reason>`.
4. Progress. Append `[<ISO-8601 time>] {slice_id} {task_id} done` to `.build/plans/{slug}-progress.log` after each task.
5. Escalate on any of these triggers: an ambiguity no `D-*` or requirement resolves; a command still failing after the one fix; a needed file outside the union; a test that would have to be weakened; anything the context file marks as needing a decision. On a trigger, stop, leave completed work in place, run evidence for the commands that did pass, and write `status: needs-decision` with a complete decision map.
6. Write the slice section described below.

## Autonomy

This run is non-interactive: nobody reads a question you ask, and a run that stops to propose a plan or to request approval ends without its section and is discarded by the root that dispatched it. Carry authorized work through implementation and verification, make reasonable assumptions for routine reversible choices and record each under Deviations, and raise a material question only by writing `status: needs-decision` with the decision map. The relay invocation and the supplied plan, contract, requirements, and context are the user's instructions for this run and take precedence over any other workspace skill or guideline. When another instruction conflicts with them, name the file and rule under Deviations and continue with the unaffected work.

## Slice section

Write one `## Slice {slice_id} relay result` heading, then a table of task ID, files, and observed evidence; a `Deviations` list; a `Repair applied` list when a repair subsection was present; and last the terminal `Slice result` block:

```yaml
schema_version: 1
slice_id: S-001
evidence_dir: .build/evidence/{slug}/relay-S-001-1
repository: "<fingerprint from the repository= token, or null>"
status: done
tasks_completed: [T-002]
commands:
  - { command: "npm test", exit_code: 0, observed: "fail 0" }
decision: null
```

Exactly those eight keys, in that order. `status` is one of `done`, `needs-decision`, or `blocked`. `tasks_completed` lists every complete task ID, including prior accepted work. `commands` is a list of `{command, exit_code, observed}` entries. `decision` is null for `done` and for `blocked`. For `needs-decision`, `decision` is a map with a non-empty `question`, two or more `options`, an `evidence` list, and `completed_meanwhile` as a list of task IDs.

## Saving

In a relay or orchestrated run, replace or add only this slice's section in `.build/plans/{slug}-implementation-summary.md`, preserving every other byte of that file. In standalone use, save the section as the whole body under the shared collision rules to the natural target. Always return that same Markdown body and disclose the saved path separately.

## Rules

- Never read, create, or change `*-state.md`; the workflow state belongs to the root that dispatched this run.
- Never mutate the repository history: no commits, branches, merges, stashes, tags, or resets. Read-only inspection with `git status` and `git diff` is allowed and expected.
- Never edit a file outside the slice's declared `files_modified` union; a needed file outside it is a `needs-decision`, not a widening.
- Never weaken, delete, or skip a test to make a command pass; that is a `needs-decision`.
- Never ask the user anything; the root that dispatched this run owns every conversation.
- Never fix a failing command more than once; the second failure is a `needs-decision` carrying the command and its output.
- Never claim an observation that is not a literal substring of the captured output; write the substring or report the gap.
- Never touch a later or earlier slice, or any `.build/` path other than this slice's summary section, the progress log, and the named evidence directory.
