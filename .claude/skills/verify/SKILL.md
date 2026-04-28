---
name: verify
description: Evidence-before-claims gate. Runs tests, build, type checks. Reports actual output. No completion claims without fresh evidence.
user-invocable: true
argument-hint: "[what to verify]"
allowed-tools:
  - Bash(*)
---

No completion claims without fresh verification evidence.

Read the [evidence requirements](reference/evidence-requirements.md) for the full claims-to-evidence mapping and per-stack command reference.

## Protocol

### 1. Read workflow artifacts when present

If `.build/plans/*-state.md` exists, read the active state file first. Then read these artifacts when present:
- `.build/plans/{slug}-requirements.md`
- `.build/plans/{slug}-plan.md`
- `.build/plans/{slug}-implementation-summary.md`

If an active workflow is present and one of those required artifacts is missing, record it as missing context and make the final verdict `PARTIAL` unless a command fails. From the plan, extract any `execution_manifest` tasks. Use their `requirements`, `must_haves`, and `verify` fields as plan-declared evidence requirements.

### 2. Detect available checks

Look for project configuration to determine what can be verified:
- **Tests**: `package.json` scripts (test, jest, vitest), `pytest.ini`, `Cargo.toml`, `go.mod`, test directories
- **Build**: `package.json` scripts (build, compile), `Makefile`, `Cargo.toml`, `go.mod`
- **Type check**: `tsconfig.json`, `mypy.ini`, `pyproject.toml` (mypy/pyright config)
- **Lint**: `package.json` scripts (lint), `.eslintrc`, `ruff.toml`, `Cargo.toml` (clippy)

### 3. Run each available check

For each check that's available:
1. Identify the exact command
2. Run it
3. Read the FULL output - do not summarize prematurely
4. Record the result

For checks that aren't available, record `N/A` with a brief note (e.g., "no test suite found").

### 4. Run plan-declared verification

For each unique `verify` command in `execution_manifest`, run the command once. When identical commands appear in multiple tasks, union all associated `requirements` lists and report the combined coverage. For each task, report whether each `must_haves` item has observable evidence in command output, test names, manual evidence text, or changed files.

If no `execution_manifest` is present, this section is a no-op; rely solely on the available-checks results from step 3.

If a command fails, final verdict is `FAILED`. If commands pass but any `REQ-*` has no fresh evidence, any `must_haves` item lacks evidence, or required workflow artifacts are missing, final verdict is `PARTIAL` with an `uncovered requirements` section. If all available checks and plan-declared evidence pass, final verdict is `VERIFIED`.

### 5. Report what actually happened

## Banned phrases

If you catch yourself writing any of these, STOP. Get real evidence instead.

- "should pass" / "should work"
- "looks correct" / "appears to work"
- "I'm confident that..."
- "Based on my analysis..." (without running anything)
- "The tests pass" (without showing output)
- "No errors" (without showing the command that proved it)

## Output format

```
## Verification Report
Timestamp: [YYYY-MM-DD HH:MM]

### Tests
Command: [exact command run]
Result: PASS / FAIL / N/A
Output:
[actual output, truncated to last 50 lines if longer]

### Build
Command: [exact command run]
Result: PASS / FAIL / N/A
Output:
[actual output]

### Type check
Command: [exact command run]
Result: PASS / FAIL / N/A
Output:
[actual output]

### Lint
Command: [exact command run]
Result: PASS / FAIL / N/A
Output:
[actual output]

### Plan-declared evidence
Required artifacts: [present / missing list]
Manifest commands: [commands run, de-duplicated]
Requirement coverage: [REQ-* covered / uncovered requirements]
must_haves evidence: [covered / missing]

### Verdict
VERIFIED - all available checks pass
FAILED - [list what failed]
PARTIAL - [list what passed], [list what's unavailable]
```

## Rules

- Run every command yourself. Do not rely on cached or remembered results.
- If a test fails, report the failure. Do not fix it. Fixing is the implementation phase's job.
- Evidence from before the most recent code change is stale. Re-run.
- A project with no tests gets `Tests: N/A`. That's an honest report, not a failure.

$ARGUMENTS
