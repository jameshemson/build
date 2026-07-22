import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  rmSync,
  statSync,
  readdirSync,
  cpSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { buildProvider, build, buildCommandProvider, buildCommands } from './builder.js';
import { PROVIDERS as REAL_PROVIDERS, COMMAND_PROVIDERS as REAL_COMMAND_PROVIDERS } from './providers.js';
import { transform } from './transform.js';
import { ROOT } from './utils.js';

const PROVIDERS = {
  claude: { outputDir: '.claude/skills', exclude: [], rewrites: null },
  opencode: {
    outputDir: '.opencode/skills',
    exclude: ['private'],
    rewrites: {
      argumentsStandalone: '*(user input)*',
      argumentsInline: "user input",
      skillRef: (name) => `\`${name}\``,
    },
  },
};

const GENERATED_BUILD_BOUNDED_EVIDENCE_BASE_CLAUSES = [
  ['least-expansive interpretation', ['least-expansive reasonable interpretation']],
  ['material-delta investigation gate', [
    'investigate uncertainty only when',
    'materially change',
    'requested outcome',
    'scope',
    'authority',
    'significant risk',
  ]],
  ['evidence consequence and fix finding gate', [
    'report a finding only when',
    'evidence',
    'plausible material consequence',
    'specific in-scope fix',
  ]],
  ['claim-sized fresh evidence', ['smallest sufficient fresh evidence', 'claims actually made']],
  ['material completion stop', [
    'stop when',
    'requested outcome exists',
    'required direct verification passes',
    'nothing unresolved can materially change the result',
  ]],
];

function generatedBuildBoundedEvidenceClauses(providerName) {
  const finalVerificationPhase = providerName === 'claude' ? 'phase 3c' : 'phase 4';
  return [
    ...GENERATED_BUILD_BOUNDED_EVIDENCE_BASE_CLAUSES,
    [`${finalVerificationPhase} boundedness mandatory-authority exception`, [
      'boundedness never skips',
      'required phases',
      'worker',
      'integration',
      'slice',
      'final authorities',
      'exactly one fresh final ledger',
      finalVerificationPhase,
      'receipt judgment',
      'safety',
      'security',
      'data rigor',
      'scope change',
      'user-only decisions',
    ]],
  ];
}

const GENERATED_FINDING_AND_STOP_CLAUSES = [
  ['evidence consequence and fix finding gate', [
    'report a finding only when',
    'evidence',
    'plausible material consequence',
    'specific in-scope fix',
  ]],
  ['material review stop', ['stop after', 'required coverage', 'no unresolved material issue']],
];

const GENERATED_PORTABLE_BOUNDED_EVIDENCE_CLAUSES = {
  'impl-plan': [
    ['least-expansive interpretation', ['least-expansive reasonable interpretation']],
    ['material-delta discovery gate', [
      'investigate uncertainty only when',
      'materially change',
      'requested outcome',
      'scope',
      'authority',
      'significant risk',
    ]],
    ['sufficient planning evidence stop', [
      'stop discovery when enough evidence maps',
      'requirements',
      'files',
      'risks',
      'acceptance',
      'exact verification',
    ]],
  ],
  'review-plan': GENERATED_FINDING_AND_STOP_CLAUSES,
  verify: [
    ['claim-sized fresh evidence', ['smallest sufficient fresh evidence', 'claims actually made']],
    ['candidate collection before selection', [
      'collect every command candidate before executing anything',
    ]],
    ['same-claim same-authority duplicate definition', [
      'duplicate only when',
      'same claim',
      'same lifecycle authority',
    ]],
    ['identical exact-command union', [
      'union candidates with identical exact command strings',
      'categories',
      'task ids',
      'requirements',
      'must_haves',
    ]],
    ['distinct mandatory lifecycle coverage', [
      'worker, integration, slice, and final gates',
      'prove distinct claims',
      'remain mandatory',
      'preserve commands required by those distinct lifecycle claims',
      'plan- or repository-required categories',
    ]],
    ['smallest claim-covering ledger selection', [
      'within one authority',
      'select the smallest claim-covering ledger',
      'narrowest direct command',
    ]],
    ['overlapping non-identical candidate exclusion', [
      'exclude an overlapping non-identical candidate',
      'no unique required claim or category',
    ]],
    ['execute selected entries once', ['run each selected exact command once']],
    ['single phase-neutral final fresh full suite', [
      'final verification authority owns exactly one fresh full suite',
    ]],
    ['selected fresh direct coverage stop', ['stop after selected fresh direct coverage']],
  ],
  'architect-review': GENERATED_FINDING_AND_STOP_CLAUSES,
};

