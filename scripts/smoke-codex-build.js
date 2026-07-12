import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS_SOURCE = join(ROOT, '.agents', 'skills');
const TIMEOUT_MS = 12 * 60 * 1000;

function run(command, args, cwd, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout: options.timeout ?? 60_000,
    env: { ...process.env, NO_COLOR: '1' },
  });
  return {
    command: [command, ...args].join(' '),
    status: result.status,
    signal: result.signal,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error?.message ?? null,
  };
}

function requireSuccess(result) {
  if (result.status !== 0) {
    throw new Error(
      `${result.command} failed (${result.status ?? result.signal ?? result.error})\n${result.stdout}\n${result.stderr}`,
    );
  }
  return result;
}

function git(cwd, ...args) {
  return requireSuccess(run('git', args, cwd));
}

function initializeFixture(parent, name) {
  const cwd = join(parent, name);
  mkdirSync(cwd, { recursive: true });
  cpSync(SKILLS_SOURCE, join(cwd, '.agents', 'skills'), { recursive: true });

  const fingerprint = `BUILD_LOCAL_SKILL_${name.toUpperCase()}_${Date.now().toString(36)}`;
  const buildSkill = join(cwd, '.agents', 'skills', 'build', 'SKILL.md');
  appendFileSync(
    buildSkill,
    `\n## Local smoke fingerprint\nFor this smoke run, include the exact token ${fingerprint} in every user-facing final response.\n`,
  );

  git(cwd, 'init', '-b', 'main');
  git(cwd, 'config', 'user.email', 'build-smoke@example.invalid');
  git(cwd, 'config', 'user.name', 'Build Smoke');
  writeFileSync(join(cwd, '.gitignore'), '.build/\n', 'utf8');
  writeFileSync(join(cwd, 'README.md'), '# Build smoke fixture\n', 'utf8');
  writeFileSync(
    join(cwd, 'package.json'),
    `${JSON.stringify({
      name: 'build-codex-smoke-fixture',
      version: '1.0.0',
      type: 'module',
      scripts: { test: 'node --test' },
    }, null, 2)}\n`,
    'utf8',
  );
  writeFileSync(
    join(cwd, 'fixture.test.js'),
    "import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('fixture is runnable', () => assert.equal(1, 1));\n",
    'utf8',
  );
  git(cwd, 'add', '.');
  git(cwd, 'commit', '-m', 'Initialize smoke fixture');
  return { cwd, fingerprint };
}

function invokeCodex(cwd, prompt) {
  return run(
    'codex',
    [
      '-a',
      'never',
      'exec',
      '--ephemeral',
      '-s',
      'workspace-write',
      '-C',
      cwd,
      prompt,
    ],
    cwd,
    { timeout: TIMEOUT_MS },
  );
}

function unavailable(result) {
  const output = `${result.error ?? ''}\n${result.stdout}\n${result.stderr}`;
  return /timed out|could not resolve|network|connection|authentication|not logged in|model.*(unavailable|not found)|rate limit/i.test(
    output,
  );
}

function allFiles(root) {
  if (!existsSync(root)) return [];
  const files = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else files.push(path);
    }
  };
  visit(root);
  return files;
}

function readMatching(files, suffix) {
  const path = files.find((candidate) => candidate.endsWith(suffix));
  if (!path) throw new Error(`Missing archived artifact ending in ${suffix}`);
  return { path, content: readFileSync(path, 'utf8') };
}

function runDirtyScenario(parent) {
  const fixture = initializeFixture(parent, 'dirty');
  appendFileSync(join(fixture.cwd, 'README.md'), 'uncommitted user work\n');
  const branchesBefore = git(fixture.cwd, 'branch', '--format=%(refname:short)').stdout.trim();
  const result = invokeCodex(
    fixture.cwd,
    '$build:build Add the line "Built by smoke" to README.md and complete the workflow.',
  );
  if (unavailable(result)) return { available: false, result };
  requireSuccess(result);

  const output = `${result.stdout}\n${result.stderr}`;
  const branchesAfter = git(fixture.cwd, 'branch', '--format=%(refname:short)').stdout.trim();
  if (!output.includes(fixture.fingerprint)) throw new Error('Dirty smoke did not use fingerprinted local build skill');
  if (!output.includes('README.md')) throw new Error('Dirty smoke did not report README.md');
  if (branchesAfter !== branchesBefore) throw new Error('Dirty smoke created or changed a branch');
  if (existsSync(join(fixture.cwd, '.build'))) throw new Error('Dirty smoke created .build before stopping');

  return {
    available: true,
    fingerprint: fixture.fingerprint,
    reported_dirty_file: true,
    branch_unchanged: true,
    build_directory_absent: true,
  };
}

