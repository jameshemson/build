import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
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

  chmodSync(join(repo, 'plan.yaml'), 0o755);
  const executable = await captureRepositoryIdentity({ repoRoot: repo, evidenceDir });
  assert.notEqual(executable.fingerprint, linkB.fingerprint);
  await assert.rejects(
    captureRepositoryIdentity({ repoRoot: repo, evidenceDir: repo }),
    (error) => error.code === 'E_EVIDENCE_PATH',
  );

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

  writeFileSync(join(repo, 'vendor/child/value.txt'), 'one\n', 'utf8');
  writeFileSync(join(repo, 'vendor/child/untracked.txt'), 'untracked\n', 'utf8');
  await assert.rejects(
    captureRepositoryIdentity({ repoRoot: repo, evidenceDir }),
    (error) => error.code === 'E_DIRTY_SUBMODULE',
  );
  rmSync(join(repo, 'vendor/child/untracked.txt'));
  writeFileSync(join(repo, 'vendor/child/value.txt'), 'dirty\n', 'utf8');

  git(join(repo, 'vendor/child'), 'add', 'value.txt');
  git(join(repo, 'vendor/child'), 'config', 'user.email', 'buildctl@example.test');
  git(join(repo, 'vendor/child'), 'config', 'user.name', 'Buildctl Test');
  git(join(repo, 'vendor/child'), 'commit', '-qm', 'child two');
  git(repo, 'add', 'vendor/child');
  const changed = await captureRepositoryIdentity({ repoRoot: repo, evidenceDir });
  assert.notEqual(changed.fingerprint, clean.fingerprint);
});

