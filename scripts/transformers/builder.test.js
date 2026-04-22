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
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { buildProvider, build } from './builder.js';

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
  writeSource('alpha/SKILL.md', '---\nname: alpha\ndescription: A\n---\nbody');
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
