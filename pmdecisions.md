# Decisions

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
