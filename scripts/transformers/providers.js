// Shared rewrite config for both Codex outputs. `codex` (repo-local discovery
// at .agents/skills/) and `codex-plugin` (Codex Plugins UI packaging at
// plugins/build/skills/) MUST produce byte-identical skill output. This is
// enforced by the sandbox byte-equality test in builder.test.js.
//
// NOTE: if any future change adds provider-specific branching (in
// filterFrontmatter, applyBodyRewrites, or elsewhere), the branch must match
// BOTH codex provider names — e.g. `provider.startsWith('codex')` — or the
// byte-equality contract will silently break.
const codexRewrites = {
  argumentsStandalone: '*(Treat the user\'s message that invoked this skill as the task input.)*',
  argumentsInline: "the user's request",
  // Codex invokes skills via `$skill <name>` or `/skills`.
  skillRef: (name) => `\`${name}\` (via \`$skill ${name}\` or \`/skills\`)`,
};

export const PROVIDERS = {
  claude: {
    outputDir: '.claude/skills',
    exclude: [],
    rewrites: null,
  },
  opencode: {
    outputDir: '.opencode/skills',
    exclude: ['build', 'eval'],
    rewrites: {
      argumentsStandalone: '*(Treat the user\'s message that invoked this skill as the task input.)*',
      argumentsInline: "the user's request",
      // OpenCode invokes skills via the built-in skill tool.
      skillRef: (name) => `\`${name}\` (via the skill tool)`,
    },
  },
  codex: {
    outputDir: '.agents/skills',
    exclude: ['build', 'eval'],
    rewrites: codexRewrites,
  },
  'codex-plugin': {
    outputDir: 'plugins/build/skills',
    exclude: ['build', 'eval'],
    rewrites: codexRewrites,
  },
};
