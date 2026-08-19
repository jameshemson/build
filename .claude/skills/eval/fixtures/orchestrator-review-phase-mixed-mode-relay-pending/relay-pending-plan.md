# Plan: relay-pending

## Approach

[B-001] Add a bulk CSV importer that parses each row into a customer record and inserts it into the
customer store; a malformed row is skipped and counted rather than aborting the batch.

## Execution manifest

```yaml
requirements: [REQ-001]
decisions: [D-001]
assumptions: [A-001]
evidence_mode: typed
bindings:
  - { id: B-001, kind: behavior, name: "a well-formed CSV row creates one customer record", task_id: T-001, must_have_id: MH-001 }
execution_manifest:
  - id: T-001
    wave: 1
    depends_on: []
    workstream: csv-import
    files_modified: ["src/csv-import.js", "test/csv-import.test.js"]
    requirements: ["REQ-001"]
    decisions: ["D-001"]
    must_haves:
      - { id: MH-001, claim: "a well-formed CSV row creates one customer record", evidence: { kind: behavioral-test, ref: "npm test -- test/csv-import.test.js :: imports a well-formed row as one customer record" } }
    verify: "npm test -- test/csv-import.test.js"
    done: "REQ-001 passes the named assertion"
```

## Delivery slices

```yaml
delivery_slices:
  - id: S-001
    goal: "A well-formed CSV import creates matching customer records"
    depends_on: []
    task_ids: ["T-001"]
    requirements: ["REQ-001"]
    must_haves: ["a well-formed CSV row creates one customer record"]
    verify: ["npm test -- test/csv-import.test.js"]
    done: "REQ-001 has exact import evidence"
```
