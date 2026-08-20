# Grading Criteria

Each assertion has an ID, a target skill type, and exact checking instructions. Pass means the condition is met. Fail means it is not. Include evidence (quote the relevant text, or state its absence) for every judgment.

## impl-plan assertions

### has-all-sections
Check that the output contains headings for all required impl-plan sections:
- Discovery level
- Requirements and decisions
- Problem
- Approach
- Who uses this and how
- Files to change
- Data impact
- What existing behavior changes
- New dependencies
- Access control and authorization
- Abuse and edge cases
- Out of scope
- Risks and rollback
- Observability (or "Observability & monitoring")
- Open questions
- Wave 0 validation design
- Execution manifest
- Delivery slices
- Workflow artifacts
- UI contract
- Parallel workstreams
- Implementation order
- Verification

Match heading text case-insensitively. A section headed "## risks and rollback" or "## Risks & Rollback" both count. If a section says "N/A" with a reason, that counts as present, except Delivery slices: every plan must declare at least one slice.

**Pass**: all 23 sections found.
**Fail**: one or more sections missing. List which ones.

If the output opens with a line matching `Tier: compact`, required sections are instead: Discovery level, Requirements and decisions, Problem, Approach, Files to change, What existing behavior changes, Execution manifest, Delivery slices, Parallel workstreams, Implementation order, Verification (plus triggered extras). Grade against that list.

### zero-placeholders
Scan the output for banned placeholder patterns. The full banned list is in `impl-plan/reference/plan-quality.md`. Key patterns to scan for:
- "TBD", "TODO", "to be determined"
- "implement later", "will be handled in a future step"
- "details to follow"
- "add appropriate" (followed by any word)
- "add validation" (without specifying what validation)
- "handle edge cases" (without naming specific cases)
- "update tests accordingly"
- "follow existing patterns" (without naming the pattern)
- "similar to Task" (without repeating specifics)
- "as needed", "if necessary", "when appropriate" (as standalone justifications)
- "add monitoring" / "add observability" (without specifying metrics)

**Pass**: zero matches found.
**Fail**: list each match with the line it appears in.

### file-map-matches-steps
Extract the list of files from the file structure mapping table. Extract the list of files referenced in the implementation order steps. Compare the two lists.

**Pass**: every file in the map appears in at least one step, and every file in the steps appears in the map.
**Fail**: list files that appear in only one place.

### steps-are-specific
Read each step in the implementation order. A specific step names: (a) a file path, (b) a concrete change (function name, endpoint, field, or test assertion), and (c) is scoped to a single action.

Flag steps that contain phrases like "implement the X system", "add the Y feature", "set up Z", or "build the W" without specifying which file and what change within it.

**Pass**: every step names a file and a concrete change.
**Fail**: list vague steps with their step number.

### workstreams-defined
Check that a "Parallel workstreams" section exists and contains at least one named workstream with: name, files list, complexity (simple or complex), and dependencies.

**Pass**: section exists with at least one fully-defined workstream.
**Fail**: section missing, or workstreams lack required fields.

### manifest-valid
Find a fenced ```yaml block containing `evidence_mode: typed`, `bindings:`, and
`execution_manifest:`. Check that every binding has exactly `id`, `kind`, `name`,
`task_id`, and `must_have_id`, and every task has all ten fields: `id`, `wave`,
`depends_on`, `workstream`, `files_modified`, `requirements`, `decisions`, `must_haves`,
`verify`, `done`. Each
must-have must have exactly `id`, `claim`, and `evidence`; evidence must contain exactly
`kind` and `ref`, with kind `behavioral-test`, `command-assertion`, `structural`, or
`manual-receipt`. Every binding must resolve to one declared task and must-have.
**Pass**: the typed block exists and every binding, task, must-have, and evidence object
satisfies the schema and resolves exactly.
**Fail**: the typed block is missing, or list each ID with its missing, extra, invalid,
or unresolved field.

### delivery-slices-valid
Find a fenced YAML block containing `delivery_slices:` and parse it together with the fenced `execution_manifest:` block. Check all of the following:
- There is at least one slice, and every slice ID matches `S-###` exactly and is unique.
- Every slice contains exactly these eight fields, with no missing or additional fields: `id`, `goal`, `depends_on`, `task_ids`, `requirements`, `must_haves`, `verify`, `done`.
- Every `task_ids` entry names an execution-manifest task. No Wave 0 task appears in any slice. Every task whose `wave` is greater than 0 appears in exactly one slice.
- Every slice dependency names a slice declared earlier in the block. For each task in a slice, every task dependency is either Wave 0, in the same slice, or in a declared predecessor slice.
- `goal`, `requirements`, `must_haves`, and `done` are non-empty and observable. `verify` names an exact command or inspection and its expected result; a generic phrase such as "verify the slice" is not evidence.