const GENERATED_BOUNDED_EVIDENCE_MAX_SPAN = 900;

let sandbox;

beforeEach(() => {
  sandbox = join(
    tmpdir(),
    `builder-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(sandbox, { recursive: true });
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

function writeSource(relPath, content) {
  const full = join(sandbox, 'source/skills', relPath);
  mkdirSync(full.replace(/\/[^/]+$/, ''), { recursive: true });
  writeFileSync(full, content, 'utf8');
}

function writeOutput(relPath, content) {
  const full = join(sandbox, relPath);
  mkdirSync(full.replace(/\/[^/]+$/, ''), { recursive: true });
  writeFileSync(full, content, 'utf8');
}

function runBuild() {
  build({
    root: sandbox,
    sourceDir: join(sandbox, 'source/skills'),
    providers: PROVIDERS,
  });
}

function walkFiles(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(p, acc);
    else if (entry.isFile()) acc.push(p);
  }
  return acc;
}

function assertProviderOutput({ providerName, config, sourceDir }) {
  const outDir = join(sandbox, config.outputDir);
  const sourceSkills = readdirSync(sourceDir)
    .filter((skillName) => {
      const sourceSkillDir = join(sourceDir, skillName);
      return statSync(sourceSkillDir).isDirectory() && !config.exclude.includes(skillName);
    })
    .sort();
  const emittedSkills = readdirSync(outDir).sort();

  assert.deepEqual(
    emittedSkills,
    sourceSkills,
    `${providerName}: emitted skills ${JSON.stringify(emittedSkills)} != expected ${JSON.stringify(sourceSkills)}`,
  );

  for (const skillName of sourceSkills) {
    const sourceSkillDir = join(sourceDir, skillName);
    const defaultEntrypoint = typeof config.entrypoint === 'object'
      ? config.entrypoint.default ?? 'SKILL.md'
      : 'SKILL.md';
    const variantEntrypoint = typeof config.entrypoint === 'object'
      ? config.entrypoint.variant
      : config.entrypoint;
    const configuredEntrypoint = variantEntrypoint
      ? join(sourceSkillDir, variantEntrypoint)
      : null;
    const selectedEntrypoint = configuredEntrypoint && existsSync(configuredEntrypoint)
      ? configuredEntrypoint
      : join(sourceSkillDir, defaultEntrypoint);
    const outputSkillDir = join(outDir, skillName);
    const leakedVariants = readdirSync(outputSkillDir)
      .filter((entry) => /^SKILL\.[^/\\]+\.md$/.test(entry));

    assert.deepEqual(
      leakedVariants,
      [],
      `${providerName}: variant entrypoint leaked for ${skillName}: ${JSON.stringify(leakedVariants)}`,
    );

    const expected = transform(readFileSync(selectedEntrypoint, 'utf8'), providerName, config);
    const actual = readFileSync(join(outputSkillDir, 'SKILL.md'), 'utf8');
    assert.equal(
      actual,
      expected,
      `${providerName}: selected entrypoint content mismatch for ${skillName}`,
    );
  }

  if (config.rewrites) {
    for (const file of walkFiles(outDir).filter((path) => path.endsWith('.md'))) {
      const body = readFileSync(file, 'utf8');
      assert.ok(!body.includes('$ARGUMENTS'), `${providerName}: $ARGUMENTS leaked into ${file}`);
      assert.ok(
        !/\/build:[a-z-]+/.test(body),
        `${providerName}: /build: reference leaked into ${file}`,
      );
      assert.ok(
        !body.includes('<!-- claude-only'),
        `${providerName}: <!-- claude-only --> block leaked into ${file}`,
      );
    }
  }
}

function readSandboxSkill(config, skillName, relPath = 'SKILL.md') {
  return readFileSync(join(sandbox, config.outputDir, skillName, relPath), 'utf8');
}

function assertGeneratedBuildDeliverySlices(content, providerName) {
  for (const field of [
    'delivery_slices: []', 'active_slice: null', 'completed_slices: []',
    'checkpoint_commits: []', 'transition_references: []', 'counter_events: []',
  ]) {
    assert.ok(content.includes(field), `${providerName}: generated build output missing ${field}`);
  }
  assert.match(
    content,
    /(?:route only task IDs in `active_slice\.task_ids`|Only the `active_slice` task IDs and their workstream batches may dispatch)/,
    `${providerName}: generated build output must dispatch only the active slice`,
  );
  const normalized = content.replace(/\s+/g, ' ');
  const checkpoint = normalized.indexOf('checkpoint commit');
  const evidence = normalized.indexOf('post-checkpoint `run-evidence`', checkpoint);
  const completion = normalized.indexOf('`complete-slice`', evidence);
  const activation = normalized.indexOf('activate the next', completion);
  assert.ok(
    checkpoint >= 0 && evidence > checkpoint && completion > evidence && activation > completion,
    `${providerName}: generated build output must authorize completion before activating the next slice`,
  );
  assert.match(
    content,
    /fresh whole-workflow (?:evidence|authority)/,
    `${providerName}: generated build output must retain fresh whole-workflow final authority`,
  );
}

function assertGeneratedPortableDeliverySlices(config, providerName) {
  const planner = readSandboxSkill(config, 'impl-plan');
  const quality = readSandboxSkill(config, 'impl-plan', 'reference/plan-quality.md');
  const reviewer = readSandboxSkill(config, 'review-plan');

  assert.match(planner, /delivery_slices:/, `${providerName}: planner missing delivery_slices schema`);
  assert.match(
    planner,
    /Each `S-###` entry has exactly `id`, `goal`, `depends_on`, `task_ids`, `requirements`, `must_haves`, `verify`, and `done`/,
    `${providerName}: planner missing exact delivery-slice fields`,
  );
  assert.match(
    planner,
    /delivery slice → dependency waves → disjoint workstreams → `execution_manifest` tasks/,
    `${providerName}: planner missing delivery-slice hierarchy`,
  );

  assert.match(
    quality,
    /Each entry has exactly `id`, `goal`, `depends_on`, `task_ids`, `requirements`, `must_haves`, `verify`, and `done`/,
    `${providerName}: plan-quality missing exact delivery-slice fields`,
  );
  assert.match(
    quality,
    /delivery slice → dependency waves → disjoint workstreams → execution-manifest tasks/,
    `${providerName}: plan-quality missing delivery-slice hierarchy`,
  );
  assert.match(
    quality,
    /foundation-only slice is valid only when/,
    `${providerName}: plan-quality missing foundation-slice boundary`,
  );

  assert.match(
    reviewer,
    /Every slice must contain exactly these eight fields/,
    `${providerName}: reviewer missing exact slice-schema review`,
  );
  assert.match(
    reviewer,
    /Preserve the hierarchy `delivery slice -> waves -> workstreams -> tasks`/,
    `${providerName}: reviewer missing hierarchy enforcement`,
  );
  assert.match(
    reviewer,
    /unsafe hierarchy or membership is \*\*Critical\*\*/,
    `${providerName}: reviewer missing unsafe-membership severity`,
  );
  assert.match(
    reviewer,
    /Forward references and cycles are \*\*Critical\*\*/,
    `${providerName}: reviewer missing slice-dependency enforcement`,
  );
  assert.match(
    reviewer,
    /foundation-only slice is justified only when/,
    `${providerName}: reviewer missing foundation-slice review`,
  );
}

function assertGeneratedTypedEvidence(config, providerName) {
  const planner = readSandboxSkill(config, 'impl-plan');
  const quality = readSandboxSkill(config, 'impl-plan', 'reference/plan-quality.md');
  const reviewer = readSandboxSkill(config, 'review-plan');
  const verifier = readSandboxSkill(config, 'verify');
  const evidence = readSandboxSkill(config, 'verify', 'reference/evidence-requirements.md');

  assert.match(planner, /evidence_mode: typed/, `${providerName}: planner missing typed mode`);
  assert.match(planner, /bindings/, `${providerName}: planner missing bindings`);
  assert.match(planner, /behavioral-test[\s\S]*command-assertion[\s\S]*structural[\s\S]*manual-receipt/, `${providerName}: planner missing evidence kinds`);
  assert.match(quality, /Every named symbol, behavior, and invariant in Approach/, `${providerName}: quality rules missing binding coverage`);
  assert.match(reviewer, /unbound Approach obligation is \*\*Important\*\*/, `${providerName}: reviewer missing unbound-obligation gate`);
  assert.match(reviewer, /non-atomic task is \*\*Important\*\*/, `${providerName}: reviewer missing evidence-atomicity gate`);
  assert.match(verifier, /Structural evidence never proves behavior/, `${providerName}: verifier missing structural boundary`);
  assert.match(evidence, /Missing or mismatched behavioral evidence is `PARTIAL` unless a command fails/, `${providerName}: evidence reference missing PARTIAL rule`);
}

function assertGeneratedCodexExecutionProfile(content, providerName) {
  assert.match(content, /Build-default Plan, Implement, and Architect Review run inline in root/,
    `${providerName}: generated Build missing inline phase authority`);
  assert.match(content, /Plan Review and Verify use fresh-context agents/,
    `${providerName}: generated Build missing fresh-context boundaries`);
  assert.match(content, /Silence is unknown, not failure evidence/,
    `${providerName}: generated Build missing terminal-only supervision`);
  assert.match(content, /20-minute hard deadline/,
    `${providerName}: generated Build missing fresh-agent deadline`);
  assert.match(content, /literal `active-session`/,
    `${providerName}: generated Build missing inline route disclosure`);
  assert.doesNotMatch(content, /evidence_free_checks|deadline_status_requested_at|exactly one 60-second grace interval/,
    `${providerName}: generated Build retained obsolete polling bookkeeping`);
}

function assertGeneratedBoundedEvidenceClauses(content, clauses, context) {
  const normalized = content.replace(/\s+/g, ' ').trim().toLowerCase();
  let clauseCursor = -1;
  for (const [name, tokens] of clauses) {
    let cursor = clauseCursor;
    let first = -1;
    let lastEnd = -1;
    for (const token of tokens) {
      const next = normalized.indexOf(token, cursor + 1);
      assert.ok(next >= 0, `${context}: missing ${name}: ${JSON.stringify(token)}`);
      if (first < 0) first = next;
      cursor = next;
      lastEnd = next + token.length;
    }
    assert.ok(
      lastEnd - first <= GENERATED_BOUNDED_EVIDENCE_MAX_SPAN,
      `${context}: unbounded ${name} clause`,
    );
    clauseCursor = lastEnd;
  }
}

function assertGeneratedPortableBoundedEvidence(config, providerName) {
  for (const [skillName, clauses] of Object.entries(
    GENERATED_PORTABLE_BOUNDED_EVIDENCE_CLAUSES,
  )) {
    assertGeneratedBoundedEvidenceClauses(
      readSandboxSkill(config, skillName),
      clauses,
      `${providerName}: generated ${skillName}`,
    );
  }
}

function assertGeneratedBuildBoundedEvidence(content, providerName) {
  assertGeneratedBoundedEvidenceClauses(
    content,
    generatedBuildBoundedEvidenceClauses(providerName),
    `${providerName}: generated build`,
  );
}

function writeCodexFamilyFixture() {
  const sample = [
    '---',
    'name: portable',
    'description: fixture',
    '---',
    '',
    '$ARGUMENTS',
    '',
    'See also $ARGUMENTS and /build:verify.',
    '',
  ].join('\n');
  const names = ['architect-review', 'build', 'impl-plan', 'review-plan', 'verify'];
  for (const name of names) writeSource(`${name}/SKILL.md`, sample);
  writeSource(
    'build/SKILL.codex.md',
    sample.replace('description: fixture', 'description: codex fixture'),
  );
  writeSource('build/SKILL.future.md', sample.replace('description: fixture', 'description: future'));
  return names;
}

function assertCodexFamilyConfigIdentity() {
  for (const providerName of ['codex-plugin', 'codex-cross']) {
    assert.strictEqual(
      REAL_PROVIDERS[providerName].entrypoint,
      REAL_PROVIDERS.codex.entrypoint,
      `${providerName}: entrypoint config must be shared with codex`,
    );
    assert.strictEqual(
      REAL_PROVIDERS[providerName].rewrites,
      REAL_PROVIDERS.codex.rewrites,
      `${providerName}: rewrite config must be shared with codex`,
    );
  }
}

function buildCodexFamilyFixture() {
  for (const providerName of ['codex', 'codex-plugin', 'codex-cross']) {
    buildProvider({
      root: sandbox,
      sourceDir: join(sandbox, 'source/skills'),
      providerName,
      config: REAL_PROVIDERS[providerName],
    });
  }
}

function assertCodexFamilyOutputs(names) {
  for (const name of names) {
    const agents = readFileSync(join(sandbox, '.agents/skills', name, 'SKILL.md'), 'utf8');
    const plugin = readFileSync(join(sandbox, 'plugins/build/skills', name, 'SKILL.md'), 'utf8');
    const cross = readFileSync(join(sandbox, '.codex/skills', name, 'SKILL.md'), 'utf8');
    assert.equal(plugin, agents, `Divergence in ${name}/SKILL.md between codex and codex-plugin`);
    assert.equal(cross, agents, `Divergence in ${name}/SKILL.md between codex and codex-cross`);
  }
  assert.match(
    readFileSync(join(sandbox, '.agents/skills/build/SKILL.md'), 'utf8'),
    /description: codex fixture/,
  );
  for (const config of [
    REAL_PROVIDERS.codex,
    REAL_PROVIDERS['codex-plugin'],
    REAL_PROVIDERS['codex-cross'],
  ]) {
    assert.ok(!existsSync(join(sandbox, config.outputDir, 'build/SKILL.codex.md')));
    assert.ok(!existsSync(join(sandbox, config.outputDir, 'build/SKILL.future.md')));
  }
}

test('fresh build: emits skills to each provider output', () => {
  writeSource('alpha/SKILL.md', '---\nname: alpha\ndescription: A\n---\nbody');
  runBuild();
  assert.ok(existsSync(join(sandbox, '.claude/skills/alpha/SKILL.md')));
  assert.ok(existsSync(join(sandbox, '.opencode/skills/alpha/SKILL.md')));
});

test('stale files are swept on rebuild', () => {
  writeSource('alpha/SKILL.md', '---\nname: alpha\ndescription: A\n---\nbody');
  runBuild();

  // Inject a stale file into each output tree (simulating a renamed skill).
  writeOutput('.claude/skills/alpha/stale.md', 'ghost');
  writeOutput('.opencode/skills/alpha/stale.md', 'ghost');
  assert.ok(existsSync(join(sandbox, '.claude/skills/alpha/stale.md')));

  runBuild();

  assert.ok(!existsSync(join(sandbox, '.claude/skills/alpha/stale.md')));
  assert.ok(!existsSync(join(sandbox, '.opencode/skills/alpha/stale.md')));
  assert.ok(existsSync(join(sandbox, '.claude/skills/alpha/SKILL.md')));
});

test('pre-existing output directories are preserved (never rm-ed)', () => {
  writeSource('alpha/SKILL.md', '---\nname: alpha\ndescription: A\n---\nbody');

  // Simulate a "hot" Codex/editor state: the directory already exists with a
  // stat record we can fingerprint. If the builder rm-d the directory we'd
  // get a new inode.
  mkdirSync(join(sandbox, '.opencode/skills/alpha'), { recursive: true });
  const beforeInode = statSync(join(sandbox, '.opencode/skills/alpha')).ino;

  runBuild();

  const afterInode = statSync(join(sandbox, '.opencode/skills/alpha')).ino;
  assert.equal(
    afterInode,
    beforeInode,
    'output skill directory inode changed — the directory was deleted and recreated',
  );
});

test('output root directory inode is preserved across rebuilds', () => {
  writeSource('alpha/SKILL.md', '---\nname: alpha\ndescription: A\n---\nbody');
  runBuild();
  const beforeInode = statSync(join(sandbox, '.opencode/skills')).ino;
  runBuild();
  const afterInode = statSync(join(sandbox, '.opencode/skills')).ino;
  assert.equal(
    afterInode,
    beforeInode,
    'output root inode changed — root was rm-d and recreated',
  );
});

test('excluded skill does not appear in provider output', () => {
  writeSource('alpha/SKILL.md', '---\nname: alpha\ndescription: A\n---\nbody');
  writeSource('private/SKILL.md', '---\nname: private\ndescription: p\n---\nx');
  runBuild();
  assert.ok(existsSync(join(sandbox, '.claude/skills/private/SKILL.md')));
  assert.ok(!existsSync(join(sandbox, '.opencode/skills/private/SKILL.md')));
});

test('renamed skill: old files removed, new files emitted', () => {
  writeSource('old-name/SKILL.md', '---\nname: old-name\ndescription: x\n---\nbody');
  runBuild();
  assert.ok(existsSync(join(sandbox, '.claude/skills/old-name/SKILL.md')));

  // Rename in source
  rmSync(join(sandbox, 'source/skills/old-name'), { recursive: true, force: true });
  writeSource('new-name/SKILL.md', '---\nname: new-name\ndescription: x\n---\nbody');

  runBuild();

  assert.ok(existsSync(join(sandbox, '.claude/skills/new-name/SKILL.md')));
  assert.ok(!existsSync(join(sandbox, '.claude/skills/old-name/SKILL.md')));
});

test('nested reference files copy through unchanged for identity provider', () => {
  writeSource('alpha/SKILL.md', '---\nname: alpha\ndescription: A\n---\nbody');
  writeSource('alpha/reference/notes.md', '# notes body');
  runBuild();
  const notes = readFileSync(
    join(sandbox, '.claude/skills/alpha/reference/notes.md'),
    'utf8',
  );
  assert.equal(notes, '# notes body');
});

test('provider entrypoint variant is selected as SKILL.md and all variants are suppressed', () => {
  writeSource('alpha/SKILL.md', '---\nname: alpha\ndescription: default\n---\nclaude body');
  writeSource('alpha/SKILL.codex.md', '---\nname: alpha\ndescription: codex\n---\ncodex body');
  writeSource('alpha/SKILL.future.md', '---\nname: alpha\ndescription: future\n---\nfuture body');

  for (const providerName of ['claude', 'opencode', 'codex']) {
    buildProvider({
      root: sandbox,
      sourceDir: join(sandbox, 'source/skills'),
      providerName,
      config: REAL_PROVIDERS[providerName],
    });
  }
  buildProvider({
    root: sandbox,
    sourceDir: join(sandbox, 'source/skills'),
    providerName: 'claude',
    config: {
      ...REAL_PROVIDERS.claude,
      outputDir: '.future/skills',
      entrypoint: { default: 'SKILL.md', variant: 'SKILL.future.md' },
    },
  });

  assert.match(
    readFileSync(join(sandbox, '.claude/skills/alpha/SKILL.md'), 'utf8'),
    /claude body/,
  );
  assert.match(
    readFileSync(join(sandbox, '.opencode/skills/alpha/SKILL.md'), 'utf8'),
    /claude body/,
  );
  assert.match(
    readFileSync(join(sandbox, '.agents/skills/alpha/SKILL.md'), 'utf8'),
    /codex body/,
  );
  assert.match(
    readFileSync(join(sandbox, '.future/skills/alpha/SKILL.md'), 'utf8'),
    /future body/,
  );

  for (const outputDir of [
    '.claude/skills',
    '.opencode/skills',
    '.agents/skills',
    '.future/skills',
  ]) {
    assert.ok(!existsSync(join(sandbox, outputDir, 'alpha/SKILL.codex.md')));
    assert.ok(!existsSync(join(sandbox, outputDir, 'alpha/SKILL.future.md')));
  }
});

test('variant entrypoint selection leaves nested references and non-Markdown files unchanged', () => {
  writeSource('alpha/SKILL.md', '---\nname: alpha\ndescription: default\n---\ndefault');
  writeSource('alpha/SKILL.codex.md', '---\nname: alpha\ndescription: codex\n---\nselected');
  writeSource('alpha/reference/SKILL.future.md', '# reference $ARGUMENTS');
  writeSource('alpha/assets/SKILL.codex.json', '{"variant":true}');

  buildProvider({
    root: sandbox,
    sourceDir: join(sandbox, 'source/skills'),
    providerName: 'codex',
    config: REAL_PROVIDERS.codex,
  });

  assert.equal(
    readFileSync(join(sandbox, '.agents/skills/alpha/reference/SKILL.future.md'), 'utf8'),
    '# reference the user\'s request',
  );
  assert.equal(
    readFileSync(join(sandbox, '.agents/skills/alpha/assets/SKILL.codex.json'), 'utf8'),
    '{"variant":true}',
  );
});

test('negative fixture: swapped and leaked variant outputs are rejected', () => {
  const sourceDir = join(sandbox, 'source/skills');
  writeSource('alpha/SKILL.md', '---\nname: alpha\ndescription: default\n---\ndefault body');
  writeSource('alpha/SKILL.codex.md', '---\nname: alpha\ndescription: codex\n---\ncodex body');

  buildProvider({
    root: sandbox,
    sourceDir,
    providerName: 'codex',
    config: REAL_PROVIDERS.codex,
  });
  assertProviderOutput({ providerName: 'codex', config: REAL_PROVIDERS.codex, sourceDir });

  writeOutput(
    '.agents/skills/alpha/SKILL.md',
    '---\nname: alpha\ndescription: default\n---\ndefault body',
  );
  assert.throws(
    () => assertProviderOutput({ providerName: 'codex', config: REAL_PROVIDERS.codex, sourceDir }),
    /selected entrypoint content mismatch/,
  );

  buildProvider({
    root: sandbox,
    sourceDir,
    providerName: 'codex',
    config: REAL_PROVIDERS.codex,
  });
  writeOutput('.agents/skills/alpha/SKILL.future.md', 'leaked variant');
  assert.throws(
    () => assertProviderOutput({ providerName: 'codex', config: REAL_PROVIDERS.codex, sourceDir }),
    /variant entrypoint leaked/,
  );
});

test('buildProvider alone is callable (unit of build)', () => {
  writeSource('alpha/SKILL.md', '---\nname: alpha\ndescription: A\n---\nbody');
  buildProvider({
    root: sandbox,
    sourceDir: join(sandbox, 'source/skills'),
    providerName: 'opencode',
    config: PROVIDERS.opencode,
  });
  assert.ok(existsSync(join(sandbox, '.opencode/skills/alpha/SKILL.md')));
  assert.ok(!existsSync(join(sandbox, '.claude/skills/alpha/SKILL.md')));
});

test('empty skill dir after rebuild: all files swept, dir may remain', () => {
  writeSource('alpha/SKILL.md', '---\nname: alpha\ndescription: B\n---\nbody');
  writeSource('beta/SKILL.md', '---\nname: beta\ndescription: B\n---\nbody');
  runBuild();

  // Drop beta from source
  rmSync(join(sandbox, 'source/skills/beta'), { recursive: true, force: true });
  runBuild();

  assert.ok(!existsSync(join(sandbox, '.claude/skills/beta/SKILL.md')));
  // Directory may or may not be present; only the file sweep is guaranteed.
  // alpha must still exist
  assert.ok(existsSync(join(sandbox, '.claude/skills/alpha/SKILL.md')));
});

test('codex, codex-plugin, and codex-cross sandbox outputs are byte-identical (via real PROVIDERS)', () => {
  const names = writeCodexFamilyFixture();
  assertCodexFamilyConfigIdentity();
  buildCodexFamilyFixture();
  assertCodexFamilyOutputs(names);
});

test('real source/skills: each provider emits expected skill set with no Claude-syntax leakage', () => {
  cpSync(join(ROOT, 'source/skills'), join(sandbox, 'source/skills'), {
    recursive: true,
  });
  const sourceDir = join(sandbox, 'source/skills');
  const codexBuildEntrypoint = join(sourceDir, 'build/SKILL.codex.md');
  assert.ok(existsSync(codexBuildEntrypoint), 'real source must include build/SKILL.codex.md');

  for (const [name, config] of Object.entries(REAL_PROVIDERS)) {
    buildProvider({
      root: sandbox,
      sourceDir,
      providerName: name,
      config,
    });
    assertProviderOutput({
      providerName: name,
      config,
      sourceDir,
    });
    assertGeneratedPortableDeliverySlices(config, name);
    assertGeneratedPortableBoundedEvidence(config, name);
    if (name === 'claude' || name.startsWith('codex')) {
      const generatedBuild = readSandboxSkill(config, 'build');
      assertGeneratedBuildDeliverySlices(generatedBuild, name);
      assertGeneratedBuildBoundedEvidence(generatedBuild, name);
      if (name.startsWith('codex')) assertGeneratedCodexExecutionProfile(generatedBuild, name);
    }
  }

  const runtimeFiles = [
    'cli.js',
    'completion.js',
    'counters.js',
    'evidence.js',
    'immutable-json.js',
    'plan-contract.js',
    'repository.js',
    'transition.js',
    'validation.js',
    'workflow-state.js',
  ];
  for (const providerName of ['claude', 'codex', 'codex-plugin', 'codex-cross']) {
    const runtimeDir = join(sandbox, REAL_PROVIDERS[providerName].outputDir, 'build/buildctl');
    assert.deepEqual(
      readdirSync(runtimeDir).sort(),
      runtimeFiles,
      `${providerName}: buildctl runtime must be self-contained`,
    );
  }
  assert.equal(
    existsSync(join(sandbox, REAL_PROVIDERS.opencode.outputDir, 'build/buildctl')),
    false,
    'OpenCode must remain prompt-only and omit the Build runtime',
  );

  const expectedCodexSkills = ['architect-review', 'build', 'impl-plan', 'review-plan', 'verify'];
  for (const providerName of ['codex', 'codex-plugin', 'codex-cross']) {
    const config = REAL_PROVIDERS[providerName];
    assert.deepEqual(
      readdirSync(join(sandbox, config.outputDir)).sort(),
      expectedCodexSkills,
      `${providerName}: should emit build and exclude only eval`,
    );
    assert.equal(
      readFileSync(join(sandbox, config.outputDir, 'build/SKILL.md'), 'utf8'),
      transform(readFileSync(codexBuildEntrypoint, 'utf8'), providerName, config),
      `${providerName}: real build skill did not select SKILL.codex.md`,
    );
  }

  const agentsRoot = join(sandbox, REAL_PROVIDERS.codex.outputDir);
  for (const providerName of ['codex-plugin', 'codex-cross']) {
    const providerRoot = join(sandbox, REAL_PROVIDERS[providerName].outputDir);
    for (const agentsFile of walkFiles(agentsRoot)) {
      const relPath = agentsFile.slice(agentsRoot.length + 1);
      assert.deepEqual(
        readFileSync(join(providerRoot, relPath)),
        readFileSync(agentsFile),
        `${providerName}: ${relPath} diverged from codex output`,
      );
    }
  }
});

test('real provider outputs retain the shared typed-evidence contract', () => {
  cpSync(join(ROOT, 'source/skills'), join(sandbox, 'source/skills'), {
    recursive: true,
  });
  const sourceDir = join(sandbox, 'source/skills');

  for (const [name, config] of Object.entries(REAL_PROVIDERS)) {
    buildProvider({ root: sandbox, sourceDir, providerName: name, config });
    assertGeneratedTypedEvidence(config, name);
  }
});

test('real source/commands: opencode emits exactly the four expected commands with @include bodies', () => {
  cpSync(join(ROOT, 'source/skills'), join(sandbox, 'source/skills'), {
    recursive: true,
  });
  cpSync(join(ROOT, 'source/commands'), join(sandbox, 'source/commands'), {
    recursive: true,
  });

  buildCommands({
    root: sandbox,
    sourceDir: join(sandbox, 'source/commands'),
    providers: REAL_COMMAND_PROVIDERS,
  });

  const emitted = readdirSync(join(sandbox, '.opencode/commands')).sort();
  assert.deepEqual(
    emitted,
    ['architect-review.md', 'impl-plan.md', 'review-plan.md', 'verify.md'],
    `Unexpected command file set: ${JSON.stringify(emitted)}`,
  );

  for (const file of emitted) {
    const full = readFileSync(join(sandbox, '.opencode/commands', file), 'utf8');
    // Strip leading frontmatter block, then the trailing body should be exactly one @include.
    const body = full.split('---\n').slice(2).join('---\n').trim();
    assert.match(
      body,
      /^@\.opencode\/skills\/[a-z-]+\/SKILL\.md$/,
      `${file}: body should be a single @include line, got ${JSON.stringify(body)}`,
    );
  }
});

test('buildCommandProvider sweeps stale command files', () => {
  const sourceDir = join(sandbox, 'source/commands');
  mkdirSync(sourceDir, { recursive: true });
  writeFileSync(
    join(sourceDir, 'alpha.md'),
    '---\ndescription: a\n---\n@.opencode/skills/alpha/SKILL.md\n',
    'utf8',
  );

  const cfg = { outputDir: '.opencode/commands', rewrites: null };
  buildCommandProvider({
    root: sandbox,
    sourceDir,
    providerName: 'opencode',
    config: cfg,
  });

  // Inject a ghost file as if from a previous build's stale state.
  writeFileSync(join(sandbox, '.opencode/commands/ghost.md'), 'stale', 'utf8');
  assert.ok(existsSync(join(sandbox, '.opencode/commands/ghost.md')));

  buildCommandProvider({
    root: sandbox,
    sourceDir,
    providerName: 'opencode',
    config: cfg,
  });

  assert.ok(!existsSync(join(sandbox, '.opencode/commands/ghost.md')), 'ghost.md should be swept');
  assert.ok(existsSync(join(sandbox, '.opencode/commands/alpha.md')), 'alpha.md should persist');
});
