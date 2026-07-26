# Decisions

## 2026-07-24: v1.15 direction - dogfood gate before Clodex or Verify-agent retirement
`status: open` · `confidence: medium` · `revisit: after v1.14 is landed and one instrumented Codex-native dogfood run (plus a recheck of Codex issues #16900/#19197/#14866) completes`

**Decision:** Land v1.14 now, then run the dogfood gate as one instrumented Codex-native build; defer both Clodex-style consolidation and Verify-agent retirement until that evidence exists.

**Bet:** One cheap instrumented run plus a host-status recheck decides the real fork (keep patching Codex-native orchestration vs consolidate orchestration on Claude with GPT as judgment provider) better than committing mechanism on two-run-old evidence. Kill criterion: persistent control-plane failures in the instrumented run skip Verify-agent retirement and make Clodex-style consolidation v1.16.

**Ruled out:** Clodex-style as v1.15: stacks a strategic bet on an unlanded receipts contract that has never survived a cross-harness run. Verify-agent retirement as v1.15: the 2026-07-22 complete-slice-transition-authority state shows the pain spread across selector fallback (8/8 spawns at host-default), explorer deadline timeouts, and inline-phase duration - one fewer Verify dispatch addresses a sliver. Doing both at once: single-maintainer dogfood bandwidth.

**Accepting:** No new mechanism ships this week; if the dogfood run slips, the v1.15 decision slips with it.

---
