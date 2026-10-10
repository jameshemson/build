# Change A/B protocol

This protocol measures whether a change to a skill's instruction text alters the behaviour it is meant to alter. It compares the new text against the old text and against a placebo of matched length, because both versions of a skill usually pass the regression suite. When a release must run this check is set by CLAUDE.md `### Release A/B check`.

The three arms are **old** (the skill at a base ref), **new** (the skill in the working tree) and **placebo** (the old skill with neutral text of matched length inserted at each place the new text adds prose). `scripts/eval-ab.js` does the bookkeeping: it builds the blinded variant trees, assigns runs to them at random, keeps the arm mapping in a key file, and joins grades with that key at the end.

## 1. State the question and the decision rule

Before any run, write these into the report, so the rule is fixed before any output exists:

- **Behaviour** — the behaviour the change is meant to alter, in one sentence.
- **Target questions** — yes/no questions about one output, each phrased so that `true` is the behaviour the change should produce.
- **Margin** — 2 at 5 runs per arm; otherwise `ceil(0.4 × runs)`, where runs is runs per arm.

A change is kept only if, on at least one target question, new beats both old and placebo by at least the margin. When the placebo arm was skipped (step 4), new must beat old by the margin.

## 2. Choose or write the probe

- Probes are documented under `reference/ab-probes/`, one file per probe. The first is `reference/ab-probes/bill-split.md`. The probe file names the skill under test, the main input, any control input, and the rubric.
- Runner-visible inputs live under `fixtures/ab-probes/<probe>/`. Name files and directories for the input state, never for the expected outcome: a runner once read the answer from a directory name.
- Where the skill under test reviews or judges something, include a false-positive control input: one where the new behaviour should not fire. A change that makes the skill flag everything is not an improvement.
- The rubric lives only in the probe's reference file. It is never given to runners.

## 3. Check headroom

Before spending a full A/B, confirm the old text leaves room to improve.

1. Run `node scripts/eval-ab.js prepare --skill <skill> --headroom` (add `--base <ref>` when step 4 will use a base other than the latest release tag). It builds only variant `s1` from the base ref, in a run directory ending `-headroom`, prints `Headroom: base variant only, 3 runs, no key`, and writes no key.
2. Run the base variant on the main input three times, with the runner template from step 5.
3. Grade the three outputs with the rubric. Grading unblinded is fine here, because there is only one arm.
4. If the base scores `true` on a target question in 2 or more of the 3 runs, stop and redesign the probe: an improvement cannot show when the old text already produces the behaviour.

## 4. Prepare the arms

Run:

```
node scripts/eval-ab.js prepare --skill <skill> --base <ref> --runs <n> --control-runs 2
```

`--base` defaults to the latest release tag (`v*`), and `HEAD` when there is none. `--runs` is runs per arm (default 5). Omit `--control-runs` when the probe has no control input; control runs always use the new arm.

Read the printed lines:

- `Run directory: <path>` — the default is `<repo>/.build/eval/<YYYY-MM-DD-HHmm>-ab`, named to the minute. `prepare` refuses a run directory that is not empty, so a second run in the same minute needs `--run-dir <dir>`.
- `Base ref: <ref> (<sha>)` and `Variants: s1, s2, s3`.
- `Runs: <n>` — the total number of main runs across all arms (runs per arm × arms), followed by ` (+<m> control)` when control runs exist.
- `Placebo: <k> insertions, <a> added chars, <p> placebo chars`, or `Placebo: skipped — <reason>`. Skipped means the new text adds no prose to match (the printed reason says why), so there are two arms (old and new) and variants `s1, s2`; the report must say the placebo arm was skipped.
- `Key: <path> (never pass this path to runner or grader agents)`.

Never open the key file, and never pass its path to any agent. The key directory defaults to `~/.cache/build-eval-ab`. If you override it with `--key-dir`, pass the same value to `unblind` in step 8. `prepare` refuses a key directory inside the run directory or the repository, and refuses to overwrite an existing key.

What `prepare` writes in the run directory:

- `assignment.json` — one `{ run, variant, input }` entry per run, where `input` is `main` or `control`. It never names an arm.
- `variants/<variant>/<skill>/` — the skill text for that variant. Every other skill is copied next to it from the base ref, so relative links resolve. The `eval` skill is one of those siblings, so it, including the probe's rubric, is reachable from each variant directory.
- `runs/<run>/scratch/` — an empty private scratch directory per run.

