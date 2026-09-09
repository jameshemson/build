# Harness capability matrix

This table is the authoritative reference for transformer decisions. Any new skill that depends on a row marked "No" for a given harness must be excluded from that harness's output.

| Capability | Claude Code | OpenCode | Codex |
| --- | --- | --- | --- |
| Repo-local skill directory | `.claude/skills/` | `.opencode/skills/` (also reads `.claude/skills/`) | `.agents/skills/` |
| Runtime `$ARGUMENTS` substitution in SKILL.md | Yes | No | No |
| Slash-command skill invocation (`/build:name`) | Yes | Yes — via `.opencode/commands/*.md` wrappers shipped by this plugin (flat names: `/impl-plan` etc.) | No — use `$<name>` or `$build:<name>` (plugin-namespaced) |
| Plugin distribution | Yes — `.claude-plugin/` | No — copy `.opencode/` bundle | Yes — `codex plugin marketplace add jameshemson/build` |
| Instructed subagent workflows | Yes — `Agent` and Task tools | No | Yes — current Codex collaboration surfaces; independent judgment blocks if delegation is unavailable |
| Per-skill `model` / `effort` / `context` frontmatter | Yes | No | No |
| Per-skill `allowed-tools` frontmatter | Yes | No | No |
| Bundled `buildctl` runtime in the Build skill | Yes | No | Yes |
| Deterministic `check-counters` / `complete-slice` workflow authority | Yes | No | Yes |
| Deterministic phase result receipts | Yes | No | Yes |
| Standalone Markdown artifact persistence | Yes | Yes | Yes |
| Standalone Plan contract compilation | Yes — bundled sibling runtime | Prompt fallback unless a package bin is available | Yes — bundled sibling runtime |

## Skill availability

| Skill | Claude Code | OpenCode | Codex | Notes |
| --- | --- | --- | --- | --- |
| `build` | Yes | No | Yes | Provider-specific orchestrators: Claude uses subagents and isolated worktrees; Codex plans inline and delegates bounded implementation and independent judgment |
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

Note that named workflow modes are Claude-orchestrator-only today — the `mode=opus` / `mode=fable` / `mode=mixed` selection is read only by the Claude orchestrator. The six-key `## Build agent routing` block, by contrast, is supported by both orchestrators: Codex has had it since the custom-agent-routing release, and this release ports it to Claude. Codex preset parity for the new named modes is roadmap-deferred. `workflow-modes.md` ships in the Codex output trees but is unreferenced there.

### Codex end-to-end flow

Run `$build:build <feature>` once to drive Plan → Plan Review → Implement → Verify → Architect Review, including repair loops and resumable `.build/plans/` artifacts. The root orchestrator owns workflow state, branch and commit operations, diff inspection, integrated checks, and phase transitions. Build-default Plan runs inline in root; Plan Review, Implement, Verify, and Architect Review use fresh-context agents. Tiny mechanical implementation may remain inline only for simple work wholly contained in one existing pattern. Explicit non-null custom routes may opt any phase into delegation.

Codex subagents share one workspace. Exploration fan-out is 0/2/3 for simple/standard/complex workflows, with a five-minute default. Manifest task IDs are evidence and completion units, not dispatch units: root groups each workstream's ready frontier into the fewest bounded writer batches. Concurrent batch file unions must be disjoint; any overlap, formatter, generator, lockfile, manifest, migration, or generated-output task is serialized. Workers edit only assigned files and never write `.build/` or mutate git.

Claude and Codex place delivery slices above the existing dependency waves → disjoint workstreams → manifest tasks hierarchy. Ordinary work has one slice. Build uses multiple slices only for dependency-ordered independently acceptable outcomes, distinct risk/recovery boundaries, or an integration checkpoint too broad to verify and recover coherently; task count, workstream count, and writer runtime alone are not split triggers. Only the active slice dispatches. After integration, root updates the summary and creates a checkpoint; fresh post-checkpoint evidence plus explicit structural/manual judgments feed `buildctl complete-slice`. The command either blocks by named obligation or writes an immutable receipt containing exactly four allowed state operations. Root alone validates and applies that patch, then requires an idempotent `already_applied` replay before activating the next slice. Resume and replan preserve completed slice boundaries through durable state. These checkpoints are provisional: Build root owns fresh whole-workflow command execution, final Verify owns receipt coverage judgment, and Architect Review owns the whole workflow diff.

Codex supervision is terminal-only: silence is unknown, not failure evidence. Root sends no child status prompts, waits for a terminal event, and interrupts only at an immutable hard deadline. Fresh Plan Review, Verify, and Architect Review use a 20-minute hard deadline and at most one fresh retry; a second independent Plan Review failure blocks implementation. Explorers default to five minutes, and only a named slow command may declare longer before dispatch. This is a deterministic prompt/state contract rather than a host-harness timing guarantee.

