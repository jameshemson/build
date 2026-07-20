# Kemet-lite unbound API

## Approach

- [B-001] `TryAdoptLegacyBuildingPose` is implemented and directly tested.
- [B-002] `TryAdoptLegacyJobPose` is also required.

## Execution manifest

```yaml
requirements: [REQ-001]
decisions: [D-001]
assumptions: [A-001]
evidence_mode: typed
bindings:
  - { id: B-001, kind: behavior, name: "building pose adoption", task_id: T-001, must_have_id: MH-001 }
execution_manifest:
  - id: T-001
    wave: 1
    depends_on: []
    workstream: legacy-pose
    files_modified: [src/legacy-pose.js, test/legacy-pose.test.js]
    requirements: [REQ-001]
    decisions: [D-001]
    must_haves:
      - { id: MH-001, claim: "legacy building poses are adopted", evidence: { kind: behavioral-test, ref: "node --test test/legacy-pose.test.js :: adopts a legacy building pose" } }
    verify: "node --test test/legacy-pose.test.js"
    done: "the building-pose test passes"
```

## Delivery slices

```yaml
delivery_slices:
  - id: S-001
    goal: "deliver legacy pose adoption"
    depends_on: []
    task_ids: [T-001]
    requirements: [REQ-001]
    must_haves: ["legacy poses are adopted"]
    verify: ["node --test test/legacy-pose.test.js"]
    done: "REQ-001 has direct evidence"
```
