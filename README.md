# build

A structured build workflow for Claude Code and Codex, plus four portable standalone skills for OpenCode. Plan before you build, review before you ship, verify before you claim.

## Skills

| Skill | What it does |
|-------|-------------|
| `/build` | Orchestrates the full workflow: plan, review, implement, verify, architect review |
| `/build:impl-plan` | Creates and saves a detailed implementation plan, compiling its contract where buildctl runs |
| `/build:review-plan` | Reviews a plan against its own evidence and saves the severity-tagged report |
| `/build:architect-review` | Runs a 10-lens architecture review and saves the structured verdict |
| `/build:verify` | Judges compiled receipts or runs prompt checks, then saves the verification report |
| `/build:eval` | Runs test cases against build skills, grades outputs against assertions |

Every skill works standalone. Run `/build:impl-plan add user authentication` without the full pipeline; the four portable skills preserve their normal response and save `.build/plans/{slug}-{plan,review,verify,architect-review}.md`. Or run `/build add user authentication` to get the complete workflow.

## Install

**Claude Code**

```
claude plugin add jameshemson/build
```

**OpenCode** — copy the `.opencode/` directory (preserving the leading dot) into your project so the final layout is `<your-project>/.opencode/skills/<skill-name>/SKILL.md` and `<your-project>/.opencode/commands/<command-name>.md`. OpenCode discovers skills from those paths. Once copied, the four portable skills are invocable as flat slash commands: `/impl-plan`, `/review-plan`, `/verify`, `/architect-review`. Each command thin-wraps the matching bundled skill.

**Codex** (two paths, either works):

Via Plugins UI / CLI:

```
codex plugin marketplace add jameshemson/build
codex plugin install build/build
```

Or via repo-local discovery: copy the `.agents/` directory into your project so the final layout is `<your-project>/.agents/skills/<skill-name>/SKILL.md`. Codex picks it up automatically.

Codex installs five skills: `build`, `impl-plan`, `review-plan`, `verify`, and `architect-review`. Start the complete workflow with one invocation:

```
$build:build <feature>
```

That one skill drives Plan, Plan Review, Implement, Verify, and Architect Review, including repair loops and resumable artifacts. The four phase skills remain directly invocable. OpenCode remains a four-skill standalone bundle, and `eval` remains Claude Code only.

## Compatibility

| Skill | Claude Code | OpenCode | Codex |
|-------|:-----------:|:--------:|:-----:|
| `build` (orchestrator) | ✓ | — | ✓ |
| `impl-plan` | ✓ | ✓ | ✓ |
| `review-plan` | ✓ | ✓ | ✓ |
| `verify` | ✓ | ✓ | ✓ |
| `architect-review` | ✓ | ✓ | ✓ |
| `eval` | ✓ | — | — |

See [HARNESSES.md](HARNESSES.md) for the full capability matrix and install story.

## How it works

Both `/build <feature>` in Claude Code and `$build:build <feature>` in Codex drive a 5-phase cycle:

1. **Plan** - Read the codebase, choose a discovery level, create `REQ-*`/`D-*` inventories, define Wave 0 validation, emit literal `B-###` obligation bindings and delivery slices, then compile the authored plan with `buildctl validate-plan`
2. **Review** - Adversarial senior engineer review: placeholder scan, workstream independence check, requirement/decision coverage, wave graph validation, test coverage mapping
3. **Implement** - Execute one active delivery slice at a time, batching each workstream's ready task IDs into the fewest safe writer dispatches, with mid-reviews for complex changes. After its checkpoint, `buildctl complete-slice` authorizes a narrow root-applied transition or blocks by named obligation. Agents report SCOPE_CHANGE to stop work against broken plans.
4. **Verify** - Validate the final generated receipt ledger and judge exact-command, expected-observation, requirement, and `must_haves` coverage without re-running evidence commands
5. **Architect Review** - 10-lens review: correctness, trade-offs, anti-patterns, consistency, non-functional, edge cases, overengineering, plan fidelity, weak-test audit, dependency audit

