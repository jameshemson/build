# build

A Claude Code plugin for structured software development. Plan before you build. Review before you ship. Verify before you claim.

## Skills

| Skill | What it does |
|-------|-------------|
| `/build` | Orchestrates the full workflow: plan, review, implement, verify, architect review |
| `/build:impl-plan` | Creates a detailed implementation plan by reading the codebase first |
| `/build:review-plan` | Reviews a plan as a skeptical senior engineer with severity-tagged findings |
| `/build:architect-review` | Principal architect review of completed work with structured verdict |
| `/build:verify` | Runs tests, build, type checks and reports actual evidence |

Every skill works standalone. Run `/build:impl-plan add user authentication` without the full pipeline. Or run `/build add user authentication` to get the complete workflow.

## Install

```
claude plugin add jameshemson/build
```

## How it works

`/build` drives a 5-phase cycle:

1. **Plan** - Read the codebase, create an implementation plan with parallel workstreams
2. **Review** - Skeptical senior engineer review catches gaps before you start building
3. **Implement** - Parallel agents in isolated worktrees, with mid-reviews for complex changes
4. **Verify** - Run tests, build, type checks. Show evidence, not assumptions.
5. **Architect Review** - Principal architect review of the finished work

The orchestrator manages state, auto-continues between phases, and deploys agents with model-appropriate assignments. You give it a feature description; it builds it.

## Standalone use

Each skill is useful on its own:

- `/build:impl-plan refactor the payment flow` - Get a thorough plan without building anything
- `/build:review-plan` - Review any plan, not just ones from this plugin
- `/build:verify` - Check if your code actually works before claiming it does
- `/build:architect-review` - Get an architect's perspective on any completed work

## Roadmap

- **v1.1** - Spec compliance checks per workstream, retrospective/rethink gate for structural problems

## License

MIT
