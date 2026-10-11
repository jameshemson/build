# Pay-more A/B probe

This probe measures whether a skill asks the user grounded questions before it plans, and whether it skips the questions it should not ask. It has two rubrics: one for the `build` orchestrator's discovery interview and one for standalone `impl-plan`'s interview. Run each skill as its own A/B (one probe question set per run). Both use the runner additions in `../ab-protocol.md` step 5: block A for both skills, block B for `build`. This rubric is for graders and the orchestrating session only, and it must never be passed to runner agents.

## Runner inputs

Paths below are relative to the repository's `source/skills/eval/` directory. Resolve them there, never in a variant's `eval` copy, and pass them to runners as absolute paths.

- The project: `fixtures/ab-probes/bill-split/project/`, shared with the bill-split probe. Every run treats it as the repository root. `src/split.js` exports `splitBill(totalPence, people)`, which splits a bill into integer-pence shares; leftover pennies go to the first people, so shares always sum to the total. `test/split.test.js` holds four tests. The project has no `.git`; block B tells `build` runners not to run git.
- build main input, passed verbatim as the skill argument: `mode=opus Let one person pay more of a bill than the others. How the extra share is expressed is not decided yet.`
- build control input: `mode=opus In src/split.js, add a one-line comment above splitBill saying it returns integer pence shares that sum to the total.`
- impl-plan main input: `Let one person pay more of a bill than the others. How the extra share is expressed is not decided yet. Done when the four existing tests still pass and new tests cover the change. Out of scope: anything other than integer pence.`
- impl-plan control input: `In src/split.js, add a one-line comment above splitBill saying it returns integer pence shares that sum to the total.`

The control inputs are the false-positive controls: a one-line comment is a tiny, fully specified change, and no arm should ask anything about it.

## Rubric: build

Questions are phrased so that `true` is the behaviour a change that adds a discovery interview should produce. Grade only what the output shows before the planning step.

- `q1_asks_before_plan`: Before the planning step, does the output show at least one question to the user about the feature itself? A question about the workflow mode or about a dirty working tree does not count.
- `q2_grounded`: Does at least one of those feature questions name something from the project's code: `splitBill`, `src/split.js`, the integer-pence shares, or the rule that leftover pennies go to the first people? False if `q1_asks_before_plan` is false.
- `q3_recommended_first`: Does every feature question list its recommended answer first and mark it as recommended? False if `q1_asks_before_plan` is false.

Also record per run: the number of feature questions shown, and a verbatim quote under 40 words for each true answer.

## Rubric: impl-plan

Same phrasing rule: `true` is the desired behaviour.

- `q1_no_who_why`: Does the output ask at least one question, and does none of its questions ask who is affected, who asked for the change, or why it is wanted now?
- `q2_skips_answered_hygiene`: Does the output ask at least one question, and does none of its questions ask for the definition of done or for what is out of scope? The request states both.
- `q3_recommended_first`: Does every question carry a recommended answer? False if no question is asked.
- `q4_grounded`: Does at least one question name `splitBill`, `src/split.js`, or the rule that leftover pennies go to the first people? False if no question is asked.

Also record per run: the number of questions asked, and a verbatim quote under 40 words for each true answer.

## Headroom note

Both main inputs say the share's shape is undecided, so a low-confidence assumption that would materially change the plan exists in every arm. That should make the base `impl-plan` interview (it asks at `standard_research`, `deep_dive`, or on such an assumption) and the new `build` arm interview rather than rate the request `quick_verify` and skip.

- impl-plan: in the step 3 headroom check, if 2 of 3 base outputs ask no question at all, the input is not open enough for the targets to discriminate; redesign it before the full A/B.
- build: the base orchestrator never interviews, so base outputs that ask nothing are the expected headroom. If 2 of 3 base outputs ask a feature question anyway, stop and redesign.

## Expected direction

For `build`, a change that adds the discovery interview should raise `q1_asks_before_plan` and `q2_grounded` on the main input, while the control runs ask nothing (`q1_asks_before_plan` false). For `impl-plan`, a change that applies the shared interview rules should raise `q1_no_who_why` and `q2_skips_answered_hygiene` on the main input; on the control input every arm should ask nothing, so both are false there because no question is asked. `q3` and `q4` are context.

ab-protocol step 7 (`compiles`) does not apply to either rubric: runners stop at their questions or before planning, so no output is a plan.

## Known fixture flaw

None recorded as of 2026-10-11.
