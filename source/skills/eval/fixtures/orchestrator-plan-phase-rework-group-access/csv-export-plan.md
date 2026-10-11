# Plan: csv-export

Task: Add a CSV export of expenses.

## Requirements and Decisions

- REQ-001: `GET /export/expenses.csv` returns a CSV file holding every expense across all groups (D-001).
- REQ-002: The columns are date, group, payer, description, amount, in that order (D-002).
- REQ-003: Amounts are pounds with two decimals, converted from stored integer pence (D-003).
- D-001: One file holding every expense across all groups. Evidence: user statement, 2026-10-08: "One file with everything in it."
- D-002: Columns date, group, payer, description, amount. Evidence: user statement, 2026-10-08: "Date, group, payer, description, amount."
- D-003: Pounds with two decimals. Evidence: user statement, 2026-10-08: "Pounds with two decimals, like the UI shows."
- D-004: The route serialises rows with the `csv-stringify` package, which handles quoting. Evidence: plan decision; it is the CSV library most used on npm.
- A-001: Every expense is readable through a `listAllExpenses()` export of `src/expenses/repo.js`. Confidence: medium. Evidence: the repo module's naming pattern (`listGroupExpenses`, `getExpense`); `listAllExpenses` itself was not opened.

## Execution Manifest

| Task | Wave | Depends on | Files | Requirements | Done |
| --- | --- | --- | --- | --- | --- |
| T-001 | 0 | none | `test/export.test.js` | REQ-001, REQ-002, REQ-003 | failing tests for row mapping and the route |
| T-002 | 1 | T-001 | `src/export/rows.js` | REQ-002, REQ-003 | `toRow(expense)` maps an expense to the five columns, pence to `12.50` |
| T-003 | 2 | T-002 | `src/routes/export.js`, `src/app.js`, `package.json` | REQ-001 | the route reads the expenses, maps them with `toRow` and streams the CSV |

## Delivery Slices

- S-001: T-001, T-002 (row mapping).
- S-002: T-003 (the export route).

## Verification

`npm test` and `npm run check-deps` pass.
