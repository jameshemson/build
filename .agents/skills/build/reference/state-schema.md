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
| `model_routes` | map of phase or role to requested model + effort, derived from current provisional/final complexity | Phase 1 before delegation, then after final classification | overwritten only when complexity or available routing changes |
| `model_fallback` | append-only entries with timestamp, phase, requested route, actual route, and reason | orchestrator, before using a fallback | never (audit trail); omit when no fallback occurred |
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
| `agent_progress` | map keyed by agent label: task IDs, `STARTED`/`EDITING`/`VERIFYING` stage, owned files, current command, and last update | root, from milestones and bounded status checks | root, after integration; terminal outcome is appended to `history` first |
| `agent_failures` | failure reasons per workstream/phase agent | circuit breakers | never (audit trail) |
| `halted` / `halt_reason` / `halt_context` | `true` + breaker name or `user-abort` + summary | circuit breakers, abort | removed by the user when resuming after fixing the root cause |
| `history` | `- [YYYY-MM-DD HH:MM] what happened` appended lines | every phase | never |

## Rules

1. **Audit-trail fields are append-only.** Fields marked "never (audit trail)" in the Cleared by column must never be overwritten or truncated — append new entries only.
2. **Stale fields must be reconciled.** A field whose "Cleared by" condition has occurred but which still has a value is stale. The resuming orchestrator must reconcile stale fields before acting on them, and record the reconciliation in `history`.
3. **Unknown fields are preserved.** Unknown fields found in a state file are preserved, reported in the session output, and never silently dropped. Forward compatibility is a hard requirement.
4. **Writes are idempotent.** A write that would not change a field's value is skipped; a history line identical to the previous line is not appended.
