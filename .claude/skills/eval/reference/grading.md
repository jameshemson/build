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
Find a fenced ```yaml block containing `execution_manifest:`. For each task entry (lines beginning `- id:`), check all eight fields are present: `id`, `wave`, `depends_on`, `files_modified`, `requirements`, `must_haves`, `verify`, `done`.
**Pass**: block exists and every task has all eight fields.
**Fail**: no block found, or list each task ID with its missing fields.

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