**Pass**: the block satisfies every schema, membership, dependency, and evidence check.
**Fail**: no block exists, or list each slice and task with the exact failed check.

### requirements-covered
Extract every `REQ-*` ID from the "Requirements and decisions" section. For each ID, check (a) it appears in at least one manifest task's `requirements` list, and (b) it appears in the "Verification" or "Wave 0 validation design" section.
**Pass**: every REQ ID satisfies both (a) and (b).
**Fail**: list each REQ ID and which check it fails.

## review-plan assertions

### catches-placeholder-language
The flawed plan fixture contains "add appropriate error handling" in the routes.ts section and "update tests accordingly" in step 7. Check that the review output flags at least one of these as a placeholder violation.

**Pass**: review mentions at least one of these phrases as a problem, ban, violation, or placeholder.
**Fail**: neither phrase is flagged.

### catches-missing-observability
The flawed plan fixture omits the observability section entirely. Check that the review output notes this omission.

**Pass**: review mentions missing observability, monitoring, or metrics section.
**Fail**: omission not noted.

### catches-workstream-overlap
The flawed plan fixture lists `src/api/routes.ts` in both the "api-endpoints" and "preference-storage" workstreams as independent. Check that the review flags this overlap.

**Pass**: review mentions file overlap, shared file between workstreams, or workstream independence violation involving routes.ts.
**Fail**: overlap not flagged.

### findings-have-severity
Check that every distinct finding in the review output is tagged with a severity level: Critical, Important, or Minor. Also applied to architect-review outputs.

**Pass**: every finding has a severity tag.
**Fail**: list findings without severity tags.

### verdict-is-structured
Check that the review output contains a clear verdict or overall assessment. For review-plan this means a pass/fail recommendation or an explicit statement about whether implementation should proceed.

**Pass**: verdict section exists with a clear recommendation.
**Fail**: no verdict or assessment found.

### no-critical-findings
Check that the review output contains zero findings tagged as Critical.

**Pass**: no Critical-severity findings.
**Fail**: list the Critical findings.

### catches-forward-slice-dependency
The delivery-slice fixture declares `S-001` before `S-002` but gives `S-001` `depends_on: ["S-002"]`. Check that the review flags this as a forward/later-slice dependency, invalid delivery order, or cycle risk and names `S-001` and `S-002`.

**Pass**: the forward dependency between the two named slices is flagged.
**Fail**: the dependency is missed or discussed without identifying the slices.

### catches-duplicate-or-missing-slice-membership
The delivery-slice fixture assigns `T-002` to both `S-001` and `S-002`, while the wave>0 task `T-003` belongs to no slice. Check that the review flags duplicate membership, missing membership, or both and names the affected task ID(s).

**Pass**: at least one exact membership defect is flagged with `T-002` or `T-003` as evidence.
**Fail**: neither defect is identified with a task ID.

### catches-missing-slice-evidence
The delivery-slice fixture gives `S-001` empty `must_haves`, the non-exact verification `"inspect the changes"`, and the non-observable completion statement `"foundation complete"`. Check that the review flags at least one of these as missing or non-observable slice acceptance/integration evidence and identifies `S-001`.

**Pass**: `S-001` is flagged for missing or non-observable `must_haves`, `verify`, or `done` evidence.
**Fail**: the review accepts the evidence or does not identify `S-001`.

### catches-unjustified-foundation-slice
The delivery-slice fixture labels `S-001` as foundation-only but does not explain why a vertical slice is impossible, name the first consuming slice, or provide compatibility evidence. Check that the review flags this exception as unjustified and identifies at least one of those missing requirements.

**Pass**: `S-001` is flagged as an unjustified foundation-only slice with a specific missing justification, consumer, or compatibility check.
**Fail**: the foundation slice is accepted or criticized without naming a required exception condition.

### catches-unbound-approach-obligation
The evidence-contract fixture names `TryAdoptLegacyBuildingPose` and
`TryAdoptLegacyJobPose` in Approach, but neither symbol appears in `bindings`.

**Pass**: review flags at least one named API as an unbound Approach obligation.
**Fail**: both missing bindings are accepted or discussed without naming either API.

### catches-non-atomic-task
The evidence-contract fixture puts 18 files and several independently observable pose,
persistence, migration, fixture, and balance claims into `T-200`, with one broad
must-have and `dotnet test` command.

**Pass**: review flags `T-200` as non-atomic and requires a split into independently
observable bounded implement-verify cycles.
**Fail**: review accepts `T-200`, or criticizes its size without evidence atomicity.

## architect-review assertions

### architect-verdict-present
Check the output contains a Verdict heading or line with exactly one of: PASS, PASS_WITH_NOTES, FAIL.
**Pass**: exactly one verdict keyword as the verdict. **Fail**: none or ambiguous.

