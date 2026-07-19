# Pose adoption verification fixture

```yaml
evidence_mode: typed
bindings:
  - { id: B-001, kind: behavior, name: "adoptLegacyPose preserves valid 8x8 geometry", task_id: T-001, must_have_id: MH-001 }
execution_manifest:
  - id: T-001
    wave: 1
    depends_on: []
    files_modified: ["src/feature.js"]
    requirements: ["REQ-001"]
    must_haves:
      - { id: MH-001, claim: "adoptLegacyPose preserves valid 8x8 geometry", evidence: { kind: behavioral-test, ref: "test/feature.test.js#preserves-valid-legacy-geometry" } }
    verify: "npm test"
    done: "the named behavior has fresh direct test evidence"
```
