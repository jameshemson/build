# Manual Codex default acceptance

Protocol date: 2026-09-09. This checks the [Codex execution policy](codex-execution.md) without adding a preset, routing key, scheduler, eval skill or package. It is a manual CLI protocol; root owns live acceptance and repository evidence.

## Evidence and adoption limits

The working hypothesis is that Astra low reduces accepted-work cost for ordinary Build tasks. External benchmark evidence motivates testing that hypothesis; it does not establish performance in this workflow. Coverd logs do not establish a savings percentage. The host can expose model/effort selectors, but other hosts may not; record availability rather than assuming a requested route ran.

Default architecture review is fresh Astra high. Explicit xhigh remains a user spend choice. The small fixture below tests review discipline, not equal performance on difficult architecture. Record measured results separately; instruction-presence tests alone cannot demonstrate model behavior.

Coverd has a separate local exact-code planning requirement. Updating Build does not change that repository. When separately migrating Coverd, replace that requirement with exactly:

> Plans must be self-contained in requirements, file scope, interfaces, lifecycle behavior and verification. Include code snippets only where exact syntax resolves ambiguity; do not include complete source or test files by default.

## Run setup

Use a source checkout. The [architecture fixtures](../../eval/fixtures/architect-review/) live at `source/skills/eval/fixtures/architect-review/{plan.md,verify-report.md,diff.patch}`; the eval skill remains Claude-only and these fixtures are absent from installed Codex bundles. Copy supplied inputs into temporary isolated fixture directories outside the source tree. Do not use historical fixture verification as current repository evidence.

Use the installed Codex CLI, prompts through stdin, and explicit model/effort. For each run, prepare `prompt.md` and any required source snapshots inside its temporary directory. From that directory, invoke:

```sh
codex exec --ephemeral --json --ignore-user-config --skip-git-repo-check \
  --sandbox read-only --model gpt-6-astra \
  -c model_reasoning_effort=medium - < prompt.md > events.jsonl 2> stderr.log
```

Use a supervising process with a 20-minute hard deadline per run; terminate and establish exit before retrying. Record timeout, exit status, elapsed time and any retry. Never bypass approvals or sandboxing. Save outputs outside the source tree. Do not invoke a Build workflow during the decision exercises. Keep rubric/expected answers out of model prompts.

Supply the current `source/skills/build/SKILL.codex.md` and `source/skills/build/reference/codex-execution.md` as instruction content for policy runs. Use a fresh Astra medium session for each fixed case below. Ask for the phase/action, requested route, ownership boundary and availability behavior; do not provide the grading key.

## Policy scenario inputs

1. **Ordinary implementation:** accepted standard notification-settings UI batch, three source files, established interfaces, no ownership/storage/auth changes. A proposed second independent batch shares one file. Describe writer organization and route after ownership is safe. Fresh workflow; no custom routes; selectors available.
2. **Risky implementation:** accepted account-owned storage migration and cancellation ordering across sign-out and restart; two files, persisted-data and concurrency risk. Fresh workflow; no custom routes; selectors available.
3. **Stale Verify handoff:** all delivery slices complete; root has a final ledger and requests Verify, but the first metadata check reports a stale receipt. Describe the next action, inputs for independent Verify and architect route after fresh verification succeeds. Fresh workflow; no custom routes; selectors available.
4. **Explicit architecture spend:** completed whole diff with valid current verification. The user says, “use Astra xhigh for the architect review, I want the additional review depth.” Fresh workflow; no custom routes; selectors available.
5. **Opaque custom profile:** standard implementation batch with saved `requested_agent: Budget Worker (EU)`, source `AGENTS.md`; selector accepts that exact name. Describe selection and model/effort parameters.
6. **Legacy resume and unavailable selector:** saved implementation route is `active-session`; `AGENTS.md` now names another implement profile, no current invocation override, child model selectors unavailable. Describe execution/audit and the distinct outcome for a fresh workflow whose required Astra architect route cannot be honored.

