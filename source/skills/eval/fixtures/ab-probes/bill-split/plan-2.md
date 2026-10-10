Tier: compact (discovery level: quick_verify)

# Implementation Plan: weighted bill splits

## Discovery level

`quick_verify`. The change touches one existing function, `splitBill` in `src/split.js` (13 lines), and its test file `test/split.test.js` (four tests). The project has no dependencies, and `npm test` runs `node --test`.

## Requirements and decisions

- **REQ-001**: `splitBill(totalPence, people, weights)` accepts an optional `weights` array, one positive integer per person, and splits the total in proportion to the weights. `splitBill(1000, 4, [2, 1, 1, 1])` returns `[400, 200, 200, 200]`.
- **REQ-002**: When `weights` is given but its length is not `people`, or any weight is not a positive integer, `splitBill` throws `RangeError('weights must be positive integers, one per person')`.
- **REQ-003**: A call without `weights` splits as it does today: `splitBill(1000, 3)` returns `[334, 333, 333]`. The remainder pennies go to the first people, so the shares always sum to the total (`src/split.js` lines 10-12).
- **D-001**: Omitting `weights` gives every person a weight of 1, so existing two-argument calls keep their current signature.
- **A-001** (high): Callers pass integer pence, as the existing `RangeError` check on `totalPence` (`src/split.js` lines 4-6) enforces.

## Problem

A group where one person ordered more cannot split a bill unevenly: `splitBill` only divides a total equally.

## Approach

- [B-001] Before any other change, add `test/split-uneven.test.js` with one test, `uneven total gives the extra pennies to the first people`, asserting that `splitBill(1000, 3)` deep-equals `[334, 333, 333]`. It passes on the unmodified code.
- [B-002] Before touching `src/split.js`, append two tests to `test/split.test.js`. `splits a total in proportion to weights` asserts that `splitBill(1000, 4, [2, 1, 1, 1])` deep-equals `[400, 200, 200, 200]`. `rejects weights that do not match people` asserts that `splitBill(1000, 3, [1, 1])` throws a `RangeError` whose message matches `/weights must be positive integers/`.
- [B-003] In `src/split.js`, add the optional third parameter `weights`. When it is omitted, use an array of `people` ones. Each person's share is the total multiplied by their weight and divided by the sum of the weights.
- [B-004] In `src/split.js`, after the existing `people` check (lines 7-9), validate `weights` when it is given, and throw `RangeError('weights must be positive integers, one per person')` on a length mismatch or on a weight that is not a positive integer.

No new module: the change stays inside `splitBill`.

## Files to change

| File | New/Modified | Responsibility | Depends on |
|------|-------------|----------------|------------|
| `test/split-uneven.test.js` | New (about 8 lines) | Wave 0 test for REQ-003 | `src/split.js` |
| `test/split.test.js` | Modified (+10 lines) | Wave 0 tests for REQ-001 and REQ-002 | `src/split.js` |
| `src/split.js` | Modified (about +10 lines) | Weighted split and weights validation | none |

## What existing behavior changes

None for existing callers. A two-argument call gives every person a weight of 1 (D-001), so it must split the same way it does today. REQ-003 pins that, including the remainder pennies, which none of the four existing tests covers.

## Wave 0 validation design

T-001 adds the REQ-003 test and confirms it passes on the unmodified code: none of the four existing tests splits an uneven total, so the remainder rule in `src/split.js` lines 10-12 had no guard. T-002 writes the REQ-001 and REQ-002 tests before `src/split.js` changes. Both fail until T-003 and T-004 land: `splitBill` ignores a third argument today, so the weighted call returns `[250, 250, 250, 250]` and the mismatched call does not throw. The `S-001` slice verify reruns the REQ-003 test after T-003 and T-004, because the weighted split rewrites the code it guards.

## Execution manifest

