# Headroom check: build discovery-interview re-open rule

Date: 2026-10-11. Text under test: `build/SKILL.md` Phase 1 step 3 as released in v1.19.0 (commit `2284c90`). Protocol: `source/skills/eval/reference/ab-protocol.md` step 3 (headroom), run on state fixtures with the `build` regression runner template from `source/skills/eval/SKILL.md`.

## Question

The v1.19.0 architect review (AR-001) and an S-002 mid-review note (MR-002) proposed rewording the rule that re-opens the discovery interview after a SCOPE_CHANGE or RETHINK return:

- **AR-001:** step 3 says root sets `{"status":"pending","trigger":"scope-change"}` "when it records the return", but the Phase 3 and 3b sites that record those returns do not mention it. A root that follows them leaves `discovery_interview` at `done` and might then plan without asking.
- **MR-002:** a `pending` state carrying `trigger` reads through the discovery-level skip test before the one-round rule, so a re-open on a request first rated `quick_verify` might be skipped.

A reword changes skill instruction text, so the release rule would require an A/B. A headroom check runs first: if the current text already behaves correctly, the reword cannot beat it.

## Setup

Four new fixtures under `source/skills/eval/fixtures/`, now regression cases in `evals.json`:

| Fixture | State | Correct next action |
| --- | --- | --- |
| `orchestrator-plan-phase-rework-group-access` | SCOPE_CHANGE makes D-001 undeliverable (what is built); `discovery_interview` left at `done` | one interview round about the change |
| `orchestrator-plan-phase-rework-stats-rounding` | RETHINK on a request rated `quick_verify` with the interview skipped; state `pending` with `trigger` | one interview round about the change |
| `orchestrator-plan-phase-rework-dependency-policy` | SCOPE_CHANGE that changes only how (a blocked dependency); `done` | re-plan, ask nothing |
| `orchestrator-plan-phase-resume-csv-export` | `fable` mode, interview `done`, session ended before planning | plan as `[orchestrated]` with D-001..D-003, ask nothing |

Runners: Opus (the session model `build` inherits), one per run, read-only. Grader: one Opus agent applying the four new `grading.md` assertions.

## Results

| Fixture | Runs | Passed |
| --- | --- | --- |
| rework-group-access (`orchestrator-rework-asks-about-change`) | 3 | 3 |
| rework-stats-rounding (`orchestrator-rework-asks-about-change`) | 3 | 3 |
| rework-dependency-policy (`orchestrator-rework-replans-without-asking`) | 2 | 2 |
| resume-csv-export (`orchestrator-resume-plans-without-asking`, `orchestrator-plan-carries-interview-answers`) | 2 | 2 + 2 |

## Decision

No headroom: the current text re-opened the interview 6/6 where it should, and never where it should not. The reword is not made, so no A/B runs.

- On the `done` state, all three runners treated the field as stale and reset it to `pending` with `trigger` before asking. They cited step 3's "except as the SCOPE_CHANGE/RETHINK rule below says" and the state schema's stale-field rule (rule 2).
- On the `quick_verify` request, every runner set the skip aside. Two of the three cited the low-confidence-assumption clause, not the trigger sentence. That is the careful-reader path MR-002 described; it lands right.

## Caveats

- 2-3 Opus runs per fixture. The regression suite runs these cases on Sonnet: one run each, with Sonnet graders, passed 4/4 cases and 5/5 assertions.
- After the Opus runs, the three rework fixtures gained a `scope_change` counter event that the runners noted was missing. The Sonnet run used those fixtures. After the Sonnet run, the dependency-policy fixture's rework note changed "add quoting tests to Wave 0" to "with quoting tests in S-002", because Wave 0 sits in the completed slice. That runner noted the tension. Neither edit touches whether the interview re-opens.
