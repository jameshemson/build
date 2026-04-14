# Build Plugin

Claude Code plugin providing a structured build workflow: plan, review, implement, verify, architect review.

## Structure

- `.claude/skills/build/` - Orchestrator. Drives the full pipeline.
- `.claude/skills/impl-plan/` - Create implementation plans. Standalone or called by orchestrator.
- `.claude/skills/review-plan/` - Skeptical plan review. Standalone or called by orchestrator.
- `.claude/skills/architect-review/` - Post-implementation architect review. Standalone or called by orchestrator.
- `.claude/skills/verify/` - Evidence-before-claims verification gate. Standalone or called by orchestrator.

## Conventions

- Each skill has a SKILL.md with frontmatter (name, description, user-invocable, argument-hint, model, effort, context)
- Reference files go in `reference/` subdirectories within the skill that owns them
- Cross-skill references use the `/build:skillname` invocation format
- The orchestrator is the only skill that manages state files
- All skills must work both standalone and when called by the orchestrator

## Versioning

Version is in `.claude-plugin/plugin.json`. Bump the `version` field before pushing updates so `claude plugin add` detects the change.

## Testing

Test each skill standalone before testing the full orchestrator pipeline. See README.md for verification steps.
