# Evidence Requirements

## Claims-to-Evidence Mapping

Every claim requires specific evidence. No exceptions.

| Claim | Required evidence | NOT sufficient |
|-------|------------------|----------------|
| "Tests pass" | Test runner output showing pass count and zero failures | Previous run, "should pass", code looks correct |
| "Build succeeds" | Build command output with exit code 0 | Linter passing, no errors in editor |
| "Types check" | Type checker output with zero errors | Build passing (different check) |
| "No regressions" | Full test suite output showing existing tests still pass | Running only new tests |
| "Feature works" | Specific test output or manual verification with observed output | "I implemented it correctly" |
| "Performance is acceptable" | Benchmark output with actual numbers | "Should be fast enough" |
| "No lint errors" | Linter output showing zero issues | Type checker passing (different tool) |
| "Migration runs cleanly" | Migration command output showing success | SQL looks correct |
| "API returns correct response" | Actual request/response output (curl, httpie, test) | "The handler returns the right thing" |
| "Bug is fixed" | Test that reproduces the original bug now passes | Code change that addresses the cause |
| "Auth is enforced" | Test showing unauthenticated request returns 401/403 | "The middleware is applied", code inspection |
| "No injection vulnerabilities" | Test with malicious input (SQL injection string, XSS payload, path traversal) showing it's rejected or escaped | "Input is validated", "we use parameterized queries" |
| "Secrets are not exposed" | Grep output showing no hardcoded secrets, API keys, or credentials in committed files | "We use environment variables" |
| "CSRF protection works" | Test showing cross-origin request without valid token is rejected | "The CSRF middleware is enabled" |

## Typed evidence kinds

New plans use `evidence_mode: typed`. Each must-have declares one kind and a non-empty
ref; Verify reports evidence against the declared claim, kind, and ref rather than
crediting any convenient output.

- `behavioral-test`: the ref names the exact test file and test ID/name. Fresh runner
  output must show that test executed and passed. The file's presence is only structural.
- `command-assertion`: the ref names an exact command and expected output/assertion. Exit
  zero alone is insufficient when the claim requires a particular value or invariant.
- `structural`: the ref names the file, symbol, field, or source inspection. A diff or
  changed-file list can prove existence/shape only. Structural evidence never proves behavior.
- `manual-receipt`: the ref names the steps and expected observation. The receipt records
  the fresh action, actual observation, and result; a prediction is not a receipt.

Stronger direct evidence may support a structural claim, but weaker evidence never supports
a behavioral claim. Passing unrelated tests, broad suite success without the named test,
and changed production files do not satisfy behavioral evidence. Missing or mismatched behavioral evidence is `PARTIAL` unless a command fails; an executed nonzero command is
`FAILED`.

An existing plan with no mode is `legacy-untyped`. Classify each string by its claim:
behavioral strings require fresh behavioral-test, command-assertion, or manual-receipt
evidence, while changed files may support only structural strings. Reopened legacy tasks
upgrade during re-plan; unchanged completed tasks do not require bulk rewriting.

## Deterministic receipt mode

An active Build workflow with `compiled_contract` and `evidence_ledger`, or a standalone
request supplying both artifacts, uses a runnable buildctl runtime. Verify runs
`buildctl run-evidence --contract <contract.json>` and appends
`--evidence-dir <dir> --check-only`; this validates plan/compiler/contract hashes, receipt
hashes, complete repository identity, stable pre/post identity, and exit state without executing an evidence command.

After check-only succeeds, judge semantic coverage:

1. Every compiled exact command required by a task/slice consumer has one ledger receipt.
2. `behavioral-test` and `command-assertion` refs split at ` :: `: the exact command must
   match a fresh exit-zero receipt, and its expected observation must appear in the stored
   stdout/stderr tail. A truncated tail that omits the observation is uncovered, not inferred.
3. `structural` evidence is inspected directly in the repository at the ledger identity.
4. `manual-receipt` still requires the named fresh action and observed result.

A failed receipt or check-only failure makes the verdict `FAILED`. Valid receipts with a
missing command consumer, expected observation, requirement, or must-have make it `PARTIAL`.
Never execute plan evidence commands in receipt mode, and never replace stale/invalid receipts
with prompt execution. Standalone prompt mode applies without a complete supplied pair or when
runtime execution is genuinely unavailable; an active state must already record that fallback.

