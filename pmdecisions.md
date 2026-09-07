# Decisions

## 2026-09-07: implement-relay accepted on the human verdict after Architect Review FAIL
`status: accepted` · `confidence: medium` · `revisit: when the coordinator-mode wave lands`

**Decision:** Close the `implement-relay` workflow on James's verdict with the Architect Review FAIL recorded rather than reworked. The branch is tested and complete on its own terms — `npm test` 553 pass / 0 fail, `check-sync` in sync, both slices checkpointed with `complete-slice` receipts, a standalone execution on Sol, and a 10/10 graded eval run — and none of the three findings names a task in the compiled contract.

**The three findings, and why each is deferred:**

- **AR-001 (Important)** — `implement-slice` writes one separator newline before its section heading, which the pinned "every byte outside the active slice section" invariant forbids. Fixing it means editing a sentence pinned verbatim by `WORKFLOW_MODE_CONTRACTS` and by T-009's evidence command, so it is a plan change, not an implementation fix. Deferred to the coordinator-mode wave (`plans/coordinator-mode-plan.md`).
- **AR-002 (Important)** — four mechanical coverage gaps leave Verify at PARTIAL: `binding:B-001:judgment`, `task:T-001:slice`, `slice:unknown:completion-receipt`, and `planned-unchanged:.build/plans/implement-relay-implementation-summary.md`. The first three are a shipped `coverage.js` defect: `impl-plan` requires Wave 0 to be global and excluded from every slice, but the coverage evaluator still demands slice completion for it, and a structural binding's judgment can only ride on a completion receipt — so any plan whose Wave 0 task carries structural evidence can never reach VERIFIED. The fourth is a plan-authoring error (T-017 and T-018 declared a gitignored `.build/` path as `files_modified`) that cannot change after review. Deferred to the coordinator-mode wave.
- **AR-003 (Important)** — the changed-path shape scan reports 20 functions over 80 lines and 7 over 150, including a 156-line `compilePhaseResult` this change touches by one expression. An extraction refactor is outside the reviewed scope. Deferred to the roadmap.

**What the seven plan-review rounds cost and found:** findings per round were 12, 8, 7, 3, 1, 1, 0. Two rounds paid for themselves by exposing shipped defects rather than plan defects. Rounds 1 and 2 surfaced the fingerprint directory mismatch — `compile-result` captured repository identity against `.build/evidence` while reading the ledger from `.build/evidence/{slug}`, so every receipt in this workflow needed an explicit `--evidence-dir`; that is fixed in this branch by the `repository-identity` subcommand and the per-slug `compile-result` default, and round 7 compiled with no `--evidence-dir` on either side, which is the live proof. The Wave 0 coverage gap surfaced only at the Verify gate and is deferred.

**Lesson:** rounds 5, 6, and 7 returned one, one, and zero findings on progressively smaller deltas, and round 7 existed only because the compiler requires a `proceed` receipt matching the current plan hash — a `proceed_with_fixes` verdict plus an applied fix is not compilable. A Proceed-with-fixes verdict on a small delta needs the threshold rule the next wave adds, instead of an unbounded fresh-review requirement.

**Accepting:** the branch ships with a recorded FAIL and a PARTIAL Verify. It is not merged; publishing stays James's decision.

---

## 2026-09-07: mixed mode relays implementation to Codex
`status: accepted` · `confidence: medium` · `revisit: after the first real mixed-mode workflow completes an implement relay`

**Decision:** `mixed` mode gains `implement: codex-relay`. Each active delivery slice is relayed to Codex (Sol at high effort) through a new portable `implement-slice` skill, while root keeps judgment, acceptance, state, and git (D-003, D-005). The relay gets no `compile-result` phase; `complete-slice` and `run-evidence --check-only` remain its deterministic authority (D-006).

**What happened:** This workflow is the first live run of the shipped judgment relays, and it found a real defect twice: `compile-result` captured repository identity against `.build/evidence` while reading the ledger from `.build/evidence/{slug}`, so every review receipt in rounds 1 to 6 had to be compiled with an explicit `--evidence-dir`. D-017 fixes that by making both sides use the per-slug default and by adding `buildctl repository-identity` as the single fingerprint source.

