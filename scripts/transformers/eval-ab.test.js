import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { ROOT } from './utils.js';
import * as ab from './eval-ab.js';

const REASON = 'the change only deletes text, so there is no added prose to match; placebo arm skipped';

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

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'eval-ab-'));
  sandboxes.push(dir);
  return dir;
}

function sandbox() {
  const repo = tempDir();
  run(['git', 'init', '-q'], repo);
  run(['git', 'config', 'user.email', 'test@example.com'], repo);
  run(['git', 'config', 'user.name', 'Test'], repo);
  return repo;
}

function write(root, path, content) {
  const absolute = join(root, ...path.split('/'));
  mkdirSync(join(absolute, '..'), { recursive: true });
  writeFileSync(absolute, content, 'utf8');
}

function readText(root, path) {
  return readFileSync(join(root, ...path.split('/')), 'utf8');
}

function commit(repo, message) {
  run(['git', 'add', '-A'], repo);
  run(['git', 'commit', '-q', '-m', message], repo);
  return run(['git', 'rev-parse', 'HEAD'], repo);
}

function isInside(child, parent) {
  const rel = relative(parent, child);
  return rel === '' || !(rel === '..' || rel.startsWith(`..${sep}`));
}

const BASE_ALPHA = '# Alpha\n\nRead [note](../beta/reference/note.md) first.\n';
const WORKING_ALPHA = '# Alpha\n\nRead [note](../beta/reference/note.md) first. Then open the extra reference file.\n';
const BASE_NOTE = 'Base note text.\n';
const WORKING_NOTE = 'Working note text that differs.\n';
const EXTRA = 'Extra guidance for the alpha skill lives here.\n';

// Repo with alpha + beta skills committed (and tagged v0.1.0 unless tag is false), then
// alpha gains a sentence, beta's note changes, and an untracked alpha reference is added.
function alphaRepo({ tag = true } = {}) {
  const repo = sandbox();
  write(repo, 'source/skills/alpha/SKILL.md', BASE_ALPHA);
  write(repo, 'source/skills/beta/reference/note.md', BASE_NOTE);
  commit(repo, 'base');
  if (tag) run(['git', 'tag', 'v0.1.0'], repo);
  write(repo, 'source/skills/alpha/SKILL.md', WORKING_ALPHA);
  write(repo, 'source/skills/beta/reference/note.md', WORKING_NOTE);
  write(repo, 'source/skills/alpha/reference/extra.md', EXTRA);
  return repo;
}

function readKey(keyPath) {
  return JSON.parse(readFileSync(keyPath, 'utf8'));
}

// A hand-written key: old=s1, placebo=s2, new=s3, five main runs each (r01..r15).
function handKey() {
  const keyDir = tempDir();
  const runDir = join(tempDir(), 'run-u1');
  mkdirSync(runDir, { recursive: true });
  const arms = { old: 's1', placebo: 's2', new: 's3' };
  const order = ['old', 'placebo', 'new'];
  const runs = [];
  for (let i = 0; i < 15; i += 1) {
    const arm = order[Math.floor(i / 5)];
    runs.push({ run: `r${String(i + 1).padStart(2, '0')}`, variant: arms[arm], arm, input: 'main' });
  }
  const key = {
    run_id: 'run-u1',
    run_dir: runDir,
    repo: '/nowhere',
    skill: 'alpha',
    base_ref: 'v0.1.0',
    base_sha: '0'.repeat(40),
    seed: 1,
    arms,
    runs,
    placebo: { skipped: false, reason: null, insertions: [] },
  };
  writeFileSync(join(keyDir, 'run-u1.json'), JSON.stringify(key, null, 2));
  return { keyDir, runDir, runs };
}

function allGrades(runs) {
  return runs.map(({ run }) => ({ run, q1: false, evidence: 'note' }));
}

test('placebo: neutral text stays within 5 percent of the requested length', () => {
  for (const n of [1, 12, 50, 202, 1000, 5000]) {
    const text = ab.neutralText(n);
    assert.ok(
      Math.abs(text.length - n) <= Math.ceil(0.05 * n),
      `neutralText(${n}) has length ${text.length}`,
    );
    assert.equal(ab.neutralText(n), text);
  }
});

