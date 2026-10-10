# Bill-split A/B probe

This probe measures whether a change to a skill makes the skill notice or protect existing behaviour that has no test, in code that a plan modifies. The runner-visible inputs live in `../../fixtures/ab-probes/bill-split/`. This rubric is for graders and the orchestrating session only, and it must never be passed to runner agents.

## Runner inputs

Paths below are relative to the repository's `source/skills/eval/` directory. Resolve them there, never in a variant's `eval` copy (which comes from the base ref and may not contain this probe), and pass them to runners as absolute paths.

- The project: `fixtures/ab-probes/bill-split/project/`. Every run treats it as the repository root. `src/split.js` splits a bill into integer-pence shares. When the total does not divide evenly, the leftover pennies go to the first people, so `splitBill(1000, 3)` returns `[334, 333, 333]` and shares always sum to the total. None of the four existing tests in `project/test/split.test.js` exercises an uneven total.
- review-plan main input: `fixtures/ab-probes/bill-split/plan-1.md`. This plan adds optional weights, never guards the remainder rule, and claims the four existing tests cover unchanged behaviour.
- review-plan control input: `fixtures/ab-probes/bill-split/plan-2.md`. This is the same plan plus REQ-003 and a Wave 0 test pinning `splitBill(1000, 3)` to `[334, 333, 333]`. It is the false-positive control: a review should not call the behaviour unguarded.
- impl-plan main input: the request text, passed verbatim as the skill argument with the project as repository root: `[orchestrated] Let splitBill take optional per-person weights, so one person can pay a larger share of a bill (for example weights [2, 1, 1, 1]).` The impl-plan probe has no control input.

## Rubric: review-plan

Questions are phrased so that `true` is the behaviour a change that strengthens preserved-behaviour checking should produce.

- `q1_rounding`: Does the review say the plan leaves rounding or remainder handling unspecified for the weighted split (fractional pence, or shares that may not sum to the total)? Record the severity label of the finding where it appears (Critical, Important, Minor or untagged).
- `q2_unguarded_existing`: Does the review say that the CURRENT behaviour of calls without weights, specifically uneven totals such as `splitBill(1000, 3)` returning `[334, 333, 333]` with leftover pennies going to the first people, is not protected by any test, or that the plan's claim that existing tests cover the unchanged behaviour is wrong? A review that only says the new weighted formula's rounding is unspecified, without saying the existing behaviour lacks a test, counts as false. A review that says the plan already adds a test pinning that behaviour, and raises no concern about it, counts as false. Record the severity.
- `q3_asks_for_guard_test`: Does the review's recommended fix include adding a test, or a requirement, that pins the existing uneven-split result (for example asserting `splitBill(1000, 3)` deep-equals `[334, 333, 333]`, or a test that passes on the current code before the change)? Recommending only that the plan define a rounding rule counts as false.

Also record per review: the verdict text, finding counts per severity, and a verbatim quote under 40 words for each true answer.

## Rubric: impl-plan

Same phrasing rule: `true` is the desired behaviour.

- `q1_remainder_rule`: Does the plan specify how weighted shares become integer pence that sum exactly to the total (a defined remainder or rounding rule)?
- `q2_names_existing_behavior`: Does the plan explicitly identify the current behaviour of calls without weights on uneven totals (leftover pennies to the first people) as behaviour that must keep working, as a requirement, a decision, or in its "What existing behavior changes" or Wave 0 section? Saying only "two-argument calls are unchanged" without referring to the uneven-total or leftover-penny behaviour counts as false.
- `q3_pins_unweighted_uneven`: Does the plan include a test that calls `splitBill` WITHOUT weights on a total that does not divide evenly and asserts the current result (for example `splitBill(1000, 3)` deep-equals `[334, 333, 333]`)? A test that only passes equal weights such as `[1, 1, 1]` counts as false.
- `q3b_passes_before_change`: If q3 is true, does the plan place that test before `src/split.js` changes (Wave 0 or an earlier task) and state or clearly imply that it passes on the unmodified code? False if q3 is false.
- `q4_equal_weights_matches_unweighted`: Does the plan include a test asserting that equal weights reproduce the unweighted split on an uneven total?
- `compiles` (mechanical, added by the orchestrating session, not the grader): `node source/skills/build/buildctl/cli.js validate-plan --plan <output> --out .build/ab-contracts/<run-id>/<run>.json` prints `"ok":true`.

## Expected direction

A change that strengthens preserved-behaviour checking should raise `q2` and `q3` for the review-plan main input while leaving `q2` false on the control input. For impl-plan it should raise `q2_names_existing_behavior`, `q3_pins_unweighted_uneven` and `q3b_passes_before_change` without lowering `compiles`. The `q1` questions are context: every arm flagged rounding on 2026-10-10, so they cannot separate arms on this probe.

## Baseline 2026-10-10

These numbers come from manual runs (reports in the maintainer's local `.build/eval/2026-10-10-0810-ab/report.md` and `.build/eval/2026-10-10-0843-ab-plan/report.md`), 5 runs per arm, one blind Opus grader. They tested a one-sentence "preserve untested behaviour" rule that was then reverted.

review-plan (Sonnet reviewer), plan-1 unless noted:

| Arm | q1_rounding | q2_unguarded_existing | q3_asks_for_guard_test | Do not proceed |
|-----|------|------|------|------|
| old | 5/5 | 4/5 | 4/5 | 1/5 |
| placebo | 5/5 | 5/5 | 5/5 | 2/5 |
| new | 5/5 | 4/5 | 4/5 | 1/5 |
| new, plan-2 (control) | 2/2 | 0/2 | 1/2 | 0/2 |

impl-plan (Opus planner, effort high):

| Arm | q1_remainder_rule | q2_names_existing_behavior | q3_pins_unweighted_uneven | q3b_passes_before_change | q4_equal_weights_matches_unweighted | compiles | Avg lines |
|-----|---|---|---|---|---|---|---|
| old | 5/5 | 3/5 | 4/5 | 3/5 | 5/5 | 4/5 | 274 |
| placebo | 5/5 | 5/5 | 5/5 | 4/5 | 5/5 | 5/5 | 246 |
| new | 5/5 | 5/5 | 4/5 | 4/5 | 5/5 | 2/5 | 247 |

The placebo differed from old by up to 2 of 5 on single questions, so differences of 1 to 2 runs in 5 are noise on this probe. The base skills already scored 4/5 on the main targets, so this probe has little headroom for review-plan and impl-plan changes aimed at the same behaviour. Run the protocol's headroom check before reusing it, and prefer a subtler fixture if the base passes.

## Known fixture flaw

Both plans' T-002 `verify` runs the whole test file, in which test 6 still fails until T-003 lands. Reviewers flagged this as Important or Critical in most runs on 2026-10-10. It is kept on purpose so results stay comparable with the baseline. Graders should not count it towards any rubric question.
