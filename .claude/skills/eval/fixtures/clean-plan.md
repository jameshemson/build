Tier: compact (discovery level: quick_verify)

# Implementation Plan: check-sync --versions-only

## Discovery level

`quick_verify`. The change touches one existing script (`scripts/check-sync.js`, 80 lines), adds one test file, and adds one README sentence. `scripts/check-sync.js` already runs the version-parity pre-check (lines 21–37) before it starts the build (line 40), so the new flag only has to stop after that pre-check.

## Requirements and decisions

- **REQ-001**: `node scripts/check-sync.js --versions-only` runs only the release-version parity check. When all carriers agree it prints `Release versions agree: <version>` and exits 0, without printing `Running build...` or running `scripts/build.js`.
- **REQ-002**: README.md documents `npm run check-sync -- --versions-only` beside the existing check-sync sentence.
- **D-001**: The flag reuses the existing pre-check unchanged, so version drift still prints `Version drift across release files:` and exits 1 before the flag is consulted.
- **A-001** (high): `VERSION_CARRIERS` in `scripts/transformers/version-carriers.js` is the single list of version carriers, as check-sync's own comment states.

## Problem

Contributors who bumped a version want a fast parity check, but `npm run check-sync` always regenerates all five provider trees first.

## Approach

- [B-001] Before touching the script, add `scripts/transformers/check-sync-versions.test.js` with one test named `check-sync --versions-only reports agreeing versions without building`. It runs `node scripts/check-sync.js --versions-only` from the repo root with `spawnSync`, reads the expected version from `package.json`, and asserts exit status 0, stdout containing `Release versions agree: <version>`, and stdout not containing `Running build...`.
- [B-002] In `scripts/check-sync.js`, directly after the existing version-drift block (after line 37) and before `console.log('Running build...')`, add: if `process.argv.includes('--versions-only')`, print `Release versions agree: ${unique[0]}` and `process.exit(0)`.
- [B-003] In README.md, after the sentence ending "because it compares generated outputs against git." (line 151), add: "Run `npm run check-sync -- --versions-only` to check only that the release version carriers agree, without rebuilding."

No new abstraction: the flag is one guarded early exit.

## Files to change

| File | New/Modified | Responsibility | Depends on |
|------|-------------|----------------|------------|
| `scripts/transformers/check-sync-versions.test.js` | New (~25 lines) | Wave 0 test for REQ-001 | `scripts/check-sync.js` |
| `scripts/check-sync.js` | Modified (+4 lines) | `--versions-only` early exit | `scripts/transformers/version-carriers.js` |
| `README.md` | Modified (+1 sentence) | Document the flag | `scripts/check-sync.js` |

None of these files is generated output: `scripts/` and `README.md` are hand-authored, so `npm run build` does not touch them.

## What existing behavior changes

None for existing callers. `npm run check-sync` without the flag runs exactly as today. The new test runs inside `npm test` (the `scripts/transformers/*.test.js` glob) and does not modify any file.

## Wave 0 validation design

T-001 writes the REQ-001 test before the script changes. It fails until T-002 lands, because without the flag check-sync prints `Running build...`. REQ-002 is documentation; T-003 proves it by direct inspection.

## Execution manifest

