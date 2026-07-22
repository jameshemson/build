import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { ROOT } from './utils.js';

const CLI = join(ROOT, 'source/skills/build/buildctl/cli.js');
const VALID_PLAN = join(ROOT, 'scripts/fixtures/buildctl/kemet-lite/valid-plan.yaml');
const sandboxes = [];

afterEach(() => {
  for (const path of sandboxes.splice(0)) rmSync(path, { recursive: true, force: true });
});

function command(cmd, cwd) {
  const result = spawnSync(cmd[0], cmd.slice(1), { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `${cmd.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

function makeRepo() {
  const repo = mkdtempSync(join(tmpdir(), 'buildctl-transition-'));
  sandboxes.push(repo);
  command(['git', 'init', '-q'], repo);
  command(['git', 'config', 'user.email', 'buildctl@example.test'], repo);
  command(['git', 'config', 'user.name', 'Buildctl Test'], repo);
  writeFileSync(join(repo, 'plan.yaml'), readFileSync(VALID_PLAN, 'utf8'), 'utf8');
  mkdirSync(join(repo, 'src'), { recursive: true });
  writeFileSync(join(repo, 'src/value.js'), 'export const value = 1;\n', 'utf8');
  command(['git', 'add', '.'], repo);
  command(['git', 'commit', '-qm', 'fixture'], repo);
  const contractPath = join(repo, '.build/contracts/transition/contract.json');
  command([process.execPath, CLI, 'validate-plan', '--plan', 'plan.yaml', '--out', contractPath], repo);
  return { repo, contractPath, evidenceDir: join(repo, '.build/evidence/transition') };
}

function nodeCommand(script) {
  return `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`;
}

test('immutable: canonical writes are idempotent and collision-safe', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'buildctl-immutable-'));
  sandboxes.push(directory);
  const path = join(directory, 'nested', 'receipt.json');
  const { writeImmutableJson } = await import('../../source/skills/build/buildctl/immutable-json.js');

  assert.equal(writeImmutableJson(path, { z: 1, a: { d: 2, b: 1 } }), path);
  const bytes = readFileSync(path, 'utf8');
  assert.equal(bytes, '{\n  "a": {\n    "b": 1,\n    "d": 2\n  },\n  "z": 1\n}\n');
  assert.equal(writeImmutableJson(path, { a: { b: 1, d: 2 }, z: 1 }), path);
  assert.equal(readFileSync(path, 'utf8'), bytes);
  assert.deepEqual(readdirSync(join(directory, 'nested')), ['receipt.json']);
  assert.throws(
    () => writeImmutableJson(path, { a: 2 }),
    (error) => error.code === 'E_IMMUTABLE_JSON_COLLISION',
  );
});

test('immutable: evidence receipt bytes, identity, and collision diagnostics stay compatible', async () => {
  const { repo, contractPath, evidenceDir } = makeRepo();
  const [{ canonicalJson, sha256 }, { runEvidence }] = await Promise.all([
    import('../../source/skills/build/buildctl/plan-contract.js'),
    import('../../source/skills/build/buildctl/evidence.js'),
  ]);
  const exact = nodeCommand("process.stdout.write('stable')");
  const first = await runEvidence({ repoRoot: repo, contractPath, evidenceDir, commands: [exact] });
  const path = first.ledger.receipts[0].path;
  const bytes = readFileSync(path, 'utf8');
  const receipt = JSON.parse(bytes);
  const expectedId = sha256([
    receipt.contract_hash,
    receipt.command,
    receipt.repository_before.fingerprint,
    receipt.repository_after.fingerprint,
    receipt.output_sha256,
    String(receipt.exit_code),
    receipt.signal || '',
    String(receipt.max_output_bytes),
  ].join('\0'));
  assert.equal(basename(path), `${expectedId}.json`);
  assert.equal(bytes, canonicalJson(receipt));
  const core = structuredClone(receipt);
  delete core.receipt_hash;
  assert.equal(receipt.receipt_hash, sha256(canonicalJson(core)));

  writeFileSync(path, `${bytes.trimEnd()} `, 'utf8');
  await assert.rejects(
    runEvidence({ repoRoot: repo, contractPath, evidenceDir, commands: [exact], force: true }),
    (error) => error.code === 'E_RECEIPT_COLLISION'
      && error.message === `Immutable receipt collision at ${path}.`,
  );
});
