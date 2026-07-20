import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from './utils.js';
import { captureRepositoryIdentity } from '../../source/skills/build/buildctl/repository.js';
import { checkEvidence, runEvidence } from '../../source/skills/build/buildctl/evidence.js';

const CLI = join(ROOT, 'source/skills/build/buildctl/cli.js');
const VALID_PLAN = join(ROOT, 'scripts/fixtures/buildctl/kemet-lite/valid-plan.yaml');
const sandboxes = [];

afterEach(() => {
  for (const path of sandboxes.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

function command(cmd, cwd) {
  const result = spawnSync(cmd[0], cmd.slice(1), { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `${cmd.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

function git(repo, ...args) {
  return command(['git', ...args], repo);
}

function makeRepo() {
  const repo = mkdtempSync(join(tmpdir(), 'buildctl-evidence-'));
  sandboxes.push(repo);
  git(repo, 'init', '-q');
  git(repo, 'config', 'user.email', 'buildctl@example.test');
  git(repo, 'config', 'user.name', 'Buildctl Test');
  writeFileSync(join(repo, 'plan.yaml'), readFileSync(VALID_PLAN, 'utf8'), 'utf8');
  mkdirSync(join(repo, 'src'), { recursive: true });
  writeFileSync(join(repo, 'src/legacy-pose.js'), 'export const pose = 1;\n', 'utf8');
  git(repo, 'add', '.');
  git(repo, 'commit', '-qm', 'fixture');

  const contractPath = join(repo, '.build/contracts/evidence/contract.json');
  const compiled = spawnSync(
    process.execPath,
    [CLI, 'validate-plan', '--plan', 'plan.yaml', '--out', contractPath],
    { cwd: repo, encoding: 'utf8' },
  );
  assert.equal(compiled.status, 0, compiled.stderr);
  const evidenceDir = join(repo, '.build/evidence/evidence');
  return { repo, contractPath, evidenceDir };
}

function nodeCommand(script) {
  return `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`;
}

test('repository identity changes for tracked, staged, untracked, deleted, symlink, and HEAD inputs', async () => {
  const { repo, evidenceDir } = makeRepo();
  const base = await captureRepositoryIdentity({ repoRoot: repo, evidenceDir });

  writeFileSync(join(repo, 'src/legacy-pose.js'), 'export const pose = 2;\n', 'utf8');
  const tracked = await captureRepositoryIdentity({ repoRoot: repo, evidenceDir });
  assert.notEqual(tracked.fingerprint, base.fingerprint);

  git(repo, 'add', 'src/legacy-pose.js');
  const staged = await captureRepositoryIdentity({ repoRoot: repo, evidenceDir });
  assert.notEqual(staged.index_sha256, base.index_sha256);

  writeFileSync(join(repo, 'untracked.txt'), 'untracked\n', 'utf8');
  const untracked = await captureRepositoryIdentity({ repoRoot: repo, evidenceDir });
  assert.notEqual(untracked.fingerprint, staged.fingerprint);

  rmSync(join(repo, 'src/legacy-pose.js'));
  const deleted = await captureRepositoryIdentity({ repoRoot: repo, evidenceDir });
  assert.notEqual(deleted.fingerprint, untracked.fingerprint);

  symlinkSync('target-a', join(repo, 'pose-link'));
  const linkA = await captureRepositoryIdentity({ repoRoot: repo, evidenceDir });
  rmSync(join(repo, 'pose-link'));
  symlinkSync('target-b', join(repo, 'pose-link'));
  const linkB = await captureRepositoryIdentity({ repoRoot: repo, evidenceDir });
  assert.notEqual(linkA.fingerprint, linkB.fingerprint);

  writeFileSync(join(repo, 'src/legacy-pose.js'), 'export const pose = 3;\n', 'utf8');
  git(repo, 'add', '.');
  git(repo, 'commit', '-qm', 'identity change');
  const committed = await captureRepositoryIdentity({ repoRoot: repo, evidenceDir });
  assert.notEqual(committed.head_commit, base.head_commit);
  assert.notEqual(committed.head_tree, base.head_tree);
});

test('clean recursive submodule commits affect identity and dirty submodules fail closed', async () => {
  const child = mkdtempSync(join(tmpdir(), 'buildctl-submodule-'));
  sandboxes.push(child);
  git(child, 'init', '-q');
  git(child, 'config', 'user.email', 'buildctl@example.test');
  git(child, 'config', 'user.name', 'Buildctl Test');
  writeFileSync(join(child, 'value.txt'), 'one\n', 'utf8');
  git(child, 'add', '.');
  git(child, 'commit', '-qm', 'child one');

  const { repo, evidenceDir } = makeRepo();
  git(repo, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', child, 'vendor/child');
  git(repo, 'commit', '-qam', 'add submodule');
  const clean = await captureRepositoryIdentity({ repoRoot: repo, evidenceDir });

  writeFileSync(join(repo, 'vendor/child/value.txt'), 'dirty\n', 'utf8');
  await assert.rejects(
    captureRepositoryIdentity({ repoRoot: repo, evidenceDir }),
    (error) => error.code === 'E_DIRTY_SUBMODULE',
  );

  git(join(repo, 'vendor/child'), 'add', 'value.txt');
  git(join(repo, 'vendor/child'), 'config', 'user.email', 'buildctl@example.test');
  git(join(repo, 'vendor/child'), 'config', 'user.name', 'Buildctl Test');
  git(join(repo, 'vendor/child'), 'commit', '-qm', 'child two');
  git(repo, 'add', 'vendor/child');
  const changed = await captureRepositoryIdentity({ repoRoot: repo, evidenceDir });
  assert.notEqual(changed.fingerprint, clean.fingerprint);
});

test('runEvidence stores bounded tails and hashes full output with repository metadata', async () => {
  const { repo, contractPath, evidenceDir } = makeRepo();
  const exact = nodeCommand("process.stdout.write('x'.repeat(20000)); process.stderr.write('y'.repeat(18000));");
  const result = await runEvidence({
    repoRoot: repo,
    contractPath,
    evidenceDir,
    commands: [exact],
    maxOutputBytes: 1024,
  });

  assert.equal(result.ledger.status, 'passed');
  assert.equal(result.ledger.passes, 1);
  const receipt = JSON.parse(readFileSync(result.ledger.receipts[0].path, 'utf8'));
  assert.equal(receipt.command, exact);
  assert.equal(receipt.exit_code, 0);
  assert.equal(receipt.stdout.bytes, 20000);
  assert.equal(receipt.stderr.bytes, 18000);
  assert.ok(Buffer.byteLength(receipt.stdout.tail) <= 1024);
  assert.ok(Buffer.byteLength(receipt.stderr.tail) <= 1024);
  assert.equal(receipt.stdout.truncated, true);
  assert.equal(receipt.stderr.truncated, true);
  assert.match(receipt.stdout.sha256, /^[a-f0-9]{64}$/);
  assert.match(receipt.stderr.sha256, /^[a-f0-9]{64}$/);
  assert.match(receipt.output_sha256, /^[a-f0-9]{64}$/);
  assert.match(receipt.plan_hash, /^[a-f0-9]{64}$/);
  assert.match(receipt.contract_hash, /^[a-f0-9]{64}$/);
  assert.match(receipt.repository.head_tree, /^[a-f0-9]{40,64}$/);
  assert.deepEqual(await checkEvidence({ repoRoot: repo, contractPath, evidenceDir }), {
    ok: true,
    diagnostics: [],
    ledger: result.ledger,
  });
});

test('stable exact command receipts deduplicate only at identical repository identity', async () => {
  const { repo, contractPath, evidenceDir } = makeRepo();
  const counter = join(tmpdir(), `buildctl-counter-${Date.now()}-${Math.random()}`);
  sandboxes.push(counter);
  const exact = nodeCommand(`require('node:fs').appendFileSync(${JSON.stringify(counter)}, 'run\\n')`);

  const first = await runEvidence({ repoRoot: repo, contractPath, evidenceDir, commands: [exact] });
  const second = await runEvidence({ repoRoot: repo, contractPath, evidenceDir, commands: [exact] });
  assert.equal(readFileSync(counter, 'utf8'), 'run\n');
  assert.equal(first.ledger.receipts[0].reused, false);
  assert.equal(second.ledger.receipts[0].reused, true);

  writeFileSync(join(repo, 'src/legacy-pose.js'), 'export const pose = 9;\n', 'utf8');
  const stale = await checkEvidence({ repoRoot: repo, contractPath, evidenceDir });
  assert.equal(stale.ok, false);
  assert.ok(stale.diagnostics.some((d) => d.code === 'E_RECEIPT_STALE'));
  const third = await runEvidence({ repoRoot: repo, contractPath, evidenceDir, commands: [exact] });
  assert.equal(readFileSync(counter, 'utf8'), 'run\nrun\n');
  assert.equal(third.ledger.receipts[0].reused, false);
});

test('one-shot content writers rerun at final identity and evidence output does not self-invalidate', async () => {
  const { repo, contractPath, evidenceDir } = makeRepo();
  const exact = nodeCommand("const fs=require('node:fs'); if(!fs.existsSync('generated.txt')) fs.writeFileSync('generated.txt','stable\\n')");
  const result = await runEvidence({ repoRoot: repo, contractPath, evidenceDir, commands: [exact] });
  assert.equal(result.ledger.passes, 2);
  assert.equal(result.ledger.status, 'passed');
  assert.equal(result.ledger.receipts[0].reused, false);
  assert.equal((await checkEvidence({ repoRoot: repo, contractPath, evidenceDir })).ok, true);
});

test('non-idempotent content writers fail closed after three passes', async () => {
  const { repo, contractPath, evidenceDir } = makeRepo();
  const exact = nodeCommand("require('node:fs').appendFileSync('changing.txt','x')");
  await assert.rejects(
    runEvidence({ repoRoot: repo, contractPath, evidenceDir, commands: [exact] }),
    (error) => error.code === 'E_EVIDENCE_UNSTABLE' && error.passes === 3,
  );
});

test('failed exact commands produce failed fresh receipts without a pass claim', async () => {
  const { repo, contractPath, evidenceDir } = makeRepo();
  const exact = nodeCommand("process.stderr.write('broken'); process.exit(7)");
  const result = await runEvidence({ repoRoot: repo, contractPath, evidenceDir, commands: [exact] });
  assert.equal(result.ledger.status, 'failed');
  const receipt = JSON.parse(readFileSync(result.ledger.receipts[0].path, 'utf8'));
  assert.equal(receipt.exit_code, 7);
  assert.equal(receipt.stderr.tail, 'broken');
});
