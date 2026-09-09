# Codex execution policy

Required with the Codex orchestrator before dispatch. This extends the existing prompt/state contract; it adds no routing key, preset, runtime router, scheduler or dependency. All five phases, root-only state/git authority, exact evidence and existing retry counters remain required.

## Fresh Build defaults

| Phase/job | Requested model | Effort |
|---|---|---|
| Root planning and integration | Inline `active-session` | Recommend starting `gpt-6-astra` / `medium`; record actual inherited route |
| Plan review / mid-review | `gpt-6-astra` | `medium` |
| Implementation | `gpt-6-astra` | `low` |
| Read-only exploration | `gpt-5.6-luna` | `max` |
| Verify receipt audit | `gpt-6-astra` | `low` |
| Architect review | `gpt-6-astra` | `high` |

Use explicit model and effort with `fork_turns: "none"` for Build-default children. Architect review uses `xhigh` only on explicit user preference; complexity alone never increases it. Plan review and mid-review use high for auth, security, destructive migrations or unresolved cross-system lifecycle risks. Verify uses medium when debt or semantic coverage requires cross-file judgment.

Select implementation effort by the batch risk, not the most expensive task elsewhere: use medium for migration, ownership, concurrency or cross-system design work. Tiny mechanical implementation may run inline only when classified simple and wholly contained in one existing pattern; disclose its inherited root model as `active-session`. Sol remains available through user/custom routing; there is no automatic Sol detour or settled claim about its task quality.

Group ready task IDs into the fewest safe bounded workstream batches, never one agent per task. Default to one writer; add a second only for independent disjoint files and available host slots. Root owns shared integration files. Retain zero explorers for simple, at most two for standard and at most three for complex, within host slot limits and the existing five-minute explorer runtime.

## Saved routes, dispatch audit and availability

Saved `model_routes`, including legacy `active-session`, remain authoritative on resume. New defaults apply only to fresh runs. Saved legacy inline roles continue inline; fresh-default delegation and effort never silently replace them. Fill genuinely missing roles once after routing validation and record the resolution. An explicit valid named-key override changes only its role. Custom routes remain opaque and `profile-owned`, with no Build model/effort override.

Append per-dispatch requested route, observed route or `unknown`, reason and task IDs to existing history; never infer the observed route from the request. Record inline work as `active-session`. Retain requested routes when reporting availability fallback. Agent-selection fallback is recorded before requesting Build defaults; model availability fallback remains independent of selection and execution failure.

If worker model selection is unavailable, implementation may fall back inline with `active-session` disclosure; Plan Review and Verify remain fresh agents on the observed host route or `unknown`. If delegation itself is unavailable, independent judgment phases block. When a host cannot honor the required Astra architect route, report the limitation and stop that phase unless the user explicitly authorizes a different reviewer. Successful custom profiles retain their own settings; this availability requirement applies to the effective Build-default architect route.

Fresh Plan Review, Verify and Architect Review use the existing 20-minute hard deadline, one fresh retry, and phase-agent breaker. A named slow command may declare a longer deadline before dispatch. A timeout never reduces reviewer effort or duplicates a still-running worker: interrupt only at immutable hard expiry and establish termination before retrying. Supervision remains terminal-only; silence is unknown. After a concrete failed must-have, one Build-default retry may move implementation low to medium within the existing retry budget; it creates no new escalation loop and never changes an opaque custom profile.

## Bounded worker packets and tool output

Supply the current workstream rather than the entire plan/history. Each packet includes requirement/decision IDs and their text, exact owned files, relevant interfaces and lifecycle rules, task IDs and dependency order, typed must-have IDs/claims/evidence kinds/refs, scoped commands, exclusions, runtime and terminal-report format. Agents may inspect necessary source; they never access `.build/` or mutate git. Implementation workers never invoke workflow skills. Root inlines needed workflow artifacts or exports exact inputs outside `.build/`.

Request at most 300 words in a normal terminal handoff, with additional space for concrete blockers or evidence that cannot fit. Use `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, `BLOCKED`, or `SCOPE_CHANGE`, completed IDs, files, exact tests and unresolved issues. Missing contract context requires `NEEDS_CONTEXT`; material unplanned scope requires `SCOPE_CHANGE`.

Use section-indexed reads and bounded tool output. For ad hoc commands, save full output to a temporary log and surface exit status, failing assertions and relevant excerpts. Compiled evidence keeps existing hashed, bounded receipts: never rewrite exact commands or imply discarded output was retained. Missing observations remain uncovered. Workers run scoped checks; root retains every integration, slice, checkpoint and final evidence authority. Run risky behavior tests in the first implementing batch; discretionary checks stop once required evidence passes unless a new change, failure or unresolved concern justifies them.

## Fresh receipt judgment

For Codex receipt-mode Verify, root freshly runs metadata `run-evidence --check-only` and exports the exact current contract, ledger, referenced receipt and subject bytes, hashes and check output. Include a role-specific file/section index for Verify covering current receipts, requirements, plan, implementation summary and all inputs needed to assess exact-command consumers, observations and semantic coverage. Root exports them outside `.build/` or inlines them, preserving exact bytes and their identities; a summary is insufficient.

The fresh Verify agent loads current receipts, requirements and implementation summary through that index, inspects those bytes, judges semantic coverage and scans source debt without reading `.build/` or executing evidence commands. Missing inputs or a changed subject require root to refresh and revalidate the packet before acceptance. A runnable check failure remains authoritative; valid failed-command evidence still receives Verify judgment. This adapts the portable Verify protocol only for the Codex root/agent boundary. Prompt fallback retains its existing exact-command protocol. The evidence kernel, root's fresh final ledger, result compilation and checkpoint/final separation remain unchanged.

## Whole-diff architect judgment

Root supplies the complete changed-file inventory, pinned base/head target, accepted requirements and fresh verification result, plus relevant artifact content outside `.build/`. Include a role-specific file/section index for Architect covering the complete diff, relevant unchanged dependencies, accepted requirements, fresh Verify and relevant artifact content; exact contract, ledger, referenced receipt and subject bytes remain available. The fresh reviewer inspects that exact diff in sections and follows unchanged dependencies as needed, reading accepted requirements, fresh Verify and relevant artifact content for its design judgment. Architect opens underlying raw evidence or historical output when a concrete concern requires it, without routinely repeating Verify's receipt audit. Summary brevity never limits whole-diff review coverage. Root owns git target computation, all artifact/state writes and result receipt acceptance; the independent reviewer owns its architecture judgment.
