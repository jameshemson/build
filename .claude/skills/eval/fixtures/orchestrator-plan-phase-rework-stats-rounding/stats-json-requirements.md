# Requirements: stats-json

Task: Add a --json flag to the stats command.

## Requirements

- REQ-001: `stats --json` prints the stats as one JSON object instead of the text table.

## Decisions

- D-001: The JSON carries the same figures the text output prints. Evidence: plan decision.

## Assumptions

- A-001: The text output's figures are the canonical balances. Confidence: medium. Contradicted by the mid-review RETHINK (see state `rework_notes`).
