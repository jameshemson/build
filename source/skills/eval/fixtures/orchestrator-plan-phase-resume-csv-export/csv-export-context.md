# Context: csv-export

## Exploration findings

- Expenses live in `src/expenses/repo.js`; amounts are stored as integer pence.
- Routes are Express handlers under `src/routes/`; each exports a router mounted in `src/app.js`.
- Tests use `node:test` under `test/`, one file per module; CI runs `npm test` and `npm run check-deps`.

## User statements from the discovery interview

- D-001: "One file with everything in it." (2026-10-08)
- D-002: "Date, group, payer, description, amount." (2026-10-08)
- D-003: "Pounds with two decimals, like the UI shows." (2026-10-08)
