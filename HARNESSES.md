# Harness capability matrix

This table is the authoritative reference for transformer decisions. Any new skill that depends on a row marked "No" for a given harness must be excluded from that harness's output.

| Capability | Claude Code | OpenCode | Codex |
| --- | --- | --- | --- |
| Repo-local skill directory | `.claude/skills/` | `.opencode/skills/` (also reads `.claude/skills/`) | `.agents/skills/` |
| Runtime `$ARGUMENTS` substitution in SKILL.md | Yes | No | No |
| Slash-command skill invocation (`/build:name`) | Yes | No — native skill tool | No — `$skill name` or `/skills` |
| Plugin distribution | Yes — `.claude-plugin/` | No — copy `.opencode/` bundle | Yes — `codex plugin marketplace add jameshemson/build` |
| Sub-agent / Task tools (`Agent`, `TaskCreate`, etc.) | Yes | No | No |
| Per-skill `model` / `effort` / `context` frontmatter | Yes | No | No |
| Per-skill `allowed-tools` frontmatter | Yes | No | No |

## Skill availability

| Skill | Claude Code | OpenCode | Codex | Notes |
| --- | --- | --- | --- | --- |
| `build` | Yes | No | No | Requires `Agent`, `Skill`, Task tools |
| `eval` | Yes | No | No | Requires `Skill` tool dispatch |
| `impl-plan` | Yes | Yes | Yes | Portable |
| `review-plan` | Yes | Yes | Yes | Portable |
| `verify` | Yes | Yes | Yes | Portable |
| `architect-review` | Yes | Yes | Yes | Portable |

## OpenCode install story

OpenCode reads both `.opencode/skills/` and `.claude/skills/`. This means opening this repo root directly in OpenCode exposes the Claude-only `build` and `eval` skills, and produces duplicate entries for the four portable skills.

**Supported OpenCode path**: copy this repo's `.opencode/` directory (including the leading dot) into the target project so the final layout is `<target-project>/.opencode/skills/<skill-name>/SKILL.md`. Do not flatten to `<target-project>/skills/` — OpenCode will not find skills there. Do not point OpenCode at this repo root directly (duplicate / Claude-only skills will appear).

## Codex install story

Two supported paths:

**Repo-local discovery.** Codex reads skills directly from `.agents/skills/` when a user opens the repo as their workspace. The committed `.agents/skills/` tree is a distribution artifact — no build step required for consumers. To add these skills to another project without installing the plugin, copy this repo's `.agents/` directory into that project so the final layout is `<target-project>/.agents/skills/<skill-name>/SKILL.md`.

**Plugins UI / CLI install.** Users who don't want to clone the repo can register this repo as a Codex marketplace and install the `build` plugin from the Plugins UI:

```sh
codex plugin marketplace add jameshemson/build
codex plugin install build/build
```

The marketplace manifest is at `.agents/plugins/marketplace.json`; the plugin manifest is at `plugins/build/.codex-plugin/plugin.json`. Both are hand-authored and committed. Four portable skills ship in the plugin — `impl-plan`, `review-plan`, `verify`, `architect-review`. The orchestrator (`build`) and `eval` runner are not shipped.

A user who both clones the repo AND installs the plugin will see duplicate entries for the four portable skills. The two copies are byte-identical (enforced by a sandbox byte-equality test); behavior is the same, only the UI listing is noisier.

Verified against Codex docs on 2026-04-22.

## Source and build

Skills are authored in `source/skills/` using Claude syntax (`$ARGUMENTS`, `/build:<name>` slash references). The build script (`npm run build`) transforms and writes provider-specific outputs to `.claude/skills/`, `.opencode/skills/`, `.agents/skills/`, and `plugins/build/skills/`. All output directories are committed.

The `codex` and `codex-plugin` providers share the same rewrite config by identity in `scripts/transformers/providers.js`, so `.agents/skills/` (repo-local) and `plugins/build/skills/` (plugin-packaged) are always byte-identical. A sandbox test in `builder.test.js` enforces this invariant.

Transforms applied for non-Claude targets:
- `argumentsToken`: standalone `$ARGUMENTS` lines become a prose instruction; inline occurrences become "the user's request".
- `skillReference`: `/build:<name>` references become `` `<name>` ``.
- `removeClaudeOnlySections`: `<!-- claude-only -->` … `<!-- /claude-only -->` blocks are stripped.
- Frontmatter: Claude-only fields (`user-invocable`, `argument-hint`, `model`, `effort`, `context`, `allowed-tools`) are stripped.
