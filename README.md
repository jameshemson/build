# build

A Claude Code plugin for structured software development. Plan before you build, review before you ship, verify before you claim.

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

```
claude plugin add jameshemson/build
```

## How it works

`/build` drives a 5-phase cycle:

1. **Plan** (Opus) - Read the codebase, create an implementation plan with parallel workstreams, observability requirements, and dependency audit
2. **Review** (Sonnet, forked context) - Adversarial senior engineer review: placeholder scan, workstream independence check, test coverage mapping
3. **Implement** - Parallel agents in isolated worktrees, with mid-reviews for complex changes. Agents report SCOPE_CHANGE to stop work against broken plans. Circuit breakers prevent runaway retries.
4. **Verify** - Run tests, build, type checks. Security-specific evidence for auth, injection, secrets, CSRF. No claims without fresh output.
5. **Architect Review** (Opus, forked context) - 10-lens review: correctness, trade-offs, anti-patterns, consistency, non-functional, edge cases, overengineering, plan fidelity, test quality, dependency audit

The orchestrator manages state, auto-continues between phases, and deploys model-appropriate agents. It resolves merge conflicts through a structured protocol. Give it a feature description; it builds it.

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

## Roadmap

- **v1.3** - Workflow memory: pattern extraction at completion, pattern surfacing at plan phase

## License

MIT
