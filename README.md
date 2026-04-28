# build

A structured build workflow for Claude Code (and four portable skills for OpenCode and Codex). Plan before you build, review before you ship, verify before you claim.

## Skills

| Skill | What it does |
|-------|-------------|
| `/build` | Orchestrates the full workflow: plan, review, implement, verify, architect review |
| `/build:impl-plan` | Creates a detailed implementation plan by reading the codebase first |
| `/build:review-plan` | Reviews a plan as a skeptical senior engineer with severity-tagged findings |
| `/build:architect-review` | Principal architect review of completed work across 10 lenses with structured verdict |
| `/build:verify` | Runs tests, build, type checks and reports actual evidence |
| `/build:eval` | Runs test cases against build skills, grades outputs against assertions |

Every skill works standalone. Run `/build:impl-plan add user authentication` without the full pipeline. Or run `/build add user authentication` to get the complete workflow.

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

Four skills are available in OpenCode and Codex: `impl-plan`, `review-plan`, `verify`, and `architect-review`. The `build` orchestrator and `eval` runner are Claude Code only (they depend on sub-agent spawning and Task tools not available elsewhere).

## Compatibility

| Skill | Claude Code | OpenCode | Codex |
|-------|:-----------:|:--------:|:-----:|
| `build` (orchestrator) | ✓ | — | — |
| `impl-plan` | ✓ | ✓ | ✓ |
| `review-plan` | ✓ | ✓ | ✓ |
| `verify` | ✓ | ✓ | ✓ |
| `architect-review` | ✓ | ✓ | ✓ |
| `eval` | ✓ | — | — |

See [HARNESSES.md](HARNESSES.md) for the full capability matrix and install story.

## How it works (Claude Code)

`/build` drives a 5-phase cycle:

1. **Plan** (Opus) - Read the codebase, choose a discovery level, create `REQ-*`/`D-*` inventories, define Wave 0 validation, and emit an `execution_manifest` with `wave`, `depends_on`, `files_modified`, `must_haves`, `verify`, and `done`
2. **Review** (Sonnet, forked context) - Adversarial senior engineer review: placeholder scan, workstream independence check, requirement/decision coverage, wave graph validation, test coverage mapping
3. **Implement** - Parallel agents in isolated worktrees, routed by the manifest when available, with mid-reviews for complex changes. Agents report SCOPE_CHANGE to stop work against broken plans. Circuit breakers prevent runaway retries.
4. **Verify** - Run tests, build, type checks, and plan-declared verification commands. Requirement coverage and missing `must_haves` evidence are reported explicitly. No claims without fresh output.
5. **Architect Review** (Opus, forked context) - 10-lens review: correctness, trade-offs, anti-patterns, consistency, non-functional, edge cases, overengineering, plan fidelity, weak-test audit, dependency audit

The orchestrator manages state, auto-continues between phases, and deploys model-appropriate agents. It resolves merge conflicts through a structured protocol. Give it a feature description; it builds it.

`/build` is file-backed. Each workflow writes durable artifacts under `.build/plans/` so later phases and fresh agents do not depend on chat history alone:

- `{slug}-state.md` - current phase, `base_ref`, task IDs, completed tasks, blockers, history
- `{slug}-context.md` - repo conventions, user constraints, discovered patterns, assumptions, out-of-scope notes
- `{slug}-requirements.md` - canonical requirements, decisions, assumptions, acceptance criteria, `must_haves`
- `{slug}-plan.md` - full implementation plan plus execution manifest
- `{slug}-review.md` - plan review findings and verdict
- `{slug}-implementation-summary.md` - completed waves, files changed, deviations, blockers
- `{slug}-verify.md` - command evidence, requirement coverage, verification verdict
- `{slug}-architect-review.md` - final architecture review findings and verdict

Skill prompts are intentionally kept compact. Detailed planning rules live in reference files, and `npm test` enforces hard line ceilings for the main skill prompts.

Generated skill outputs are committed artifacts. When changing `source/skills/`, run `npm run build` and commit the source changes, regenerated provider outputs, and any test updates together. `npm run check-sync` intentionally fails on an uncommitted source/output change set because it compares generated outputs against git.

## Standalone use

Each skill is useful on its own:

- `/build:impl-plan refactor the payment flow` - Get a thorough plan without building anything
- `/build:review-plan` - Review any plan, not just ones from this plugin
- `/build:verify` - Check if your code works before claiming it does
- `/build:architect-review` - Get an architect's perspective on any completed work

## Standalone model enforcement

Each skill sets its own model for standalone runs:

| Skill | Model | Effort | Context |
|-------|-------|--------|---------|
| `/build:impl-plan` | Opus | High | inherited |
| `/build:review-plan` | Sonnet | default | fork |
| `/build:architect-review` | Opus | High | fork |
| `/build:verify` | inherited | inherited | inherited |

The orchestrator's agent parameters take precedence over skill frontmatter.

## License

MIT
