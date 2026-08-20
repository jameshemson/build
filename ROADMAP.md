# Build roadmap

Build already has extensive workflow policy. This roadmap adds the small deterministic
authority needed to reject incomplete plans, stale evidence, and premature transitions.
Markdown YAML remains the authored source; generated artifacts must never become a second
hand-authored contract.

Deterministic code owns facts, freshness, coverage, counters, and transition eligibility.
Models and humans continue to own semantic judgment. Each new code-owned gate must replace
prompt bookkeeping or prevent rework rather than duplicate an unchanged model check.

## v1.11.1 — provider execution and typed evidence

- Use provider-specific Codex execution: Plan, Implement, and Architect Review inline;
  Plan Review and Verify in fresh context. Claude keeps its subagents and worktrees.
- Replace Codex milestone polling with terminal-only supervision, a 20-minute hard
  judgment deadline, and one fresh retry.
- Add typed evidence kinds, task must-have IDs, and bindings from named obligations to
  one task and one direct evidence path.
- Treat missing modes as `legacy-untyped`; changed files prove structure, not behavior.
- Add deterministic Kemet-derived fixtures for unbound APIs, non-atomic tasks, and passing
  unrelated tests that leave behavioral claims uncovered.

## v1.12.0 — compiled contracts and evidence receipts (shipped)

- Add `buildctl validate-plan`: compile authored Markdown/YAML with explicit `B-###`
  obligations into generated `contract.json`, then validate schema, IDs, DAGs, binding
  coverage, ownership overlap, evidence kinds, and evidence atomicity.
- Add `buildctl run-evidence`: execute exact commands and emit bounded receipts containing
  exit state, complete output hashes, plan/contract/compiler hashes, HEAD commit/tree, and
  complete repository identity.
- Deduplicate fresh receipts only by exact command plus complete repository identity and
  reject stale or tampered evidence.
- Ship Kemet-lite as validator fixtures. Keep sampled agent trajectories optional.
- Define portability explicitly: `buildctl` is authoritative where the harness can run it;
  portable OpenCode and standalone skills retain a documented prompt-only fallback.
- Keep workflow transitions prompt-owned; buildctl does not implement `complete-slice`.

## v1.12.1 — standalone artifact continuity

- Make each portable skill save its natural durable artifact when invoked standalone:
  `impl-plan` saves a plan and compiles its contract where buildctl is available;
  `review-plan`, `verify`, and `architect-review` save sibling reports.
- Let standalone Review and Verify consume supplied plan, contract, and ledger artifacts
  without inventing missing workflow context.
- Keep standalone use composable but stateless: no workflow state, transitions, branches,
  commits, archives, auto-continuation, or synthetic artifacts. The Build orchestrator remains
  the only workflow-state owner.

## v1.13 calibration decision (accepted)

On 2026-07-22, the existing Kemet-sized v1.12.1 workflow was accepted as sufficient calibration
for the predicate boundary: it compiled a reviewed contract, resumed durable state, used named
red-first failures, and finished a five-probe automated gate. Its unfinished application-specific
human acceptance remains a Kemet workflow concern, not a Build release prerequisite. A separate
ordinary-workflow record was waived because the mechanisms reuse the shipped evidence, immutable
receipt, fingerprint, and bounded-counter primitives. The v1.13 repository and completion-fixture
gates remain mandatory; this decision does not claim the waived runs occurred.

## v1.13.0 — complete-slice transition authority (shipped)

- Make `complete-slice` the first program-owned transition decision. Validate the active slice
  against current state, contract, repository identity, implementation summary, checkpoint,
  and fresh ledger before allowing completion.
- Require deterministic coverage of every slice requirement and must-have, including exact
  command consumers and mechanically checkable expected observations. Preserve explicit
  judgment requirements for structural and manual evidence.
- Emit a generated, hash-bound transition receipt containing exactly four allowed state operations.
  Build root remains the sole writer of authored Markdown state and applies only that patch.
- Move retry and loop counters into deterministic checks, and make completion idempotent across
  interruption and resume.
- Keep general phase authority, result schemas, model routing, production-readiness profiles,
  and Clodex integration out of this release.

## Dogfood gate for v1.14

Dogfood v1.13.0 before expanding transition authority. Continue only if complete-slice is stable
and observed failures or wasted time come from stale, incomplete, or ambiguous phase judgments
rather than from semantic review quality.

## v1.14.0 — deterministic phase receipts (shipped)

- Keep Plan Review, Verify, and Architect Review as authored Markdown/YAML judgments, then
  compile them into generated, schema-validated result receipts.
- Bind each receipt to the relevant plan, contract, repository identity, prior artifact, and
  allowed verdict. Require stable finding IDs, severity, evidence, and an in-scope fix where a
  finding exists.
- Move remaining mechanical phase checks out of prose judgment: artifact completeness and
  freshness, whole-workflow obligation/consumer coverage, planned-versus-changed file scope,
  and allowed next-transition checks.
- Let models judge whether evidence is meaningful and architecture is sound; let buildctl decide
  whether that judgment is complete, current, internally consistent, and transition-eligible.
- Expand one phase boundary at a time and require each code-owned gate to remove equivalent
  prompt work. Preserve the recorded prompt-only fallback where buildctl cannot run.

## v1.15.0 — in-plan test weakening and orchestrator agreement (shipped)

- Close the gap file scope cannot see: a test or fixture path declared by any task is in-plan for
  every task, so weakening it to pass a gate produced no mechanical signal. Report assertion-line
  loss between `base_ref` and `HEAD` as a Verify gap that caps the verdict at `partial`.
- Keep it soft on first release. Rename behaviour is unmeasured on real state, and a hard fail
  would wedge a workflow on a legitimate mid-workflow test consolidation. Harden only if observed
  runs earn it.
- Make the phase-agent failure rule agree across `SKILL.md`, `SKILL.codex.md`, and `counters.js`,
  and pin the agreement to the compiler's own limit rather than to matching prose.
- State the literal-substring evidence rule where plans are authored, not only where they are
  verified.

## Deferred

- Full leases beyond rejecting expired handoffs.
- Repository-authored domain metadata and triggered invariant catalogs for concerns such as
  secrets, authorization boundaries, payments, backups, telemetry, and smoke paths. Do not add
  a universal production-readiness checklist.
- End-to-end trajectory benchmarks and scored model routing.
- Broad write-agent parallelism or provider routing changes without measured evidence.
- Codex-side named mode presets (`opus`/`fable`/`mixed`) expanding into the existing routing
  contract, for parity with the Claude orchestrator.
- Graded eval fixtures for relay failure paths (artifact-absent resume, `no_progress` halt/reset
  sequences) and fresh-workflow mode resolution (invocation > file > ask precedence, malformed
  sources), requiring an invocation-bearing eval fixture mechanism the harness lacks today.
- A deterministic resume gate (`buildctl validate-state`): artifact completeness for the recorded
  phase, receipt-reference resolution and currency, `base_ref` normalization, and provider-variant
  `agent_progress` classification, checked before a resuming orchestrator acts on state. Replaces
  prompt-owned resume reconciliation; a natural prerequisite for cross-harness handoff.
- Cross-harness state fixtures: a Codex-authored state resumed under the Claude orchestrator
  contract and vice versa, mechanically verifying unknown-field preservation and phase-boundary
  handoff. Today that forward-compatibility rule is asserted in the state schema but untested.
- Direct Clodex integration. Treat it only as an optional compatibility and dogfood environment
  after the core cross-harness contract is stable.
