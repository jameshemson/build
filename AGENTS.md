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

OpenCode reads both `.opencode/skills/` and `.claude/skills/`. If you are running OpenCode against this repo root directly, the Claude-only `build` and `eval` skills will appear. They will not function correctly outside Claude Code. The intended OpenCode usage is to copy `.opencode/skills/` into your target project.

## Codex note

Codex discovers skills from `.agents/skills/`. The four portable skills are available there and require no build step.
