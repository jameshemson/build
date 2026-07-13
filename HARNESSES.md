# Harness capability matrix

This table is the authoritative reference for transformer decisions. Any new skill that depends on a row marked "No" for a given harness must be excluded from that harness's output.

| Capability | Claude Code | OpenCode | Codex |
| --- | --- | --- | --- |
| Repo-local skill directory | `.claude/skills/` | `.opencode/skills/` (also reads `.claude/skills/`) | `.agents/skills/` |
| Runtime `$ARGUMENTS` substitution in SKILL.md | Yes | No | No |
| Slash-command skill invocation (`/build:name`) | Yes | Yes — via `.opencode/commands/*.md` wrappers shipped by this plugin (flat names: `/impl-plan` etc.) | No — use `$<name>` or `$build:<name>` (plugin-namespaced) |
| Plugin distribution | Yes — `.claude-plugin/` | No — copy `.opencode/` bundle | Yes — `codex plugin marketplace add jameshemson/build` |
| Instructed subagent workflows | Yes — `Agent` and Task tools | No | Yes — current Codex collaboration surfaces, with inline fallback when delegation is unavailable |
| Per-skill `model` / `effort` / `context` frontmatter | Yes | No | No |
| Per-skill `allowed-tools` frontmatter | Yes | No | No |

## Skill availability

| Skill | Claude Code | OpenCode | Codex | Notes |
| --- | --- | --- | --- | --- |
| `build` | Yes | No | Yes | Provider-specific orchestrators: Claude uses isolated worktrees; Codex uses instructed subagents in a shared workspace |
| `eval` | Yes | No | No | Requires `Skill` tool dispatch |
| `impl-plan` | Yes | Yes | Yes | Portable |
| `review-plan` | Yes | Yes | Yes | Portable |
| `verify` | Yes | Yes | Yes | Portable |
| `architect-review` | Yes | Yes | Yes | Portable |

## OpenCode install story

OpenCode reads both `.opencode/skills/` and `.claude/skills/`. This means opening this repo root directly in OpenCode exposes the Claude-targeted `build` skill and Claude-only `eval` skill, and produces duplicate entries for the four portable skills.

**Supported OpenCode path**: copy this repo's `.opencode/` directory (including the leading dot) into the target project so the final layout is `<target-project>/.opencode/skills/<skill-name>/SKILL.md` and `<target-project>/.opencode/commands/<command-name>.md`. Do not flatten to `<target-project>/skills/` — OpenCode will not find skills there. Do not point OpenCode at this repo root directly (duplicate and provider-incompatible skills will appear).

**Slash command bundle.** In addition to the four portable skills at `.opencode/skills/`, we ship four OpenCode slash commands at `.opencode/commands/` (`impl-plan.md`, `review-plan.md`, `verify.md`, `architect-review.md`). Each command's body is a single `@.opencode/skills/<name>/SKILL.md` line — OpenCode resolves `@<path>` against the project worktree and inlines the file content at invocation time (verified against OpenCode `packages/opencode/src/session/prompt.ts`). Users invoke as `/impl-plan <task>` etc.; pass-through arguments become the skill's task input. Commands use flat (non-namespaced) names: collision with an unrelated local command in the user's project is possible and requires renaming one of the two.

## Codex install story

Two supported paths:

**Repo-local discovery.** Codex reads skills directly from `.agents/skills/` when a user opens the repo as their workspace. The committed `.agents/skills/` tree is a distribution artifact — no build step required for consumers. To add these skills to another project without installing the plugin, copy this repo's `.agents/` directory into that project so the final layout is `<target-project>/.agents/skills/<skill-name>/SKILL.md`.

**Plugins UI / CLI install.** Users who don't want to clone the repo can register this repo as a Codex marketplace and install the `build` plugin from the Plugins UI:

```sh
codex plugin marketplace add jameshemson/build
codex plugin install build/build
```

The marketplace manifest is at `.agents/plugins/marketplace.json`; the plugin manifest is at `plugins/build/.codex-plugin/plugin.json`. Both are hand-authored and committed. Five skills ship in the Codex plugin: the `build` orchestrator plus the standalone `impl-plan`, `review-plan`, `verify`, and `architect-review` skills. The `eval` runner remains Claude Code only.

A user who both clones the repo AND installs the plugin will see duplicate entries for the five Codex skills. The two copies are byte-identical (enforced by a sandbox byte-equality test); behavior is the same, only the UI listing is noisier.

### Codex end-to-end flow

Run `$build:build <feature>` once to drive Plan → Plan Review → Implement → Verify → Architect Review, including repair loops and resumable `.build/plans/` artifacts. The root orchestrator owns workflow state, branch and commit operations, diff inspection, integrated checks, and phase transitions. It gives read-heavy phases and reviews to fresh instructed subagents when the current surface supports delegation; otherwise it runs the companion skill inline and records that fallback.

Codex subagents share one workspace. Exploration fan-out is 0/2/3 for simple/standard/complex workflows, with a five-minute default. Manifest task IDs are evidence and completion units, not dispatch units: root groups each workstream's ready frontier into the fewest bounded writer batches. Concurrent batch file unions must be disjoint; any overlap, formatter, generator, lockfile, manifest, migration, or generated-output task is serialized. Workers edit only assigned files and never write `.build/` or mutate git.

