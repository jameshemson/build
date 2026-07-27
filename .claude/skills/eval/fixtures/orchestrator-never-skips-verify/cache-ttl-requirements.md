# Requirements: cache-ttl

## Requirements

- **REQ-001** — A `Cache` instance accepts a `ttlMs` option. An entry written more than `ttlMs`
  milliseconds ago is not returned by `get`, and the cache reports it as absent rather than
  returning stale content.

## Decisions

- **D-001** — Expire lazily on read rather than with a background sweep. The cache is small and
  short-lived; a timer would add a shutdown path for no measurable benefit.

## Assumptions

- **A-001 (confirmed)** — No existing caller depends on entries surviving indefinitely. Confirmed
  by reading every `Cache` construction site; none sets a TTL today and all tolerate a miss.

## Acceptance criteria

- `npm test -- test/cache-ttl.test.js` passes, including the named assertion
  `expires entries once the configured TTL elapses`.
- The full suite (`npm test`) passes with no new failures.

## must_haves

- **MH-001** (T-001, structural) — the Wave 0 test names and asserts the user-visible expiry
  behavior.
- **MH-002** (T-002, behavioral-test) — `npm test -- test/cache-ttl.test.js` ::
  `expires entries once the configured TTL elapses` passes.