```yaml
requirements: [REQ-001, REQ-002, REQ-003]
decisions: [D-001]
assumptions: [A-001]
evidence_mode: typed
bindings:
  - { id: B-001, kind: invariant, name: "uneven split gives the remainder pennies to the first people", task_id: T-001, must_have_id: MH-001 }
  - { id: B-002, kind: invariant, name: "Wave 0 tests name the weighted split and the weights validation", task_id: T-002, must_have_id: MH-002 }
  - { id: B-003, kind: behavior, name: "splitBill splits a total in proportion to weights", task_id: T-003, must_have_id: MH-003 }
  - { id: B-004, kind: behavior, name: "splitBill rejects mismatched or invalid weights", task_id: T-004, must_have_id: MH-004 }
execution_manifest:
  - id: T-001
    wave: 0
    depends_on: []
    workstream: guard
    files_modified: ["test/split-uneven.test.js"]
    requirements: [REQ-003]
    decisions: [D-001]
    must_haves:
      - { id: MH-001, claim: "On the unmodified code, splitBill(1000, 3) returns [334, 333, 333].", evidence: { kind: behavioral-test, ref: "node --test --test-reporter=tap test/split-uneven.test.js :: ok 1 - uneven total gives the extra pennies to the first people" } }
    verify: "node --test --test-reporter=tap test/split-uneven.test.js"
    done: "The REQ-003 test passes before src/split.js changes."
  - id: T-002
    wave: 0
    depends_on: []
    workstream: validation
    files_modified: ["test/split.test.js"]
    requirements: [REQ-001, REQ-002]
    decisions: [D-001]
    must_haves:
      - { id: MH-002, claim: "test/split.test.js defines the weighted-split and weights-validation tests.", evidence: { kind: structural, ref: "test/split.test.js tests named splits a total in proportion to weights and rejects weights that do not match people" } }
    verify: "node --check test/split.test.js"
    done: "Both Wave 0 tests exist and parse before src/split.js changes."
  - id: T-003
    wave: 1
    depends_on: [T-001, T-002]
    workstream: split
    files_modified: ["src/split.js"]
    requirements: [REQ-001, REQ-003]
    decisions: [D-001]
    must_haves:
      - { id: MH-003, claim: "splitBill(1000, 4, [2, 1, 1, 1]) returns [400, 200, 200, 200].", evidence: { kind: behavioral-test, ref: "node --test --test-reporter=tap test/split.test.js :: ok 5 - splits a total in proportion to weights" } }
    verify: "node --test --test-reporter=tap test/split.test.js"
    done: "The weighted-split test passes."
  - id: T-004
    wave: 2
    depends_on: [T-003]
    workstream: split
    files_modified: ["src/split.js"]
    requirements: [REQ-002]
    decisions: [D-001]
    must_haves:
      - { id: MH-004, claim: "A weights array whose length is not people throws the weights RangeError.", evidence: { kind: behavioral-test, ref: "node --test --test-reporter=tap test/split.test.js :: ok 6 - rejects weights that do not match people" } }
    verify: "node --test --test-reporter=tap test/split.test.js"
    done: "The weights-validation test passes."
```

## Delivery slices

```yaml
delivery_slices:
  - id: S-001
    goal: "A bill can be split in proportion to per-person weights, and invalid weights are rejected."
    depends_on: []
    task_ids: ["T-003", "T-004"]
    requirements: ["REQ-001", "REQ-002", "REQ-003"]
    must_haves: ["splitBill(1000, 4, [2, 1, 1, 1]) returns [400, 200, 200, 200]", "mismatched weights throw the weights RangeError", "splitBill(1000, 3) still returns [334, 333, 333]"]
    verify: ["node --test --test-reporter=tap test/split.test.js", "node --test --test-reporter=tap test/split-uneven.test.js", "npm test"]
    done: "All three tests pass inside the full suite."
```

Wave 0 tasks `T-001` and `T-002` are global. The implementation tasks `T-003` and `T-004` each belong to `S-001` exactly once.

## Parallel workstreams

| Workstream | Task IDs | Files | Complexity | Depends on |
|-----------|----------|-------|------------|------------|
| guard | `T-001` | `test/split-uneven.test.js` | simple | none |
| validation | `T-002` | `test/split.test.js` | simple | none |
| split | `T-003`, `T-004` | `src/split.js` | simple | guard, validation |

`T-001` and `T-002` touch different files and can run together in Wave 0. `T-003` and `T-004` are sequential.

## Implementation order

1. T-001: create `test/split-uneven.test.js` with the REQ-003 test; run `node --test --test-reporter=tap test/split-uneven.test.js` and confirm `ok 1 - uneven total gives the extra pennies to the first people` on the unmodified code.
2. T-002: append the two tests described in [Approach] to `test/split.test.js`; run `node --check test/split.test.js`.
3. T-002: run `node --test --test-reporter=tap test/split.test.js` once and confirm tests 5 and 6 fail.
4. T-003: add the `weights` parameter and the weighted split to `src/split.js`.
5. T-003: run `node --test --test-reporter=tap test/split.test.js` and confirm `ok 5 - splits a total in proportion to weights`, then run `node --test --test-reporter=tap test/split-uneven.test.js` and confirm `ok 1 - uneven total gives the extra pennies to the first people`.
6. T-004: add the `weights` validation after the `people` check in `src/split.js`.
7. T-004: run `node --test --test-reporter=tap test/split.test.js` and confirm `ok 6 - rejects weights that do not match people`.

## Verification

- REQ-001: `node --test --test-reporter=tap test/split.test.js` prints `ok 5 - splits a total in proportion to weights`.
- REQ-002: the same command prints `ok 6 - rejects weights that do not match people`.
- REQ-003: `node --test --test-reporter=tap test/split-uneven.test.js` prints `ok 1 - uneven total gives the extra pennies to the first people`, before and after the change.
- D-001: `npm test` exits 0 with `ℹ fail 0`, including the four existing tests.