## Verify mechanical compatibility matrix

buildctl, not the verifier prompt, computes whole-workflow coverage, final file scope, prior
acceptance currency, and the allowed next phase:

| Mechanical fact | Compilable verdict | Required authored coverage |
|---|---|---|
| dirty worktree, invalid `base_ref`, out-of-plan change, malformed/tampered prior receipt, or stale subject | none; `E_RESULT_*`, no receipt | n/a |
| failed evidence command | `failed` only | `VR-###` findings name every failed command |
| missing consumer, observation, requirement, must-have, or completion receipt | `partial` only | findings name every generated gap |
| non-empty `planned-but-unchanged` set | at most `partial` | findings name every unchanged planned path |
| non-empty `test-shrink` set | at most `partial` | findings name every test path that lost assertions |
| valid pre-S-001 Plan Review bootstrap | at most `partial` | a finding names the absent generated Plan Review receipt |
| no mechanical gap | `verified`; semantic `partial`/`failed` remains available | ordinary finding/verdict consistency |

Generated receipts list exact required commands, resolved requirements, gaps, failed commands,
planned/changed/out-of-plan/planned-but-unchanged paths, and prior Plan Review status. They also
carry `test_shrink`: every test or fixture path that existed at `base_ref` and reaches `HEAD` with
fewer assertion lines, with the `bounds` naming the paths and pattern the scan read. Such a path is
in-plan by definition, so file scope cannot see it and its must-have observation still matches — a
shrink is a gap to account for in findings, not a failure on its own. Deciding whether it was a
legitimate consolidation or a weakened gate is Verify's semantic call. An earlier
state-referenced receipt remains current across a compiler-only recompile only when its immutable
hash verifies and its plan subject equals the unchanged current source-plan hash. Verify reads
these facts and authors semantic findings; it does not recompute or silently weaken them.

## Common Verification Commands by Stack

### Node.js / TypeScript
```
Tests:      CI=1 npm test / npx jest --ci / npx vitest run
Build:      npm run build / npx tsc
Types:      npx tsc --noEmit
Lint:       npm run lint / npx eslint .
```

### Python
```
Tests:      pytest / python -m pytest
Types:      mypy . / pyright
Lint:       ruff check . / flake8
Build:      python -m build / pip install -e .
```

### Go
```
Tests:      go test ./...
Build:      go build ./...
Lint:       go vet ./... / golangci-lint run
```

### Rust
```
Tests:      cargo test
Build:      cargo build
Lint:       cargo clippy
Types:      (included in cargo build)
```

### Finding the right commands
If unsure, check these files in order:
1. `package.json` (scripts section)
2. `Makefile` / `Justfile`
3. `Cargo.toml` / `pyproject.toml` / `go.mod`
4. CI config (`.github/workflows/`, `.gitlab-ci.yml`)
5. `README.md` (often documents how to run tests)

## Non-Interactive Execution

Evidence requires a command that exits. Watch modes (`vitest` default, `jest --watch`, `tsc --watch`, dev servers) do not exit and produce no verdict.

- Prefer explicit run-once forms: `npx vitest run`, `npx jest --ci`, `tsc --noEmit`.
- Set `CI=1` when invoking package scripts you didn't write — most runners disable watch under CI.
- If a command produces output then sits idle waiting for keys or file changes, kill it, record nothing from that run, and re-run the non-interactive variant.
- Long suites: let them finish. If a suite genuinely cannot finish in the session, record the exact command, how long it ran, and report that check as N/A with that note — never report a partial run as PASS.

## Freshness Rules

Evidence is only valid if it's newer than the most recent code change.

- If files were modified after the last test run, tests must be re-run
- If a dependency was added or updated, build must be re-run
- "I ran the tests earlier" is not fresh evidence
- Evidence from a different branch is not valid for the current branch

## Projects Without Test Suites

Not every project has tests, a build step, or type checking. This is fine.

For each check category:
1. **Detect** whether the check is available (look for test config, build scripts, type checker config)
2. **If available**: run it and report output
3. **If not available**: report `N/A - no [test suite|build step|type checker] found`
4. **Never fail** just because a check category doesn't exist

A project with no tests gets `Tests: N/A`. That's an honest report, not a failure. The verification report should note what IS verifiable and what ISN'T, so the reviewer knows the gaps.
