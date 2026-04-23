# AGENTS.md

Instructions for OpenCode, Codex, and other non-Claude harnesses.

## Available skills

This repo ships four portable skills usable in OpenCode and Codex:

- **`impl-plan`** — Create a detailed implementation plan. Reads the codebase, traces code paths, maps files, identifies parallel workstreams. Use before building any non-trivial feature.
- **`review-plan`** — Review an implementation plan as a skeptical senior engineer. Scans for placeholders, verifies accuracy, finds gaps, assigns severity levels to findings.
- **`verify`** — Evidence-before-claims gate. Runs tests, build, type checks. Reports actual output. No completion claims without fresh evidence.
- **`architect-review`** — Principal Software Architect review of completed work. 10 review lenses with severity levels and structured verdict.

Skills are in `.agents/skills/` (Codex) or `.opencode/skills/` (OpenCode).

## Claude-only skills

The `build` orchestrator and `eval` runner are Claude Code only. They depend on sub-agent spawning, Task tracking tools, and the `Skill` tool dispatch — capabilities not available in other harnesses. Do not attempt to invoke `build` or `eval` outside Claude Code.

## Invocation

Invoke skills using your harness's native mechanism:

- **OpenCode**: use the built-in skill tool with the skill name.
- **Codex**: `$skill <name>` or `/skills <name>` per the Codex docs.

Provide your task, plan path, or spec as the invoking message — the skill will treat it as input.

## OpenCode note

OpenCode reads both `.opencode/skills/` and `.claude/skills/`. If you are running OpenCode against this repo root directly, the Claude-only `build` and `eval` skills will appear. They will not function correctly outside Claude Code. The intended OpenCode usage is to copy this repo's `.opencode/` directory into your target project (preserving the leading dot), so the final layout is `<your-project>/.opencode/skills/<skill-name>/SKILL.md`. Do not flatten to `<your-project>/skills/` — OpenCode will not find skills there.

## Codex note

Two install paths, both supported:

**Repo-local discovery.** Clone the repo and open it as your Codex workspace. Codex reads skills directly from `.agents/skills/`. No build step.

**Plugins UI / CLI install.** Register this repo as a Codex marketplace and install the plugin:

```sh
codex plugin marketplace add jameshemson/build
codex plugin install build/build
```

The plugin installs into `~/.codex/plugins/cache/build/build/<version>/` and makes the four portable skills available globally, independent of which workspace you're in.

If you do both (clone AND install), you will see duplicate skill entries in Codex's listing. The two copies are byte-identical and behave identically — only the UI listing is noisier. `.agents/skills/` and `plugins/build/skills/` are both regenerated from the same `source/skills/` tree by `npm run build` and share the same rewrite config by reference in `scripts/transformers/providers.js`.
