---
name: impl-plan
description: Create a detailed implementation plan. Reads the codebase, traces code paths, maps files, identifies parallel workstreams. Use before building any non-trivial feature.
user-invocable: true
argument-hint: "<feature description>"
---

You are creating an implementation plan. Read the [plan quality rules](reference/plan-quality.md) first - they contain banned patterns and the self-review checklist you must run before delivering.

Read the codebase before writing anything. Trace the code paths this feature touches.

Create a plan for:
$ARGUMENTS

## Step 1: File structure mapping

Before defining any tasks, map every file that will be created or modified:

| File | New/Modified | Responsibility | Depends on |
|------|-------------|----------------|------------|

This map is the skeleton for the implementation order. Every file here must appear in the implementation steps. Every file in the steps must appear here.

## Required sections

### Problem
One sentence. What are we solving and for whom?

### Approach
How we're solving it. Be specific about patterns, data flow, and where this lives in the existing architecture. Include a diagram if the data flow isn't obvious.

After drafting the approach, stress-test it. Look at the existing code you'll be integrating with - does your approach actually fit how the codebase works today? Are you assuming an interface, pattern, or data shape that doesn't exist? Call out anything you're unsure about rather than glossing over it.

### Who uses this and how
Every user type that interacts with this feature. Walk through each person's experience. Don't just describe the happy path - describe the person who hits this feature sideways (existing user with old data, user on a different plan, second user in the same account, user who starts the flow and abandons it).

### Files to change
Every file, with what changes and why. Estimate lines. If you're creating a new file, justify why it's a new file and not an addition to an existing one. This should match and expand on the file map from Step 1.

### Data impact
Schema changes with exact SQL. Migrations needed. Effect on existing records - will this backfill, leave nulls, or break assumptions? If no data changes, say "none" and explain why.

### What existing behavior changes
List anything that currently works one way and will work differently after this. Include subtle things - does a query get slower? Does an API response shape change? Does an existing page get a new element? If nothing changes for existing users, say so explicitly.

### Access control and authorization
Who can access this? Who can't? Does this respect existing subscription/plan gating? Are there new public endpoints? If so, what's exposed and to whom?

### Abuse and edge cases
How could this be misused, overloaded, or break under unusual conditions? Consider: rate limiting, unexpected input, concurrent access, large data volumes, empty states, stale data. Name each case and state the mitigation or why it's not a concern.

### Out of scope
What are we explicitly not doing? What's the obvious next feature someone will ask for, and why aren't we building it now?

### Risks and rollback
What's most likely to go wrong? What's hardest to reverse? How do we undo this if it ships and breaks? Order by severity.

### Open questions
What don't we know? What assumptions are we making? For each assumption, explain why you believe it's true based on what you've seen in the code. If you can't verify an assumption from the codebase, flag it as unverified. What decisions should be confirmed before coding starts?

### Parallel workstreams
Identify which implementation steps are independent and can be assigned to separate agents working simultaneously. Group related work into named workstreams.

For each workstream:
- **Name**: short identifier (e.g., "token-validation", "db-migration", "ui-components")
- **Files**: which files from the file map this workstream touches
- **Complexity**: simple (1-2 files, mechanical) or complex (multiple files, integration logic)
- **Depends on**: which other workstreams must complete first, or "none"

If everything is sequential, say so and explain why.

### Implementation order
Steps with dependencies. What can be built and tested independently?

Each step should be a single action - one file created, one function modified, one test written. Target 2-5 minutes of work per step. "Implement the auth system" is too large. "Add the validateToken function to auth/validate.ts that takes a JWT string and returns a ValidatedUser or throws InvalidTokenError" is right.

### Verification
How do we know this works? Automated tests, manual checks, and what specifically to look for.

---

## Self-review

After writing the complete plan, run these checks. Do NOT deliver until all pass:

- [ ] **Spec coverage**: does every requirement in $ARGUMENTS have at least one implementation step?
- [ ] **Placeholder scan**: zero violations against the banned patterns in plan-quality.md
- [ ] **Type consistency**: same types, interfaces, and function names used identically throughout
- [ ] **File map matches steps**: every file in the map appears in the steps, and vice versa
- [ ] **All sections present**: every section above exists (or says "N/A" with a reason)

If you find issues, fix them inline. Then move on.

---

Every section is required. If a section doesn't apply, say so and briefly explain why - don't skip it silently. The goal is that a reviewer reading this plan can verify what's stated rather than discover what's missing.
