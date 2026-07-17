# Implementation Plan: Export Project Report

## Discovery level

`standard_research` — the feature crosses report data collection, rendering, and automated tests.

## Requirements and decisions

- **REQ-001**: Collect the project name and build result for a report.
- **REQ-002**: Export the collected report as CSV through `renderCsv()`.
- **D-001**: Use the existing Node test runner and no new dependency.
- **A-001**: Report values are already available as strings.

## Problem

Users cannot export a compact project build report for use outside the tool.

## Approach

Add a data collector and CSV renderer, then prove the public `renderCsv()` result with a behavior test.

## Who uses this and how

A local user runs the report command after a build and receives a CSV row containing the project name and result. Empty project names are rejected before rendering.

## Files to change

| File | New/Modified | Responsibility | Depends on |
|---|---|---|---|
| `src/report/data.js` | New | Collect project name and build result | None |
| `src/report/render.js` | New | Render collected values as CSV | `src/report/data.js` |
| `tests/report.test.js` | New | Assert the exported CSV behavior | `src/report/render.js` |

## Data impact

None. The command reads in-memory build values and writes its CSV result to stdout.

## What existing behavior changes

No existing command changes; a new report export becomes available.

## New dependencies

None. The implementation uses built-in JavaScript and `node:test`.

## Access control and authorization

N/A — this is a local command with no network endpoint.

## Abuse and edge cases

- Empty project name: reject with `TypeError("project name is required")`.
- Commas in values: quote the CSV field and double embedded quotation marks.

## Out of scope

- JSON and PDF report formats.
- Persisting report history.

## Risks and rollback

Incorrect CSV escaping could produce invalid rows. The behavior test covers commas and quotation marks. Rollback removes the three new files.

## Observability & monitoring

N/A — local command with no production deployment.

## Open questions

None. The output columns and error behavior are specified above.

## Wave 0 validation design

Run `node --test tests/report.test.js` before implementation and record the expected missing-module failure. `T-001` first makes REQ-001 testable; `T-003` makes REQ-002 testable.

## Execution manifest

```yaml
execution_manifest:
  - id: T-000
    wave: 0
    depends_on: []
    files_modified: []
    requirements: []
    must_haves: ["baseline records the missing report module"]
    verify: "node --test tests/report.test.js"
    done: "The expected missing-module baseline is recorded"
  - id: T-001
    wave: 1
    depends_on: ["T-000"]
    files_modified: ["src/report/data.js"]
    requirements: ["REQ-001"]
    must_haves: ["collector returns project name and build result"]
    verify: "node -e \"import('./src/report/data.js').then(m => console.log(m.collectReport('demo', 'passed')))\""
    done: "Collector output contains demo and passed"
  - id: T-002
    wave: 2
    depends_on: ["T-001"]
    files_modified: ["src/report/render.js"]
    requirements: ["REQ-002"]
    must_haves: ["renderCsv emits a header and escaped value row"]
    verify: "node -e \"import('./src/report/render.js').then(m => console.log(m.renderCsv({name:'demo',result:'passed'})))\""
    done: "Renderer output contains the expected CSV header and row"
  - id: T-003
    wave: 3
    depends_on: ["T-002"]
    files_modified: ["tests/report.test.js"]
    requirements: ["REQ-001", "REQ-002"]
    must_haves: ["test asserts normal output, escaping, and empty-name rejection"]
    verify: "node --test tests/report.test.js"
    done: "All report behavior assertions pass"
```

## Workflow artifacts

N/A — standalone plan saved by the user if durable context is needed.

## UI contract

N/A — no UI files change.

## Delivery slices

```yaml
delivery_slices:
  - id: S-001
    goal: "Foundation-only: add the shared report data and rendering foundation"
    depends_on: ["S-002"]
    task_ids: ["T-001", "T-002"]
    requirements: ["REQ-001"]
    must_haves: []
    verify: "inspect the changes"
    done: "foundation complete"
  - id: S-002
    goal: "Users can export a tested CSV project report"
    depends_on: []
    task_ids: ["T-002"]
    requirements: ["REQ-002"]
    must_haves: ["report test asserts the exact header, escaped values, and empty-name error"]
    verify: "node --test tests/report.test.js exits 0 with three passing assertions"
    done: "The report behavior test passes and demonstrates the CSV export"
```

`S-001` is foundation-only. No vertical-impossibility rationale, first consuming slice, or compatibility check is supplied. `T-002` appears in both slices, while implementation task `T-003` appears in neither. Wave 0 task `T-000` remains global.

## Parallel workstreams

| Workstream | Task IDs | Files | Complexity | Depends on |
|---|---|---|---|---|
| report-implementation | `T-001`, `T-002` | `src/report/data.js`, `src/report/render.js` | complex | None |
| report-tests | `T-003` | `tests/report.test.js` | simple | report-implementation |

## Implementation order

1. Add `collectReport(name, result)` to `src/report/data.js`, returning the two named fields and rejecting an empty name.
2. Add `renderCsv(report)` to `src/report/render.js`, emitting a two-column header and escaped data row.
3. Add three assertions to `tests/report.test.js` for ordinary output, CSV escaping, and empty-name rejection.

## Verification

Run `node --test tests/report.test.js` and require three passing assertions covering REQ-001 and REQ-002.
