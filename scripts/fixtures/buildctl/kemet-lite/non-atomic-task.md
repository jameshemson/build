# Kemet-lite non-atomic task

## Approach

- [B-001] `TryAdoptLegacyBuildingPose` is implemented and directly tested.
- [B-002] `TryAdoptLegacyJobPose` is implemented and directly tested.

## Execution manifest

```yaml
requirements: [REQ-001, REQ-002]
decisions: [D-001]
assumptions: [A-001]
evidence_mode: typed
bindings:
  - { id: B-001, kind: behavior, name: "building pose adoption", task_id: T-001, must_have_id: MH-001 }
  - { id: B-002, kind: behavior, name: "job pose adoption", task_id: T-001, must_have_id: MH-002 }
execution_manifest:
  - id: T-001
    wave: 1
    depends_on: []
    workstream: legacy-pose
    files_modified: [src/building-pose.js, src/job-pose.js, test/legacy-pose.test.js]
    requirements: [REQ-001, REQ-002]
    decisions: [D-001]
    must_haves:
      - { id: MH-001, claim: "legacy building poses are adopted", evidence: { kind: behavioral-test, ref: "node --test test/legacy-pose.test.js :: adopts a legacy building pose" } }
      - { id: MH-002, claim: "legacy job poses are adopted", evidence: { kind: behavioral-test, ref: "node --test test/legacy-pose.test.js :: adopts a legacy job pose" } }
    verify: "node --test test/legacy-pose.test.js"
    done: "both unrelated adoption behaviors pass"
```

## Delivery slices

```yaml
delivery_slices:
  - id: S-001
    goal: "deliver both legacy adoption paths"
    depends_on: []
    task_ids: [T-001]
    requirements: [REQ-001, REQ-002]
    must_haves: ["building and job poses are adopted"]
    verify: ["node --test test/legacy-pose.test.js"]
    done: "both requirements have evidence"
```
