import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repositoryTestShrink } from '../../source/skills/build/buildctl/repository.js';
import { ROOT } from './utils.js';

const sandboxes = [];

afterEach(() => {
  for (const path of sandboxes.splice(0)) rmSync(path, { recursive: true, force: true });
});

function run(args, cwd) {
  const result = spawnSync(args[0], args.slice(1), { cwd, encoding: 'utf8' });
  assert.equal(
    result.status,
    0,
    `${args.join(' ')}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return result.stdout.trim();
}

function sandbox() {
  const repo = mkdtempSync(join(tmpdir(), 'buildctl-shrink-'));
  sandboxes.push(repo);
  run(['git', 'init', '-q', '-b', 'main'], repo);
  run(['git', 'config', 'user.email', 'test@example.com'], repo);
  run(['git', 'config', 'user.name', 'Test'], repo);
  return repo;
}

function commit(repo, message) {
  run(['git', 'add', '-A'], repo);
  run(['git', 'commit', '-q', '-m', message], repo);
  return run(['git', 'rev-parse', 'HEAD'], repo);
}

const STRONG = [
  'test("clamps low values", () => {',
  '  assert.equal(clamp(-1), 0);',
  '});',
  'test("clamps high values", () => {',
  '  assert.equal(clamp(99), 10);',
  '});',
].join('\n');

const WEAKENED = [
  'test("clamps low values", () => {',
  '  // assertion removed to get the gate green',
  '});',
].join('\n');

// Close enough to STRONG that git -M still pairs it across a rename.
const MILDLY_WEAKENED = [
  'test("clamps low values", () => {',
  '  assert.equal(clamp(-1), 0);',
  '});',
  'test("clamps high values", () => {',
  '});',
].join('\n');

test('test-shrink: a weakened in-plan test file is reported with before and after counts', () => {
  const repo = sandbox();
  writeFileSync(join(repo, 'clamp.test.js'), `${STRONG}\n`, 'utf8');
  const base = commit(repo, 'wave 0 test');
  writeFileSync(join(repo, 'clamp.test.js'), `${WEAKENED}\n`, 'utf8');
  commit(repo, 'weaken the test');

  const result = repositoryTestShrink({ baseRef: base, repoRoot: repo });
  assert.deepEqual(result.examined, ['clamp.test.js']);
  assert.equal(result.shrunk.length, 1);
  assert.equal(result.shrunk[0].path, 'clamp.test.js');
  assert.ok(result.shrunk[0].after < result.shrunk[0].before);
});

test('test-shrink: a rename that preserves assertions is not a finding', () => {
  const repo = sandbox();
  writeFileSync(join(repo, 'clamp.test.js'), `${STRONG}\n`, 'utf8');
  const base = commit(repo, 'wave 0 test');
  unlinkSync(join(repo, 'clamp.test.js'));
  writeFileSync(join(repo, 'clamp-boundaries.test.js'), `${STRONG}\n`, 'utf8');
  commit(repo, 'rename for clarity');

  const result = repositoryTestShrink({ baseRef: base, repoRoot: repo });
  assert.deepEqual(result.shrunk, [], 'a pure rename must not read as lost coverage');
  assert.deepEqual(result.examined, ['clamp-boundaries.test.js']);
});

test('test-shrink: a git-paired rename that also weakens carries its former path', () => {
  const repo = sandbox();
  writeFileSync(join(repo, 'clamp.test.js'), `${STRONG}\n`, 'utf8');
  const base = commit(repo, 'wave 0 test');
  unlinkSync(join(repo, 'clamp.test.js'));
  writeFileSync(join(repo, 'clamp-boundaries.test.js'), `${MILDLY_WEAKENED}\n`, 'utf8');
  commit(repo, 'rename and drop one assertion');

  const result = repositoryTestShrink({ baseRef: base, repoRoot: repo });
  assert.equal(result.shrunk.length, 1);
  assert.equal(result.shrunk[0].path, 'clamp-boundaries.test.js');
  assert.equal(result.shrunk[0].renamed_from, 'clamp.test.js');
});

// Below git's -M similarity threshold a rewrite-plus-rename is a delete and an
// add, not a pair. The finding must still fire, named against the path that
// actually lost its assertions.
test('test-shrink: a rewrite too dissimilar for -M still reports the abandoned path', () => {
  const repo = sandbox();
  writeFileSync(join(repo, 'clamp.test.js'), `${STRONG}\n`, 'utf8');
  const base = commit(repo, 'wave 0 test');
  unlinkSync(join(repo, 'clamp.test.js'));
  writeFileSync(join(repo, 'clamp-boundaries.test.js'), `${WEAKENED}\n`, 'utf8');
  commit(repo, 'rewrite under a new name');

  const result = repositoryTestShrink({ baseRef: base, repoRoot: repo });
  assert.equal(result.shrunk.length, 1);
  assert.equal(result.shrunk[0].path, 'clamp.test.js');
  assert.equal(result.shrunk[0].after, 0);
});

test('test-shrink: a deleted test file is reported as a deletion', () => {
  const repo = sandbox();
  writeFileSync(join(repo, 'clamp.test.js'), `${STRONG}\n`, 'utf8');
  const base = commit(repo, 'wave 0 test');
  unlinkSync(join(repo, 'clamp.test.js'));
  commit(repo, 'drop the test');

  const result = repositoryTestShrink({ baseRef: base, repoRoot: repo });
  assert.equal(result.shrunk.length, 1);
  assert.equal(result.shrunk[0].deleted, true);
  assert.equal(result.shrunk[0].after, 0);
});

test('test-shrink: new test files and non-test files are never findings', () => {
  const repo = sandbox();
  writeFileSync(join(repo, 'src.js'), 'export const clamp = (n) => n;\n', 'utf8');
  const base = commit(repo, 'source only');
  writeFileSync(join(repo, 'clamp.test.js'), `${STRONG}\n`, 'utf8');
  writeFileSync(join(repo, 'src.js'), 'export const clamp = (n) => Math.max(0, n);\n', 'utf8');
  commit(repo, 'add tests and change source');

  const result = repositoryTestShrink({ baseRef: base, repoRoot: repo });
  assert.deepEqual(result.shrunk, []);
  assert.deepEqual(result.examined, [], 'a file absent at base_ref cannot have lost coverage');
});

test('test-shrink: a binary fixture is never counted as lost assertions', () => {
  const repo = sandbox();
  mkdirSync(join(repo, 'fixtures'), { recursive: true });
  const before = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x61, 0x73, 0x73, 0x65, 0x72, 0x74]);
  writeFileSync(join(repo, 'fixtures/snapshot.png'), before);
  const base = commit(repo, 'binary fixture');
  writeFileSync(join(repo, 'fixtures/snapshot.png'), Buffer.from([0x89, 0x50, 0x00]));
  commit(repo, 'regenerate the fixture');

  const result = repositoryTestShrink({ baseRef: base, repoRoot: repo });
  assert.deepEqual(result.shrunk, [], 'a binary blob has no assertion lines to lose');
});

test('test-shrink: bounds are reported so a narrow scan never reads as whole-repository', () => {
  const repo = sandbox();
  writeFileSync(join(repo, 'clamp.test.js'), `${STRONG}\n`, 'utf8');
  const base = commit(repo, 'wave 0 test');
  writeFileSync(join(repo, 'clamp.test.js'), `${WEAKENED}\n`, 'utf8');
  commit(repo, 'weaken');

  const { bounds } = repositoryTestShrink({ baseRef: base, repoRoot: repo });
  assert.equal(bounds.unit, 'lines matching assertion_pattern');
  assert.ok(bounds.path_pattern.length > 0);
  assert.ok(bounds.assertion_pattern.length > 0);
});

// The zero-false-positive claim is only worth anything if it stays true as this
// repo's history grows, so the measurement runs as a test rather than once by
// hand. Every commit pair in real history is checked; nothing is sampled.
test('test-shrink: no commit in this repository\'s real history is a false positive', () => {
  const commits = run(['git', 'log', '--format=%H'], ROOT).split('\n').filter(Boolean);
  const findings = [];
  let pairs = 0;
  let examined = 0;
  for (const head of commits) {
    const parent = spawnSync('git', ['rev-parse', `${head}^`], { cwd: ROOT, encoding: 'utf8' });
    if (parent.status !== 0) continue;
    const result = repositoryTestShrink({
      baseRef: parent.stdout.trim(),
      headRef: head,
      repoRoot: ROOT,
    });
    pairs += 1;
    examined += result.examined.length;
    for (const entry of result.shrunk) findings.push({ commit: head.slice(0, 7), ...entry });
  }
  assert.ok(pairs > 50, `expected real history to exercise the check; saw ${pairs} commit pairs`);
  assert.ok(examined > 0, `expected real test files to be examined; saw ${examined}`);
  assert.deepEqual(
    findings,
    [],
    `test-shrink fired on real history (${pairs} commit pairs, ${examined} files examined). `
    + 'Either the commit genuinely dropped coverage, or the detector needs narrowing: '
    + JSON.stringify(findings, null, 2),
  );
});
