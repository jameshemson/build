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
    rewrites: {
      argumentsStandalone: '*(Treat the user\'s message that invoked this skill as the task input.)*',
      argumentsInline: "the user's request",
      // Codex invokes skills via `$skill <name>` or `/skills`.
      skillRef: (name) => `\`${name}\` (via \`$skill ${name}\` or \`/skills\`)`,
    },
  },
};
