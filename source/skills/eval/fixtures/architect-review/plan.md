# Implementation Plan: Add clamp utility

## File structure mapping

| File | New/Modified | Responsibility | Depends on |
|------|-------------|----------------|------------|
| `src/clamp.js` | New | clamp(value, min, max) implementation | None |
| `tests/clamp.test.js` | New | Tests for clamp | `src/clamp.js` |

## Problem

The project has no utility for clamping a numeric value to a [min, max] range.

## Approach

Add a single exported `clamp(value, min, max)` function to `src/clamp.js`. Returns `min` if value is below range, `max` if above, otherwise value unchanged. Add tests in `tests/clamp.test.js` using `node:test`.

## Who uses this and how

**Developer importing clamp**: imports `{ clamp }` from `../src/clamp.js` and calls `clamp(value, 0, 100)` to bound a numeric input.

## Files to change

### `src/clamp.js` (New, ~6 lines)
Export `function clamp(value, min, max)` — three conditionals, returns min/value/max.

### `tests/clamp.test.js` (New, ~10 lines)
Two tests using `node:test` and `node:assert/strict`: value within range returns value; value below min returns min; value above max returns max.

## Data impact

None.

## What existing behavior changes

None — new file only.

## New dependencies

None.

## Access control and authorization

N/A — utility function, no endpoints.

## Abuse and edge cases

- **min > max**: undefined behaviour, not handled in v1 — document in JSDoc.
- **non-numeric inputs**: JavaScript coercion applies; no explicit validation in v1.

## Out of scope

- TypeScript types — plain JS only.
- Edge handling for NaN or Infinity.

## Risks and rollback

1. **Low**: name collision if caller imports `clamp` from elsewhere — scoped by file import, no global.

## Observability & monitoring

N/A — no production deployment.

## Open questions

None.

## Wave 0 validation design

No pre-implementation tests needed — the implementation IS the test target. Wave 0 is confirmed by running `node --test tests/` after T-002.

## Execution manifest

```yaml
execution_manifest:
  - id: T-001
    wave: 0
    depends_on: []
    files_modified: ["src/clamp.js"]
    requirements: ["REQ-001"]
    must_haves: ["clamp function exported", "handles below-min, in-range, above-max"]
    verify: "node -e \"import('./src/clamp.js').then(m => { console.assert(m.clamp(5,0,10)===5); console.assert(m.clamp(-1,0,10)===0); console.assert(m.clamp(11,0,10)===10); console.log('ok'); })\""
    done: "clamp.js exports a working clamp function"
  - id: T-002
    wave: 1
    depends_on: ["T-001"]
    files_modified: ["tests/clamp.test.js"]
    requirements: ["REQ-002"]
    must_haves: ["node --test exits 0", "two tests present"]
    verify: "node --test tests/clamp.test.js"
    done: "Tests pass against the implementation"
```

## Workflow artifacts

N/A — standalone plan. User saves this file if durable context is needed.

## UI contract

N/A — no UI files changed.

## Parallel workstreams

- **Name**: clamp-impl — Files: `src/clamp.js` — Complexity: simple — Depends on: none
- **Name**: tests — Files: `tests/clamp.test.js` — Complexity: simple — Depends on: clamp-impl

## Implementation order

1. Add `src/clamp.js` with `export function clamp(value, min, max)` — three branches, returns min if value < min, max if value > max, otherwise value.
2. Add `tests/clamp.test.js` — import clamp, write two `node:test` test blocks covering the three branches.

## Verification

Run `node --test tests/clamp.test.js`. All tests must pass (exit 0).
Covers REQ-001 (clamp implementation) and REQ-002 (test coverage).