## 5. Run the arms

Spawn one agent per `assignment.json` entry, all in one message. Take the model and effort from the frontmatter `model` and `effort` of the skill under test; when a field is absent, the runner inherits the session's. Every runner gets the identical template below, with only the placeholders filled. `{argument}` is the main input for a run whose `input` is `main`, and the control input for a run whose `input` is `control`, as the probe file defines them.

```
Read the skill instructions at {runDir}/variants/{variant}/{skill}/SKILL.md and carry them out with this argument: {argument}
Relative links in those instructions resolve from the skill file's location.

Constraints:
- Read nothing outside {runDir}/variants/{variant}/{skill}/ except files that skill links to and the probe input files named in the argument.
- Use {runDir}/runs/{run}/scratch/ as your only scratch directory.
- Do not open, list or search other variants, other runs, assignment.json, anything else under .build/, or the session scratchpad.
- Do not modify the probe input files.

Write your complete output to {runDir}/runs/{run}/output.md, then reply DONE.
```

## 6. Grade blind

After every runner has returned, spawn one grader agent on Opus. It reads only the rubric section for the skill under test in the probe's reference file, and every `{runDir}/runs/<run>/output.md` in run order. It never reads the variants, `assignment.json` or the key. It grades each output independently, against the rubric alone, and writes `{runDir}/grades.json`:

```json
[
  {
    "run": "r01",
    "<question>": true,
    "evidence": { "<question>": "<verbatim quote from the output, under 40 words>" }
  }
]
```

One object per run; one boolean field per rubric question; one `evidence` entry per question.

## 7. Run mechanical checks

Mechanical results need no judgment and are not the grader's job. For skills whose output is a plan, the orchestrating session runs, for each run:

```
node source/skills/build/buildctl/cli.js validate-plan --plan {runDir}/runs/<run>/output.md --out .build/ab-contracts/<run-id>/<run>.json
```

`<run-id>` is the run directory's name. The session then adds a boolean `compiles` to that run's object in `grades.json`: `true` when the command exits 0, `false` otherwise.

## 8. Unblind and decide

Run:

```
node scripts/eval-ab.js unblind --run-dir {runDir} --grades {runDir}/grades.json --margin <margin from step 1>
```

Add `--key-dir <dir>` with the same value used in step 4 if it was overridden. Passing the step 1 margin makes the printed decision row the step 1 rule applied.

`unblind` prints a Markdown table with rows `old`, `placebo`, `new`, `new (control input)` (when control runs exist), `noise (abs placebo - old)`, and `decision (margin N)` holding `keep` or `drop` per question column. It also writes `{runDir}/unblinded.json`. Every boolean field in the grades becomes a column, including `compiles` from step 7, so read only the target questions' decision cells; the other columns are context.

When no target question shows an effect, drop the text, or keep it with a written justification under CLAUDE.md "When a second copy of a rule is justified".

## 9. Write the report

Write `{runDir}/report.md` with:

- **Question and decision rule** — the behaviour, target questions and margin from step 1, written before the runs.
- **Setup** — the probe, base ref, models and effort, runs per arm, control runs, and the placebo summary line (or that the placebo arm was skipped).
- **Results** — the unblinded table as printed.
- **Reading** — a short reading of the target questions' decision cells and the noise row.
- **Caveats** — always including that runners could list `variants/`, and that the `eval` sibling, with the rubric, sits inside each variant, so blinding rests on instructions rather than on file access.

For a release, copy the report to `docs/evals/<YYYY-MM-DD>-<skill>-<topic>.md` and link it from the CHANGELOG entry.

## Rules

- **Only the target skill differs between arms.** Every sibling skill comes from the base ref in every variant.
- **Same template, same permissions.** Every runner gets the identical step 5 template and the same tools.
- **Keep the mapping hidden.** Never tell any agent the arm mapping or the key path.
- **Never re-grade after unblinding.** A fix to the probe, rubric or grading needs a fresh run.
- **One probe question set per run.** Each A/B run uses one probe and the target questions fixed in step 1; a second probe or question set needs its own run.
