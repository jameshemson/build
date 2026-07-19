# Legacy pose adoption plan

## Approach

Add `TryAdoptLegacyBuildingPose` and `TryAdoptLegacyJobPose`, preserve valid legacy
8x8 geometry after pose adoption, update persistence migration, and propagate varied
footprints through every placement fixture.

## Execution manifest

```yaml
evidence_mode: typed
bindings:
  - { id: B-001, kind: behavior, name: "varied footprints persist", task_id: T-200, must_have_id: MH-200 }
execution_manifest:
  - id: T-200
    wave: 1
    depends_on: []
    files_modified: ["src/catalog.cs", "src/placement.cs", "src/persistence.cs", "src/migration.cs", "src/validation.cs", "src/jobs.cs", "src/buildings.cs", "src/geometry.cs", "tests/catalog.cs", "tests/placement.cs", "tests/persistence.cs", "tests/migration.cs", "tests/validation.cs", "tests/jobs.cs", "tests/buildings.cs", "tests/geometry.cs", "tests/autoplayer.cs", "tests/balance.cs"]
    requirements: ["REQ-200"]
    must_haves:
      - { id: MH-200, claim: "all pose, persistence, migration, fixture, and balance behavior is complete", evidence: { kind: behavioral-test, ref: "dotnet test" } }
    verify: "dotnet test"
    done: "all named behavior is complete"
```

## Delivery slices

```yaml
delivery_slices:
  - id: S-001
    goal: "legacy pose adoption and footprint propagation work end to end"
    depends_on: []
    task_ids: ["T-200"]
    requirements: ["REQ-200"]
    must_haves: ["MH-200"]
    verify: "dotnet test"
    done: "all named behavior is complete"
```

## What existing behavior changes

Legacy saves adopt model pose, and placement fixtures no longer assume 8x8 geometry.

## Verification

Run `dotnet test` after all 18 files change.