The root supervises every delegated role through boundary milestones (`STARTED`, `EDITING`, `VERIFYING`, then terminal), persisted ISO timestamps, immutable absolute deadlines, and status/diff checks at intervals no longer than 60 seconds. Root polls do not count as agent evidence. Two evidence-free checks request status without moving the deadline. At the deadline, every agent—with or without edits—gets exactly one deadline request and one 60-second grace period before interruption. Defaults are five minutes for explorers and ten for writers/companions; only a named slow command may declare longer. This is a deterministic prompt/state contract rather than a host-harness timing guarantee.

Wave 0 uses targeted evidence, workers own scoped checks, and root runs each integration command once per completed wave. The portable verifier collects detected and plan-declared candidates into one same-invocation ledger keyed by exact command string, unions their evidence provenance, runs each key once, and invalidates earlier rows after any later content change. Earlier workflow layers never substitute for final fresh evidence.

Model routing is an auditable request, not a guaranteed pin:

| Phase | Simple | Standard | Complex or high-risk |
| --- | --- | --- | --- |
| Plan / Plan Review | `gpt-5.6-sol` / `medium` | `gpt-5.6-sol` / `high` | `gpt-5.6-sol` / `xhigh` |
| Exploration / Verify | `gpt-5.6-luna` / `max` | `gpt-5.6-luna` / `max` | `gpt-5.6-luna` / `max` with narrower agents |
| Implement | `gpt-5.6-luna` / `max` for mechanical work | `gpt-5.6-sol` / `medium` | `gpt-5.6-sol` / `high` |
| Architect Review | `gpt-5.6-sol` / `high` | `gpt-5.6-sol` / `xhigh` for a broad diff | `gpt-5.6-sol` / `xhigh` |

The orchestrator classifies complexity before Plan and refines it from the plan. If the active spawn surface cannot override the child model or reasoning effort, the phase inherits the current session model and the workflow records `model_fallback` visibly in state and the final summary.

#### Custom agent routing contract

The optional routing block ends at the next H2 heading or EOF. Its body permits blank lines and one or more exact `- <key>: <value>` entries only. Parsing trims only surrounding delimiter whitespace and preserves the opaque remainder exactly, including case, punctuation, quotes, and internal whitespace. Build rejects duplicate blocks, duplicate keys, unknown keys, non-list content, and blank values before workflow mutation, naming the offending source and key when a key exists.

Saved routing is durable. The saved route snapshot wins unless the current invocation contains a valid block. A valid invocation block overrides only named keys and logs their old and new values. Changed `AGENTS.md` content never silently changes live state, while an invalid current mapping leaves the snapshot and history unchanged. Removing or editing an `AGENTS.md` mapping affects route resolution for a fresh workflow; it does not reset a live snapshot. A legacy state missing routes resolves once after valid input and logs that resolution.

If exact custom selection is unavailable or rejected, Build appends `agent_selection_fallback` before using the Build-default model route. A later model override failure is recorded in an independent `model_fallback`; an execution failure remains on the existing `agent_failures` path. Selection support is an active-API boundary: Build can request an exposed exact name, but does not define profiles or selectors.

**Cross-harness skill bridge.** In addition to `.agents/skills/` (Codex CLI primary) and `plugins/build/skills/` (Codex plugin package), this repo also emits `.codex/skills/`. Byte-identical to `.agents/skills/` (enforced by a 3-way sandbox byte-equality test — `codex` ↔ `codex-plugin` ↔ `codex-cross` share `codexRewrites` by reference). This path exists so cross-reading harnesses — notably Cursor, which documents `.codex/skills/` as a scan path — can discover the skills without additional configuration.

Verified against Codex docs on 2026-07-12. Install verified on 2026-04-23.

## Source and build

Skills are authored in `source/skills/` using Claude syntax (`$ARGUMENTS`, `/build:<name>` slash references). OpenCode slash commands are authored in `source/commands/`. The build script (`npm run build`) transforms and writes provider-specific outputs to `.claude/skills/`, `.opencode/skills/`, `.agents/skills/`, `plugins/build/skills/`, `.codex/skills/`, and `.opencode/commands/`. All output directories are committed.

The `codex`, `codex-plugin`, and `codex-cross` providers share the same rewrite config by identity in `scripts/transformers/providers.js`, so `.agents/skills/` (repo-local), `plugins/build/skills/` (plugin-packaged), and `.codex/skills/` (cross-harness bridge) are always byte-identical. A 3-way sandbox test in `builder.test.js` enforces this invariant.

Transforms applied for non-Claude targets:
- `argumentsToken`: standalone `$ARGUMENTS` lines become a prose instruction; inline occurrences become "the user's request".
- `skillReference`: `/build:<name>` references become `` `<name>` ``.
- `removeClaudeOnlySections`: `<!-- claude-only -->` … `<!-- /claude-only -->` blocks are stripped.
- Frontmatter: Claude-only fields (`user-invocable`, `argument-hint`, `model`, `effort`, `context`, `allowed-tools`) are stripped.
