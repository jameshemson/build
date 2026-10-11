# A/B report: build orchestrator discovery interview

Date: 2026-10-11. Workflow: `discovery-interview` (branch `build/discovery-interview`). Protocol: `source/skills/eval/reference/ab-protocol.md`, with the step 5 runner additions (blocks A and B) for a skill that asks the user.

## Question and decision rule

Written before any run.

- **Behaviour:** on a fresh, non-tiny workflow, the Claude `build` orchestrator asks the user grounded discovery questions, on option screens with the recommended answer first, after exploring the code and before planning.
- **Target questions** (from `source/skills/eval/reference/ab-probes/pay-more.md`, `## Rubric: build`):
  - `q1_asks_before_plan` — before the planning step, at least one question to the user about the feature itself.
  - `q2_grounded` — at least one such question names `splitBill`, `src/split.js`, the integer-pence shares or the leftover-pennies rule.
- **Context question:** `q3_recommended_first`.
- **Margin:** 2 (5 runs per arm). Keep only if new beats both old and placebo by at least 2 on a target question.

## Setup

- **Probe:** pay-more, build main input `mode=opus Let one person pay more of a bill than the others. How the extra share is expressed is not decided yet.`; control input `mode=opus In src/split.js, add a one-line comment above splitBill saying it returns integer pence shares that sum to the total.`; project `fixtures/ab-probes/bill-split/project/`.
- **Base ref:** `8c7d44c368d806538a603e6b5406217af3769ff0`, the S-001 checkpoint. At that commit `build` is unchanged from `v1.18.0` and the sibling `impl-plan` already holds `reference/discovery-interview.md`, which the new `build` step links; `eval-ab.js prepare` copies siblings from the base ref, so every arm resolves that link.
- **New:** working tree at `1c38202` (`build/SKILL.md` Phase 1 step 3 and the orchestrated planning paths; `state-schema.md` row).
- **Runners:** session model (Opus; `build` has no `model` frontmatter); step 5 template plus block A (write question screens and stop) and block B (read-only simulation of a fresh workflow, no git, stop before the planning step).
- **Runs:** 5 per arm, 3 arms, plus 2 control runs on the new arm (17 runners). One blind Opus grader.
- **Placebo:** `5 insertions, 4824 added chars, 4815 placebo chars`.
- **Headroom (step 3):** 3 base runs on the main input; none asked a question, all three ended at `/build:impl-plan`.
- **Step 7 (`compiles`):** not applicable; no output is a plan.

## Results

```
| Arm | q1_asks_before_plan | q2_grounded | q3_recommended_first |
| --- | --- | --- | --- |
| old | 0/5 | 0/5 | 0/5 |
| placebo | 0/5 | 0/5 | 0/5 |
| new | 5/5 | 5/5 | 5/5 |
| new (control input) | 0/2 | 0/2 | 0/2 |
| noise (abs placebo - old) | 0 | 0 | 0 |
| decision (margin 2) | keep | keep | keep |
```

## Reading

Both target questions decide **keep**: every new-arm run on the main input stopped after exploration with a first-round question screen, and every one of those questions named `splitBill` in `src/split.js` (and in several runs the integer-pence model) with the recommended option first. Old and placebo never asked; they listed the undecided share shape as an open point for the planner and went straight to `/build:impl-plan`. The new arm rated the request `quick_verify` in every run and still interviewed, through the low-confidence-assumption exception, which is the path the plan relied on. The first rounds held 1-3 questions, with leftover-pence handling and validation deferred to round 2 because they depend on the first answer, which is the frontier rule working. On the control input the new arm rated the request `skip`, recorded the skip, and asked nothing in both runs.

## Caveats

- Block A stops each runner at its first question screen, so this A/B measures that the interview starts and how its first round looks. It does not measure later rounds, the "no cap" rule, the closing confirmation screen or the recording of answers; the contract tests pin that prose, and the root session's own interview in this workflow exercised it once by hand.
- Runners could list `variants/`, and the `eval` sibling, which holds this rubric, sits inside each variant, so blinding rests on instructions rather than file access.
- The placebo filler is visibly nonsense; several placebo-arm runners said they noticed and ignored it, and one noticed a stray single-character line left by an insertion. The placebo controls for length, not for a plausible inert instruction.
- One runner (r11) listed the probe's parent fixture directory with `ls -la ..` and saw the bill-split probe's `plan-1.md` and `plan-2.md` names; it opened neither, and they bear on another probe's rubric, not this one.
- One probe, one project, Claude only. The Codex orchestrator (`SKILL.codex.md`) was not changed and is not measured.
