---
name: verify
description: Evidence-before-claims gate. Runs tests, build, type checks. Reports actual output. No completion claims without fresh evidence.
---

No completion claims without fresh verification evidence.

Read the [evidence requirements](reference/evidence-requirements.md) for the full claims-to-evidence mapping and per-stack command reference.

## Protocol

### 1. Read workflow artifacts when present

If `.build/plans/*-state.md` exists, read the active state file first. Treat a state file as active only when the current request is part of that workflow or the state task matches the current work. If the state appears stale or unrelated, report it as ignored and continue in standalone mode. Then read these artifacts when present:
- `.build/plans/{slug}-requirements.md`
- `.build/plans/{slug}-plan.md`
- `.build/plans/{slug}-implementation-summary.md`

If an active workflow is present and one of those required artifacts is missing, record it as missing context and make the final verdict `PARTIAL` unless a command fails. From the plan, extract any `execution_manifest` tasks. Use their `requirements`, `must_haves`, and `verify` fields as plan-declared evidence requirements. If the request itself names a plan file, read it and use its `execution_manifest` the same way.

If no active workflow state exists, record workflow artifacts as `N/A - standalone verification`. Missing `.build/plans/` artifacts must not make standalone verification `PARTIAL`.

### 2. Build one exact-command ledger

Collect every command candidate before executing anything. Detect available checks from:
- **Tests**: `package.json` scripts (test, jest, vitest), `pytest.ini`, `Cargo.toml`, `go.mod`, test directories
- **Build**: `package.json` scripts (build, compile), `Makefile`, `Cargo.toml`, `go.mod`
- **Type check**: `tsconfig.json`, `mypy.ini`, `pyproject.toml` (mypy/pyright config)
- **Lint**: `package.json` scripts (lint), `.eslintrc`, `ruff.toml`, `Cargo.toml` (clippy)

Also collect every `execution_manifest.verify` command. Key the ledger by the exact
command string; do not normalize whitespace, aliases, or environment prefixes. For each
duplicate key, union its detected categories, task IDs, `requirements`, and `must_haves`
onto one entry. When there is no manifest, use only detected candidates.

### 3. Execute the ledger once with a freshness barrier

Run each exact command once, read its full output, and attach the result to every unioned
category and evidence consumer. An entry is valid only in the same invocation when
executed after the latest code, dependency, or content change. Baseline, worker, wave,
cached, remembered, and prior-invocation output never substitutes for this evidence.

After every content-writing command, run `git status --short` and
`git diff --name-only` before consuming the next ledger result. Any later content change
makes all earlier entries stale; rerun them after the last change before issuing a
verdict. In an active workflow, newly dirty generated output makes the verdict `FAILED`
so implementation can integrate it before verification restarts.

### 4. Evaluate results and coverage

For unavailable detected categories, record `N/A` with a brief reason. For every task,
report whether each `must_haves` item has observable evidence in its shared ledger output,
test names, manual evidence text, or changed files.

If a command fails, final verdict is `FAILED`. If commands pass but any `REQ-*` has no fresh evidence, any `must_haves` item lacks evidence, or required workflow artifacts are missing, final verdict is `PARTIAL` with an `uncovered requirements` section. If all available checks and plan-declared evidence pass, final verdict is `VERIFIED`.

### 4.5 Debt scan on changed files

Scan set: every path in `execution_manifest.*.files_modified`; without a manifest, fall back to files listed by `git status --porcelain` and `git diff --name-only HEAD`. Skip paths that no longer exist. If the scan set is empty, report the Debt scan as `N/A` and continue.

Run one pass (portable word match — `-w`, not `\b`):

    grep -nwE "TODO|FIXME|XXX|HACK|we.ll fix this later|temporary fix" <files>

A match is **referenced** when the same line carries an issue or deferral ref matching `(#[0-9]+|[A-Z]{2,}-[0-9]+)` — `DEF-001` is the formal deferral convention. List every match in the report as `path:line:text`, referenced and unreferenced alike: deferrals are visible, never silent. If any marker lacks a same-line reference, the final verdict is `FAILED` with reason `unreferenced debt markers in changed files`, even when every command passes.

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
Command ledger: [exact command | unioned categories/task IDs/REQs/must_haves | result | fresh/stale]
Requirement coverage: [REQ-* covered / uncovered requirements]
must_haves evidence: [covered / missing]

### Debt scan
Files scanned: [N]
Markers: [each path:line:text, tagged referenced/unreferenced — or "none"]
Result: PASS / FAIL / N/A

### Verdict
VERIFIED - all available checks pass
FAILED - [list what failed]
PARTIAL - [list what passed], [list what's unavailable]
```

This report is fresh verification evidence for `architect-review` in the same conversation. When invoked by `/build`, the orchestrator saves the report to `.build/plans/{slug}-verify.md`; standalone runs do not need to write a disk artifact.

## Rules

- Run every command yourself. Do not rely on cached or remembered results.
- If a test fails, report the failure. Do not fix it. Fixing is the implementation phase's job.
- Evidence from before the most recent code change is stale. Re-run.
- A project with no tests gets `Tests: N/A`. That's an honest report, not a failure.
- Use non-interactive command variants: `npx vitest run` not `npx vitest`, `npx jest --ci`, `CI=1 npm test`. A watch-mode command that never exits is not evidence — if a command waits for input or file changes, kill it and re-run the non-interactive variant.

*(Treat the user's message that invoked this skill as the task input.)*
