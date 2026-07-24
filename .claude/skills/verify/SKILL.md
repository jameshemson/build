---
name: verify
description: Evidence-before-claims gate. Runs tests, build, type checks. Reports actual output. No completion claims without fresh evidence.
user-invocable: true
argument-hint: "[what to verify]"
allowed-tools: Read, Glob, Grep, Bash
---

Use the smallest sufficient fresh evidence for the claims actually made; no completion claims without fresh verification evidence.

Read the [evidence requirements](reference/evidence-requirements.md) and [standalone artifact rules](../impl-plan/reference/standalone-artifacts.md); both are required.

## Protocol

### 1. Read workflow artifacts when present

If `.build/plans/*-state.md` exists, read the active state file first. Treat a state file as active only when the current request is part of that workflow or the state task matches the current work. If the state appears stale or unrelated, report it as ignored and continue in standalone mode. Then read these artifacts when present:
- `.build/plans/{slug}-requirements.md`
- `.build/plans/{slug}-plan.md`
- `.build/plans/{slug}-implementation-summary.md`

If an active workflow is present and one of those required artifacts is missing, record it as missing context and make the final verdict `PARTIAL` unless a command fails. From the plan, extract its evidence mode, `bindings`, and `execution_manifest` tasks. Use each task's `requirements`, typed `must_haves` evidence kind/ref, and `verify` as plan-declared requirements. Missing mode means `legacy-untyped`.

In standalone mode, consume every supplied plan, contract, ledger, requirements, context, or implementation-summary directly. Record unsupplied workflow artifacts as `N/A - standalone verification`; their absence alone must not make the verdict `PARTIAL`, and no missing sibling may be synthesized.

### 2. Select compiled-receipt or prompt mode

