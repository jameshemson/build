# Grading Criteria

Each assertion has an ID, a target skill type, and exact checking instructions. Pass means the condition is met. Fail means it is not. Include evidence (quote the relevant text, or state its absence) for every judgment.

## impl-plan assertions

### has-all-sections
Check that the output contains headings for all required impl-plan sections:
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
- Parallel workstreams
- Implementation order
- Verification

Match heading text case-insensitively. A section headed "## risks and rollback" or "## Risks & Rollback" both count. If a section says "N/A" with a reason, that counts as present.

**Pass**: all 16 sections found.
**Fail**: one or more sections missing. List which ones.

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
Check that every distinct finding in the review output is tagged with a severity level: Critical, Important, or Minor.

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
