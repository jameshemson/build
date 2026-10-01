import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repositoryFileScope } from '../../source/skills/build/buildctl/repository.js';

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
  const repo = mkdtempSync(join(tmpdir(), 'buildctl-file-scope-'));
  sandboxes.push(repo);
  run(['git', 'init', '-q'], repo);
  run(['git', 'config', 'user.email', 'test@example.com'], repo);
  run(['git', 'config', 'user.name', 'Test'], repo);
  return repo;
}

function write(repo, path, content) {
  const absolute = join(repo, ...path.split('/'));
  mkdirSync(join(absolute, '..'), { recursive: true });
  writeFileSync(absolute, content, 'utf8');
}

function commit(repo, message) {
  run(['git', 'add', '-A'], repo);
  run(['git', 'commit', '-q', '-m', message], repo);
  return run(['git', 'rev-parse', 'HEAD'], repo);
}

function movedRepo() {
  const repo = sandbox();
  write(repo, 'old.js', 'export const value = 1;\n');
  const baseRef = commit(repo, 'base');
  run(['git', 'mv', 'old.js', 'new.js'], repo);
  commit(repo, 'move old.js to new.js');
  return { baseRef, repo };
}

test('file scope classification: a gitignored planned output is planned_ignored, not unchanged', () => {
  const repo = sandbox();
  write(repo, '.gitignore', 'out/\n');
  write(repo, 'src/a.js', 'export const a = 1;\n');
  const baseRef = commit(repo, 'base');
  write(repo, 'src/a.js', 'export const a = 2;\n');
  write(repo, 'out/result.json', '{}\n');
  commit(repo, 'change src/a.js and generate an ignored output');

  const scope = repositoryFileScope({
    baseRef,
    plannedPaths: ['out/result.json', 'src/a.js'],
    repoRoot: repo,
  });
  assert.deepEqual(scope.planned_ignored, ['out/result.json']);
  assert.deepEqual(scope.planned_but_unchanged, []);
});

test('file scope classification: a move lists both the old and the new path as changed', () => {
  const { baseRef, repo } = movedRepo();

  const scope = repositoryFileScope({
    baseRef,
    plannedPaths: ['old.js', 'new.js'],
    repoRoot: repo,
  });
  assert.ok(scope.changed.includes('old.js'), `changed: ${scope.changed.join(', ')}`);
  assert.ok(scope.changed.includes('new.js'), `changed: ${scope.changed.join(', ')}`);
  assert.deepEqual(scope.planned_but_unchanged, []);
});

test('file scope classification: tracked files under an ignored directory are never planned_ignored', () => {
  const repo = sandbox();
  write(repo, '.gitignore', 'gen/\n');
  write(repo, 'gen/x.js', 'export const x = 1;\n');
  write(repo, 'gen/y.js', 'export const y = 1;\n');
  run(['git', 'add', '.gitignore'], repo);
  run(['git', 'add', '-f', 'gen/x.js', 'gen/y.js'], repo);
  run(['git', 'commit', '-q', '-m', 'base with force-added generated files'], repo);
  const baseRef = run(['git', 'rev-parse', 'HEAD'], repo);
  write(repo, 'gen/x.js', 'export const x = 2;\n');
  run(['git', 'add', '-u'], repo);
  run(['git', 'commit', '-q', '-m', 'change gen/x.js only'], repo);

  const scope = repositoryFileScope({
    baseRef,
    plannedPaths: ['gen/x.js', 'gen/y.js'],
    repoRoot: repo,
  });
  assert.ok(scope.changed.includes('gen/x.js'), `changed: ${scope.changed.join(', ')}`);
  assert.deepEqual(scope.planned_ignored, []);
  assert.deepEqual(scope.planned_but_unchanged, ['gen/y.js']);
});

test('file scope classification: a move with only the new path planned puts the old path out of plan', () => {
  const { baseRef, repo } = movedRepo();

  const scope = repositoryFileScope({
    baseRef,
    plannedPaths: ['new.js'],
    repoRoot: repo,
  });
  assert.ok(scope.out_of_plan.includes('old.js'), `out_of_plan: ${scope.out_of_plan.join(', ')}`);
});

test('file scope classification: result keys are reported in a fixed order', () => {
  const { baseRef, repo } = movedRepo();

  const scope = repositoryFileScope({
    baseRef,
    plannedPaths: ['old.js', 'new.js'],
    repoRoot: repo,
  });
  assert.deepEqual(Object.keys(scope), [
    'changed',
    'out_of_plan',
    'planned',
    'planned_but_unchanged',
    'planned_ignored',
  ]);
  console.log('file scope classification complete');
});