For an active workflow with `compiled_contract` and `evidence_ledger`, or a standalone request that supplies both artifacts, resolve buildctl under the shared rules and run only `run-evidence --check-only` (use the supplied ledger's directory as `--evidence-dir`). Read the contract, ledger, and referenced receipts directly; do not execute any plan/repository evidence command. A stale, invalid, or failed receipt check is authoritative and never selects fallback. Judge exact-command consumers, expected observations, requirements, and must-haves using the receipt rules in the reference.

Use prompt mode for standalone verification without a complete supplied contract/ledger pair, or when the shared runtime rules select fallback; disclose why supplied compiled evidence could not be checked. In an active workflow, prompt mode still requires a recorded `buildctl_fallback`; missing compiled artifacts without it are uncovered evidence, not fallback.

### 3. Prompt mode: build one exact-command ledger

Collect every command candidate before executing anything. Detect available checks from:
- **Tests**: `package.json` scripts (test, jest, vitest), `pytest.ini`, `Cargo.toml`, `go.mod`, test directories
- **Build**: `package.json` scripts (build, compile), `Makefile`, `Cargo.toml`, `go.mod`
- **Type check**: `tsconfig.json`, `mypy.ini`, `pyproject.toml` (mypy/pyright config)
- **Lint**: `package.json` scripts (lint), `.eslintrc`, `ruff.toml`, `Cargo.toml` (clippy)

Also collect every `execution_manifest.verify` command and executable `command-assertion` ref. Evidence is duplicate only when it proves the same claim at the same lifecycle authority.
Union candidates with identical exact command strings into one entry. Key the ledger by the exact
command string; do not normalize whitespace, aliases, or environment prefixes. For each unioned entry, union its detected categories, task IDs, `requirements`, and `must_haves`. Worker, integration, slice, and final gates prove distinct claims and remain mandatory.
Preserve commands required by those distinct lifecycle claims and plan- or repository-required categories. Within one authority, select the smallest claim-covering ledger using the narrowest direct command for each claim; exclude an overlapping non-identical candidate when it proves no unique required claim or category. When there is no manifest, use only detected candidates.

### 4. Prompt mode: execute once with a freshness barrier

Run each selected exact command once, read its full output, and attach the result to every unioned
category and evidence consumer. An entry is valid only in the same invocation when
executed after the latest code, dependency, or content change. Baseline, worker, wave,
cached, remembered, and prior-invocation output never substitutes for this evidence. The final verification authority owns exactly one fresh full suite.

After every content-writing command, run `git status --short` and
`git diff --name-only` before consuming the next ledger result. Any later content change
makes all earlier entries stale; rerun them after the last change before issuing a
verdict. In an active workflow, newly dirty generated output makes the verdict `FAILED`
so implementation can integrate it before verification restarts.

### 5. Evaluate results and coverage

For unavailable detected categories, record `N/A` with a brief reason. For every typed must-have, evaluate only its declared evidence kind and ref using the reference mapping. Structural evidence never proves behavior; changed files prove only structural claims. A `behavioral-test` needs the named test result, a `command-assertion` its asserted output, and a `manual-receipt` the fresh observed result. For `legacy-untyped`, classify the claim: behavioral strings still need direct test, command, or manual evidence, never changed files.

If a command fails, final verdict is `FAILED`. If commands pass but any `REQ-*` has no fresh evidence, any must-have has missing or mismatched evidence, or required workflow artifacts are missing, final verdict is `PARTIAL` with an `uncovered requirements` section. If all available checks and plan-declared evidence pass, final verdict is `VERIFIED`. Stop after selected fresh direct coverage proves every claim actually made.

### 5.5 Debt scan on changed files

Scan set: every path in `execution_manifest.*.files_modified`; without a manifest, fall back to files listed by `git status --porcelain` and `git diff --name-only HEAD`. Skip paths that no longer exist. If the scan set is empty, report the Debt scan as `N/A` and continue.

Run one pass (portable word match — `-w`, not `\b`):

    grep -nwE "TODO|FIXME|XXX|HACK|we.ll fix this later|temporary fix" <files>

Classify every match before the verdict. A **policy literal** uses the marker as input data
to define or test marker detection: a scanner pattern, lint/validation rule, explicit test
fixture, or documentation list of forbidden markers. Quoting, backticks, or prose alone do
not make an unfinished-work marker a policy literal. Every other match is **actionable**.

An actionable match is **referenced** only when the same line carries an issue or deferral
ref matching `(#[0-9]+|[A-Z]{2,}-[0-9]+)`; `DEF-001` is the formal convention. List every
match as `path:line:text` tagged `policy-literal`, `referenced-actionable`, or
`unreferenced-actionable`. Policy literals need no issue ref. If any actionable marker is
unreferenced, the final verdict is `FAILED` with reason `unreferenced debt markers in
changed files`, even when every command passes.

### 6. Report what actually happened

## Banned phrases

If you catch yourself writing any of these, STOP. Get real evidence instead.

- "should pass" / "should work"
- "looks correct" / "appears to work"
- "I'm confident that..."
- "Based on my analysis..." (without running anything)
- "The tests pass" (without showing output)
- "No errors" (without showing the command that proved it)

## Output format

Write `## Verification Report`, timestamp, Tests/Build/Type check/Lint sections with exact Command, PASS/FAIL/N/A, and actual Output; then Plan-declared evidence with required artifacts, mode, the exact-command ledger, requirement and must_haves coverage; then Debt scan with files, classified markers, and result. End prose with exactly one verdict line: `VERIFIED - all available checks pass`, `FAILED - <failures>`, or `PARTIAL - <passed and unavailable evidence>`.

This report is fresh verification evidence for `architect-review` in the same conversation. In an orchestrated run, Build root saves it. In standalone mode, save the exact report to `.build/plans/{slug}-verify.md` under the shared collision rules and still show that same report body to the user; save FAILED and PARTIAL reports too.

When all orchestrated subjects are available, end the saved report after the prose verdict with exactly one `## Machine result` YAML fence. Use `schema_version: 1`, `phase: verify`, the mapped lowercase `verdict: verified|partial|failed`, and exactly one SHA-256 subject for each of `plan`, `contract`, `requirements`, `implementation-summary`, `evidence-ledger`, and `repository`; do not guess hashes. Encode prose findings in order with gap-free `VR-###` IDs and exactly `id`, `severity`, `summary`, `evidence`, `consequence`, and `fix`. Severity is `critical`, `important`, or `minor`; the prose verdict and machine verdict must agree.

```yaml
## Machine result
schema_version: 1
phase: verify
verdict: verified
subjects:
  - { name: plan, sha256: "<64 lowercase hex>" }
findings: []
```

buildctl supplies the mechanical whole-workflow coverage, scope, bootstrap/currency facts, and allowed phase; Verify remains the semantic authority that authors findings and verdict without re-executing receipt-mode commands. Follow the exact compatibility matrix in the evidence reference. When any required subject is unavailable in standalone use, omit the section and end with the literal `Machine result: N/A — missing subjects: <sorted comma-separated names>` line, replacing the placeholder with actual names; never emit a partial subject set.

## Rules

- In compiled-receipt mode run only metadata `--check-only`; in prompt mode run every selected command yourself. Never rely on cached or remembered results.
- If a test fails, report the failure. Do not fix it. Fixing is the implementation phase's job.
- Evidence from before the most recent code change is stale. Re-run.
- A project with no tests gets `Tests: N/A`. That's an honest report, not a failure.
- Use non-interactive command variants: `npx vitest run` not `npx vitest`, `npx jest --ci`, `CI=1 npm test`. A watch-mode command that never exits is not evidence — if a command waits for input or file changes, kill it and re-run the non-interactive variant.

$ARGUMENTS
