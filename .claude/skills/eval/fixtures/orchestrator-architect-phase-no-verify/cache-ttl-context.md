# Context: cache-ttl

## Repo conventions

- Node project, `npm test` runs Vitest. Non-interactive form is `npx vitest run`.
- Source in `src/`, tests in `test/`, one test file per module.
- No formatter enforced in CI; match surrounding style.

## User constraints

- No new dependencies for this change. A timer library was explicitly rejected.

## Discovered patterns

- `src/cache.js` is the only cache implementation. Three call sites, all in `src/handlers/`.
- Existing tests use Vitest fake timers (`vi.useFakeTimers`) in `test/rate-limit.test.js`;
  the same pattern applies to TTL expiry.

## Assumptions

- **A-001 (confirmed)** — no caller depends on entries surviving indefinitely.

## Out of scope

- Cache eviction by size or LRU policy. TTL only.
- Persisting cache contents across restarts.
