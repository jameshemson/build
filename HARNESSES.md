# Harness capability matrix

This table is the authoritative reference for transformer decisions. Any new skill that depends on a row marked "No" for a given harness must be excluded from that harness's output.

| Capability | Claude Code | OpenCode | Codex |
| --- | --- | --- | --- |
| Repo-local skill directory | `.claude/skills/` | `.opencode/skills/` (also reads `.claude/skills/`) | `.agents/skills/` |
| Runtime `$ARGUMENTS` substitution in SKILL.md | Yes | No | No |
| Slash-command skill invocation (`/build:name`) | Yes | No — native skill tool | No — `$skill name` or `/skills` |
| Plugin distribution | Yes — `.claude-plugin/` | No — copy `.opencode/` bundle | Via Codex plugin manifest (not implemented) |
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

**Supported OpenCode path**: copy only the `.opencode/skills/` directory into the target project. Do not point OpenCode at this repo root.

## Codex install story

Codex discovers repo-local skills from `.agents/skills/`. The committed `.agents/skills/` tree is the distribution artifact — no build step required for consumers.

Codex plugin distribution (an installable manifest) is not implemented.

## Source and build

Skills are authored in `source/skills/` using Claude syntax (`$ARGUMENTS`, `/build:<name>` slash references). The build script (`npm run build`) transforms and writes provider-specific outputs to `.claude/skills/`, `.opencode/skills/`, and `.agents/skills/`. All output directories are committed.

Transforms applied for non-Claude targets:
- `argumentsToken`: standalone `$ARGUMENTS` lines become a prose instruction; inline occurrences become "the user's request".
- `skillReference`: `/build:<name>` references become `` `<name>` ``.
- `removeClaudeOnlySections`: `<!-- claude-only -->` … `<!-- /claude-only -->` blocks are stripped.
- Frontmatter: Claude-only fields (`user-invocable`, `argument-hint`, `model`, `effort`, `context`, `allowed-tools`) are stripped.
