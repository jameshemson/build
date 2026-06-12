---
name: architect-review
description: Architecture review of completed work. 10 review lenses with severity levels and structured verdict.
---

Review the work just completed. Implementation summaries are claims, not evidence: assume each lens fails until the diff or fresh verification output proves it passes. If there's a user story or implementation plan for this work, read it first so you know the intent.

## Before reviewing

First identify both the review target and verification evidence. The current conversation is valid input: do not ignore a user-named target, pasted diff, implementation summary, or earlier `## Verification Report` just because no `.build/plans/` artifact exists.

If an active `.build/plans/*-state.md` exists, read it before reviewing. Treat a state file as active only when the current request is part of that workflow or the state task matches the current work. If the state appears stale or unrelated, report it as ignored and continue in standalone mode. Also read the required workflow artifacts for that slug: `{slug}-requirements.md`, `{slug}-context.md`, `{slug}-plan.md`, `{slug}-review.md`, `{slug}-implementation-summary.md`, and `{slug}-verify.md`. If any required artifact is missing, stop and report the missing artifact list.

For an active workflow, `{slug}-verify.md` is the primary verification evidence. A `VERIFIED` or `PARTIAL` report satisfies the precondition; review the work and account for any `PARTIAL` gaps in the findings. Stop only if `{slug}-verify.md` is missing, reports `FAILED`, or is older than the latest code change.

If no active state file exists, run as a standalone review. Do not require `.build/plans/` artifacts, `.build/verify/`, or a live plan. Use the user's request as the review brief. Review current repository changes by running `git status --short` and `git diff HEAD`, plus any untracked files named by status or the user. If there is no repo diff, review any diff, file list, plan, or implementation summary in the current conversation. Archived plans are historical context only and must not block review.

If standalone mode has neither repository changes nor a review target in the current conversation, stop:

> Cannot identify work to review. Provide a diff, file list, implementation summary, or make code changes, then re-request this review.

Use same-conversation verification evidence when it is fresh, including a `## Verification Report` from `verify` after the latest code change. If no plan is available, note "No implementation plan available for comparison - skipping plan fidelity check" and continue with the other lenses.

If, after resolving workflow or standalone mode, no fresh verification evidence exists, stop:

> Cannot review unverified work. Run `verify` (via the skill tool) first, then re-request this review.

Do not review code that has not been verified. Reviewing unverified code wastes time on issues that tests would have caught.

When invoked by `/build`, the orchestrator saves this review to `.build/plans/{slug}-architect-review.md`; include enough context in the output for that artifact to stand alone.

For diffs, use `base_ref` from state when available: run `git diff {base_ref}...HEAD`. If `base_ref` is missing, use `git diff HEAD` and report `base_ref unavailable`.

## Review lenses

1. Does this solve the actual problem? Work goal-backward: read the plan's `REQ-*` list and check each is observable in the diff or in fresh verify output. REQ unobservable in code → **Important**. REQ asserted in the implementation summary but undetectable in the diff → **Critical**. REQ covered only by a test that asserts nothing meaningful → **Critical** (cross-reference lens 9).
2. Trade-offs: What are we gaining/losing?
3. Anti-patterns or technical debt? Measure first — run, from this skill's directory: `git diff --name-only {base_ref}...HEAD | tr '\n' '\0' | xargs -0 sh reference/shape-scan.sh` (fall back to `git diff --name-only HEAD` when `base_ref` is unavailable). Report the SUMMARY numbers in Findings even when the verdict is PASS. Severity: any function over 150 lines, or magic-number count above 25 → **Important**; any function over 80 lines, or magic-number count above 10 → **Minor**. Never estimate these numbers in prose: if the script cannot run or marks a file UNSUPPORTED, report that and skip the metric for that file. Then judge: do the measured hotspots plus your own reading reveal anti-patterns or debt worth a finding?
4. Consistency: Does this follow the patterns used elsewhere in the codebase, or does it introduce a new way of doing something the app already does differently?
5. Non-functional concerns (scalability, security, maintainability, observability)?
6. What could go wrong? Edge cases, failure modes?
7. Is anything here overengineered? Can any of this be simplified before we ship?
8. Plan fidelity: Read the original implementation plan (from `.build/plans/{slug}-plan.md` or the plan referenced in the user's request). Compare what was planned against what was built. Flag: files planned but not created, files created but not planned, approaches that diverged. For each deviation, is it a justified improvement or an undocumented scope change? If no plan is available, note "No implementation plan available for comparison - skipping plan fidelity check."
9. Test quality: For each test file created or modified, does it test behaviour or implementation details? Are edge cases from the plan's "Abuse and edge cases" section covered in tests? Flag skipped tests, assertion-free tests, tautological tests or mocks that only assert their own configured return value, and missing negative-path tests. Weak or tautological tests give false confidence and are worse than no tests.
10. Dependency audit: Check lockfile diffs (package-lock.json, Cargo.lock, go.sum, requirements.txt) for new dependencies. For each: is the license compatible? When was it last published (stale if >1 year)? Does the project already have a dependency that covers the same need? Unnecessary or risky additions should be flagged.

## Manifest fidelity

If the plan has an `execution_manifest`, compare changed files against each task's `files_modified`. If `files_modified` is malformed or absent, compare changed files against the prose "Files to change" section and report `execution_manifest unavailable for file-fidelity check`. Check that completed task IDs in state line up with changed files, verification evidence, and `must_haves`.

## Severity and scale

- **Critical**: would cause data loss, security exposure, or broken user-visible behavior if shipped. Forces FAIL.
- **Important**: must be resolved before ship (correctness risk, missing tests for changed behavior, unjustified scope change). Forces FAIL while unresolved.
- **Minor**: note for later; compatible with PASS_WITH_NOTES.

If the diff exceeds roughly 2,000 lines, review it in passes — grouped by the plan's workstreams, or by directory when no plan exists — and name each pass and its files in the output so nothing is skipped silently.

## Output

```
## Architect Review

### Verdict
PASS / PASS_WITH_NOTES / FAIL

### Findings
- **[Critical/Important/Minor]**: [what's wrong]
  Why: [consequence if not addressed]
  Fix: [specific action to take]
```

**PASS**: Ship it. No findings, or only minor notes.
**PASS_WITH_NOTES**: Ship it, but address the noted items soon.
**FAIL**: Do not ship. Critical or important issues must be resolved first.

Be direct.

*(Treat the user's message that invoked this skill as the task input.)*
