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
import { buildProvider, build } from './builder.js';
import { PROVIDERS as REAL_PROVIDERS } from './providers.js';
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

test('codex and codex-plugin sandbox outputs are byte-identical (via real PROVIDERS)', () => {
  // Fixture: a portable skill with $ARGUMENTS (both forms) and a /build: ref,
  // so that all three rewrite paths are exercised. Any divergence between
  // codex and codex-plugin would surface here.
  const sample =
    '---\n' +
    'name: portable\n' +
    'description: fixture\n' +
    '---\n' +
    '\n' +
    '$ARGUMENTS\n' +
    '\n' +
    'See also $ARGUMENTS and /build:verify.\n';

  const names = ['architect-review', 'impl-plan', 'review-plan', 'verify'];
  for (const n of names) {
    writeSource(`${n}/SKILL.md`, sample);
  }

  buildProvider({
    root: sandbox,
    sourceDir: join(sandbox, 'source/skills'),
    providerName: 'codex',
    config: REAL_PROVIDERS.codex,
  });
  buildProvider({
    root: sandbox,
    sourceDir: join(sandbox, 'source/skills'),
    providerName: 'codex-plugin',
    config: REAL_PROVIDERS['codex-plugin'],
  });

  for (const n of names) {
    const agents = readFileSync(
      join(sandbox, '.agents/skills', n, 'SKILL.md'),
      'utf8',
    );
    const plugin = readFileSync(
      join(sandbox, 'plugins/build/skills', n, 'SKILL.md'),
      'utf8',
    );
    assert.equal(
      plugin,
      agents,
      `Divergence in ${n}/SKILL.md between codex and codex-plugin`,
    );
  }
});

// Ground-truth integration test: copy the REAL source/skills tree into a
// sandbox, run every provider from REAL_PROVIDERS, and assert invariants
// that matter to consumers (exact skill set, no Claude-syntax leakage).
// This is the regression gate C2 in the v1.4.0 architect review was asking
// for — it exercises every rewrite branch any real skill actually hits.
function walkFiles(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(p, acc);
    else if (entry.isFile()) acc.push(p);
  }
  return acc;
}

test('real source/skills: each provider emits expected skill set with no Claude-syntax leakage', () => {
  cpSync(join(ROOT, 'source/skills'), join(sandbox, 'source/skills'), {
    recursive: true,
  });

  for (const [name, config] of Object.entries(REAL_PROVIDERS)) {
    buildProvider({
      root: sandbox,
      sourceDir: join(sandbox, 'source/skills'),
      providerName: name,
      config,
    });

    const outDir = join(sandbox, config.outputDir);
    const emittedSkills = readdirSync(outDir).sort();
    const sourceSkills = readdirSync(join(sandbox, 'source/skills'))
      .filter((s) => !config.exclude.includes(s))
      .sort();
    assert.deepEqual(
      emittedSkills,
      sourceSkills,
      `${name}: emitted skills ${JSON.stringify(emittedSkills)} != expected ${JSON.stringify(sourceSkills)}`,
    );

    // Only non-Claude providers strip Claude syntax; the claude provider is
    // identity and legitimately retains $ARGUMENTS and /build: references.
    if (config.rewrites) {
      for (const file of walkFiles(outDir)) {
        const body = readFileSync(file, 'utf8');
        assert.ok(
          !body.includes('$ARGUMENTS'),
          `${name}: $ARGUMENTS leaked into ${file}`,
        );
        assert.ok(
          !/\/build:[a-z-]+/.test(body),
          `${name}: /build: reference leaked into ${file}`,
        );
        assert.ok(
          !body.includes('<!-- claude-only'),
          `${name}: <!-- claude-only --> block leaked into ${file}`,
        );
      }
    }
  }
});