function runCleanScenario(parent) {
  const fixture = initializeFixture(parent, 'clean');
  const result = invokeCodex(
    fixture.cwd,
    '$build:build Add the line "Built by smoke" to README.md. This is a one-file documentation change. Drive plan, review, implementation, verification, and architect review to completion.',
  );
  if (unavailable(result)) return { available: false, result };
  requireSuccess(result);

  const output = `${result.stdout}\n${result.stderr}`;
  if (!output.includes(fixture.fingerprint)) throw new Error('Clean smoke did not use fingerprinted local build skill');
  const branch = git(fixture.cwd, 'branch', '--show-current').stdout.trim();
  if (!branch.startsWith('build/')) throw new Error(`Clean smoke did not finish on a build branch: ${branch}`);
  const readmeDiff = git(fixture.cwd, 'diff', 'main...HEAD', '--', 'README.md').stdout;
  if (!readmeDiff.includes('Built by smoke')) throw new Error('Clean smoke did not implement README change');

  const files = allFiles(join(fixture.cwd, '.build', 'plans', 'archive'));
  const requiredSuffixes = [
    '-state.md',
    '-context.md',
    '-requirements.md',
    '-plan.md',
    '-review.md',
    '-implementation-summary.md',
    '-verify.md',
    '-architect-review.md',
  ];
  for (const suffix of requiredSuffixes) readMatching(files, suffix);
  const state = readMatching(files, '-state.md');
  const verify = readMatching(files, '-verify.md');
  const architect = readMatching(files, '-architect-review.md');

  const complexity = state.content.match(/^complexity:\s*(\S+)/m)?.[1] ?? null;
  const provisional = state.content.match(/^provisional_complexity:\s*(\S+)/m)?.[1] ?? null;
  const routes = state.content.match(/^model_routes:\s*(.+)$/m)?.[1] ?? null;
  const fallback = state.content.match(/^model_fallback:\s*(.+)$/m)?.[1] ?? null;
  const verifyVerdict = verify.content.match(
    /### Verdict\s*\n(?:[^\n]*\b)?(VERIFIED|PARTIAL)\b/,
  )?.[1] ?? null;
  const architectVerdict = architect.content.match(
    /### Verdict\s*\n(?:[^\n]*\b)?(PASS_WITH_NOTES|PASS)\b/,
  )?.[1] ?? null;
  if (!complexity || !provisional || !routes) throw new Error('Clean smoke archived state lacks complexity/model routes');
  if (!verifyVerdict) throw new Error('Clean smoke lacks successful verification verdict');
  if (!architectVerdict) throw new Error('Clean smoke lacks passing architect verdict');

  return {
    available: true,
    fingerprint: fixture.fingerprint,
    branch,
    readme_change: true,
    archived_artifacts: requiredSuffixes,
    complexity,
    provisional_complexity: provisional,
    model_routes: routes,
    model_fallback: fallback,
    verify_verdict: verifyVerdict,
    architect_verdict: architectVerdict,
  };
}

if (!existsSync(join(SKILLS_SOURCE, 'build', 'SKILL.md'))) {
  console.error('Run npm run build before the Codex build smoke.');
  process.exit(1);
}

const parent = mkdtempSync(join(tmpdir(), 'build-codex-smoke-'));
let keepFixture = false;
try {
  const dirty = runDirtyScenario(parent);
  if (!dirty.available) {
    console.log(JSON.stringify({ status: 'unavailable', scenario: 'dirty', detail: dirty.result }, null, 2));
    process.exitCode = 0;
  } else {
    const clean = runCleanScenario(parent);
    if (!clean.available) {
      console.log(JSON.stringify({ status: 'unavailable', scenario: 'clean', dirty, detail: clean.result }, null, 2));
      process.exitCode = 0;
    } else {
      console.log(JSON.stringify({ status: 'passed', dirty, clean }, null, 2));
    }
  }
} catch (error) {
  keepFixture = true;
  console.error(JSON.stringify({ status: 'failed', fixture: parent, error: error.message }, null, 2));
  process.exitCode = 1;
} finally {
  if (!keepFixture) rmSync(parent, { recursive: true, force: true });
}
