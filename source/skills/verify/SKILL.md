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

### 1. Detect available checks

Look for project configuration to determine what can be verified:
- **Tests**: `package.json` scripts (test, jest, vitest), `pytest.ini`, `Cargo.toml`, `go.mod`, test directories
- **Build**: `package.json` scripts (build, compile), `Makefile`, `Cargo.toml`, `go.mod`
- **Type check**: `tsconfig.json`, `mypy.ini`, `pyproject.toml` (mypy/pyright config)
- **Lint**: `package.json` scripts (lint), `.eslintrc`, `ruff.toml`, `Cargo.toml` (clippy)

### 2. Run each available check

For each check that's available:
1. Identify the exact command
2. Run it
3. Read the FULL output - do not summarize prematurely
4. Record the result

For checks that aren't available, record `N/A` with a brief note (e.g., "no test suite found").

### 3. Report what actually happened

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
