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

## Common Verification Commands by Stack

### Node.js / TypeScript
```
Tests:      npm test / npx jest / npx vitest
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
