Tier: compact (discovery level: quick_verify)

# Add a configurable TTL to the response cache

## Discovery level

`quick_verify`. One production file and one new test. `src/cache.js` is 40 lines with a single
`Map` backing store and three call sites, all traced.

## Requirements and decisions

Canonical `REQ-001`, `D-001`, and `A-001` are in `cache-ttl-requirements.md`.

## Problem

Cached responses never expire, so a deploy that changes upstream data serves stale content until
the process restarts.

## Approach

[B-001] Stamp each entry with its insertion time on write, and treat an entry older than `ttlMs`
as absent on read. Lazy expiry keeps the change inside `Cache` with no timer and no shutdown path.

No new interface, factory, or abstraction is introduced — this is an option on the existing class.

## Files to change

| File | New/Modified | Responsibility | Depends on |
|------|-------------|----------------|------------|
| `test/cache-ttl.test.js` | New | TTL expiry behavior test | `src/cache.js` |
| `src/cache.js` | Modified | `ttlMs` option, insertion stamping, expiry on read | none |

## What existing behavior changes

`get` returns a miss for an entry older than `ttlMs`. With no `ttlMs` set, behavior is unchanged
and entries never expire.

## Wave 0 validation design

`REQ-001` is proven by `test/cache-ttl.test.js` before implementation: write an entry, advance the
clock past `ttlMs`, assert `get` reports a miss.

## Execution manifest

```yaml
requirements: [REQ-001]
decisions: [D-001]
assumptions: [A-001]
evidence_mode: typed
bindings:
  - { id: B-001, kind: behavior, name: "cache entries expire after the configured TTL", task_id: T-002, must_have_id: MH-002 }
execution_manifest:
  - id: T-001
    wave: 0
    depends_on: []
    workstream: cache-ttl
    files_modified: ["test/cache-ttl.test.js"]
    requirements: ["REQ-001"]
    decisions: ["D-001"]
    must_haves:
      - { id: MH-001, claim: "test names and asserts TTL expiry", evidence: { kind: structural, ref: "test/cache-ttl.test.js test name and assertion" } }
    verify: "npm test -- test/cache-ttl.test.js"
    done: "REQ-001 has a named failing assertion before implementation"
  - id: T-002
    wave: 1
    depends_on: ["T-001"]
    workstream: cache-ttl
    files_modified: ["src/cache.js"]
    requirements: ["REQ-001"]
    decisions: ["D-001"]
    must_haves:
      - { id: MH-002, claim: "cache entries expire after the configured TTL", evidence: { kind: behavioral-test, ref: "npm test -- test/cache-ttl.test.js :: expires entries once the configured TTL elapses" } }
    verify: "npm test -- test/cache-ttl.test.js"
    done: "REQ-001 passes the named Wave 0 assertion"
```

## Delivery slices

```yaml
delivery_slices:
  - id: S-001
    goal: "Cached entries expire after the configured TTL"
    depends_on: []
    task_ids: ["T-002"]
    requirements: ["REQ-001"]
    must_haves: ["a cache read after the TTL elapses reports a miss"]
    verify: ["npm test -- test/cache-ttl.test.js"]
    done: "REQ-001 has exact boundary evidence"
```

## Workflow artifacts

`cache-ttl-state.md`, `-context.md`, `-requirements.md`, `-plan.md`, `-review.md`,
`-implementation-summary.md`, `-verify.md`, `-architect-review.md`.

## Parallel workstreams

One workstream, `cache-ttl`, owning T-001 and T-002. Sequential — T-002 depends on T-001.

## Implementation order

1. T-001 — add the failing TTL expiry test.
2. T-002 — add the `ttlMs` option and lazy expiry until T-001 passes.

## Verification

`npm test -- test/cache-ttl.test.js` for the named assertion, then `npm test` for the full suite.