test('nested clean submodule commits are included recursively', async () => {
  const grandchild = mkdtempSync(join(tmpdir(), 'buildctl-grandchild-'));
  sandboxes.push(grandchild);
  git(grandchild, 'init', '-q');
  git(grandchild, 'config', 'user.email', 'buildctl@example.test');
  git(grandchild, 'config', 'user.name', 'Buildctl Test');
  writeFileSync(join(grandchild, 'nested.txt'), 'one\n', 'utf8');
  git(grandchild, 'add', '.');
  git(grandchild, 'commit', '-qm', 'grandchild one');

  const child = mkdtempSync(join(tmpdir(), 'buildctl-recursive-child-'));
  sandboxes.push(child);
  git(child, 'init', '-q');
  git(child, 'config', 'user.email', 'buildctl@example.test');
  git(child, 'config', 'user.name', 'Buildctl Test');
  writeFileSync(join(child, 'child.txt'), 'child\n', 'utf8');
  git(child, 'add', '.');
  git(child, 'commit', '-qm', 'child base');
  git(child, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', grandchild, 'nested/grandchild');
  git(child, 'commit', '-qam', 'add nested submodule');

  const { repo, evidenceDir } = makeRepo();
  git(repo, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', child, 'vendor/child');
  git(repo, '-c', 'protocol.file.allow=always', 'submodule', 'update', '--init', '--recursive');
  git(repo, 'commit', '-qam', 'add recursive submodule');
  const first = await captureRepositoryIdentity({ repoRoot: repo, evidenceDir });
  assert.deepEqual(first.submodules.map((item) => item.path), [
    'vendor/child',
    'vendor/child/nested/grandchild',
  ]);

  const nested = join(repo, 'vendor/child/nested/grandchild');
  writeFileSync(join(nested, 'nested.txt'), 'two\n', 'utf8');
  git(nested, 'config', 'user.email', 'buildctl@example.test');
  git(nested, 'config', 'user.name', 'Buildctl Test');
  git(nested, 'add', 'nested.txt');
  git(nested, 'commit', '-qm', 'grandchild two');
  const checkedOutChild = join(repo, 'vendor/child');
  git(checkedOutChild, 'config', 'user.email', 'buildctl@example.test');
  git(checkedOutChild, 'config', 'user.name', 'Buildctl Test');
  git(checkedOutChild, 'add', 'nested/grandchild');
  git(checkedOutChild, 'commit', '-qm', 'advance nested submodule');
  git(repo, 'add', 'vendor/child');
  const second = await captureRepositoryIdentity({ repoRoot: repo, evidenceDir });
  assert.notEqual(second.fingerprint, first.fingerprint);
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

  const first = await runEvidence({ repoRoot: repo, contractPath, evidenceDir, commands: [exact, exact] });
  const second = await runEvidence({ repoRoot: repo, contractPath, evidenceDir, commands: [exact] });
  assert.equal(readFileSync(counter, 'utf8'), 'run\n');
  assert.equal(first.ledger.receipts.length, 1);
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
  assert.equal(readdirSync(join(evidenceDir, 'receipts')).length, 2);
  assert.equal((await checkEvidence({ repoRoot: repo, contractPath, evidenceDir })).ok, true);
});

test('output bounds support hash-only receipts and reject values above one MiB', async () => {
  const { repo, contractPath, evidenceDir } = makeRepo();
  const exact = nodeCommand("process.stdout.write('secret')");
  const result = await runEvidence({
    repoRoot: repo,
    contractPath,
    evidenceDir,
    commands: [exact],
    maxOutputBytes: 0,
  });
  const receipt = JSON.parse(readFileSync(result.ledger.receipts[0].path, 'utf8'));
  assert.equal(receipt.stdout.bytes, 6);
  assert.equal(receipt.stdout.tail, '');
  assert.equal(receipt.stdout.truncated, true);
  const bounded = await runEvidence({
    repoRoot: repo,
    contractPath,
    evidenceDir,
    commands: [exact],
    maxOutputBytes: 1,
  });
  const boundedReceipt = JSON.parse(readFileSync(bounded.ledger.receipts[0].path, 'utf8'));
  assert.notEqual(bounded.ledger.receipts[0].path, result.ledger.receipts[0].path);
  assert.equal(boundedReceipt.stdout.tail, 't');
  await assert.rejects(
    runEvidence({
      repoRoot: repo,
      contractPath,
      evidenceDir,
      commands: [exact],
      maxOutputBytes: 1024 * 1024 + 1,
    }),
    (error) => error.code === 'E_OUTPUT_BOUND',
  );
});

test('stale contracts and tampered receipts fail closed', async () => {
  const first = makeRepo();
  const exact = nodeCommand("process.stdout.write('ok')");
  const result = await runEvidence({
    repoRoot: first.repo,
    contractPath: first.contractPath,
    evidenceDir: first.evidenceDir,
    commands: [exact],
  });
  const receiptPath = result.ledger.receipts[0].path;
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  receipt.stdout.tail = 'tampered';
  writeFileSync(receiptPath, `${JSON.stringify(receipt)}\n`, 'utf8');
  const tampered = await checkEvidence({
    repoRoot: first.repo,
    contractPath: first.contractPath,
    evidenceDir: first.evidenceDir,
  });
  assert.equal(tampered.ok, false);
  assert.ok(tampered.diagnostics.some((item) => item.code === 'E_RECEIPT_HASH'));

  const second = makeRepo();
  await runEvidence({
    repoRoot: second.repo,
    contractPath: second.contractPath,
    evidenceDir: second.evidenceDir,
    commands: [exact],
  });
  writeFileSync(join(second.repo, 'plan.yaml'), `${readFileSync(join(second.repo, 'plan.yaml'), 'utf8')}\n`, 'utf8');
  await assert.rejects(
    checkEvidence({
      repoRoot: second.repo,
      contractPath: second.contractPath,
      evidenceDir: second.evidenceDir,
    }),
    (error) => error.code === 'E_CONTRACT_STALE',
  );
});

test('run-evidence CLI writes and check-only validates the same stable ledger', () => {
  const { repo, contractPath, evidenceDir } = makeRepo();
  const exact = nodeCommand("process.stdout.write('cli-ok')");
  const run = spawnSync(
    process.execPath,
    [
      CLI,
      'run-evidence',
      '--contract', contractPath,
      '--evidence-dir', evidenceDir,
      '--command', exact,
      '--max-output-bytes', '32',
    ],
    { cwd: repo, encoding: 'utf8' },
  );
  assert.equal(run.status, 0, run.stderr);
  assert.equal(JSON.parse(run.stdout).status, 'passed');

  const check = spawnSync(
    process.execPath,
    [
      CLI,
      'run-evidence',
      '--contract', contractPath,
      '--evidence-dir', evidenceDir,
      '--check-only',
    ],
    { cwd: repo, encoding: 'utf8' },
  );
  assert.equal(check.status, 0, check.stderr);
  assert.equal(JSON.parse(check.stdout).ok, true);
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
