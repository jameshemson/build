# Changelog

## 1.15.0 - 2026-07-28

### Added

- `buildctl compile-result --phase verify` now reports `test_shrink`: every test or fixture path
  that existed at `base_ref` and reaches `HEAD` with fewer assertion lines. A test file named in
  `files_modified` is in-plan by definition, so file scope cannot see it being weakened and its
  must-have observation still matches — previously nothing mechanical fired. The set caps the
  verdict at `partial` and requires findings to name every affected path; it never fails the
  compile on its own, because a mid-workflow test consolidation is legitimate and must not wedge
  a workflow. Rename pairing uses `git diff -M`, binary blobs are skipped, and `bounds` reports
  the scanned path and assertion patterns so a narrow scan never reads as a clean whole-repository
  result.

### Fixed

- The Claude orchestrator told a second failed phase agent to run its phase inline, at exactly the
  point `check-counters` returns an authoritative `phase-agent-failure` halt
  (`fresh_judgment_retry`, `halt_at: 2`) and the Codex orchestrator halts. Because runnable
  buildctl diagnostics already win, the prose instructed behaviour the compiler overrides. A
  second phase-agent failure now halts and escalates on both orchestrators, and a test reads the
  limit out of `counters.js` so the two cannot drift apart again.

### Documentation

- The rule that a `behavioral-test` or `command-assertion` observation must be a literal substring
  of that command's own captured output was stated only in the Verify evidence reference, which
  `impl-plan` and `review-plan` never read. Plans were authored with prose observations that
  compiled cleanly and then failed at `complete-slice`, after implementation. All three authoring
  paths now state it, pinned by a test that also asserts `coverage.js` still performs a substring
  compare.

### Scope

- Receipt shape is additive: `mechanical_facts.test_shrink` is new, `schema_version` is unchanged,
  and existing receipts verify as before. No change to `complete-slice`, the evidence ledger, or
  the authored machine-result contract.

## 1.14.1 - 2026-07-26

### Changed

- Claude implementation dispatch now requests Sonnet for single-file mechanical tasks and Opus
  for multi-file integration or design judgment. The previous Fable preference and its
  availability fallback are removed from Phase 3 guidance, the merge-conflict resolver, and the
  auto-continue routing table. Skill frontmatter pins are unchanged; `impl-plan` and
  `architect-review` still pin Opus because frontmatter does not resolve the `fable` alias.
- `eval/reference/grading.md` validated manifest tasks against an eight-field schema while the
  contract in `plan-quality.md` defines ten. The grader now checks all ten, including
  `workstream` and `decisions`.

### Documentation

- Recorded why the skill prose is dense: it is the enforcement mechanism for harnesses without
  `buildctl`, and specific clauses answer observed failures logged in the archived
  `codex-end-to-end-flow`, `codex-agent-supervision`, and `bounded-execution-invariant`
  workflows. The `skill-contract.test.js` phrase assertions are named as a deliberate guard
  against removing that scaffolding.
- Corrected three stale claims that `build` is Claude-only. It is excluded from OpenCode only;
  the three Codex trees build their orchestrator from `SKILL.codex.md`, making five Codex skills
  rather than four. OpenCode is the only tree without `buildctl`.
- Removed per-skill descriptions and the npm script block from `CLAUDE.md`, both of which
  restated content already available in skill frontmatter and `package.json`.

### Scope

- No behavioral change to the Codex or OpenCode outputs: this release regenerates
  `.claude/skills/` only. No buildctl, receipt-protocol, or machine-result contract is affected.

## 1.14.0 - 2026-07-24

### Added

- Added `buildctl compile-result` for Plan Review, Verify, and Architect Review. It compiles
  authored semantic judgments into immutable result receipts bound to exact subject hashes,
  stable findings, repository identity, and one allowed next phase.
- Added code-owned Verify coverage and file-scope classification, including current completion
  receipts, precompiler Plan Review bootstrap, compiler-only contract recompilation, and
  planned-but-unchanged visibility.

### Changed

- Build root remains the sole workflow-state and git writer. It validates each generated result
  receipt, records its immutable reference, and applies only the receipt's eligible phase.
- Architect Review pass is now bound to the current accepted Verify result and exact final diff;
  Plan Review and Verify likewise fail closed on stale or structurally incompatible inputs.
- Standalone Plan Review, Verify, and Architect Review author either the complete portable
  machine-result section or the exact `Machine result: N/A — missing subjects: <names>` form.

### Scope

- OpenCode remains a portable four-skill bundle without the Build runtime. Runnable result
  diagnostics are authoritative; prompt fallback remains limited to genuine runtime absence.

## 1.13.0 - 2026-07-22

### Added

- Added `buildctl complete-slice`, the first program-owned workflow transition decision. It checks
  the active slice against current state, compiled contract, clean repository identity, full-SHA
  checkpoint and summary marker, fresh exact-command receipts, requirements, must-haves, and
  subject-bound structural/manual/slice judgments.
- Added immutable completion receipts with exactly four allowed state operations and idempotent
  `proposed` / `already_applied` replay across interruption and resume.
- Added `buildctl check-counters` over root-recorded typed events for deterministic retry, loop,
  scope-change, and no-progress limits.

### Changed

- Build root now applies the allowed completion patch after a checkpoint and remains the sole
  workflow-state and git writer. buildctl never mutates authored state or git.
- Claude Code and Codex bundles include the same self-contained completion runtime; OpenCode
  remains portable and prompt-only because it does not ship the Build orchestrator.
- Runnable compiler, counter, evidence, completion, and receipt diagnostics are authoritative;
  only genuine runtime unavailability selects the disclosed prompt fallback.

### Calibration

- The existing Kemet-sized v1.12.1 run was accepted as sufficient predicate calibration. Its
  pending application-specific human acceptance and a separate ordinary-workflow record were
  explicitly not required for this release; repository and completion-fixture gates still apply.

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
