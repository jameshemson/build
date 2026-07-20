# Build roadmap

Build already has extensive workflow policy. This roadmap adds the small deterministic
authority needed to reject incomplete plans, stale evidence, and premature transitions.
Markdown YAML remains the authored source; generated artifacts must never become a second
hand-authored contract.

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

## v1.13 — transition authority

Before starting this release, dogfood v1.12.0 on a Kemet-sized workflow.

- Make `complete-slice` the first program-owned transition: refuse completion without
  fresh receipts covering every must-have.
- Move retry and loop counters into deterministic state transition checks.
- Expand code-owned transition authority only after the slice gate proves stable; do not
  make generated JSON the authored workflow source.

## Deferred

- Full leases beyond rejecting expired handoffs.
- Baseline domain metadata and invariant catalogs.
- End-to-end trajectory benchmarks and scored model routing.
- Broad write-agent parallelism or provider routing changes without measured evidence.
