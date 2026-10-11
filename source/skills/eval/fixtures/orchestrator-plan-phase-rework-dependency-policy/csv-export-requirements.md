# Requirements: csv-export

Task: Add a CSV export of expenses.

## Decisions

- D-001: The export is one file holding every expense across all groups. Evidence: user statement, 2026-10-08: "One file with everything in it."
- D-002: Columns, in order: date, group, payer, description, amount. Evidence: user statement, 2026-10-08: "Date, group, payer, description, amount."
- D-003: Amounts are written in pounds with two decimals (`12.50`), converted from the stored integer pence. Evidence: user statement, 2026-10-08: "Pounds with two decimals, like the UI shows."

## Requirements

- REQ-001: `GET /export/expenses.csv` returns a CSV file holding every expense across all groups (D-001).
- REQ-002: The columns are date, group, payer, description, amount, in that order (D-002).
- REQ-003: Amounts are pounds with two decimals, converted from stored integer pence (D-003).
