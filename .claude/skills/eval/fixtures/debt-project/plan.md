Tier: compact (discovery level: quick_verify)

# Plan — in-memory cache helper

## Problem

Callers need a process-local key/value cache with a stable put/get API.

## Execution manifest

```yaml
execution_manifest:
  - id: T-001
    wave: 0
    depends_on: []
    files_modified: ["src/cache.js"]
    requirements: ["REQ-001"]
    must_haves: ["cache.test.js asserts the put/get round-trip"]
    verify: "npm test"
    done: "REQ-001 has command evidence and a named assertion"
```
