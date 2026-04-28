---
name: impl-plan
description: Create a detailed implementation plan. Reads the codebase, traces code paths, maps files, identifies parallel workstreams. Use before building any non-trivial feature.
---

You are creating an implementation plan. Read the [plan quality rules](reference/plan-quality.md) first - they contain banned patterns and the self-review checklist you must run before delivering.

Read the codebase before writing anything. Trace the code paths this feature touches.

Create a plan for:
*(Treat the user's message that invoked this skill as the task input.)*

## Step 0: Discovery level and assumptions

If `the user's request` begins with the literal marker `[orchestrated]`, strip the marker and skip only the user interview — you're being driven by the build orchestrator and must not block on user input. Still do the targeted read, choose a discovery level, and record `A-*` assumptions with confidence and evidence. Then proceed to Step 1.

Otherwise, run a brief targeted read of the area of the codebase this feature touches, then choose and state one discovery level:
- **skip**: tiny doc-only or already fully specified change
- **quick_verify**: narrow one-file or obvious-path change
- **standard_research**: normal feature/change touching multiple files
- **deep_dive**: ambiguous, high-risk, cross-cutting, data/security, or UI-heavy change

For standalone use, ask the discovery questions below only when the level is `standard_research` or `deep_dive`, or when a low-confidence assumption would materially change the plan. For `[orchestrated]` use, do not ask; record assumptions with IDs and proceed.

**Standard hygiene (ask when interviewing):**

1. **Who & why now**: Who's running into this today, and what are they doing instead? If it's net-new, who asked for it and what triggered the ask now?
2. **Definition of done**: What does "shipped and working" look like in concrete terms — a metric, a workflow that completes, a complaint that stops? If unmeasurable, what would you check manually to know it shipped?
3. **Constraints I won't see in the code**: Deadlines, cross-team dependencies, things-that-must-not-change, prior attempts that failed and why?
4. **Out of scope**: What's the obvious next ask we are explicitly NOT building now?

**Feature-specific (2–5 questions you draft after the brief code read):**

Based on what you actually saw in the code, ask 2–5 questions about ambiguities specific to this feature. Name real files, functions, or existing patterns. No generic questions — if a question's answer is obviously inferable from the code or from `the user's request`, don't ask it.

If the user answers tersely or says "just plan it," proceed to Step 1 with what you have. Carry the user's answers into the relevant plan sections. Record assumptions as `A-001`, `A-002`, etc. with confidence (`high`, `medium`, `low`) and evidence from files, commands, or user statements.

## Step 1: File structure mapping

Before defining any tasks, map every file that will be created or modified:

| File | New/Modified | Responsibility | Depends on |
|------|-------------|----------------|------------|

This map is the skeleton for the implementation order. Every file here must appear in the implementation steps. Every file in the steps must appear here.

## Required sections

### Discovery level
State `skip`, `quick_verify`, `standard_research`, or `deep_dive`, and justify it with codebase evidence.

### Requirements and decisions
List canonical requirements as `REQ-001`, `REQ-002`, etc. List decisions as `D-001`, `D-002`, etc. List assumptions as `A-001`, `A-002`, etc. Every `REQ-*` and `D-*` must map to implementation tasks, verification, and acceptance criteria.

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

### New dependencies

List every new package, library, or tool this feature introduces. For each:
- **Name and version**: exact package name and version constraint
- **License**: the license type and whether it's compatible with this project
- **Maintenance**: last release date, open issue count, bus factor (sole maintainer?)
- **Size impact**: approximate addition to bundle size (frontend) or binary size (backend)
- **Justification**: why this dependency is needed and why an existing dependency in the project doesn't cover the need

If no new dependencies are introduced, write "None" and move on.

### Access control and authorization
Who can access this? Who can't? Does this respect existing subscription/plan gating? Are there new public endpoints? If so, what's exposed and to whom?

### Abuse and edge cases
How could this be misused, overloaded, or break under unusual conditions? Consider: rate limiting, unexpected input, concurrent access, large data volumes, empty states, stale data. Name each case and state the mitigation or why it's not a concern.

### Out of scope
What are we explicitly not doing? What's the obvious next feature someone will ask for, and why aren't we building it now?

### Risks and rollback
What's most likely to go wrong? What's hardest to reverse? How do we undo this if it ships and breaks? Order by severity.

### Observability & monitoring

How will you know this feature is working in production? For each user-facing behaviour:
- **Metrics**: what to measure (request count, latency, error rate, business metric)
- **Alerting**: what thresholds trigger alerts, who gets paged, what's the runbook
- **Dashboards**: what graphs or views should exist for ongoing monitoring
- **Failure signature**: what does it look like when this feature breaks? What's the first signal?

If this is a local tool, CLI, or has no production deployment, write "N/A - no production deployment" and move on.

### Open questions
What don't we know? What assumptions are we making? For each assumption, explain why you believe it's true based on what you've seen in the code. If you can't verify an assumption from the codebase, flag it as unverified. What decisions should be confirmed before coding starts?

### Wave 0 validation design
Before implementation tasks, define the fastest test, fixture, command, or manual evidence that will prove each `REQ-*`. If a requirement cannot be tested before coding, say exactly why and identify the first implementation task that will make it testable.

### Execution manifest
Include a compact fenced YAML block named `execution_manifest`. Each task entry must include `id`, `wave`, `depends_on`, `files_modified`, `requirements`, `must_haves`, `verify`, and `done`.

```yaml
execution_manifest:
  - id: T-001
    wave: 0
    depends_on: []
    files_modified: ["tests/example.test.ts"]
    requirements: ["REQ-001"]
    must_haves: ["test asserts the named user-visible behavior"]
    verify: "npm test -- tests/example.test.ts"
    done: "REQ-001 has command evidence and named assertions"
```

`must_haves` are non-optional acceptance criteria. They must be observable in test names, command output, manual evidence, or changed files.

### Workflow artifacts
For `/build`-orchestrated plans, name the `.build/plans/{slug}-*.md` artifacts each phase must write and read: state, context, requirements, plan, review, implementation-summary, verify, and architect-review. For standalone plans, say "N/A - standalone plan" and explain where the user should save the plan if they want durable context.

### UI contract
If UI files change, list the affected screen or component, required states (loading, empty, error, success, disabled), responsive checks (mobile and desktop), and verification method (screenshot, browser run, or component test). If no UI files change, write "N/A - no UI files changed."

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

- [ ] **Spec coverage**: does every requirement in the user's request have at least one implementation step?
- [ ] **Requirement/decision coverage**: every `REQ-*` and `D-*` appears in the execution manifest and verification plan
- [ ] **Placeholder scan**: zero violations against the banned patterns in plan-quality.md
- [ ] **Type consistency**: same types, interfaces, and function names used identically throughout
- [ ] **File map matches steps**: every file in the map appears in the steps, and vice versa
- [ ] **All sections present**: every section above exists (or says "N/A" with a reason)
- [ ] **Execution manifest validity**: every task has `id`, `wave`, `depends_on`, `files_modified`, `requirements`, `must_haves`, `verify`, and `done`
- [ ] **Observability coverage**: every user-facing behaviour in a production-deployed feature has monitoring defined, or the section says "N/A" with justification
- [ ] **Dependency justification**: every new dependency has license, maintenance status, size impact, and necessity stated

If you find issues, fix them inline. Then move on.

---

Every section is required. If a section doesn't apply, say so and briefly explain why - don't skip it silently. The goal is that a reviewer reading this plan can verify what's stated rather than discover what's missing.
