# Plan Quality Rules

Read this before writing any implementation plan. These rules are non-negotiable.

## Banned Placeholder Language

The following patterns are NEVER acceptable in a plan. Each is a plan failure - replace with specifics or remove.

**Vague deferrals:**
- "TBD", "TODO", "to be determined"
- "implement later", "will be handled in a future step"
- "details to follow", "see above" (without specifics)

**Lazy descriptions:**
- "add appropriate error handling" - name WHICH errors and HOW to handle each
- "add validation" - specify WHAT validation, against WHAT rules, with WHAT error messages
- "handle edge cases" - name EACH edge case and its specific handling
- "update tests accordingly" - specify WHICH tests, testing WHAT behavior, with WHAT assertions
- "follow existing patterns" - name the PATTERN, WHERE it's used, and WHAT to replicate
- "similar to Task N" - repeat the specifics, the reader may be reading tasks out of order
- "add monitoring" / "add observability" - specify WHAT metrics, WHERE they're emitted (which service, which endpoint), WHAT thresholds trigger alerts, and WHO gets paged
- "add appropriate dependencies" / "pull in a library for X" - name EACH dependency, its VERSION, its LICENSE, and WHY it's needed over alternatives already in the project
- "verify manually" without exact observations, commands, screenshots, or files to inspect
- "tests should cover" without naming the test file, assertion, and expected result
- "ensure it works" / "properly" / "validate the behavior" without naming the observable behavior and evidence
- "same as above" / "agent should figure out" - repeat the concrete details in each task

**Missing substance:**
- Steps that describe intent without showing the concrete change
- Any step a developer would need to "figure out" to execute
- References to types, functions, or methods not defined anywhere in the plan

## Good vs Bad Steps

**BAD:** "Add error handling to the API endpoint"
**GOOD:** "In `routes/api/users.ts`, wrap the `createUser` handler in try/catch. On `DuplicateEmailError`, return 409 with `{ error: 'email_taken' }`. On `ValidationError`, return 400 with the Zod error's `flatten()` output. On unknown errors, log with request ID and return 500."

**BAD:** "Write tests for the auth module"
**GOOD:** "In `tests/auth/validate.test.ts`, add three tests: (1) valid JWT returns user object with id and email, (2) expired JWT throws `TokenExpiredError`, (3) malformed string throws `InvalidTokenError`."

**BAD:** "Update the database schema"
**GOOD:** "Add migration `002_add_user_preferences.sql`: CREATE TABLE user_preferences (user_id UUID REFERENCES users(id) ON DELETE CASCADE, theme VARCHAR(20) DEFAULT 'system', notifications_enabled BOOLEAN DEFAULT true, PRIMARY KEY (user_id))."

**BAD:** "Similar to the handler in Task 2"
**GOOD:** "Add a DELETE handler at `/api/users/:id` that: validates the :id param is a UUID, calls `userService.softDelete(id)`, returns 204 on success, returns 404 if user not found, returns 403 if the authenticated user is not an admin."

## File Map Template

Before defining tasks, map every file you'll touch:

| File | New/Modified | Responsibility | Depends on |
|------|-------------|----------------|------------|
| `src/auth/validate.ts` | New | JWT token validation | `src/types/auth.ts` |
| `src/routes/api/users.ts` | Modified | Add DELETE endpoint | `src/auth/validate.ts` |
| `tests/auth/validate.test.ts` | New | Tests for validation | `src/auth/validate.ts` |

Every file in this map must appear in the implementation steps. Every file in the implementation steps must appear in this map.

## Execution Manifest Rules

### Typed evidence contract

New plans declare `evidence_mode: typed` beside `execution_manifest`. The allowed modes are `typed` and `legacy-untyped`; a missing mode on an existing plan means `legacy-untyped`. Every typed `must_haves` item has exactly `id`, `claim`, and `evidence`; evidence has exactly `kind` and `ref`. Kinds are `behavioral-test`, `command-assertion`, `structural`, and `manual-receipt`. IDs are unique `MH-###` values. Refs name the exact test/test ID, command plus expected assertion, source/symbol inspection, or observed manual receipt. Changed files and source inspection are structural evidence only.

Typed plans also declare `bindings`. Each binding has exactly `id`, `kind`, `name`, `task_id`, and `must_have_id`; IDs are unique `B-###` values and kinds are `symbol`, `behavior`, or `invariant`. Every named symbol, behavior, and invariant in Approach must follow one binding, one manifest task, and one must-have. Every referenced task and must-have exists, and the must-have belongs to that task.

Evidence atomicity is semantic, not a file-count threshold. Each task must let every must-have be independently observed in one bounded implement-verify cycle. Split unrelated claims, APIs, migrations, fixtures, or invariants when one broad command cannot identify which obligation is missing. Multiple files are valid when they form one independently evidenced outcome.

Existing missing-mode plans remain `legacy-untyped`; unchanged tasks continue, but changed files never prove behavioral strings. Reopened tasks must upgrade their must-haves and named obligations to the typed contract during re-plan. Completed tasks are not bulk-rewritten.

Plans must include a fenced YAML block named `execution_manifest`. Every task entry must have:
- `id`: stable task ID like `T-001`
- `wave`: integer execution wave; lower waves run first
- `depends_on`: list of task IDs that must complete first
- `files_modified`: exact files created or modified by the task
- `requirements`: `REQ-*` IDs the task satisfies
- `must_haves`: typed, observable acceptance criteria, not advice
- `verify`: exact command or inspection that proves the task
- `done`: observable completion statement

Every `REQ-*` and `D-*` must appear in at least one task and at least one verification path. Same-wave tasks must not share `files_modified`; put shared files in a later dependent task or merge the workstreams.

## Delivery Slice Rules

