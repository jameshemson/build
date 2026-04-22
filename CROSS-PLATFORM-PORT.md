---
tags: [project, build, opencode, codex, skills, implementation-plan]
date: 2026-04-22
---
Source: split from `vault/notes/projects/skills-cross-platform-port.md`
Last updated: 2026-04-22

# Cross-platform port plan for `build`

## Context

`build` currently ships as a Claude Code plugin only. The skill format itself is portable, so the goal is to move to a single-source build pipeline that renders provider-specific output for Claude Code, OpenCode, and Codex.

This repo currently has 6 Claude skills and no `source/skills/` tree yet.

## Goal

Adopt the impeccable-style multi-harness pattern inside this repo:

- `source/skills/` becomes the single source of truth
- `scripts/build.js` renders provider-specific output
- committed output lives in:
  - `.claude/skills/` — Claude Code
  - `.opencode/skills/` — OpenCode (when consumed as an extracted bundle; see "OpenCode install story" below)
  - `.agents/skills/` — Codex repo-local discovery (primary Codex target per Codex docs and impeccable's layout)

The generated directories stay committed so GitHub installs do not require a local build step.

## Harness capability matrix

Add a repo-root `HARNESSES.md` modeled on impeccable's, listing what each harness supports. Concrete columns:

| Capability | Claude Code | OpenCode | Codex |
| --- | --- | --- | --- |
| Repo-local skill directory | `.claude/skills/` | `.opencode/skills/` (and also reads `.claude/skills/`) | `.agents/skills/` |
| Runtime `$ARGUMENTS` substitution in SKILL.md | Yes | No | No |
| Slash-command invocation (`/build:name`) | Yes | No (native skill tool) | No (`$skill` / `/skills`) |
| Plugin distribution | Yes (`.claude-plugin/`) | No (copy `.opencode/`) | Via Codex plugin manifest (out of scope) |
| Sub-agent / Task tools | Yes | No | No |

`HARNESSES.md` is the authoritative reference for transformer decisions. Any new skill must declare which row it depends on.

## Key repo-specific decisions

- The `build` orchestrator skill stays Claude-only. It depends on `TaskCreate`/`TaskUpdate`/`Agent` worktree isolation / `Skill` dispatch, which have no clean OpenCode or Codex equivalents.
- The `eval` skill also stays Claude-only. It drives other skills via `Skill` tool dispatch.
- OpenCode and Codex outputs include only the portable sub-skills:
  - `impl-plan`
  - `review-plan`
  - `verify`
  - `architect-review`
- The transformer code lives inside this repo rather than a shared package.

## Portability blockers in current skills

Every portable sub-skill has Claude-specific syntax in its body, not just frontmatter. The transformer must rewrite both.

1. **`$ARGUMENTS` substitution**. Present in:
   - `.claude/skills/impl-plan/SKILL.md:15`
   - `.claude/skills/review-plan/SKILL.md:12`
   - `.claude/skills/architect-review/SKILL.md:30` and `:54`
   - `.claude/skills/verify/SKILL.md:90`

   OpenCode and Codex do not substitute this at runtime. For non-Claude targets, the transformer must replace the literal `$ARGUMENTS` token with natural-language prose telling the agent to treat the user's invoking message as the input (e.g. "the task, plan path, or spec provided by the user in the message that invoked this skill").

2. **Slash-command cross-references**. Portable skills reference sibling skills using `/build:verify`, `/build:impl-plan`, etc. (e.g. `architect-review/SKILL.md:17`, `README.md:9`). This is Claude-only syntax. For:
   - OpenCode: rewrite to "invoke the `verify` skill via the skill tool".
   - Codex: rewrite to "run the `verify` skill (via `$skill verify` or `/skills`)".

The `{{command_prefix}}build:` placeholder from the original plan is dropped. A single prefix swap cannot produce valid prose for OpenCode or Codex because the invocation idiom is different, not just the prefix.

## Approach

Create a repo-local transformer. Two passes:

**Pass 1 — frontmatter rewrite**: strip Claude-only fields (`user-invocable`, `argument-hint`, `context`, custom tool allowlists), emit the frontmatter shape each harness expects.

**Pass 2 — body rewrite**: a small set of typed transforms, not generic placeholder substitution:

- `argumentsToken`: replace `$ARGUMENTS` with per-provider prose.
- `skillReference`: rewrite `/build:<name>` spans with per-provider invocation phrasing.
- `removeClaudeOnlySections`: strip any sections gated by HTML-style markers (`<!-- claude-only -->` … `<!-- /claude-only -->`) so authors can keep Claude-specific asides in source.

Provider config selects which transforms run and supplies the replacement strings.

## Files to add or change

### Build pipeline

- `package.json`
  - add `"type": "module"`
  - add `build` and `check-sync` scripts
- `scripts/build.js`
- `scripts/check-sync.js`
- `scripts/transformers/providers.js` — per-provider config (output dir, excluded skills, transform phrasing)
- `scripts/transformers/body-rewrites.js` — `argumentsToken`, `skillReference`, `removeClaudeOnlySections`
- `scripts/transformers/frontmatter.js`
- `scripts/transformers/transform.js` — compose passes
- `scripts/transformers/utils.js`
- `.gitignore`
  - add `dist-tmp/`

### Source tree migration

- create `source/skills/`
- copy the 6 existing skills from `.claude/skills/` into `source/skills/`
- preserve any nested `reference/`, `fixtures/`, and `evals.json` files when moving the tree
- source files keep Claude syntax (`$ARGUMENTS`, `/build:name`); transformer handles non-Claude outputs

### Provider config

- `providers.js` entries:
  - `claude`: output `.claude/skills/`, no transforms (identity), exclude none.
  - `opencode`: output `.opencode/skills/`, run `argumentsToken` + `skillReference` (OpenCode phrasing) + `removeClaudeOnlySections`, exclude `['build', 'eval']`.
  - `codex`: output `.agents/skills/`, run `argumentsToken` + `skillReference` (Codex phrasing) + `removeClaudeOnlySections`, exclude `['build', 'eval']`.

### Repo docs and manifests

- `HARNESSES.md` — new, the capability matrix above.
- `CLAUDE.md`
  - update structure docs to point to `source/skills/`
  - document generated output directories including `.agents/skills/`
- `AGENTS.md`
  - add repo instructions for OpenCode and Codex
  - note the orchestrator and eval are Claude-only
  - document the OpenCode dual-discovery behaviour (see below)
- `README.md`
  - add compatibility/install guidance with per-harness invocation examples
- `.claude-plugin/plugin.json`
  - bump version to `1.3.0`
- `.claude-plugin/marketplace.json`
  - bump matching version

## OpenCode install story

OpenCode reads both `.opencode/skills/` and `.claude/skills/`. In this repo, opening it directly in OpenCode would expose:

- `build` and `eval` from `.claude/skills/` (Claude-only, will misfire)
- duplicate `impl-plan`, `review-plan`, `verify`, `architect-review` from both directories

Decision: **the supported OpenCode consumption path is copying `.opencode/skills/` into a target project, not running OpenCode against this repo's root**. This repo is a distribution source, not an OpenCode workspace. This is documented in `README.md` and `AGENTS.md`.

If we later want this repo itself to be OpenCode-clean, options are:

- gate `.claude/skills/build` and `.claude/skills/eval` with Claude-only frontmatter OpenCode respects, or
- move Claude-only skills to a sibling path OpenCode does not scan.

Both are out of scope for this migration; flagged as follow-up.

## Codex discovery

Codex's documented repo-local discovery path is `.agents/skills/` (matches impeccable's layout). `.codex/skills/` is not a documented discovery path. The plan emits to `.agents/skills/` and drops `.codex/skills/`.