The orchestrator manages state and auto-continues between phases. Claude continues to use subagents, isolated worktrees, and a structured merge protocol. Codex uses a narrower provider profile: Build-default Plan, Implement, and Architect Review run inline in root, while Plan Review and Verify use fresh-context agents. Codex agents share a shared workspace; read-only exploration may fan out, and custom-routed writers may overlap only when their `files_modified` unions are disjoint. The Codex root alone writes `.build/`, mutates git, inspects integrated diffs, and advances phases.

Delivery slices bound large implementations without turning them into separate workflows. The hierarchy is delivery slice → dependency waves → disjoint workstreams → manifest tasks. Ordinary work gets one slice; Build splits only when there are dependency-ordered independently acceptable outcomes, materially different risk/recovery boundaries, or an integration checkpoint too broad to verify and recover coherently—not merely because there are many tasks, workstreams, or a long-running writer. Root dispatches only the active slice, records provisional evidence, creates its checkpoint, then captures fresh post-checkpoint receipts and explicit structural/manual judgments. `complete-slice` validates current state, contract, summary, repository identity, checkpoint, ledger, requirements, must-haves, and judgments before emitting an immutable receipt with exactly four allowed state operations. Root alone applies that patch and reruns it to require `already_applied`. Slice evidence remains provisional: Build root runs final whole-workflow evidence, fresh Verify judges its receipts, and Architect Review covers the whole workflow diff.

Codex exploration is complexity-bounded: simple workflows use no explorer, standard uses at most two, and complex uses at most three. Explorers default to five minutes. Fresh Plan Review and Verify agents have a 20-minute hard deadline; longer budgets require a named slow command and explicit duration.

Codex supervision is terminal-only. Silence is unknown, not failure evidence, so root sends no child status prompts and does not duplicate work after empty observations. It waits for a terminal event and interrupts only at the immutable hard deadline. One fresh retry is allowed; a second independent Plan Review failure blocks implementation instead of silently falling back to inline self-review. These Markdown and state contracts make supervision auditable, but cannot guarantee host-harness wall-clock behavior.

Testing has one owner per layer: Wave 0 uses the fastest targeted evidence, workers use scoped checks, root deduplicates integration commands once per completed wave, and final Build root evidence owns the fresh full suite and exact-command ledger. Baseline, worker, and wave output never substitutes for final evidence after the latest change.

New plans use `evidence_mode: typed`. Every named symbol, behavior, and invariant in the Approach is bound to one manifest task and one must-have ID; each must-have declares one of `behavioral-test`, `command-assertion`, `structural`, or `manual-receipt` plus the exact evidence reference. Tasks must be evidence-atomic: every must-have must be independently observable in one bounded implement-verify cycle. Changed-file lists prove only structural claims, never behavior. A missing mode is treated as `legacy-untyped`; unchanged legacy tasks may continue, but reopened tasks must upgrade to typed must-haves and bindings. Verify reports `PARTIAL` when behavioral evidence is missing or mismatched, unless an evidence command itself fails.

### Deterministic buildctl runtime

Markdown/YAML remains authored authority. In a Build workflow, literal `B-###` markers make Approach obligation coverage deterministic, and `buildctl validate-plan` emits a generated `contract.json` under `.build/contracts/`. The compiler rejects invalid schemas, IDs, DAGs, bindings, file ownership, evidence kinds, and non-atomic tasks before Plan can be accepted. Generated JSON is never hand-authored workflow authority.

After implementation, Build root invokes `buildctl run-evidence` for the compiled exact commands. It emits bounded receipts containing exit state, complete output hashes and tails, plan/contract/compiler identity, HEAD commit/tree, and a complete repository identity covering the index, tracked and non-ignored untracked content, deletions, modes, symlinks, and clean recursive submodules. Receipt reuse requires the same exact command and complete repository identity; stale or tampered receipts are rejected. Fresh Verify consumes those receipts without re-running evidence commands.

At every dispatch or transition, root records a typed occurrence and `buildctl check-counters` evaluates retry, loop, scope-change, and no-progress limits deterministically. At a slice checkpoint, `buildctl complete-slice` requires a clean repository, full checkpoint SHA and summary marker, fresh exact-command consumers and observations, complete requirement coverage, and current subject-bound judgments. It writes only an immutable transition receipt; it never mutates workflow state or git. Root validates and applies only the allowed completion patch, preserving root as the sole workflow-state and git writer.

