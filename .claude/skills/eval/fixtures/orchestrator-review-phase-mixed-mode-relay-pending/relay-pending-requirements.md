# Requirements: relay-pending

## Requirements

- **REQ-001** — Importing a CSV of customer rows creates one customer record per well-formed row
  and skips malformed rows without aborting the batch.

## Decisions

- **D-001** — Skip and count malformed rows rather than aborting the import, so a partial file
  still imports its valid rows.

## Assumptions

- **A-001 (confirmed)** — The CSV header order is fixed. Confirmed against the two existing export
  templates under `fixtures/customers`.

## Acceptance criteria

- `npm test -- test/csv-import.test.js` passes, including the named assertion "imports a
  well-formed row as one customer record".

## must_haves

- **MH-001** (T-001, behavioral-test) — `npm test -- test/csv-import.test.js` ::
  "imports a well-formed row as one customer record" passes.
