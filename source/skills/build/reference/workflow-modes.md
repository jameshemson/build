# Workflow modes and Claude agent routing

This file is the normative contract for workflow modes in the Claude build orchestrator. A mode is
a named preset over the six agent-route keys and their model routes. It never adds a routing key,
never removes a phase, and never changes what a phase must produce. Root records the resolved mode
as `workflow_mode` in state, with the source it came from, before its first dispatch.

## Modes

The three modes are `claude`, `fable`, and `mixed`; a missing `workflow_mode` resolves to `claude` and preserves current behavior.

- **`claude`** — all six agent-route keys take the Build default, and `model_routes` records the
  documented pins: `plan` opus at `high` effort through the `/build:impl-plan` Skill invocation,
  `review` sonnet with `context: fork`, `architect-review` opus at `high` effort with
  `context: fork`, and every other key inherited from the dispatching session. This mode is
  exactly current behavior; a workflow that resolves to `claude` must be indistinguishable from
  one that never read this file.
- **`fable`** — `plan: active-session` and `architect-review: active-session`. Root executes those
  two skill protocols in the root session: it reads the skill's `SKILL.md` and every reference
  that skill requires, follows the protocol as written, and authors the artifact at its natural
  path directly. Everything else routes as `claude`. These two keys are routed rather than left to
  the Skill tool because skill frontmatter does not resolve the `fable` alias — `impl-plan` and
  `architect-review` both pin `model: opus`, and the v1.14.1 removal of the Fable implementation
  preference kept those pins for exactly that reason. Routing the key to the active session is the
  only way a Fable session stays the author of the plan and the architecture verdict.
- **`mixed`** — `plan: active-session`, and `review: codex-relay`, `verify: codex-relay`, and
  `architect-review: codex-relay`. Everything else routes as `claude`. Planning stays in the root
  session for the same reason as `fable`; the three judgment phases move to Codex so their
  verdicts come from a different model family than the one that authored the work.

`review` and `verify` are never routed `active-session`; independent fresh-context judgment is mode-invariant.
A mode may move those keys to a fresh context in another harness, but never into the session that
produced the plan or the diff.

Model-route bookkeeping follows the key's routing: an `active-session` key records the literal
`active-session` in `model_routes`, a `codex-relay` key records the literal `codex-relay`, and
every remaining key records the `claude` pin listed above.

## Mode resolution

Resolution precedence is a `mode=claude`, `mode=fable`, or `mode=mixed` token in the invocation, then a `build-mode:` line in the effective `AGENTS.md`, then a fresh-workflow AskUserQuestion; the recorded `workflow_mode` is authoritative on resume and is never re-asked.

On Claude Code, `CLAUDE.md` serves as the effective `AGENTS.md` when no `AGENTS.md` file exists.

The grammar is deterministic, and every applicable source is validated before any mutation. The invocation may contain at most one token matching `\bmode=(claude|fable|mixed)\b` and the effective `AGENTS.md` at most one line matching `^build-mode:[ \t]*(claude|fable|mixed)[ \t]*$`; a duplicate or unrecognized value rejects that entire source by name and resolution falls to the next source.
Rejecting a source is not a halt. Report the source name and the offending text, then continue at
the next source in precedence order — a rejected invocation token does not suppress an otherwise
valid `build-mode:` line, and a rejected `AGENTS.md` line does not suppress the ask.

The AskUserQuestion is reached only when neither source supplies a mode, and only on a fresh
workflow. Ask one question with exactly three options, in this order:

1. `claude` — current pinned routing. Recommended, and listed first.
2. `fable` — the root session plans and architect-reviews.
3. `mixed` — fable planning plus Codex judgment relays.

Never ask on resume: a state that already records `workflow_mode` uses it as written, whatever the
current invocation or `AGENTS.md` now says. If the mode ask cannot be presented, resolve to `claude` and record it in history.
Record the resolved mode and its source in state and in `history` before the first dispatch.

## Relay stops (mixed mode)

A relay stop pauses a live workflow for the user to run one named standalone skill in Codex; it is not a session-switch stop, root remains the sole workflow-state and git writer, and Codex runs only the standalone portable skills.

In `mixed` mode root first runs the relay command itself via `codex exec -s workspace-write` under a 20-minute deadline; a discarded, artifactless, or receipt-rejected run is retried once, and a second failure selects the manual relay stop.

