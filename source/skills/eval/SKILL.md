---
name: eval
description: Run test cases against build skills, grade outputs against assertions. Use when you want to verify skills work correctly after changes.
user-invocable: true
argument-hint: "[skill-name]"
allowed-tools: Read, Write, Bash, Glob, Grep, Agent, Skill
---

You are running evaluations against the build plugin's skills. You spawn agents that run each skill, then spawn graders that check the outputs against defined assertions.

## Step 1: Load test cases

Read `evals.json` (in this skill's directory). If $ARGUMENTS names a skill (e.g. "review-plan"), filter to only test cases where `"skill"` matches. If $ARGUMENTS is empty, run all test cases.

## Step 2: Set up output directory

Create `.build/eval/{YYYY-MM-DD-HHmm}/`. This is the run directory. Each test case gets a subdirectory named by its `id`.

## Step 3: Pre-flight check

Run `git status` (short format). If there are uncommitted changes, print a warning: "Uncommitted changes detected. Eval results may vary depending on repo state." Continue regardless.

## Step 4: State the cost

Count the test cases. Print: "Running {N} test cases. This will spawn {N} runner agents + {N} grader agents ({2N} total)." Wait for no acknowledgment — just proceed.

## Step 5: Spawn runner agents (parallel)

For each test case, spawn an agent. Send all independent agents in a single message so they run in parallel. Use Sonnet for all runners.

**For `impl-plan` test cases** (has `"prompt"` and `"target"` fields):
```
You are running an eval for the impl-plan skill.

1. Invoke /build:impl-plan via the Skill tool with this argument: "{prompt}"
2. The skill will produce an implementation plan. When it finishes, save the complete plan output to {run-dir}/{eval-id}/output.md using the Write tool.
3. Report DONE when the file is written.
```

**For `review-plan` test cases** (has `"input_fixture"` field):
```
You are running an eval for the review-plan skill.

1. Read the plan at {this-skill-dir}/{input_fixture}
2. Invoke /build:review-plan via the Skill tool. The plan content is already in your context from step 1.
3. Save the complete review output to {run-dir}/{eval-id}/output.md using the Write tool.
4. Report DONE when the file is written.
```

**For `verify` test cases** (has `"target"` field, skill is "verify"):
```
You are running an eval for the verify skill.

1. Invoke /build:verify via the Skill tool. If the test case has a "prompt" field, pass it (with {this-skill-dir} substituted) as the argument. Otherwise, if the test case's "target" is not ".", pass this argument: "Verify the project at {this-skill-dir}/{target}. Run all commands inside that directory." Otherwise pass no argument.
2. Save the complete verification output to {run-dir}/{eval-id}/output.md using the Write tool.
3. Report DONE when the file is written.
```

**For `architect-review` test cases** (has `"input_fixture"` field, skill is "architect-review"):
```
You are running an eval for the architect-review skill.

1. Read all three files in {this-skill-dir}/{input_fixture}: plan.md, verify-report.md, diff.patch.
2. Invoke /build:architect-review via the Skill tool with this argument: "Review the diff provided in this conversation (diff.patch content) against the plan provided (plan.md content). The verification report in context is fresh evidence for this work. This is a standalone review of fixture content - do not run git commands to find a target."
3. Save the complete review output to {run-dir}/{eval-id}/output.md using the Write tool.
4. Report DONE when the file is written.
```

**For `build` test cases** (has `"state_fixture"` and `"state_slug"` fields):

The orchestrator is a decision function over workflow state. These cases evaluate the transition it
would choose, never its execution — a real invocation would run a git preflight, cut a branch, and
dispatch implementation agents. Read-only by construction.

Name orchestrator cases and fixtures for the input state, never for the expected outcome. The
runner sees both the fixture path and its own output path, so an id like `build-never-skips-verify`
hands it the answer — observed doing exactly that, in a run where the agent cited the directory
name as its reason. `build-verify-phase-clean-summary` describes the same fixture without
disclosing what should happen.
```
You are running an eval for the build orchestrator's phase-transition logic.

This is a READ-ONLY evaluation. Do not create, modify, or delete any file except the single
output file named in step 4. Do not run any git command that changes state (no checkout, branch,
commit, add, or stash). Do not invoke /build:build.

1. Read every `{state_slug}-*.md` artifact in {this-skill-dir}/{state_fixture}. Together they are
   a workflow mid-flight; treat them as if they were the contents of `.build/plans/`.
2. Read the orchestrator's own instructions at {this-skill-dir}/../build/SKILL.md, and the state
   schema it links at {this-skill-dir}/../build/reference/state-schema.md, and any reference file
   those instructions link to for the fixture's current phase — for mode fixtures,
   {this-skill-dir}/../build/reference/workflow-modes.md.
3. Applying those instructions to that state, decide what the orchestrator does next. Write your
   answer with these four headings, in this order:
   - `## Next phase` — the exact value the `phase:` field would take next, or `unchanged` if the
     orchestrator would act without transitioning.
   - `## Next action` — the single concrete action taken first, naming the skill or command.
   - `## Why` — the specific instruction that determines this, quoted from the orchestrator or the
     state schema.
   - `## Rejected` — each phase you considered and did not choose, with the reason.
4. Save that answer to {run-dir}/{eval-id}/output.md using the Write tool.
5. Report DONE when the file is written.
```

## Step 6: Spawn grader agents (parallel, after all runners complete)

After all runner agents return, spawn grader agents — one per test case, all in a single message. Use Sonnet for all graders.

Each grader prompt:
```
You are grading the output of a build skill eval.

1. Read the grading criteria at {this-skill-dir}/reference/grading.md
2. Read the skill output at {run-dir}/{eval-id}/output.md
3. For each of these assertions: {assertions list from the test case}
   - Find the assertion's checking instructions in grading.md
   - Apply those instructions to the skill output
   - Record: assertion_id, passed (true/false), evidence (quote the relevant text or state its absence)
4. Write the results as JSON to {run-dir}/{eval-id}/grading.json:
   {
     "eval_id": "{eval-id}",
     "skill": "{skill}",
     "results": [
       {"assertion_id": "...", "passed": true/false, "evidence": "..."}
     ],
     "summary": "{passed_count}/{total_count} passed"
   }
5. Report DONE.
```

## Step 7: Produce report

After all graders return, read every `grading.json` from the run directory. Produce `{run-dir}/report.md`:

```markdown
# Eval Report — {timestamp}

## Summary

{total_passed}/{total_assertions} assertions passed across {n} test cases

| Test Case | Skill | Result | Score |
|-----------|-------|--------|-------|
| {eval-id} | {skill} | PASS/FAIL | {passed}/{total} |

## Details

### {eval-id} ({skill}) — PASS/FAIL

- [x] {assertion description} — {evidence}
- [ ] {assertion description} — {evidence of failure}
```

A test case PASSes if all its assertions pass. It FAILs if any assertion fails.

Print the summary table to the user. Tell them where the full report is.

## Rules

- **All runners in one message.** Don't spawn them one at a time.
- **All graders in one message.** Don't spawn them one at a time.
- **Graders run after runners.** Don't spawn graders until all runners have returned.
- **Don't grade it yourself.** The grader agents grade the output. You just read their grading.json files and compile the report.
- **Sonnet for everything.** Runners and graders use `model: "sonnet"`. The skills being tested may override this internally (impl-plan forces Opus via frontmatter), but the eval agent itself is Sonnet.
- **Don't fix failures.** If a test case fails, report it. Don't modify the skill or rerun. The user reads the report and decides what to change.
