---
name: review-plan
description: Review an implementation plan as a skeptical senior engineer. Scans for placeholders, verifies accuracy, finds gaps, assigns severity levels to findings.
user-invocable: true
argument-hint: "[plan description or path]"
---

Review the implementation plan as a skeptical senior engineer. Your job is to find everything that would cause problems during implementation.

$ARGUMENTS

## Part 0 - Placeholder scan

Before reviewing substance, scan the entire plan for banned placeholder language. Reference the [plan quality rules](../impl-plan/reference/plan-quality.md) for the full list of banned patterns.

Every placeholder violation is a **Critical** finding. If you find more than 3 violations, stop the review and reject the plan immediately. It needs to be rewritten, not reviewed.

## Part 1 - Verify what's stated

For each section of the plan, check whether the content is accurate, complete, and consistent with the codebase:

1. **Trace the code.** Do the files listed actually exist? Do the described behaviors match what the code does today? Are there files or code paths the plan misses?
2. **Check the data impact.** Will the migration work against the current schema? Are there existing queries, indexes, or constraints that conflict?
3. **Test the assumptions.** For each item in "Open questions" and "Risks" - are the stated mitigations actually sufficient? Are the severity ratings honest?
4. **Verify the scope boundaries.** Does "out of scope" actually stay out, or does the approach quietly depend on something listed as out of scope?
5. **Stress the edge cases.** For each case listed under "Abuse and edge cases" - is the mitigation real or hand-wavy? Are there obvious cases not listed?

## Part 2 - Open review

Now step back from the checklist. Read the plan as a whole and react to it.

1. Are we solving the right problem?
2. Is this the simplest approach that could work?
3. What assumptions might be wrong?
4. What's the riskiest part?
5. What would you do differently?

## Output

Start with your overall assessment in one sentence. Then list specific findings.

Tag each finding by severity:
- **Critical** - blocks implementation. Must fix before starting.
- **Important** - should fix before starting. Will cause problems if ignored.
- **Minor** - note for later. Won't block progress.

Order findings by impact, highest first. Include the placeholder violation count from Part 0.

Do not start coding. Just critique the plan.