test('placebo: neutral text carries no direction words or markdown structure', () => {
  const text = ab.neutralText(5000);
  assert.doesNotMatch(text, /[#`*|\n]/);
  assert.doesNotMatch(text, /\b(must|should|always|never|test|plan|review|requirement|verify)\b/i);
});

test('placebo: inserts neutral text where new adds prose', () => {
  const oldText = 'a\nKeep this line.\nb\n';
  const newText = 'a\nKeep this line. Added sentence here.\nb\n';
  const result = ab.buildPlacebo(oldText, newText);
  assert.equal(result.insertions.length, 1);
  const [insertion] = result.insertions;
  assert.equal(insertion.oldLine, 2);
  assert.equal(insertion.addedChars, 20);
  assert.ok(Math.abs(insertion.placeboChars - 20) <= 1, `placeboChars ${insertion.placeboChars}`);
  const at = 'a\nKeep this line.'.length;
  const insertedLength = result.text.length - oldText.length;
  assert.equal(result.text.slice(at, at + insertedLength), ` ${ab.neutralText(20)}`);
  assert.equal(result.text.slice(0, at) + result.text.slice(at + insertedLength), oldText);
  const lines = result.text.split('\n');
  assert.equal(lines[0], 'a');
  assert.equal(lines[2], 'b');
});

test('placebo: matches a new paragraph without removing old text', () => {
  const oldText = 'First paragraph of the skill.\n\nSecond paragraph of the skill.\n';
  const newText = 'First paragraph of the skill.\n\nA whole new paragraph of guidance.\n\nSecond paragraph of the skill.\n';
  const result = ab.buildPlacebo(oldText, newText);
  const resultLines = result.text.split('\n');
  let cursor = 0;
  for (const line of oldText.split('\n')) {
    while (cursor < resultLines.length && resultLines[cursor] !== line) cursor += 1;
    assert.ok(cursor < resultLines.length, `old line ${JSON.stringify(line)} missing or out of order`);
    cursor += 1;
  }
  assert.equal(result.insertions.length, 1);
  const [insertion] = result.insertions;
  assert.equal(insertion.addedChars, 'A whole new paragraph of guidance.'.length);
  assert.ok(
    Math.abs(insertion.placeboChars - insertion.addedChars) <= Math.ceil(0.05 * insertion.addedChars),
    `placeboChars ${insertion.placeboChars} vs addedChars ${insertion.addedChars}`,
  );
  assert.ok(result.text.length > oldText.length);
});

test('variants: skips the placebo arm when the change only deletes text', () => {
  const repo = sandbox();
  write(repo, 'source/skills/alpha/SKILL.md', '# Alpha\n\nFirst line.\nSecond line.\n');
  commit(repo, 'base');
  write(repo, 'source/skills/alpha/SKILL.md', '# Alpha\n\nFirst line.\n');
  const keyDir = tempDir();
  const runDir = join(tempDir(), 'run-delete');
  const result = ab.prepare({ repo, skill: 'alpha', runs: 2, seed: 5, keyDir, runDir });
  assert.equal(result.placebo.skipped, true);
  assert.equal(result.placebo.reason, REASON);
  assert.equal(result.variants.length, 2);
  assert.equal(result.runs.length, 2 * 2);
  assert.equal(result.arms.placebo, null);
  const key = readKey(result.keyPath);
  assert.equal(key.placebo.skipped, true);
  assert.equal(key.arms.placebo, null);
});

test('variants: builds three variants with base-ref siblings', () => {
  const repo = alphaRepo();
  const keyDir = tempDir();
  const runDir = join(tempDir(), 'run-three');
  const result = ab.prepare({ repo, skill: 'alpha', runs: 2, seed: 11, keyDir, runDir });
  assert.deepEqual(result.variants, ['s1', 's2', 's3']);
  const key = readKey(result.keyPath);
  const variant = (arm) => join(runDir, 'variants', key.arms[arm]);

  assert.equal(readText(variant('old'), 'alpha/SKILL.md'), BASE_ALPHA);
  assert.equal(existsSync(join(variant('old'), 'alpha', 'reference', 'extra.md')), false);

  assert.equal(readText(variant('new'), 'alpha/SKILL.md'), WORKING_ALPHA);
  assert.equal(readText(variant('new'), 'alpha/reference/extra.md'), EXTRA);

  const placeboSkill = readText(variant('placebo'), 'alpha/SKILL.md');
  const expected = ab.buildPlacebo(BASE_ALPHA, WORKING_ALPHA);
  assert.equal(expected.insertions.length, 1);
  assert.equal(placeboSkill, expected.text);
  assert.ok(placeboSkill.length > BASE_ALPHA.length);
  const placeboExtra = readText(variant('placebo'), 'alpha/reference/extra.md');
  assert.notEqual(placeboExtra, EXTRA);
  assert.ok(
    Math.abs(placeboExtra.length - EXTRA.length) <= Math.ceil(0.05 * EXTRA.length),
    `placebo extra.md length ${placeboExtra.length} vs ${EXTRA.length}`,
  );
  assert.equal(key.placebo.skipped, false);
  assert.equal(key.placebo.insertions.length, 2);

  for (const arm of ['old', 'new', 'placebo']) {
    assert.equal(readText(variant(arm), 'beta/reference/note.md'), BASE_NOTE, `${arm} beta note`);
  }
});

test('variants: defaults the base to the latest v tag and falls back to HEAD', () => {
  const tagged = alphaRepo();
  const taggedResult = ab.prepare({
    repo: tagged,
    skill: 'alpha',
    runs: 1,
    seed: 2,
    keyDir: tempDir(),
    runDir: join(tempDir(), 'run-tagged'),
  });
  assert.equal(taggedResult.base, 'v0.1.0');
  assert.match(taggedResult.baseSha, /^[0-9a-f]{40}$/);

  const untagged = alphaRepo({ tag: false });
  const untaggedResult = ab.prepare({
    repo: untagged,
    skill: 'alpha',
    runs: 1,
    seed: 2,
    keyDir: tempDir(),
    runDir: join(tempDir(), 'run-untagged'),
  });
  assert.equal(untaggedResult.base, 'HEAD');
});

test('assignment: keeps the key outside the run directory', () => {
  const repo = alphaRepo();
  const keyDir = tempDir();
  const runDir = join(tempDir(), 'run-key');
  const result = ab.prepare({ repo, skill: 'alpha', runs: 2, seed: 4, keyDir, runDir });
  assert.ok(isInside(result.keyPath, keyDir), `${result.keyPath} not under ${keyDir}`);
  assert.equal(isInside(result.keyPath, runDir), false);
  assert.equal(isInside(result.keyPath, repo), false);

  const assignment = JSON.parse(readFileSync(join(runDir, 'assignment.json'), 'utf8'));
  assert.equal(assignment.runs.length, 6);
  const walk = (value) => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (value && typeof value === 'object') {
      for (const [field, inner] of Object.entries(value)) {
        assert.notEqual(field, 'arm', 'assignment.json names an arm field');
        walk(inner);
      }
      return;
    }
    if (typeof value === 'string') {
      assert.ok(!['old', 'new', 'placebo'].includes(value), `assignment.json names arm ${value}`);
    }
  };
  walk(assignment);

  const insideRunDir = join(tempDir(), 'run-refused');
  assert.throws(
    () => ab.prepare({ repo, skill: 'alpha', runs: 2, seed: 4, keyDir: join(repo, 'keys'), runDir: insideRunDir }),
    /key directory must be outside the run directory and the repository/,
  );
  assert.equal(existsSync(insideRunDir), false);
  const nestedRunDir = join(tempDir(), 'run-nested');
  assert.throws(
    () => ab.prepare({ repo, skill: 'alpha', runs: 2, seed: 4, keyDir: join(nestedRunDir, 'keys'), runDir: nestedRunDir }),
    /key directory must be outside the run directory and the repository/,
  );
  assert.equal(existsSync(nestedRunDir), false);
});

test('assignment: assigns runs reproducibly from a seed', () => {
  const repo = alphaRepo();
  const keyDir = tempDir();
  const first = ab.prepare({ repo, skill: 'alpha', runs: 3, seed: 7, keyDir, runDir: join(tempDir(), 'run-seed-a') });
  const second = ab.prepare({ repo, skill: 'alpha', runs: 3, seed: 7, keyDir, runDir: join(tempDir(), 'run-seed-b') });
  assert.deepEqual(first.runs, second.runs);
  assert.deepEqual(first.arms, second.arms);
  for (const variant of first.variants) {
    const count = first.runs.filter((entry) => entry.input === 'main' && entry.variant === variant).length;
    assert.equal(count, 3, `variant ${variant}`);
  }

  const withControl = ab.prepare({
    repo,
    skill: 'alpha',
    runs: 3,
    controlRuns: 2,
    seed: 7,
    keyDir,
    runDir: join(tempDir(), 'run-seed-c'),
  });
  const key = readKey(withControl.keyPath);
  const control = withControl.runs.filter((entry) => entry.input === 'control');
  assert.equal(control.length, 2);
  for (const entry of control) assert.equal(entry.variant, key.arms.new);
  assert.equal(withControl.runs.filter((entry) => entry.input === 'main').length, 9);
});

test('assignment: headroom builds only the base variant', () => {
  const repo = alphaRepo();
  const keyDir = tempDir();
  const runDir = join(tempDir(), 'run-headroom');
  const result = ab.prepare({ repo, skill: 'alpha', headroom: true, seed: 1, keyDir, runDir });
  assert.deepEqual(result.variants, ['s1']);
  assert.equal(readText(join(runDir, 'variants', 's1'), 'alpha/SKILL.md'), BASE_ALPHA);
  assert.equal(readText(join(runDir, 'variants', 's1'), 'beta/reference/note.md'), BASE_NOTE);
  assert.equal(result.runs.length, 3);
  for (const entry of result.runs) assert.equal(entry.variant, 's1');
  assert.equal(result.keyPath, null);
  assert.deepEqual(readdirSync(keyDir), []);
});

test('unblind: prints per-arm counts and the noise reference', () => {
  const { keyDir, runDir, runs } = handKey();
  const trueQ1 = new Set(['r01', 'r06', 'r07', 'r11', 'r12', 'r13', 'r14', 'r15']);
  const trueQ2 = new Set(['r01', 'r02', 'r03', 'r06', 'r07', 'r08', 'r11', 'r12', 'r13', 'r14']);
  const grades = runs.map(({ run }) => ({
    run,
    q1: trueQ1.has(run),
    q2: trueQ2.has(run),
    evidence: `quote for ${run}`,
  }));
  const { markdown } = ab.unblind({ runDir, grades, keyDir });
  assert.ok(markdown.includes('| old | 1/5 |'), markdown);
  assert.ok(markdown.includes('| placebo | 2/5 |'), markdown);
  assert.ok(markdown.includes('| new | 5/5 |'), markdown);
  assert.ok(markdown.includes('| noise (abs placebo - old) | 1 |'), markdown);
  assert.ok(markdown.includes('| decision (margin 2) | keep | drop |'), markdown);
  assert.ok(!markdown.includes('evidence'), markdown);
  assert.ok(existsSync(join(runDir, 'unblinded.json')));
});

test('unblind: rejects grades that do not match the assignment', () => {
  const { keyDir, runDir, runs } = handKey();
  assert.throws(
    () => ab.unblind({ runDir, grades: [...allGrades(runs), { run: 'r99', q1: true }], keyDir }),
    /grade for unknown run/,
  );
  assert.throws(
    () => ab.unblind({ runDir, grades: allGrades(runs).slice(1), keyDir }),
    /has no grade/,
  );
  assert.throws(
    () => ab.unblind({ runDir, grades: [...allGrades(runs), { run: 'r01', q1: true }], keyDir }),
    /graded twice/,
  );
});

test('cli: prepare reports the base ref and key path', () => {
  const repo = alphaRepo();
  const keyDir = tempDir();
  const runDir = join(tempDir(), 'run-cli');
  const result = spawnSync(
    process.execPath,
    ['scripts/eval-ab.js', 'prepare', '--repo', repo, '--skill', 'alpha', '--runs', '2', '--seed', '3', '--key-dir', keyDir, '--run-dir', runDir],
    { cwd: ROOT, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  assert.ok(result.stdout.includes('Base ref: v0.1.0 ('), result.stdout);
  assert.ok(result.stdout.includes('Variants: s1, s2, s3'), result.stdout);
  assert.ok(result.stdout.includes('Runs: 6'), result.stdout);
  assert.ok(result.stdout.includes('Key: '), result.stdout);
});

test('cli: rejects an unknown command', () => {
  const result = spawnSync(process.execPath, ['scripts/eval-ab.js', 'frobnicate'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(result.status, 1, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  assert.ok(result.stderr.includes('eval-ab: unknown command frobnicate'), result.stderr);
});
