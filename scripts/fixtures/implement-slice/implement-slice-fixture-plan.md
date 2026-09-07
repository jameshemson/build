# Implementation plan: implement-slice-fixture

## Approach

- [B-001] `a()` is implemented and directly tested.
- [B-002] `b()` is implemented and directly tested.

## Execution manifest

```yaml
requirements: [REQ-001, REQ-002]
decisions: [D-001]
assumptions: [A-001]
evidence_mode: typed
bindings:
  - { id: B-001, kind: behavior, name: "a returns a", task_id: T-001, must_have_id: MH-001 }
  - { id: B-002, kind: behavior, name: "b returns b", task_id: T-002, must_have_id: MH-002 }
execution_manifest:
  - id: T-001
    wave: 1
    depends_on: []
    workstream: alpha
    files_modified: [src/a.js, test/a.test.js]
    requirements: [REQ-001]
    decisions: [D-001]
    must_haves:
      - { id: MH-001, claim: "a() returns 'a'", evidence: { kind: behavioral-test, ref: "node --test test/a.test.js :: fail 0" } }
    verify: "node --test test/a.test.js"
    done: "a() returns 'a' and its test passes"
  - id: T-002
    wave: 1
    depends_on: []
    workstream: beta
    files_modified: [src/b.js, test/b.test.js]
    requirements: [REQ-002]
    decisions: [D-001]
    must_haves:
      - { id: MH-002, claim: "b() returns 'b'", evidence: { kind: behavioral-test, ref: "node --test test/b.test.js :: fail 0" } }
    verify: "node --test test/b.test.js"
    done: "b() returns 'b' and its test passes"
```

## Delivery slices

```yaml
delivery_slices:
  - id: S-001
    goal: "deliver a() and its test"
    depends_on: []
    task_ids: [T-001]
    requirements: [REQ-001]
    must_haves: ["a() returns 'a'"]
    verify: ["node --test test/a.test.js"]
    done: "REQ-001 has direct behavioral evidence"
  - id: S-002
    goal: "deliver b() and its test alongside a()"
    depends_on: [S-001]
    task_ids: [T-002]
    requirements: [REQ-002]
    must_haves: ["b() returns 'b' with a() still passing"]
    verify: ["node --test test/a.test.js test/b.test.js"]
    done: "REQ-002 has direct behavioral evidence and REQ-001 still passes"
```
