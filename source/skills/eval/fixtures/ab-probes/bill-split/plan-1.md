Tier: compact (discovery level: quick_verify)

# Implementation Plan: weighted bill splits

## Discovery level

`quick_verify`. The change touches one existing function, `splitBill` in `src/split.js` (13 lines), and its test file `test/split.test.js` (four tests). The project has no dependencies, and `npm test` runs `node --test`.

## Requirements and decisions

- **REQ-001**: `splitBill(totalPence, people, weights)` accepts an optional `weights` array, one positive integer per person, and splits the total in proportion to the weights. `splitBill(1000, 4, [2, 1, 1, 1])` returns `[400, 200, 200, 200]`.
- **REQ-002**: When `weights` is given but its length is not `people`, or any weight is not a positive integer, `splitBill` throws `RangeError('weights must be positive integers, one per person')`.
- **D-001**: Omitting `weights` gives every person a weight of 1, so existing two-argument calls keep their current signature.
- **A-001** (high): Callers pass integer pence, as the existing `RangeError` check on `totalPence` (`src/split.js` lines 4-6) enforces.

## Problem

A group where one person ordered more cannot split a bill unevenly: `splitBill` only divides a total equally.

## Approach

- [B-001] Before touching `src/split.js`, append two tests to `test/split.test.js`. `splits a total in proportion to weights` asserts that `splitBill(1000, 4, [2, 1, 1, 1])` deep-equals `[400, 200, 200, 200]`. `rejects weights that do not match people` asserts that `splitBill(1000, 3, [1, 1])` throws a `RangeError` whose message matches `/weights must be positive integers/`.
- [B-002] In `src/split.js`, add the optional third parameter `weights`. When it is omitted, use an array of `people` ones. Each person's share is the total multiplied by their weight and divided by the sum of the weights.
- [B-003] In `src/split.js`, after the existing `people` check (lines 7-9), validate `weights` when it is given, and throw `RangeError('weights must be positive integers, one per person')` on a length mismatch or on a weight that is not a positive integer.

No new module: the change stays inside `splitBill`.

## Files to change

| File | New/Modified | Responsibility | Depends on |
|------|-------------|----------------|------------|
| `test/split.test.js` | Modified (+10 lines) | Wave 0 tests for REQ-001 and REQ-002 | `src/split.js` |
| `src/split.js` | Modified (about +10 lines) | Weighted split and weights validation | none |

## What existing behavior changes

None for existing callers. A two-argument call gives every person a weight of 1 (D-001), so it splits the same way it does today, and the four existing tests in `test/split.test.js` keep passing.

## Wave 0 validation design

T-001 writes the REQ-001 and REQ-002 tests before `src/split.js` changes. Both fail until T-002 and T-003 land: `splitBill` ignores a third argument today, so the weighted call returns `[250, 250, 250, 250]` and the mismatched call does not throw. D-001 is covered by the four existing tests, which `npm test` runs.

## Execution manifest

```yaml
requirements: [REQ-001, REQ-002]
decisions: [D-001]
assumptions: [A-001]
evidence_mode: typed
bindings:
  - { id: B-001, kind: invariant, name: "Wave 0 tests name the weighted split and the weights validation", task_id: T-001, must_have_id: MH-001 }
  - { id: B-002, kind: behavior, name: "splitBill splits a total in proportion to weights", task_id: T-002, must_have_id: MH-002 }
  - { id: B-003, kind: behavior, name: "splitBill rejects mismatched or invalid weights", task_id: T-003, must_have_id: MH-003 }
execution_manifest:
  - id: T-001
    wave: 0
    depends_on: []
    workstream: validation
    files_modified: ["test/split.test.js"]
    requirements: [REQ-001, REQ-002]
    decisions: [D-001]
    must_haves:
      - { id: MH-001, claim: "test/split.test.js defines the weighted-split and weights-validation tests.", evidence: { kind: structural, ref: "test/split.test.js tests named splits a total in proportion to weights and rejects weights that do not match people" } }
    verify: "node --check test/split.test.js"
    done: "Both Wave 0 tests exist and parse before src/split.js changes."
  - id: T-002
    wave: 1
    depends_on: [T-001]
    workstream: split
    files_modified: ["src/split.js"]
    requirements: [REQ-001]
    decisions: [D-001]
    must_haves:
      - { id: MH-002, claim: "splitBill(1000, 4, [2, 1, 1, 1]) returns [400, 200, 200, 200].", evidence: { kind: behavioral-test, ref: "node --test --test-reporter=tap test/split.test.js :: ok 5 - splits a total in proportion to weights" } }
    verify: "node --test --test-reporter=tap test/split.test.js"
    done: "The weighted-split test passes."
  - id: T-003
    wave: 2
    depends_on: [T-002]
    workstream: split
    files_modified: ["src/split.js"]
    requirements: [REQ-002]
    decisions: [D-001]
    must_haves:
      - { id: MH-003, claim: "A weights array whose length is not people throws the weights RangeError.", evidence: { kind: behavioral-test, ref: "node --test --test-reporter=tap test/split.test.js :: ok 6 - rejects weights that do not match people" } }
    verify: "node --test --test-reporter=tap test/split.test.js"
    done: "The weights-validation test passes."
```

## Delivery slices

```yaml
delivery_slices:
  - id: S-001
    goal: "A bill can be split in proportion to per-person weights, and invalid weights are rejected."
    depends_on: []
    task_ids: ["T-002", "T-003"]
    requirements: ["REQ-001", "REQ-002"]
    must_haves: ["splitBill(1000, 4, [2, 1, 1, 1]) returns [400, 200, 200, 200]", "mismatched weights throw the weights RangeError"]
    verify: ["node --test --test-reporter=tap test/split.test.js", "npm test"]
    done: "Both new tests pass inside the full suite."
```

Wave 0 task `T-001` is global. The implementation tasks `T-002` and `T-003` each belong to `S-001` exactly once.

## Parallel workstreams

| Workstream | Task IDs | Files | Complexity | Depends on |
|-----------|----------|-------|------------|------------|
| validation | `T-001` | `test/split.test.js` | simple | none |
| split | `T-002`, `T-003` | `src/split.js` | simple | validation |

Everything is sequential: each task needs the previous one.

## Implementation order

1. T-001: append the two tests described in [Approach] to `test/split.test.js`; run `node --check test/split.test.js`.
2. T-001: run `node --test --test-reporter=tap test/split.test.js` once and confirm tests 5 and 6 fail.
3. T-002: add the `weights` parameter and the weighted split to `src/split.js`.
4. T-002: run `node --test --test-reporter=tap test/split.test.js` and confirm `ok 5 - splits a total in proportion to weights`.
5. T-003: add the `weights` validation after the `people` check in `src/split.js`.
6. T-003: run `node --test --test-reporter=tap test/split.test.js` and confirm `ok 6 - rejects weights that do not match people`.

## Verification

- REQ-001: `node --test --test-reporter=tap test/split.test.js` prints `ok 5 - splits a total in proportion to weights`.
- REQ-002: the same command prints `ok 6 - rejects weights that do not match people`.
- D-001: `npm test` exits 0 with `ℹ fail 0`, including the four existing tests.
