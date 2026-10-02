# Legacy pose adoption plan

## Requirements and decisions

- **REQ-200**: Saves written before footprint support load with adopted poses, keep every valid 8x8 building, and place 8x8 buildings alongside 2x2 and 4x4 buildings without overlap; a placement that overlaps an existing footprint is rejected.
- **D-200**: A record that fails pose adoption is dropped with a warning; the load does not fail.
- **A-200** (high): `LegacyBuildingRecord` and `LegacyJobRecord` are the existing format-3 save records in `src/persistence.cs`, and `BuildingPose` (`Anchor`, `Footprint`) and `JobPose` (`Anchor`) are the existing structs in `src/geometry.cs`.

## Approach

- Add `bool TryAdoptLegacyBuildingPose(LegacyBuildingRecord record, out BuildingPose pose)` in `src/buildings.cs`. It returns true and fills `pose` with the record's anchor and footprint when the record's footprint is 8x8 and its anchor `(x, y)` lies inside the 256x256 map on multiples of 8; otherwise it returns false and leaves `pose` as `default`.
- Add `bool TryAdoptLegacyJobPose(LegacyJobRecord record, IReadOnlyDictionary<int, BuildingPose> adopted, out JobPose pose)` in `src/jobs.cs`. It returns true when the record's `BuildingId` is a key in `adopted` and copies that building's anchor into `pose`; otherwise it returns false.
- In `src/migration.cs`, add save-format migration step 3 to 4. It runs `TryAdoptLegacyBuildingPose` over every legacy building record first, then `TryAdoptLegacyJobPose` over every legacy job record with the adopted buildings keyed by id. It drops records that return false and logs each dropped record id at warning level.
- In `src/persistence.cs`, write format version 4 and read versions 3 and 4.
- Replace the hard-coded 8x8 footprint in the six placement fixtures in `tests/fixtures/placement.json` with two 2x2, two 4x4 and two 8x8 footprints.
- Update `data/balance.json` so construction cost scales with footprint area: 2x2 costs 1, 4x4 costs 4, 8x8 costs 16.

## Execution manifest

```yaml
requirements: [REQ-200]
decisions: [D-200]
assumptions: [A-200]
evidence_mode: typed
bindings:
  - { id: B-001, kind: behavior, name: "varied footprints persist", task_id: T-200, must_have_id: MH-200 }
execution_manifest:
  - id: T-200
    wave: 1
    depends_on: []
    workstream: migration
    files_modified: ["src/catalog.cs", "src/placement.cs", "src/persistence.cs", "src/migration.cs", "src/validation.cs", "src/jobs.cs", "src/buildings.cs", "src/geometry.cs", "tests/catalog.cs", "tests/placement.cs", "tests/persistence.cs", "tests/migration.cs", "tests/validation.cs", "tests/jobs.cs", "tests/buildings.cs", "tests/geometry.cs", "tests/fixtures/placement.json", "data/balance.json"]
    requirements: ["REQ-200"]
    decisions: ["D-200"]
    must_haves:
      - { id: MH-200, claim: "Legacy building and job poses are adopted, migration step 3 to 4 keeps valid 8x8 buildings and drops invalid records, the six placement fixtures use 2x2, 4x4 and 8x8 footprints, and balance costs scale with footprint area", evidence: { kind: behavioral-test, ref: "dotnet test :: Passed!" } }
    verify: "dotnet test"
    done: "dotnet test exits 0 and prints Passed!"
```

## Delivery slices

```yaml
delivery_slices:
  - id: S-001
    goal: "Legacy saves load with adopted poses and placement handles 2x2, 4x4 and 8x8 footprints"
    depends_on: []
    task_ids: ["T-200"]
    requirements: ["REQ-200"]
    must_haves: ["legacy saves load with adopted poses and varied footprints place without overlap"]
    verify: ["dotnet test"]
    done: "dotnet test passes on the integrated change"
```

## What existing behavior changes

Legacy saves are migrated from format 3 to format 4 on load. Records that fail pose adoption are dropped with a warning. Placement fixtures no longer assume 8x8 footprints.

## Verification

Run `dotnet test` once T-200 is complete and confirm the run ends with `Passed!`.