Every plan must include a fenced YAML block named `delivery_slices`. Each entry has exactly `id`, `goal`, `depends_on`, `task_ids`, `requirements`, `must_haves`, `verify`, and `done`; IDs use `S-###`.

Delivery slices preserve this hierarchy: delivery slice → dependency waves → disjoint workstreams → execution-manifest tasks. Wave 0 is global and must not appear in a slice. Every task in waves greater than 0 belongs to exactly one slice. Slice `depends_on` entries name existing earlier slices, and every task dependency must be in Wave 0, the same slice, or a declared predecessor slice.

Ordinary work uses one slice. Multiple slices are valid only for dependency-ordered independently acceptable outcomes, materially distinct risk/recovery boundaries, or an integration checkpoint too broad to verify or recover coherently. Task count, multiple workstreams, and one writer's runtime are not sufficient reasons to split.

Each slice is dependency-closed, preferably vertical, integrated and working at its boundary, and backed by exact verification for its named requirements and observable must-haves. A foundation-only slice is valid only when the plan explains why a vertical slice is impossible, names its first consuming slice, and provides exact compatibility evidence. Manifest task IDs remain planning, evidence, and completion units, not dispatch units.

## Workstream Routing Rules

Every manifest task ID must belong to exactly one workstream, and every workstream `Task IDs` entry must name an existing manifest task. Missing, duplicate, or unknown membership is invalid. Each workstream's `Files` set must equal the union of `files_modified` for its member task IDs, with no extra or missing files. Workstreams whose dependencies allow concurrent execution must have disjoint file unions; otherwise merge them or order them through an explicit dependency.

## Workflow Artifact Rules

For `/build` workflows, phase artifacts under `.build/plans/` are durable memory and control surface:
- `{slug}-state.md`: phase, `base_ref`, decisions, assumptions, task IDs, blockers, history
- `{slug}-context.md`: repo conventions, user constraints, discovered patterns, out-of-scope notes
- `{slug}-requirements.md`: canonical `REQ-*`, `D-*`, `A-*`, acceptance criteria, `must_haves`
- `{slug}-plan.md`: full plan plus `execution_manifest`
- `{slug}-review.md`: plan review findings and verdict
- `{slug}-implementation-summary.md`: completed waves, task IDs, files changed, deviations, blockers
- `{slug}-verify.md`: command evidence, requirement coverage, missing `must_haves`, verdict
- `{slug}-architect-review.md`: final architecture review findings and verdict

Every phase must write the artifact the next phase needs before updating state to that next phase.

## Self-Review Checklist

Run these checks after writing the plan. All must pass before delivering.

### 1. Spec coverage
Read the feature description again. For each requirement, can you point to a specific implementation step that addresses it? List any gaps.

### 1a. Requirement and decision coverage
Every `REQ-*` and `D-*` appears in the execution manifest, implementation order, and verification plan. Every task has observable `must_haves`.

### 1b. Binding coverage and evidence atomicity
Every named Approach obligation has one valid binding to its owning typed must-have. Every evidence kind and ref fits the claim, and every task's must-haves can be independently observed in one bounded implement-verify cycle. Reopened `legacy-untyped` tasks are upgraded; completed legacy tasks are preserved.

### 2. Placeholder scan
Search your plan for any phrase from the banned list above. Also search for: vague verbs without objects ("handle", "process", "manage" without specifying what), conditional language without specifics ("if needed", "as appropriate", "when necessary"). Zero violations required.

### 3. Type consistency
Check that the same types, interfaces, function names, and property names are spelled identically throughout. A function called `clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 is a bug in the plan.

### 4. File map matches implementation order
Every file in the map has at least one implementation step. Every file touched in the steps is in the map.

### 4a. Execution manifest matches implementation order
Every task in the implementation order appears in `execution_manifest`, and every manifest task appears in the implementation order. Same-wave tasks do not share files.

### 4b. Workstream membership and union safety
Every manifest task ID belongs to exactly one workstream; no workstream contains an unknown ID, and no task has missing or duplicate membership. Each workstream's `Files` set exactly matches the union of its member tasks' `files_modified`, with no extra or missing files. File unions for concurrently eligible workstreams are disjoint.

### 4c. Delivery slice integrity
The `delivery_slices` block exists and every entry has exactly the required fields. Wave 0 appears in no slice; every wave-greater-than-0 task appears in exactly one. Slice IDs and dependencies are valid and ordered, and every task dependency is Wave 0, same-slice, or in a declared predecessor. Each slice is dependency-closed, integrated, independently acceptable, and has exact requirement/must-have evidence. Multiple slices have one of the permitted boundary reasons; foundation-only slices include the vertical-impossibility explanation, first consumer, and compatibility evidence. Slices do not replace workstream batching or turn manifest tasks into dispatch units.

### 4d. Abstraction justification
When the plan proposes a new interface, factory, design pattern, or abstraction layer for frontend, backend, CLI, or tooling work, verify that its Approach records, in order: (1) the present pain or a real axis of variation; (2) the simpler alternative and why it is insufficient; and (3) the added indirection or maintenance cost. A test seam, a second real implementation, and a deliberate architectural boundary are qualitative examples, not a numeric threshold. Future flexibility alone is insufficient. Do not require a dedicated section.

### 5. All sections present
Every required section exists. Sections that don't apply say "N/A" with a brief explanation - they are not silently omitted.

### 6. Observability coverage
For production-deployed features: every user-facing behaviour change has metrics, alerting, and failure signatures defined. Plans for local tools or CLIs should say "N/A - no production deployment."

### 7. Dependency justification
Every new package or library has license, maintenance status, size impact, and necessity documented. If no new dependencies, "None" is stated explicitly.

If you find issues, fix them inline. Then move on.