```yaml
requirements: [REQ-001, REQ-002]
decisions: [D-001]
assumptions: [A-001]
evidence_mode: typed
bindings:
  - { id: B-001, kind: invariant, name: "Wave 0 test names the versions-only behavior", task_id: T-001, must_have_id: MH-001 }
  - { id: B-002, kind: behavior, name: "check-sync versions-only early exit", task_id: T-002, must_have_id: MH-002 }
  - { id: B-003, kind: invariant, name: "README documents the versions-only flag", task_id: T-003, must_have_id: MH-003 }
execution_manifest:
  - id: T-001
    wave: 0
    depends_on: []
    workstream: validation
    files_modified: ["scripts/transformers/check-sync-versions.test.js"]
    requirements: [REQ-001]
    decisions: [D-001]
    must_haves:
      - { id: MH-001, claim: "The test file defines the versions-only test with exit, version and no-build assertions.", evidence: { kind: structural, ref: "scripts/transformers/check-sync-versions.test.js test named check-sync --versions-only reports agreeing versions without building" } }
    verify: "node --check scripts/transformers/check-sync-versions.test.js"
    done: "The Wave 0 test exists and parses before the script changes."
  - id: T-002
    wave: 1
    depends_on: [T-001]
    workstream: check-sync
    files_modified: ["scripts/check-sync.js"]
    requirements: [REQ-001]
    decisions: [D-001]
    must_haves:
      - { id: MH-002, claim: "With --versions-only and agreeing carriers, check-sync prints the agreed version, exits 0 and does not build.", evidence: { kind: behavioral-test, ref: "node --test --test-reporter=tap scripts/transformers/check-sync-versions.test.js :: ok 1 - check-sync --versions-only reports agreeing versions without building" } }
    verify: "node --test --test-reporter=tap scripts/transformers/check-sync-versions.test.js"
    done: "The Wave 0 test passes."
  - id: T-003
    wave: 2
    depends_on: [T-002]
    workstream: docs
    files_modified: ["README.md"]
    requirements: [REQ-002]
    decisions: [D-001]
    must_haves:
      - { id: MH-003, claim: "README.md documents npm run check-sync -- --versions-only next to the existing check-sync sentence.", evidence: { kind: structural, ref: "README.md line after the check-sync sentence names npm run check-sync -- --versions-only" } }
    verify: "grep -n \"check-sync -- --versions-only\" README.md"
    done: "README names the flag and what it skips."
```

## Delivery slices

```yaml
delivery_slices:
  - id: S-001
    goal: "Contributors can run a fast release-version parity check that skips the rebuild, and README documents it."
    depends_on: []
    task_ids: ["T-002", "T-003"]
    requirements: ["REQ-001", "REQ-002"]
    must_haves: ["check-sync --versions-only exits 0 with the agreed version and no build", "README documents the flag"]
    verify: ["node --test --test-reporter=tap scripts/transformers/check-sync-versions.test.js", "npm test"]
    done: "The versions-only test passes inside the full suite and README documents the flag."
```

Wave 0 task `T-001` is global. The implementation tasks `T-002` and `T-003` each belong to `S-001` exactly once.

## Parallel workstreams

| Workstream | Task IDs | Files | Complexity | Depends on |
|-----------|----------|-------|------------|------------|
| validation | `T-001` | `scripts/transformers/check-sync-versions.test.js` | simple | none |
| check-sync | `T-002` | `scripts/check-sync.js` | simple | validation |
| docs | `T-003` | `README.md` | simple | check-sync |

Everything is sequential: each task needs the previous one.

## Implementation order

1. T-001: create `scripts/transformers/check-sync-versions.test.js` with the one test described in [Approach]; run `node --check` on it.
2. T-001: run the test once and confirm it fails because stdout contains `Running build...`.
3. T-002: add the `--versions-only` early exit to `scripts/check-sync.js` after the version-drift block.
4. T-002: run `node --test --test-reporter=tap scripts/transformers/check-sync-versions.test.js` and confirm `ok 1 - check-sync --versions-only reports agreeing versions without building`.
5. T-003: add the README sentence after line 151 and run `grep -n "check-sync -- --versions-only" README.md`.

## Verification

- `node --test --test-reporter=tap scripts/transformers/check-sync-versions.test.js` exits 0 and prints `ok 1 - check-sync --versions-only reports agreeing versions without building`.
- `npm test` exits 0 with `ℹ fail 0`.
- `npm run check-sync` without the flag still prints `Running build...` and `Outputs are in sync.` on a committed tree.
- `grep -n "check-sync -- --versions-only" README.md` prints one line.
