// Shared rewrite config for all three Codex outputs. `codex` (repo-local
// discovery at .agents/skills/), `codex-plugin` (Codex Plugins UI packaging
// at plugins/build/skills/), and `codex-cross` (cross-harness bridge at
// .codex/skills/ — tools like Cursor cross-read this path) MUST produce
// byte-identical skill output. This is enforced by the sandbox byte-equality
// test in builder.test.js.
//
// NOTE: if any future change adds provider-specific branching (in
// filterFrontmatter, applyBodyRewrites, or elsewhere), the branch must match
// ALL THREE codex provider names — e.g. `provider.startsWith('codex')` — or
// the byte-equality contract will silently break.
const codexRewrites = {
  argumentsStandalone: '*(Treat the user\'s message that invoked this skill as the task input.)*',
  argumentsInline: "the user's request",
  // Codex invokes skills via `$skill <name>` or `/skills`.
  skillRef: (name) => `\`${name}\` (via \`$skill ${name}\` or \`/skills\`)`,
};

const defaultSkillEntrypoint = {
  default: 'SKILL.md',
};

const codexSkillEntrypoint = {
  ...defaultSkillEntrypoint,
  variant: 'SKILL.codex.md',
};

// Every Codex-family output selects the same source entrypoint and applies
// the same rewrites. Skills without a Codex variant fall back to SKILL.md.
const codexSkillConfig = {
  exclude: ['eval'],
  entrypoint: codexSkillEntrypoint,
  rewrites: codexRewrites,
};

export const PROVIDERS = {
  claude: {
    outputDir: '.claude/skills',
    exclude: [],
    entrypoint: defaultSkillEntrypoint,
    rewrites: null,
  },
  opencode: {
    outputDir: '.opencode/skills',
    exclude: ['build', 'eval'],
    entrypoint: defaultSkillEntrypoint,
    rewrites: {
      argumentsStandalone: '*(Treat the user\'s message that invoked this skill as the task input.)*',
      argumentsInline: "the user's request",
      // OpenCode invokes skills via the built-in skill tool.
      skillRef: (name) => `\`${name}\` (via the skill tool)`,
    },
  },
  codex: {
    outputDir: '.agents/skills',
    ...codexSkillConfig,
  },
  'codex-plugin': {
    outputDir: 'plugins/build/skills',
    ...codexSkillConfig,
  },
  'codex-cross': {
    outputDir: '.codex/skills',
    ...codexSkillConfig,
  },
};

export const COMMAND_PROVIDERS = {
  opencode: {
    outputDir: '.opencode/commands',
    rewrites: null,
  },
};