### catches-tautological-test
The fixture diff adds `tests/clamp.test.js` containing a test whose mock returns 7 and whose only assertion checks that the mock returned 7. Check the review flags this test as tautological, self-asserting, mock-only, or testing the mock instead of the code.
**Pass**: the test or file is flagged with one of those characterizations. **Fail**: not flagged.

### catches-unplanned-file
The fixture plan's file map does not include `src/extra-helper.js`, but the diff creates it. Check the review flags it as created-but-not-planned, an undocumented scope change, or a plan-fidelity deviation.
**Pass**: extra-helper is flagged. **Fail**: not flagged.

## verify assertions

### zero-banned-phrases
Scan the output for verify's banned phrases:
- "should pass"
- "looks correct"
- "I'm confident"
- "Based on analysis"
- "The tests pass" (without accompanying test runner output)

**Pass**: none of these phrases appear.
**Fail**: list each match.

### commands-shown
Check that the output includes at least one shell command that was executed. Look for code blocks containing command-line invocations, or lines prefixed with `Command:`, `$`, or `>`.

**Pass**: at least one executed command is shown.
**Fail**: no commands visible in the output.

### output-included
Check that the output includes actual command output (stdout or stderr content from a real command execution), not just a claim about what the output was. Look for code blocks following commands, or sections labeled "Output:".

**Pass**: actual command output is present.
**Fail**: no command output found, or output is described rather than shown.

### verdict-present
Check that the output contains one of the three verify verdicts: VERIFIED, FAILED, or PARTIAL.

**Pass**: exactly one verdict keyword present.
**Fail**: no verdict found, or verdict is ambiguous.

### verdict-failed
Check the verdict is FAILED (not VERIFIED, not PARTIAL).
**Pass**: verdict is FAILED. **Fail**: any other or missing verdict.

### verdict-verified
Check the verdict is VERIFIED (not FAILED, not PARTIAL).
**Pass**: verdict is VERIFIED. **Fail**: any other or missing verdict.

### verdict-partial
Check the verdict is PARTIAL (not FAILED, not VERIFIED).
**Pass**: verdict is PARTIAL. **Fail**: any other or missing verdict.

### behavioral-evidence-gap-shown
The fixture's `npm test` command passes an unrelated smoke test, while typed must-have
`MH-001` requires the absent direct test
`test/feature.test.js#preserves-valid-legacy-geometry`.

**Pass**: the report names `MH-001` or the missing direct test as uncovered and explains
that passing unrelated tests or changed `src/feature.js` cannot prove the behavior.
**Fail**: the report treats the smoke test or changed production source as behavioral proof.

### debt-scan-reported
Check the output contains a Debt scan section reporting how many files were scanned and a PASS, FAIL, or N/A result.
**Pass**: section present with a result. **Fail**: section absent or missing a result.

### debt-unreferenced-flagged
The fixture's `src/cache.js` contains a FIXME with no same-line issue or `DEF-*` reference. Check the Debt scan lists that marker as unreferenced (path, line, and marker text) and the FAILED verdict cites unreferenced debt markers.
**Pass**: marker listed as unreferenced and tied to the verdict. **Fail**: marker missing, listed as referenced, or the verdict reason is absent.

### deferred-marker-listed
The fixture's `src/cache.js` contains a FIXME carrying `DEF-001` on the same line. Check the Debt scan still lists this marker, tagged as referenced — deferrals must be visible, never silent — while the verdict remains VERIFIED.
**Pass**: marker listed as referenced. **Fail**: marker absent from the report.

### failure-evidence-shown
Check the output quotes real failing test-runner output: a nonzero fail count, an assertion error, or a stack trace from the executed command — not a prose claim that tests failed.
**Pass**: actual failure output quoted. **Fail**: failure only described, never shown.

## Build orchestrator assertions

These grade a decision, not an artifact. The runner output has four fixed headings: `## Next
phase`, `## Next action`, `## Why`, `## Rejected`. Grade only what the output states. Do not
consult the fixture, the orchestrator, or your own view of what the right answer is — an output
that reaches the right phase for a stated wrong reason still passes the phase assertions and fails
the reasoning ones, and that distinction is the point.

### orchestrator-next-phase-stated
Check the output has a `## Next phase` heading naming exactly one value, and a `## Next action`
heading naming exactly one first action. A hedged answer ("verify, or possibly complete") is not
one value.
**Pass**: both headings present, each with a single unambiguous value.
**Fail**: either heading missing, empty, or naming more than one alternative.

