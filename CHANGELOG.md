# Changelog

## 1.12.1 - 2026-07-21

### Added

- Added standalone artifact continuity: `impl-plan`, `review-plan`, `verify`, and
  `architect-review` now save their natural Markdown reports under `.build/plans/`
  while preserving the same response shown to the user.
- Added deterministic supplied-path/request slug derivation with collision-safe numeric
  suffixes, plus direct consumption of supplied plan, contract, ledger, requirements,
  context, implementation-summary, and Verify artifacts.
- Standalone Plan now compiles its authored plan into generated JSON when buildctl is
  runnable and discloses prompt-only fallback only for genuine runtime unavailability.

### Scope

- Standalone skills remain stateless and never own workflow transitions or git mutation.
  Build remains the only workflow-state owner; v1.13 transition authority and v1.14 phase
  receipts remain deferred.

## 1.12.0 - 2026-07-20

### Added

- Added `buildctl validate-plan`, which compiles authored Markdown/YAML with explicit
  `B-###` obligations into generated `contract.json` and rejects invalid schema, IDs,
  DAGs, bindings, ownership, evidence kinds, and atomicity.
- Added `buildctl run-evidence`, which executes exact commands and emits bounded,
  deterministic receipts tied to complete repository identity, output hashes, plan and
  contract hashes, compiler version, and HEAD commit/tree.
- Added Kemet-lite fixtures for unbound obligations, non-atomic tasks, and unrelated
  evidence.

### Changed

- Build now refuses Plan acceptance after a runnable validator failure. Build root runs
  final evidence commands, while fresh Verify validates receipt freshness and coverage
  without re-running them.
- Runtime-unavailable workflows retain a recorded prompt-only fallback. Runnable
  validation, command, and stale-receipt failures remain authoritative.

### Scope

- Workflow transitions remain prompt-owned. `complete-slice` authority is deferred to
  v1.13 after dogfooding v1.12.0 on a Kemet-sized workflow.

## 1.11.1 - 2026-07-19

### Changed

- Split Build execution by provider: Claude retains subagents and isolated worktrees;
  Codex keeps Plan, Implement, and Architect Review inline and delegates fresh-context
  Plan Review and Verify.
- Replaced Codex progress polling with terminal-only supervision, a 20-minute hard
  judgment deadline, and one fresh retry.
- Added typed must-have evidence and exact Approach bindings to new plans. Changed-file
  lists now prove only structural claims; missing or mismatched behavioral evidence is
  `PARTIAL` unless its evidence command fails.

### Migration

Plans without `evidence_mode` are treated as `legacy-untyped`. Unchanged tasks may
continue, but any reopened task must upgrade to typed must-haves and bindings.

## 1.6.2 - 2026-05-17

### Changed

- Updated GitHub repository references to `jameshemson/build`.
- Updated install commands:
  - `claude plugin add jameshemson/build`
  - `codex plugin marketplace add jameshemson/build`

### Migration

Existing installs should update their marketplace source to `jameshemson/build`.
