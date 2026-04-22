# Build Plugin

Claude Code plugin providing a structured build workflow: plan, review, implement, verify, architect review.

## Structure

### Source (single source of truth)

- `source/skills/` — all skill source files. Edit here, not in the generated output directories.

### Generated output (committed, do not edit directly)

- `.claude/skills/` — Claude Code output. Identity transform; source is emitted as-is.
  - `build/` — Orchestrator. Drives the full pipeline. Claude-only.
  - `impl-plan/` — Create implementation plans. Standalone or called by orchestrator.
  - `review-plan/` — Skeptical plan review. Standalone or called by orchestrator.
  - `architect-review/` — Post-implementation architect review. Standalone or called by orchestrator.
  - `verify/` — Evidence-before-claims verification gate. Standalone or called by orchestrator.
  - `eval/` — Eval runner. Tests skills against defined test cases with assertions. Claude-only.
- `.opencode/skills/` — OpenCode output. Contains only the 4 portable skills (impl-plan, review-plan, verify, architect-review). Claude-only fields stripped, $ARGUMENTS and /build: references rewritten.
- `.agents/skills/` — Codex output. Same 4 portable skills. Same transforms as OpenCode.

## Conventions

- Each skill has a SKILL.md with frontmatter (name, description, user-invocable, argument-hint, model, effort, context)
- Reference files go in `reference/` subdirectories within the skill that owns them
- Cross-skill references use the `/build:skillname` invocation format (Claude syntax; transformer rewrites for other harnesses)
- The orchestrator is the only skill that manages state files
- All portable skills must work both standalone and when called by the orchestrator

## Build pipeline

```
npm run build       # regenerate all output directories from source/skills/
npm run check-sync  # build and verify outputs match what is committed
```

Transformer scripts live in `scripts/`. Harness capability details and transform rules are in `HARNESSES.md`.

## Versioning

Version is in `.claude-plugin/plugin.json`. Bump the `version` field before pushing updates so `claude plugin add` detects the change.

## Testing

Test each skill standalone before testing the full orchestrator pipeline. See README.md for verification steps.

After any source change, run `npm run build` before committing.