**Primary path.** Root composes the phase's full-subject relay command, always starting with the
literal `[relay]` marker, then runs

    codex exec -s workspace-write -C {repo-root} '{relay command}'

as a supervised background command with a 20-minute deadline. The run is accepted only when all
three of the following hold:

1. No tracked-file changes: `git status --porcelain` is empty. Otherwise discard the run and revert
   the working tree to its pre-run state.
2. The expected artifact is present at its natural path.
3. `compile-result` returns a successful receipt for that phase.

A run failing any of the three is discarded and retried once from a fresh `codex exec`. A second
failure selects the manual stop below; a discarded run is never read as a phase result.

**Fallback path (manual stop).** Root writes

    relay: {"phase": "<phase>", "command": "<same full-subject relay command>", "artifact": "<expected artifact path>"}

plus a `history` line, prints the command, the repository path, the branch `build/{slug}`, and the
expected artifact path, and stops. It does not advance the phase and does not supply the verdict
itself.

On resume with the artifact present and its receipt valid, clear `relay` with a `history` line and
append the scoped `no_progress` reset event. On resume without it, restate the command, repository
path, branch, and expected artifact path, append one scoped `no_progress` increment event, run
`check-counters` — authoritative halt at 2 events — and stop again.

**Command templates.** Each is the full subject for its phase; root substitutes `{slug}` and
`{base_ref}` from state and passes no other context.

- Review — `[relay] $build:review-plan .build/plans/{slug}-plan.md .build/contracts/{slug}/contract.json .build/plans/{slug}-context.md .build/plans/{slug}-requirements.md`
- Verify — `[relay] $build:verify` followed by the contract, evidence-ledger, requirements, and
  implementation-summary paths as recorded in state.
- Architect review — `[relay] $build:architect-review` followed by `{slug}-verify.md`,
  `{slug}-requirements.md`, `{slug}-context.md`, and the diff target `git diff {base_ref}...HEAD`.

Saved-artifact semantics for a `[relay]` run — where the skill writes and under what name — are
owned by the relay clause in `../impl-plan/reference/standalone-artifacts.md`, not by this file.

## Build agent routing (Claude port)

This section is the Claude port of the routing-block contract in `SKILL.codex.md`. Modes and
routing blocks are independent inputs: a mode names a preset, a routing block names agents, and an
explicit routing mapping wins over the mode for the key it names.

The invocation and the effective `AGENTS.md` may each contain at most one literal
`## Build agent routing` block. Its body ends immediately before the next H2 heading or at EOF.
Blank lines are allowed; every nonblank line must match `^- ([^:]+):[ \t]*(.*?)[ \t]*$`, and at
least one mapping line is required. Trim only horizontal padding around the captured value.
Preserve all remaining case, punctuation, quotes, and internal whitespace. The only public keys, in state order, are `plan`, `review`, `explore`, `implement`, `verify`, and `architect-review`; `review` also governs mid-review.
Reject the entire source mapping for a duplicate block, duplicate key, unknown key,
non-list/nonblank content, or a value blank after trimming; name the source and the offending key
when one exists.

Validate every applicable mapping completely before any mutation. On a fresh workflow, resolve each
key independently with precedence invocation > effective `AGENTS.md` > Build default; the Build
default is `{ requested_agent: null, source: build-default }`. With no mapping in either source,
all six keys use that null Build default. Snapshot all six `agent_routes` records before
delegation. On resume the saved snapshot wins, changes to `AGENTS.md` never alter a live snapshot,
and an invalid invocation mapping leaves state and history byte-for-byte unchanged.

Agent names are opaque. Never discover, validate, normalize, alias, create, copy, edit, install,
bundle, or overwrite agent profiles; `default` is an ordinary selectable opaque name, not a
sentinel.

Claude semantics for a non-null route: dispatch that phase through the Agent tool's
`subagent_type` using the requested name, omit Build's model and effort overrides, and record
`profile-owned` for that key in `model_routes`. That record takes precedence over the mode's model
route for the same key. If agent selection is unavailable or the named agent is rejected, append an
`agent_selection_fallback` entry before dispatching, then use the mode's model route for that key.

## Scope

The Codex orchestrator does not read this file yet: Codex preset parity is roadmap-deferred, and
the file ships in the Codex output trees unreferenced.

A `mode` key inside a `## Build agent routing` block is an unknown key and is rejected under the
rules above — mode is not a seventh routing key and is never carried by a routing mapping.