### orchestrator-routes-to-verify
The fixture's state is `phase: verify` with every slice complete and `active_slice: null`. Check
`## Next action` names running the verification phase — invoking `verify` (as `/build:verify`,
`build:verify`, or Phase 3c). Naming the skill by any of those forms passes.
**Pass**: the first action is running verification.
**Fail**: the first action is anything else, including architect review, completion, archiving, or
re-running implementation.

### orchestrator-does-not-skip-to-complete
The fixture has no `cache-ttl-verify.md`: the workflow has never been verified. Check the output
does not transition to `complete` or `architect-review`. `## Next phase` must not name either, and
`## Rejected` must not describe either as acceptable.
**Pass**: neither terminal nor architect-review phase is chosen.
**Fail**: `## Next phase` names `complete` or `architect-review`, or the output treats the
workflow as finishable now.

### orchestrator-treats-summary-as-provisional
The fixture's implementation summary reports every wave complete, every command passing, no
deviations and no blockers — it is written to look finished. Check `## Why` or `## Rejected`
states that this is not sufficient: that the summary is a claim rather than verification evidence,
that slice or checkpoint evidence does not substitute for whole-workflow verification, or that no
`{slug}-verify.md` exists yet.
**Pass**: the output gives one of those reasons for not treating the work as verified.
**Fail**: the output routes to verify only because the `phase:` field says `verify`, with no
statement about the summary's insufficiency. Reading the phase field alone is the behavior this
assertion is designed to catch, because a weakened prompt still does it.

### orchestrator-halts-on-missing-artifact
This fixture's state says `phase: architect-review`. Every artifact that phase reads is present
except `cache-ttl-verify.md`, which does not exist. Check the output's first action is to stop,
report the missing artifact, or return the workflow to verification — not to begin reviewing.
Naming the missing verify report as the reason is required; stopping for an unrelated reason does
not pass.
**Pass**: the first action is a stop, a missing-artifact report, or a return to verification, and
the output names the absent verify report.
**Fail**: the first action is conducting or dispatching the architect review, or the output names
a different blocker while treating the missing verify report as acceptable.

### orchestrator-does-not-review-unverified
Check the output does not invoke, dispatch, or begin `architect-review` against this state. A
statement that architect review is what happens *after* verification is not an invocation and does
not fail this assertion.
**Pass**: no architect review is started.
**Fail**: `## Next action` invokes `/build:architect-review`, spawns a reviewer, or begins reading
the diff to review it.

### orchestrator-fable-plan-active-session
The fixture's state is `phase: plan` with `workflow_mode: fable`, recording `model_routes`
`plan: active-session` — meaning the dispatching session's model is fable, so the plan is authored
in the root session. Check `## Next action` is executing the `impl-plan` protocol in the root
session — reading `impl-plan/SKILL.md` and its references and authoring the plan directly. (An
answer that instead dispatches a fresh agent with `model: fable` is correct only for a session
that is not fable, which contradicts this fixture's recorded `plan: active-session` route.)
**Pass**: the first action executes `impl-plan`'s protocol in the root session and authors the plan
directly.
**Fail**: the first action dispatches an agent for planning despite the recorded
`plan: active-session` route, or invokes the model-pinned skill (as `/build:impl-plan`,
`build:impl-plan`, or via the Skill tool).

### orchestrator-mixed-relays-review
The fixture's state is `phase: review` with `workflow_mode: mixed`, recording `model_routes`
`review: codex-relay` and no pending `relay` field. Check `## Next action` is relaying the review to
Codex — either running the relay command via `codex exec` under supervision, or writing the `relay`
field and stopping — naming the review-plan skill in any established form (`$build:review-plan`,
`/build:review-plan`, `build:review-plan`, or `review-plan`) and carrying the review phase's full
subject set: the plan, contract, context, and requirements artifact paths
(`.build/plans/mixed-mode-plan.md`, `.build/contracts/mixed-mode/contract.json`,
`.build/plans/mixed-mode-context.md`, `.build/plans/mixed-mode-requirements.md`) plus a
`repository=` token carrying the repository fingerprint.
**Pass**: the first action is a relay naming review-plan and carrying all four artifact paths plus a
`repository=` fingerprint token.
**Fail**: the command names only the plan — the shape that cannot produce a compilable machine
result — the output reviews the plan itself, invokes the skill in the local session, or continues
past the phase without a relay.

### orchestrator-mixed-resume-validates-relay
The fixture's state is `phase: review` with a pending `relay` field pointing at
`.build/plans/relay-pending-review.md`, and that artifact is present in the fixture. Check
`## Next action` is confirming the relayed artifact exists, clearing `relay` with a history entry,
and proceeding to `compile-result` on that artifact.
**Pass**: the output confirms the artifact at `.build/plans/relay-pending-review.md`, clears
`relay`, and proceeds to `compile-result`.
**Fail**: the output re-runs the review, issues a new relay stop, or treats the relay as still
pending.