**Also decided:** After six plan-review rounds and three breaker waivers, James accepted the round-6 review ("Proceed with fixes", one Important finding, fix applied) without a seventh confirming review. The lesson: a Proceed-with-fixes verdict on a small delta needs a threshold rule rather than an unbounded fresh-review requirement.

**Accepting:** The relay has never run end to end inside a workflow. A standalone execution on Sol and five first-action eval cases stand in; the first real mixed-mode workflow after this lands is still the acceptance test.

---

## 2026-08-19: workflow modes ships; the v1.15 dogfood kill criterion fires
`status: accepted` · `confidence: high` · `revisit: if the codex-exec primary relay fails its first real mixed-mode workflow, or if a third mechanism release lands before an instrumented dogfood run`

**Decision:** Ship workflow modes as a second mechanism release landing before the instrumented Codex-native dogfood run; per the 2026-07-28 kill criterion, the dogfood gate stops being called a gate.

**What happened:** The v1.15 direction question — consolidate orchestration on Claude with GPT as judgment provider — is now being answered by shipped mechanism: `mixed` mode is that consolidation in preset form, with codex-exec as the primary relay mechanism. This choice is user-directed; feasibility was proven in-session by a non-interactive `gpt-5.6-sol` adversarial review of the feature's own plan, which found a Critical receipt-compatibility hole two Claude review rounds had missed.

**Accepting:** The instrumented run remains worth doing but no longer gates releases.

---

## 2026-07-28: v1.15.0 shipped mechanism without the dogfood gate running first
`status: accepted` · `confidence: high` · `revisit: if a second mechanism release lands before the instrumented Codex-native run`

**Decision:** Ship the in-plan test-weakening gate, the phase-agent halt fix, and the evidence-ref guidance as 1.15.0, and record that the 2026-07-24 dogfood gate did not gate it.

**What happened:** The 2026-07-24 entry accepted "No new mechanism ships this week" as the price of putting one instrumented Codex-native run ahead of the Clodex-versus-Verify-agent fork. v1.14.1 landed 2026-07-26. That run and the Codex issue recheck (#16900/#19197/#14866) have still not happened. 1.15.0 shipped mechanism anyway, from an unrelated source: an audit of July transcripts surfaced three recurring corrections, and one — a test file weakened to pass a gate — had no mechanical guard at all.

**Why it did not wait:** All three were verified against the code before anything was built, and two were already enforced (`coverage.js:95` for literal evidence refs, `agent_retry` for dispatch escalation), so only the uncovered case shipped. The work is orthogonal to the fork and spends none of its evidence budget; the dogfood run still decides that question on unchanged terms.

**Accepting:** The 2026-07-24 decision stays `open` and its revisit condition is unchanged. 1.15.0 has been dogfooded informally and behaves as intended, but that is not the instrumented Codex-native run that entry specifies, and this release is not evidence for either branch of the fork.

**Kill criterion:** If a second mechanism release lands before the instrumented run, the dogfood gate is not a real gate — stop calling it one and re-plan the v1.15 direction on the evidence actually available.

---

## 2026-07-24: v1.15 direction - dogfood gate before Clodex or Verify-agent retirement
`status: open` · `confidence: medium` · `revisit: after v1.14 is landed and one instrumented Codex-native dogfood run (plus a recheck of Codex issues #16900/#19197/#14866) completes`

**Decision:** Land v1.14 now, then run the dogfood gate as one instrumented Codex-native build; defer both Clodex-style consolidation and Verify-agent retirement until that evidence exists.

**Bet:** One cheap instrumented run plus a host-status recheck decides the real fork (keep patching Codex-native orchestration vs consolidate orchestration on Claude with GPT as judgment provider) better than committing mechanism on two-run-old evidence. Kill criterion: persistent control-plane failures in the instrumented run skip Verify-agent retirement and make Clodex-style consolidation v1.16.

**Ruled out:** Clodex-style as v1.15: stacks a strategic bet on an unlanded receipts contract that has never survived a cross-harness run. Verify-agent retirement as v1.15: the 2026-07-22 complete-slice-transition-authority state shows the pain spread across selector fallback (8/8 spawns at host-default), explorer deadline timeouts, and inline-phase duration - one fewer Verify dispatch addresses a sliver. Doing both at once: single-maintainer dogfood bandwidth.

**Accepting:** No new mechanism ships this week; if the dogfood run slips, the v1.15 decision slips with it.

---
