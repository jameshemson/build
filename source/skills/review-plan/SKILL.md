---
name: review-plan
description: Review an implementation plan against its own evidence. Scans for placeholders, verifies accuracy, finds gaps, assigns severity levels to findings.
user-invocable: true
argument-hint: "[plan description or path]"
model: sonnet
context: fork
---

Review the implementation plan. Assume every section is weak until the plan's own evidence proves otherwise. Your job is to find everything that would cause problems during implementation.

Report a finding only when supported by evidence, a plausible material consequence, and a specific in-scope fix. Stop after required coverage when there is no unresolved material issue.

$ARGUMENTS

If the argument names a file path, read that file — it is the plan under review. If sibling artifacts exist beside it (`{slug}-requirements.md`, `{slug}-context.md`), read those too before reviewing.

When Build supplies a generated `contract.json`, run `buildctl validate-plan` first: any runnable compiler failure is **Critical** and blocks acceptance. Use the prompt checks below only when buildctl cannot run; record that prompt fallback explicitly.

## Part 0 - Placeholder scan

Before reviewing substance, scan the entire plan for banned placeholder language. Reference the [plan quality rules](../impl-plan/reference/plan-quality.md) for the full list of banned patterns.

Every placeholder violation is a **Critical** finding. If you find more than 3 violations, stop the review and reject the plan immediately. It needs to be rewritten, not reviewed.

## Part 1 - Verify what's stated

First, check section completeness. The impl-plan skill requires these sections: Discovery level, Requirements and decisions, Problem, Approach, Who uses this and how, Files to change, Data impact, What existing behavior changes, New dependencies, Access control and authorization, Abuse and edge cases, Out of scope, Risks and rollback, Observability & monitoring, Open questions, Wave 0 validation design, Delivery slices, Execution manifest, Workflow artifacts, UI contract, Parallel workstreams, Implementation order, Verification. Any missing section (not present, or present without "N/A" justification) is an **Important** finding.

Exception: if the plan opens with `Tier: compact`, the required sections are: Discovery level, Requirements and decisions, Problem, Approach, Files to change, What existing behavior changes, Delivery slices, Execution manifest, Parallel workstreams, Implementation order, Verification, plus any triggered extras the plan's own file map implies (data, dependency, UI, or access-control changes). A compact tier claimed for a change whose file map spans multiple non-trivial files is itself an **Important** finding — compactness is for skip/quick_verify discovery levels only.

Then, for each section of the plan, check whether the content is accurate, complete, and consistent with the codebase:

Inspect the plan's Approach for every proposed new interface, factory, design pattern, or abstraction layer, whether in frontend, backend, CLI, or tooling work. Require, in order: the present pain or a real axis of variation; the simpler alternative and why it is insufficient; and the added indirection or maintenance cost. Treat test seams, a second real implementation, and a deliberate architectural boundary as qualitative examples that may justify an abstraction, never as a numeric threshold. Future flexibility alone is insufficient. Missing, incomplete, or speculative-only evidence is **Important**.

1. **Trace the code.** Do the files listed actually exist? Do the described behaviors match what the code does today? Are there files or code paths the plan misses?
2. **Check the data impact.** Will the migration work against the current schema? Are there existing queries, indexes, or constraints that conflict?
3. **Test the assumptions.** For each item in "Open questions" and "Risks" - are the stated mitigations actually sufficient? Are the severity ratings honest?
4. **Verify the scope boundaries.** Does "out of scope" actually stay out, or does the approach quietly depend on something listed as out of scope?
5. **Stress the edge cases.** For each case listed under "Abuse and edge cases" - is the mitigation real or hand-wavy? Are there obvious cases not listed?
6. **Verify workstream independence.** If the plan has a "Parallel workstreams" section, cross-reference the file map against the workstream assignments. For each file, check which workstream(s) claim it. If any file appears in more than one independent workstream, flag as **Critical** - concurrent writer agents will produce conflicting shared-workspace edits or worktree merges. Suggest either: (a) moving the shared file into its own sequential step that runs after both workstreams, or (b) merging the conflicting workstreams into one.
7. **Validate task-to-workstream membership.** Independently cross-reference every workstream's exact `Task IDs` against the `execution_manifest`. Missing, duplicate, or unknown task membership is **Important**. For each workstream, compare its `Files` set with the union of its member tasks' `files_modified`; any extra or missing file is **Critical**. File unions for concurrently eligible workstreams must be disjoint; overlap is **Critical**. A plan that routes one writer per manifest task instead of batching ready task IDs by workstream is **Important**.
8. **Map test coverage.** For each behaviour change listed in "What existing behavior changes" and each new capability in the implementation steps, check that the "Verification" section names a specific test covering that behaviour. Flag untested behaviour changes as **Important** - these are gaps that will pass verification (no test = no failure) but leave the feature unproven.
9. **Verify requirement and decision coverage.** Every `REQ-*` and `D-*` in "Requirements and decisions" must appear in the `execution_manifest`, implementation order, and verification plan. If any ID is missing from one of those places, flag it as **Important**. If the missing ID affects authorization, data integrity, security, or destructive behavior, flag it as **Critical**.
10. **Validate the execution_manifest.** Validate the typed evidence contract: new plans have top-level `requirements`, `decisions`, `assumptions`, and `evidence_mode: typed`. Every manifest task must include `id`, `wave`, `depends_on`, `workstream`, `files_modified`, `requirements`, `decisions`, `must_haves`, `verify`, and `done`. Each must-have has exactly `id`, `claim`, and `evidence`; evidence has exactly `kind` and `ref`; supported kinds are `behavioral-test`, `command-assertion`, `structural`, and `manual-receipt`. A missing field, duplicate ID, empty ref, or unsupported evidence kind is **Important**; missing `files_modified` or `requirements` is **Critical**.
    Cross-check every named Approach symbol, behavior, and invariant: it starts with one unique literal `[B-###]` marker equal to one `bindings` ID, and resolves to one task and its one must-have. An unbound Approach obligation is **Important**. Structural evidence cannot prove behavior.
    Each new compiled task has exactly one marker/binding/must-have chain observable in one bounded implement-verify cycle; behavioral-test and command-assertion refs use `<exact command> :: <expected observation>`. A non-atomic task is **Important**. Reopened `legacy-untyped` tasks must upgrade; unchanged completed legacy tasks remain valid, but their behavioral strings still need direct evidence.
