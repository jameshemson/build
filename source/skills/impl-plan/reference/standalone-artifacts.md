# Standalone artifact rules

Apply these rules only when the invocation is not explicitly orchestrated and no active
Build state matches the request. An unrelated or archived state does not make the run
orchestrated. In an orchestrated run, return the normal body; Build root saves it and
retains all state, transition, and git authority.

## Mode and supplied inputs

Use an explicitly supplied artifact path before request text when choosing inputs and a
slug. Read every supplied plan, contract, ledger, requirements, context,
implementation-summary, or Verify result directly when it is relevant to the skill.
Do not search for, infer, or fabricate missing siblings. Missing inputs stay explicitly
missing or `N/A`; they never become invented workflow context.

## Relay invocations

These rules govern invocations relayed from another harness. An invocation beginning with
the literal `[relay]` marker is a relay run: an external harness is executing this skill on
behalf of a Build root that will validate the result. A relay run saves its natural
artifact under the normal collision rules even when an active Build state matches the
request — the state belongs to the root that issued the relay, not to this run — and never
touches `*-state.md`. A relay run's artifact must end with the phase's complete fenced
machine-result block built from the supplied subject inputs; `Machine result: N/A` is not a
valid relay outcome. A relay invocation missing a subject input its phase's machine result
requires reports the named missing input as a blocking error in the artifact and the
response.

## Natural targets

- Plan: `.build/plans/{slug}-plan.md`
- Plan Review: `.build/plans/{slug}-review.md`
- Verify: `.build/plans/{slug}-verify.md`
- Architect Review: `.build/plans/{slug}-architect-review.md`

These are authored Markdown artifacts. Plan's optional `contract.json` is generated.

## Deterministic slug and collision rule

Choose one candidate before authoring:

1. From a recognized supplied path, preserve `{slug}` from
   `.build/plans/{slug}-{plan,review,verify,architect-review,requirements,context,implementation-summary}.md`,
   `.build/contracts/{slug}/contract.json`, or `.build/evidence/{slug}/ledger.json`.
2. Otherwise use the supplied file's basename without its last extension.
3. With no supplied path, use the request text.

Normalize the candidate to lowercase ASCII, replace every run outside `[a-z0-9]` with
one `-`, trim leading/trailing `-`, keep the first 48 characters and trim again. The
fallback slug is `artifact` when nothing remains.

For a recognized supplied family, keep its slug when this skill's natural target does
not exist; existing input siblings are intentional. For request text or an unrecognized
path, treat any existing `.build/plans/{slug}-*.md` or `.build/contracts/{slug}/` as a
collision. On every target collision, append the lowest available numeric suffix,
starting with `-2`, truncating the base so the resolved slug stays within 48 characters.
Check the same collision set again for each suffix and use the resolved slug for every
output created by this invocation. Never overwrite an existing artifact.

Examples are normative:

- Request `Add OAuth / SSO` resolves to `add-oauth-sso`.
- Supplied `.build/plans/billing-plan.md` gives Review the target
  `.build/plans/billing-review.md` when that target is free.
- If `billing-review.md` exists, Review tests `billing-2` against the full family and uses
  `.build/plans/billing-2-review.md` only when that candidate is free.
- Supplied `.build/contracts/billing/contract.json` preserves `billing` before applying
  the same Verify-target collision rule.

## Saving without changing the response

Finish the normal plan or report first, including a blocked/failure report when the skill
must stop. Create `.build/plans/`, write the exact Markdown body to the natural target,
then return that same body unchanged and disclose the saved path separately. A write
failure is reported; it never turns an unsaved result into a success claim.

## buildctl availability and authority

Where a skill calls buildctl, require Node.js 20 or newer and resolve in order:
`../build/buildctl/cli.js` relative to the current skill directory,
`source/skills/build/buildctl/cli.js` in a source checkout, then the package `buildctl` bin.
Only an absent runtime (`runtime-not-found`), Node below 20 (`node-version`), or a runtime
that cannot be executed (`execution-unavailable`) selects prompt-only fallback; disclose
the reason in both the artifact and response. Runnable compiler or evidence diagnostics
are authoritative and must not select fallback. Markdown/YAML remains authored authority;
generated JSON remains generated. Never hand-author or repair generated JSON.

## Standalone authority boundary

Standalone skills may create only their natural Markdown output and, for Plan, its
buildctl-generated contract. They never create or mutate `*-state.md`; there are no phase
transitions or auto-continuation; no branches, commits, merges, archives, checkpoints,
tags, releases, or git mutation; and no synthetic context, requirements, implementation
summaries, ledgers, contracts, or receipts. The only contract exception is buildctl output
compiled from the authored standalone plan. Read-only git inspection remains allowed.
The Build orchestrator remains the only workflow-state owner.