Codex plugin distribution (a real installable manifest) is out of scope. Users of this repo get Codex skills via the committed `.agents/skills/` tree.

## Implementation order

### Phase 1: Transformer foundation

1. Add `package.json` and the transformer scripts.
2. Implement provider config for Claude Code, OpenCode, and Codex including output paths, exclusions, and per-provider replacement strings.
3. Implement the three body-rewrite transforms.
4. Implement minimal frontmatter parse/emit logic.
5. Implement `build.js` and `check-sync.js`.

### Phase 2: Source migration

1. Create `source/skills/`.
2. Copy the current `.claude/skills/` tree into source.
3. Confirm all skill-local assets still resolve after the move.

### Phase 3: Build-specific rewriting

1. Verify every `$ARGUMENTS` occurrence in portable skills is handled by `argumentsToken`.
2. Verify every `/build:<name>` cross-reference in portable skills is handled by `skillReference`.
3. Exclude `build` and `eval` from OpenCode and Codex outputs.
4. Run the build. Spot-check each output file for grammatical prose (the non-Claude outputs should read as natural instructions, not templated placeholders).

### Phase 4: Docs and release metadata

1. Add `HARNESSES.md`.
2. Update `CLAUDE.md`.
3. Add `AGENTS.md`.
4. Update `README.md` with compatibility notes and the OpenCode install-story caveat.
5. Bump plugin versions.

## Expected output by provider

- `.claude/skills/`
  - `build`
  - `impl-plan`
  - `review-plan`
  - `architect-review`
  - `verify`
  - `eval`
- `.opencode/skills/`
  - `impl-plan`
  - `review-plan`
  - `architect-review`
  - `verify`
- `.agents/skills/`
  - `impl-plan`
  - `review-plan`
  - `architect-review`
  - `verify`

## Risks

1. Codex may evolve its discovery conventions; `.agents/skills/` is the current documented path and matches impeccable, but is worth re-checking before each release.
2. Frontmatter regeneration may create noisy diffs for existing Claude output on first build. Acceptable one-time cost.
3. `argumentsToken` prose may read awkwardly in some skills; spot-check after Phase 3.
4. OpenCode's dual-discovery of `.claude/skills/` means running OpenCode against this repo root will surface Claude-only skills. Mitigated by documenting that the supported OpenCode path is the extracted `.opencode/` bundle.
5. `eval` may rely on further Claude-specific assumptions that need to stay isolated.

## Verification

- `npm run build` exits 0.
- `npm run check-sync` exits 0 after a clean build.
- `.claude/skills/` remains behaviorally identical for Claude users (diff vs. pre-migration content should be empty or frontmatter-only).
- `.opencode/skills/` and `.agents/skills/` contain only the 4 portable sub-skills.
- No `$ARGUMENTS` literal and no `/build:` substring appears in any file under `.opencode/skills/` or `.agents/skills/`.
- Claude standalone checks still work for:
  - `/build:impl-plan`
  - `/build:review-plan`
  - `/build:verify`
  - `/build:architect-review`
- Sample orchestrator flow still works in Claude after regeneration.
- Manual smoke test: load one rewritten skill (e.g. `verify`) in OpenCode and in Codex and confirm invocation phrasing resolves.

## Out of scope

- Porting the `build` orchestrator to OpenCode or Codex.
- Making this repo itself runnable as an OpenCode workspace (distribution-only for OpenCode).
- Publishing a Codex plugin manifest.
- Publishing any shared transformer package.
- Adding other harnesses beyond Claude Code, OpenCode, and Codex.