11. **Check the wave graph.** Dependencies must point to existing task IDs and cannot point to later-wave tasks. Same-wave tasks must not share `files_modified`; shared files must move to a later dependent task or the tasks must be merged. Same-wave file overlap is **Critical**.
12. **Check Wave 0 validation design.** Each `REQ-*` must have a test, fixture, command, or explicit first implementation task that makes it testable before feature work proceeds. Missing Wave 0 evidence is **Important**.
13. **Check workflow artifacts for `/build` plans.** If the plan is for `/build`, it must describe `.build/plans/{slug}-state.md`, `{slug}-context.md`, `{slug}-requirements.md`, `{slug}-plan.md`, `{slug}-review.md`, `{slug}-implementation-summary.md`, `{slug}-verify.md`, and `{slug}-architect-review.md`. Missing required artifact responsibilities are **Important**.
14. **Check UI contract when UI files change.** If planned files look like UI/frontend files, the UI contract must name the affected screen or component, required states, responsive checks, and verification method. Missing UI state coverage is **Important**.
15. **Validate delivery slices.** The `Delivery slices` section must declare one or more slices in delivery order; it cannot be `N/A`. Every slice must contain exactly these eight fields: `id`, `goal`, `depends_on`, `task_ids`, `requirements`, `must_haves`, `verify`, and `done`. IDs must be unique `S-###` values, and all requirement and task references must exist. Missing fields, non-observable `goal`/`must_haves`/`done`, or verification that does not prove the slice goal is **Important**.

    When slices are declared, Wave 0 is validation design and belongs to no delivery slice. Every manifest task with `wave > 0` must belong to exactly one slice, and no slice may name a Wave 0 task. A missing, duplicate, unknown, or Wave 0 membership is **Critical**. Preserve the hierarchy `delivery slice -> waves -> workstreams -> tasks`: slices are acceptance/checkpoint units, waves remain dependency/integration order, workstreams remain ownership/parallel-dispatch units, and tasks remain evidence/completion units. Do not accept a plan that substitutes one level for another, invents slice-local task IDs or waves, or breaks exact task-to-workstream membership; unsafe hierarchy or membership is **Critical**.

    Slice `depends_on` may name only declared earlier slices. Forward references and cycles are **Critical**. Project the task graph onto the slice graph: for every task dependency crossing a slice boundary, the consuming slice must transitively depend on the producing slice, and every task dependency must remain inside its own slice or its slice's transitive predecessor closure. Any dependency leakage is **Critical**.

    Judge slicing by delivery boundaries, not volume. An unbounded single slice is **Important** when the plan contains multiple independently acceptable outcomes or distinct risk, recovery, or integration boundaries. Artificial fragmentation is also **Important**: horizontal file/layer splits, task count, multiple workstreams, or one writer runtime alone do not justify splitting. Prefer vertical slices that prove an end-to-end outcome. A foundation-only slice is justified only when the plan explains why a vertical first slice is impossible, names the first consuming slice, and provides compatibility evidence for the foundation contract; otherwise flag it as **Important**.

## Part 2 - Open review

Now step back from the checklist. Read the plan as a whole and react to it.

1. Are we solving the right problem?
2. Is this the simplest approach that could work?
3. What assumptions might be wrong?
4. What's the riskiest part?
5. What would you do differently?

## Test-quality audit

When the plan adds or changes tests, look for weak tests: skipped tests, assertion-free tests, snapshot-only tests for behavior changes, tautological mocks that only assert their own configured return value, and tests that would pass if the production code were removed. Weak tests are **Important** unless they are explicitly limited to non-behavioral rendering snapshots.

## Output

Start with your overall assessment in one sentence. Then list specific findings.

Tag each finding by severity:
- **Critical** - blocks implementation. Must fix before starting.
- **Important** - should fix before starting. Will cause problems if ignored.
- **Minor** - note for later. Won't block progress.

Order findings by impact, highest first. Include the placeholder violation count from Part 0.

End with an explicit verdict: "Proceed to implementation" (no critical findings), "Proceed with fixes" (no critical, but important findings to address), or "Do not proceed" (critical findings that block implementation). One line, no ambiguity.

Do not start coding. Just critique the plan.
