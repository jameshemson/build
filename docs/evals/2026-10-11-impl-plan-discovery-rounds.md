# A/B report: impl-plan shared discovery interview

Date: 2026-10-11. Workflow: `discovery-interview` (branch `build/discovery-interview`). Protocol: `source/skills/eval/reference/ab-protocol.md`.

## Question and decision rule

Written before any run.

- **Behaviour:** standalone `impl-plan` asks only grounded decision questions it cannot settle from the code, and no longer asks "who and why now" or re-asks the definition of done and out-of-scope when the request already states them.
- **Target questions** (from `source/skills/eval/reference/ab-probes/pay-more.md`, `## Rubric: impl-plan`):
  - `q1_no_who_why` — the output asks at least one question and none asks who is affected, who asked, or why now.
  - `q2_skips_answered_hygiene` — the output asks at least one question and none asks for the definition of done or what is out of scope.
- **Context questions:** `q3_recommended_first`, `q4_grounded`.
- **Margin:** 2 (5 runs per arm). Keep only if new beats both old and placebo by at least 2 on a target question.

## Setup

- **Probe:** pay-more, impl-plan main input `Let one person pay more of a bill than the others. How the extra share is expressed is not decided yet. Done when the four existing tests still pass and new tests cover the change. Out of scope: anything other than integer pence.`; control input `In src/split.js, add a one-line comment above splitBill saying it returns integer pence shares that sum to the total.`; project `fixtures/ab-probes/bill-split/project/`.
- **Base ref:** `4194a2d4b39ca1e205ad505c7f3be1f644e860af` (the workflow's base, identical to `v1.18.0` for `impl-plan`).
- **New:** working tree at `1c38202` (shared `reference/discovery-interview.md` plus the Step 0 change).
- **Runners:** Opus, effort high (from `impl-plan` frontmatter); step 5 template plus block A ("This run has no user … write each question screen … and then stop. Writing a screen counts as presenting it").
- **Runs:** 5 per arm, 3 arms, plus 2 control runs on the new arm (17 runners). One blind Opus grader.
- **Placebo:** `3 insertions, 5039 added chars, 5035 placebo chars`.
- **Headroom (step 3):** 3 base runs on the main input; all three asked "who and why now" and re-asked done and scope, so both targets were false 3/3. Every base run did ask questions, so the input was open enough.
- **Step 7 (`compiles`):** not applicable; runners stop at their questions.

## Results

```
| Arm | q1_no_who_why | q2_skips_answered_hygiene | q3_recommended_first | q4_grounded |
| --- | --- | --- | --- | --- |
| old | 0/5 | 0/5 | 3/5 | 5/5 |
| placebo | 0/5 | 0/5 | 2/5 | 5/5 |
| new | 5/5 | 5/5 | 5/5 | 5/5 |
| new (control input) | 0/2 | 0/2 | 0/2 | 0/2 |
| noise (abs placebo - old) | 0 | 0 | 1 | 0 |
| decision (margin 2) | keep | keep | keep | drop |
```

## Reading

Both target questions decide **keep**: the new text moved `q1_no_who_why` and `q2_skips_answered_hygiene` from 0/5 (old and placebo) to 5/5, a margin of 5 against a required 2, with zero placebo-vs-old noise on either target. The new arm's questions were also fewer (3-4 per first round, against 7-9 in old and placebo) because the rest of the frontier was held for later rounds, and every question carried a recommended answer (`q3` 5/5 against 3/5 and 2/5). `q4_grounded` is 5/5 in every arm, so grounding in the code was already present and is context, as planned. On the control input the new arm asked nothing and went straight to a compact plan in both runs, so the change does not make `impl-plan` interview on tiny, fully specified requests.

## Caveats

- Runners could list `variants/`. The variants' `eval` copies come from the base ref, which predates this probe, so they hold no `pay-more` rubric; the rubric lived only in the repository's `source/skills/eval/`, two directories above the probe inputs. Blinding still rests on the instruction not to read outside the variant and the listed inputs, not on file access.
- The placebo filler is visibly nonsense (unit conversions, character codes); several placebo-arm runners said they noticed and ignored it. The placebo still controls for length, not for a plausible-looking but inert instruction.
- The placebo variant contains `reference/discovery-interview.md` as length-matched filler (`eval-ab.js` replaces a new file with filler), and the old variant has no such file. Placebo-arm runners reported that their `SKILL.md` does not link it and did not open it.
- One probe, one project, Claude only. The behaviour is close to binary on this probe, so a larger effect size than 5/5 is not possible here.
- The grader judged an invitation to "correct" a restated definition of done as asking about it (r02, r16) and a recommendation of "none"/"skip it" as no recommendation (r05, r15, r16); neither call touches a new-arm run.