`buildctl compile-result` compiles authored Plan Review, Verify, and Architect Review reports into immutable phase-result receipts. Models continue to own semantic findings and verdicts; buildctl owns exact subject identity, freshness, coverage, file scope, prose-to-machine consistency, and next-phase eligibility. Build root is the sole state and git writer: it records a validated receipt reference and applies only its allowed transition. Runnable diagnostics block without fallback.

The Build skill and standalone Plan resolve the bundled sibling `buildctl/cli.js`; source checkouts and package installs may use the source runtime or `buildctl` bin. A runnable standalone Plan compiles its authored Markdown to `.build/contracts/{slug}/contract.json`. OpenCode's portable bundle omits the Build runtime, so it preserves a disclosed prompt-only fallback unless another package bin is available. Runnable compiler, counter, evidence, completion, and result diagnostics are authoritative and never become fallback. Standalone Plan Review, Verify, and Architect Review remain stateless and emit either their full portable machine-result section or `Machine result: N/A — missing subjects: <names>` when required inputs are unavailable; `compile-result`, `complete-slice`, and `check-counters` belong only to the Build orchestrator runtime.

`/build` is file-backed. Each workflow writes durable artifacts under `.build/plans/` so later phases and fresh agents do not depend on chat history alone:

- `{slug}-state.md` - current phase, `base_ref`, delivery slices, checkpoint commits, transition references/history, typed counter events, task completion, blockers, history
- `{slug}-context.md` - repo conventions, user constraints, discovered patterns, assumptions, out-of-scope notes
- `{slug}-requirements.md` - canonical requirements, decisions, assumptions, acceptance criteria, `must_haves`
- `{slug}-plan.md` - full implementation plan plus execution manifest
- `.build/contracts/{slug}/contract.json` - generated deterministic projection of the authored plan
- `{slug}-review.md` - plan review findings and verdict
- `{slug}-implementation-summary.md` - completed waves, files changed, deviations, blockers
- `.build/evidence/{slug}/ledger.json` and receipts - generated deterministic command evidence
- `{slug}-verify.md` - command evidence, requirement coverage, verification verdict
- `{slug}-architect-review.md` - final architecture review findings and verdict

Skill prompts are intentionally kept compact. Detailed planning rules live in reference files, and `npm test` enforces hard line ceilings for the main skill prompts.

### Codex model routing

Inline phases inherit the active root session; Build cannot downshift their model or effort. For normal complex Codex work, start Build in a Sol (`gpt-5.6-sol`) session at high effort. That avoids paying `xhigh` implementation cost merely because planning is complex. Build-default fresh Plan Review and Verify request Sol at `medium`, `high`, or `xhigh` according to simple, standard, or complex classification; exploration requests `gpt-5.6-luna` / `max`.

These are requests rather than guaranteed pins. When the current spawn surface cannot override a child model or effort, the workflow records `model_fallback` in state and the final summary instead of claiming the requested route occurred. Inline phases record `active-session`; they do not invent a fallback.

### Custom Build agents

Codex and Claude Code users may add an optional literal `## Build agent routing` block to the current invocation or effective `AGENTS.md`. A partial map resolves each key independently with this precedence: invocation > effective `AGENTS.md` > Build default. On Claude Code, `CLAUDE.md` serves as the effective `AGENTS.md` when no `AGENTS.md` file exists. The six public keys are:

```md
## Build agent routing
- plan: planning-profile
- review: review-profile
- explore: exploration-profile
- implement: implementation-profile
- verify: verification-profile
- architect-review: architecture-profile
```

`review` also controls the mid-implementation review. Agent names are opaque and externally owned: Build never discovers, validates, normalizes, aliases, creates, copies, edits, installs, bundles, or overwrites agent profiles. It does not provide profile setup or map profile names to models.

