# Plan: stats-json

Task: Add a --json flag to the stats command.

Discovery level: quick_verify. One file changes; the discovery interview was skipped.

## Requirements and Decisions

- REQ-001: `stats --json` prints the stats as one JSON object instead of the text table.
- D-001: The JSON carries the same figures the text output prints: group total, expense count, and each member's balance. Evidence: plan decision; one source of truth for both outputs.
- A-001: The text output's figures are the canonical balances. Confidence: medium. Evidence: `src/cli/stats.js` calls `formatBalance()` on each balance before printing; `formatBalance` was not opened.

## Execution Manifest

| Task | Wave | Depends on | Files | Requirements | Done |
| --- | --- | --- | --- | --- | --- |
| T-001 | 0 | none | `test/stats.test.js` | REQ-001 | failing test that `stats --json` output parses and holds the three figures |
| T-002 | 1 | T-001 | `src/cli/stats.js` | REQ-001 | the `--json` flag prints `JSON.stringify` of the figures the table shows |

## Delivery Slices

- S-001: T-001, T-002.

## Verification

`npm test` passes.