Wave 0 uses targeted evidence, workers own scoped checks, and root runs each integration command once per completed wave. In Claude and Codex Build workflows, Markdown/YAML remains authored authority: `buildctl validate-plan` creates the generated contract, `run-evidence` creates repository-bound receipts, `check-counters` evaluates root-recorded typed events, `complete-slice` authorizes only the narrow completion patch, and `compile-result` creates deterministic phase result receipts for Plan Review, Verify, and Architect Review. Models own semantic judgment; buildctl owns exact subjects, freshness, coverage, file scope, verdict consistency, and transition eligibility. The root-only orchestrator validates each receipt and remains the sole workflow-state and git writer; buildctl never writes workflow state or mutates git. Runnable diagnostics are authoritative; only genuine runtime unavailability selects the recorded prompt-only fallback. Standalone skills use the same bundled runtime where available, while OpenCode omits Build and discloses fallback unless a package `buildctl` bin exists. Standalone skills never gain workflow authority.

Typed evidence is portable across all three harnesses. New plans declare `evidence_mode: typed`, bind each named Approach symbol, behavior, or invariant to one task and must-have ID, and give every must-have an exact evidence kind and reference. The four kinds are `behavioral-test`, `command-assertion`, `structural`, and `manual-receipt`. Changed files satisfy only structural claims; they cannot prove behavior. Missing modes are `legacy-untyped`, while reopened legacy tasks must upgrade. Missing or mismatched behavioral evidence yields `PARTIAL` unless the underlying command fails.

All four portable skills save their natural standalone Markdown artifact under `.build/plans/` while preserving the report shown in the conversation. Known supplied artifact paths determine the family slug; request-derived slugs use deterministic bounded normalization and the lowest unused collision suffix. Supplied plan, contract, ledger, requirements, context, implementation-summary, and Verify artifacts are consumed directly. Missing siblings are never synthesized. Standalone skills do not own Build state, transitions, git mutation, checkpointing, or release operations.

Fresh Codex defaults request `gpt-6-astra`: Plan Review/mid-review medium, implementation low, Verify low, and independent Architect Review high. Review uses high for auth, security, destructive migrations or unresolved cross-system lifecycle risk; implementation uses medium for its batch's migration, ownership, concurrency or cross-system design risks; Verify uses medium for cross-file coverage/debt judgment. Architect Review uses xhigh only on explicit user preference. Exploration stays `gpt-5.6-luna` / `max`. Start root at Astra medium; inline planning and integration inherit the active session and cannot be downshifted by Build. Sol remains a user/custom routing option.

Saved `model_routes`, including legacy inline `active-session`, remain authoritative on resume; missing roles resolve once after routing validation. Explicit Build-default child requests use `fork_turns: "none"`; opaque custom profiles are `profile-owned` and omit Build model/effort overrides. Dispatch history records requested and observed routes (or `unknown`). Model-selection unavailability may send implementation inline with disclosure, but Plan Review and Verify stay fresh on the observed host route or `unknown`. Unavailable delegation blocks independent judgment; an unavailable required Build-default Astra architect route needs explicit user authorization for another reviewer. Record `model_fallback` independently from agent-selection fallback.

Workers receive the current workstream's requirements, interfaces, owned files, typed must-haves, scoped commands and runtime. They may read necessary source, but never access `.build/`, mutate git or invoke workflow skills. Default to one writer; a second needs disjoint ownership and available host slots. Normal terminal reports are at most 300 words. Required worker, integration, slice and final evidence remains intact; discretionary checks stop after it passes unless new changes, failures or unresolved concerns justify more.

For Codex receipt-mode Verify, root freshly runs metadata `run-evidence --check-only`, then exports exact current contract, ledger, referenced receipt and subject bytes, hashes and check output outside `.build/` or inline. Include requirements, plan, summary and semantic coverage inputs. Verify judges these bytes and scans source debt without executing evidence commands or reading `.build/`. Missing inputs or a changed subject require root to refresh and revalidate before acceptance; summaries cannot replace exact receipts. Runnable diagnostics remain authoritative and the evidence kernel is unchanged. Architect Review receives the complete file inventory, pinned base/head target, accepted requirements and fresh Verify result, and reviews the whole diff.

The [manual Codex acceptance protocol](source/skills/build/reference/codex-default-eval.md) records the research limits, separate Coverd migration and reproducible policy/planning/architecture checks. Run it from a source checkout: installed Codex bundles omit the Claude-only eval skill and its fixtures. It creates no new preset, routing key, harness or package.

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