For a non-null requested profile, the route is `profile-owned`: Build requests the exact name with no Build model or effort override and no inherited history (`fork_turns: "none"` where exposed). For a null Build-default route, Build makes no named selection attempt and creates no `agent_selection_fallback` record. `default` is an opaque selectable agent name, not a reserved sentinel. For a fresh workflow, restore adaptive Build default by removing or editing the `AGENTS.md` mapping before invocation. A live workflow keeps its saved snapshot: `AGENTS.md` edits do not change it, and only a valid current invocation block may replace named keys.

An explicit non-null route opts that phase into delegation, including phases whose Build default is inline. If exact custom selection is unavailable or rejected, Build appends `agent_selection_fallback` before using the Build-default model route or inline authority. A later model override failure is recorded independently in `model_fallback`; execution failures use `agent_failures`.

Configuration requests the exact profile only where the active API exposes agent selection; otherwise the documented fallback applies. This repository does not add host selectors.

Generated skill outputs are committed artifacts. When changing `source/skills/`, run `npm run build` and commit the source changes, regenerated provider outputs, and any test updates together. `npm run check-sync` intentionally fails on an uncommitted source/output change set because it compares generated outputs against git.

See [ROADMAP.md](ROADMAP.md) for the deterministic evidence and transition-authority sequence.

### Workflow modes

The Claude orchestrator supports three named workflow modes: `claude` (the default), `fable`, and `mixed`. Selection resolves from an optional `mode=claude` / `mode=fable` / `mode=mixed` invocation token, a `build-mode:` line in the effective `AGENTS.md`, or an option screen asked once on a fresh workflow — no memorized syntax required.

Four tracks:

- **Sole Claude** — `/build` as-is; the `claude` default, today's pinned routing.
- **Sole Codex** — run `$build:build` in a Codex session; nothing new to install.
- **`fable`** — the root session executes the plan and architect-review protocols itself; review and verify remain independent fresh-context agents.
- **`mixed`** — fable planning plus cross-model adversarial judgment: plan review, verify, and architect review run on Codex via a supervised `codex exec` invocation, with a manual relay stop as fallback.

See `reference/workflow-modes.md` in the build skill for the full contract.

## Standalone use

Each skill is useful on its own:

- `/build:impl-plan refactor the payment flow` - Save `.build/plans/{slug}-plan.md` and compile its generated contract when buildctl runs
- `/build:review-plan <plan path>` - Consume the supplied plan/contract/context directly and save `.build/plans/{slug}-review.md`
- `/build:verify <artifacts or scope>` - Consume supplied plan/contract/ledger inputs or run prompt checks, then save `.build/plans/{slug}-verify.md`
- `/build:architect-review <work and Verify result>` - Consume the supplied target/evidence and save `.build/plans/{slug}-architect-review.md`

Standalone slug resolution is deterministic and collision-safe: known artifact paths preserve their family slug, request text is normalized to bounded lowercase ASCII, and existing outputs receive the lowest unused numeric suffix. Missing workflow inputs remain missing or `N/A`; standalone skills never synthesize state/context/evidence, mutate workflow state or git, or auto-continue. The Build orchestrator remains the only workflow-state owner.

## Claude Code standalone model enforcement

In Claude Code, each skill sets its own model for standalone runs:

| Skill | Model | Effort | Context |
|-------|-------|--------|---------|
| `/build:impl-plan` | Opus | High | inherited |
| `/build:review-plan` | Sonnet | default | fork |
| `/build:architect-review` | Opus | High | fork |
| `/build:verify` | inherited | inherited | inherited |

Skill frontmatter takes precedence: a skill invoked from inside an orchestrator-spawned agent still runs on its own pinned model, not the agent's (verified empirically — a Haiku agent invoking `review-plan` executes on Sonnet). The orchestrator's `build/{slug}` dispatch agents (implementation, merge-conflict resolution) request Sonnet for single-file mechanical work and Opus for multi-file integration or design judgment. Note that skill frontmatter does not resolve the `fable` alias — it falls back silently to the invoking model — so the two judgment skills pin Opus explicitly rather than relying on inheritance. Fable mode executes the plan and architect-review protocols in the root session precisely because skill frontmatter cannot express a session-model pin, for the same reason the fable-alias note above gives. The standalone skills' pins are unchanged.

## License

MIT
