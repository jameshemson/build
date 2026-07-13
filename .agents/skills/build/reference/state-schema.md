# Build workflow state-file schema

The state file (`.build/plans/{slug}-state.md`) is the source of truth for the workflow. The root orchestrator is its only writer. Delegated phase and workstream agents must never write to it.

## Field reference

| Field | Format | Written by | Cleared by |
|---|---|---|---|
| `slug` | kebab-case string | Phase 1 | never |
| `base_ref` | full git SHA from `git rev-parse HEAD` | Phase 1 | never |
| `branch` | `build/{slug}` branch name | Phase 1 | never |
| `phase` | one of `plan`, `review`, `implement`, `verify`, `architect-review`, `complete`, `aborted` | every phase transition | n/a |
| `task` | one-line description of the feature | Phase 1 | never |
| `started` / `last_updated` | YYYY-MM-DD | Phase 1 / every write | never |
| `provisional_complexity` | `simple`, `standard`, or `complex`; pre-plan routing estimate | Phase 1 before delegation | updated at the start of each re-plan |
| `complexity` | final `simple`, `standard`, or `complex` classification from the validated plan | Phase 1 after planning | updated when a re-plan changes the classification |
| `agent_routes` | exactly six records keyed `plan`, `review`, `explore`, `implement`, `verify`, and `architect-review`; each record contains `requested_agent: <opaque-name> | null` and `source: invocation | AGENTS.md | build-default` | Phase 1 before delegation, or one-time legacy resolution / explicit resume override | only named keys are replaced by a valid explicit resume override; otherwise never |
| `model_routes` | map of phase or role to requested model + effort, or literal `profile-owned` for a selected custom agent | Phase 1 before delegation, then after final classification | overwritten only when complexity or agent routing changes |
| `model_fallback` | append-only entries with timestamp, phase, requested route, actual route, and reason | orchestrator, before using a fallback | never (audit trail); omit when no fallback occurred |
| `agent_selection_fallback` | append-only entries with timestamp, phase, role, requested_agent, actual_agent (`unknown` if unreported), fallback_route, reason (`selector-unavailable` or `selection-rejected`), and detail | orchestrator, before Build-default dispatch after named selection is unavailable/rejected | never (audit trail); omit when no fallback occurred |
| `requirements` / `decisions` / `assumptions_confirmed` | `REQ-*` / `D-*` / `A-*` lists (assumptions carry `inferred` or `confirmed`) | Phase 1 | updated on re-plan |
| `workstreams` | named list from the plan | Phase 1 | updated on re-plan |
| `execution_manifest` | summary: task IDs, waves, depends_on, files_modified | Phase 1 | updated on re-plan |
| `completed_tasks` | `T-###` IDs only — no checksums or commit IDs | Phase 3, after integrated wave verification | cleared per-task when a file revert or rework names the task |
| `rework_notes` | text; any task references use `T-###` | Phase 2 (Do not proceed), Phase 3 (SCOPE_CHANGE), Phase 3b (RETHINK) | Phase 1, once the revised plan addresses them (history records the clearing) |
| `fixes_needed` | text with `T-###` references | Phase 3b | Phase 3, when fixes are applied and their wave verification passes |
| `verification_failures` | failed command/requirement list with `T-###` references | Phase 3c (FAILED) | Phase 3c, on the next VERIFIED or PARTIAL verdict |
| `review_fixes_applied` | list of changes made to address Important findings | Phase 2 (Proceed with fixes) | never (audit trail) |
| `verify_verdict` | `VERIFIED` or `PARTIAL` | Phase 3c | overwritten on re-verify |
| `uncovered_requirements` | gap list from a PARTIAL verify verdict | Phase 3c | overwritten on re-verify |
| `architect_fixes` | finding list with `T-###` references | Phase 4 (FAIL) | Phase 4, on the next PASS or PASS_WITH_NOTES |
| `merge_conflicts` | files + workstreams whose integrated edits conflicted | Phase 3 integration | never (audit trail) |
| `scope_changes` | agent-reported discoveries | Phase 3 | never (audit trail) |
| `agent_progress` | map keyed by agent label: task IDs; `STARTED`/`EDITING`/`VERIFYING` stage; owned files; current command; ISO-8601-with-timezone `dispatched_at`, immutable `deadline_at`, `last_checked_at`, and `last_evidence_at`; integer `evidence_free_checks`; `deadline_status_requested_at`, initialized to `null` and replaced exactly once by an ISO-8601-with-timezone timestamp at the deadline request | root; dispatch initializes every supervision field, polling changes only `last_checked_at`/counter, and a milestone/status reply or new assigned-file diff changes `last_evidence_at` and resets the counter | root, after integration; terminal outcome is appended to `history` first |
| `agent_failures` | failure reasons per workstream/phase agent | circuit breakers | never (audit trail) |
| `halted` / `halt_reason` / `halt_context` | `true` + breaker name or `user-abort` + summary | circuit breakers, abort | removed by the user when resuming after fixing the root cause |
| `history` | `- [YYYY-MM-DD HH:MM] what happened` appended lines | every phase | never |

## Rules

1. **Audit-trail fields are append-only.** Fields marked "never (audit trail)" in the Cleared by column must never be overwritten or truncated — append new entries only.
2. **Stale fields must be reconciled.** A field whose "Cleared by" condition has occurred but which still has a value is stale. The resuming orchestrator must reconcile stale fields before acting on them, and record the reconciliation in `history`.
3. **Unknown fields are preserved.** Unknown fields found in a state file are preserved, reported in the session output, and never silently dropped. Forward compatibility is a hard requirement.
4. **Writes are idempotent.** A write that would not change a field's value is skipped; a history line identical to the previous line is not appended.
5. **Legacy agent entries are reconciled, not invented.** An `agent_progress` entry missing any supervision field is an orphaned handoff. Do not fabricate timestamps: record the reconciliation in `history`, inspect and preserve its assigned-file diff, obtain fresh scoped evidence, then complete it or redispatch only a named missing must-have.
6. **Agent routes are snapshotted before delegation.** Fresh workflows resolve each key independently with invocation > effective `AGENTS.md` > Build default, validate all mappings before mutation, and persist all six records. An absent mapping resolves to `{ requested_agent: null, source: build-default }`.
7. **Resume overrides are explicit and narrow.** Resume inspection before routing validation is read-only: select state and inventory branch, artifacts, stale fields, and halt conditions without acting. Complete every applicable current routing mapping before switching branches, reconciling stale fields, removing a halt triplet, recovering artifacts, applying a named-key override or legacy resolution, or mutating state/history. On resume, saved routes win. Changed `AGENTS.md` content is ignored. Invalid input preserves state and history unchanged. After valid input, a valid invocation block replaces only named keys, sets their source to `invocation`, and appends the old and new records to history; a legacy file missing `agent_routes` resolves exactly once and records history. Invalid routing preserves branch, state, history, and artifacts unchanged.
8. **Selection and model fallbacks are separate audit trails.** `agent_selection_fallback` is append-only and is written before Build-default dispatch; `model_fallback` is appended independently only if that model/effort route also falls back. A selected custom agent uses `profile-owned` in `model_routes`; later execution failure belongs in `agent_failures`.