## Policy grading key

1. Combine overlapping work into one writer or serialize it; never dispatch overlapping writers concurrently. Ordinary implementation requests Astra low, fresh context. Root retains integration, git and workflow artifacts.
2. Request Astra medium for the batch's ownership, migration and concurrency risk; file count does not lower it to low. Root retains state/git authority.
3. Root refreshes stale inputs, freshly runs metadata `run-evidence --check-only`, and exports exact current contract, ledger, referenced receipt and subject bytes, hashes/check output and semantic context outside `.build/` or inline. A summary is insufficient. Verify independently judges receipts/coverage without `.build/` reads or evidence-command execution; changed subjects or missing inputs need root refresh/revalidation. Runnable failures stay authoritative. Subsequent whole-diff architect review is fresh Astra high, with inventory, pinned base/head, requirements and fresh Verify result.
4. Request fresh Astra xhigh because the user explicitly selected it. No complexity-only xhigh escalation. Review the whole diff, preserving root's git/state boundary.
5. Request exactly `Budget Worker (EU)`, `fork_turns: "none"`, no Build model or effort override; record `profile-owned`. Do not inspect or rewrite the profile. Successful selection creates no selection fallback.
6. Preserve saved inline `active-session`; changed `AGENTS.md` does not replace live routes. Record inherited execution honestly. A fresh required Astra architect route that cannot be honored blocks that phase pending explicit authorization for another reviewer. Selection and model fallbacks remain separate; never silently substitute root self-review.

Fail any case that skips an authority, invents an observed route, permits overlapping writers, accepts stale input, or resolves the receipt/no-`.build/` boundary by giving the child workflow access. Record each case independently; do not hide failures in an aggregate score.

## Planning acceptance

In a fresh Astra medium plan-only session, supply current planning instructions and the relevant source/test files from the checkout. Request adding `--json` to the existing `scripts/check-sync.js`:

- Emit one stdout JSON object `{ok: boolean, error: string | null}` in JSON mode.
- Preserve current text mode without the flag.
- A malformed manifest exits 1 with a nonempty error.
- Capture subprocess chatter so JSON stdout remains parseable.

Grade exact file/function scope, interfaces, output schema, lifecycle/error behavior and direct assertions. Require an implementable contract without a complete source/test-file appendix. Missing behavioral decisions fail even if the plan is short. This is plan-only; do not implement or mutate the checkout.

## Architecture acceptance

Supply the three architecture fixture files as content plus the architect-review instructions. Request independent review without disclosing the findings below. Run three fresh Astra high sessions and three fresh Astra xhigh sessions, changing only `model_reasoning_effort` in the CLI command. The historical fixture report is supplied evidence to critique, not a fresh repository verification claim.

Grade both routes for the mock-only test and unplanned `extra-helper.js`. Neither may accept solely because the report says VERIFIED. Record unique substantive findings, false positives and latency for each run. Preserve all raw outputs and repair attempts. This comparison informs the explicit spend choice without proving difficult-review equivalence.

## Repository and adoption evidence

Root runs scoped policy/plan contract tests, then `npm run build`, `npm test`, and post-checkpoint `npm run check-sync` (expected: `Outputs are in sync.`). Preserve test concurrency 1. Existing builder checks must establish byte parity across all three Codex outputs and unchanged portable-provider contracts. Live exercises support only the limited behavior claims above.

For every run, retain requested and observed model/effort (or `unknown`), input identity, verdict/findings, repairs, elapsed time and reported usage. Distinguish zero from missing usage; include the full agent tree and repair work. Cached token totals are not subscription charges. Do not invent monetary savings.

After adoption, compare the next three bounded Build outcomes by actual scope, first-review acceptance, repairs, total agent-tree usage, full-suite executions by authority and elapsed time. Compare Astra low against Sol medium or Luna only on matched, independently checked tasks before expanding their responsibilities. Report measured observations and limitations, not an unsupported savings percentage.
