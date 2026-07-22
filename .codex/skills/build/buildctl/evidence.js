import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import {
  BuildctlError,
  canonicalJson,
  loadContract,
  resolveInsideRepo,
  sha256,
} from './plan-contract.js';
import { captureRepositoryIdentity } from './repository.js';
import { atomicWrite, writeImmutableJson } from './immutable-json.js';

const KIBIBYTE = 2 ** 10;
const DEFAULT_MAX_OUTPUT_BYTES = 16 * KIBIBYTE;
const MAX_OUTPUT_BYTES = KIBIBYTE * KIBIBYTE;
const MAX_PASSES = 3;

function outputLimit(value) {
  const limit = value === undefined ? DEFAULT_MAX_OUTPUT_BYTES : value;
  if (!Number.isInteger(limit) || limit < 0 || limit > MAX_OUTPUT_BYTES) {
    throw new BuildctlError(
      'E_OUTPUT_BOUND',
      `maxOutputBytes must be an integer from 0 through ${MAX_OUTPUT_BYTES}.`,
    );
  }
  return limit;
}

function commandList(commands, contract) {
  const source = commands?.length
    ? commands
    : (contract.evidence_commands || []).map((entry) => entry.command);
  const unique = [];
  const seen = new Set();
  for (const command of source) {
    if (typeof command !== 'string' || !command) {
      throw new BuildctlError('E_EVIDENCE_COMMAND', 'Evidence commands must be non-empty strings.');
    }
    if (!seen.has(command)) {
      seen.add(command);
      unique.push(command);
    }
  }
  if (unique.length === 0) {
    throw new BuildctlError('E_EVIDENCE_COMMAND', 'No evidence commands were supplied or compiled.');
  }
  return unique;
}

class StreamReceipt {
  constructor(limit) {
    this.limit = limit;
    this.bytes = 0;
    this.hash = createHash('sha256');
    this.tail = Buffer.alloc(0);
  }

  update(chunk) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    this.bytes += bytes.length;
    this.hash.update(bytes);
    if (this.limit === 0) return;
    this.tail = Buffer.concat([this.tail, bytes]);
    if (this.tail.length > this.limit) this.tail = this.tail.subarray(this.tail.length - this.limit);
  }

  result() {
    let tail = this.limit === 0 ? '' : this.tail.toString('utf8');
    while (Buffer.byteLength(tail) > this.limit && tail.length > 0) tail = tail.slice(1);
    return {
      bytes: this.bytes,
      sha256: this.hash.digest('hex'),
      tail,
      truncated: this.bytes > this.limit,
    };
  }
}

function execute(command, repoRoot, limit) {
  return new Promise((resolvePromise, reject) => {
    const stdout = new StreamReceipt(limit);
    const stderr = new StreamReceipt(limit);
    const child = spawn(command, {
      cwd: repoRoot,
      env: process.env,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => stdout.update(chunk));
    child.stderr.on('data', (chunk) => stderr.update(chunk));
    child.on('error', (error) => reject(new BuildctlError(
      'E_EVIDENCE_SPAWN',
      `Cannot execute evidence command ${JSON.stringify(command)}: ${error.message}`,
    )));
    child.on('close', (exitCode, signal) => {
      const stdoutResult = stdout.result();
      const stderrResult = stderr.result();
      const outputSha256 = sha256(Buffer.from([
        'stdout',
        String(stdoutResult.bytes),
        stdoutResult.sha256,
        'stderr',
        String(stderrResult.bytes),
        stderrResult.sha256,
      ].join('\0')));
      resolvePromise({
        exit_code: exitCode,
        output_sha256: outputSha256,
        signal,
        stderr: stderrResult,
        stdout: stdoutResult,
      });
    });
  });
}

function receiptCore(receipt) {
  const copy = structuredClone(receipt);
  delete copy.receipt_hash;
  return copy;
}

function verifyReceiptHash(receipt) {
  const expected = sha256(canonicalJson(receiptCore(receipt)));
  if (receipt.receipt_hash !== expected) {
    throw new BuildctlError('E_RECEIPT_HASH', `Receipt hash mismatch: expected ${expected}.`);
  }
  return expected;
}

function receiptId(receipt) {
  return sha256([
    receipt.contract_hash,
    receipt.command,
    receipt.repository_before.fingerprint,
    receipt.repository_after.fingerprint,
    receipt.output_sha256,
    String(receipt.exit_code),
    receipt.signal || '',
    String(receipt.max_output_bytes),
  ].join('\0'));
}

function writeImmutableReceipt(receiptsDir, receipt) {
  receipt.receipt_hash = sha256(canonicalJson(receipt));
  const path = join(receiptsDir, `${receiptId(receipt)}.json`);
  return writeImmutableJson(path, receipt, {
    collisionCode: 'E_RECEIPT_COLLISION',
    collisionMessage: `Immutable receipt collision at ${path}.`,
  });
}

export function readEvidenceReceipt(path) {
  let receipt;
  try {
    receipt = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new BuildctlError('E_RECEIPT_JSON', `Cannot parse receipt ${path}: ${error.message}`);
  }
  verifyReceiptHash(receipt);
  return receipt;
}

export function evidenceReceiptStableFor(
  receipt,
  command,
  identity,
  contract,
  maxOutputBytes = receipt.max_output_bytes,
) {
  return receipt.command === command
    && receipt.contract_hash === contract.contract_hash
    && receipt.plan_hash === contract.source.sha256
    && receipt.compiler_version === contract.compiler.version
    && receipt.max_output_bytes === maxOutputBytes
    && receipt.repository?.fingerprint === identity.fingerprint
    && receipt.repository_before?.fingerprint === identity.fingerprint
    && receipt.repository_after?.fingerprint === identity.fingerprint;
}

function reusableReceipt(receiptsDir, command, identity, contract, maxOutputBytes) {
  if (!existsSync(receiptsDir)) return null;
  for (const name of readdirSync(receiptsDir).filter((entry) => entry.endsWith('.json')).sort()) {
    const path = join(receiptsDir, name);
    let receipt;
    try {
      receipt = readEvidenceReceipt(path);
    } catch {
      continue;
    }
    if (evidenceReceiptStableFor(receipt, command, identity, contract, maxOutputBytes)) {
      return { path, receipt };
    }
  }
  return null;
}

function reference(command, path, receipt, reused) {
  return {
    command,
    path,
    receipt_hash: receipt.receipt_hash,
    reused,
  };
}

function ledgerCore(ledger) {
  const copy = structuredClone(ledger);
  delete copy.ledger_hash;
  return copy;
}

function diagnostic(diagnostics, code, path, message) {
  diagnostics.push({ code, path, message });
}

export async function runEvidence({
  repoRoot = process.cwd(),
  contractPath,
  evidenceDir,
  commands,
  maxOutputBytes,
  force = false,
} = {}) {
  if (!contractPath) throw new BuildctlError('E_ARGUMENT', 'contractPath is required.');
  const loaded = loadContract({ contractPath, cwd: repoRoot });
  const root = loaded.repoRoot;
  const contract = loaded.contract;
  const exactCommands = commandList(commands, contract);
  const limit = outputLimit(maxOutputBytes);
  const directory = resolveInsideRepo(
    evidenceDir || join('.build', 'evidence', contract.slug),
    root,
    'evidence directory',
  );
  const receiptsDir = join(directory, 'receipts');
  mkdirSync(receiptsDir, { recursive: true });

  for (let pass = 1; pass <= MAX_PASSES; pass += 1) {
    const passReferences = new Map();
    for (const command of exactCommands) {
      const before = await captureRepositoryIdentity({ repoRoot: root, evidenceDir: directory });
      const reusable = force ? null : reusableReceipt(receiptsDir, command, before, contract, limit);
      if (reusable) {
        passReferences.set(command, reference(command, reusable.path, reusable.receipt, true));
        continue;
      }
      const result = await execute(command, root, limit);
      const after = await captureRepositoryIdentity({ repoRoot: root, evidenceDir: directory });
      const receipt = {
        command,
        compiler_version: contract.compiler.version,
        contract_hash: contract.contract_hash,
        exit_code: result.exit_code,
        max_output_bytes: limit,
        output_sha256: result.output_sha256,
        plan_hash: contract.source.sha256,
        repository: after,
        repository_after: after,
        repository_before: before,
        schema_version: 1,
        signal: result.signal,
        stderr: result.stderr,
        stdout: result.stdout,
      };
      const path = writeImmutableReceipt(receiptsDir, receipt);
      passReferences.set(command, reference(command, path, receipt, false));
    }

    const finalIdentity = await captureRepositoryIdentity({ repoRoot: root, evidenceDir: directory });
    const finalReferences = [];
    let stable = true;
    for (const command of exactCommands) {
      const currentReference = passReferences.get(command);
      const currentReceipt = readEvidenceReceipt(currentReference.path);
      if (evidenceReceiptStableFor(currentReceipt, command, finalIdentity, contract, limit)) {
        finalReferences.push(currentReference);
        continue;
      }
      const reusable = force
        ? null
        : reusableReceipt(receiptsDir, command, finalIdentity, contract, limit);
      if (reusable) finalReferences.push(reference(command, reusable.path, reusable.receipt, true));
      else stable = false;
    }
    if (!stable) {
      if (pass === MAX_PASSES) {
        throw new BuildctlError(
          'E_EVIDENCE_UNSTABLE',
          `Evidence commands did not converge after ${MAX_PASSES} passes.`,
          { passes: MAX_PASSES },
        );
      }
      continue;
    }

    const receiptValues = finalReferences.map((item) => readEvidenceReceipt(item.path));
    const status = receiptValues.every((receipt) => receipt.exit_code === 0 && !receipt.signal)
      ? 'passed'
      : 'failed';
    const ledger = {
      commands: exactCommands,
      compiler_version: contract.compiler.version,
      contract_hash: contract.contract_hash,
      contract_path: relative(root, loaded.contractPath).split('\\').join('/'),
      max_output_bytes: limit,
      passes: pass,
      plan_hash: contract.source.sha256,
      receipts: finalReferences,
      repository: finalIdentity,
      schema_version: 1,
      status,
    };
    ledger.ledger_hash = sha256(canonicalJson(ledger));
    const ledgerPath = join(directory, 'ledger.json');
    atomicWrite(ledgerPath, canonicalJson(ledger));
    return { ledger, ledgerPath };
  }
  throw new BuildctlError('E_EVIDENCE_UNSTABLE', 'Evidence convergence failed.');
}

export async function checkEvidence({
  repoRoot = process.cwd(),
  contractPath,
  evidenceDir,
} = {}) {
  if (!contractPath) throw new BuildctlError('E_ARGUMENT', 'contractPath is required.');
  const loaded = loadContract({ contractPath, cwd: repoRoot });
  const root = loaded.repoRoot;
  const contract = loaded.contract;
  const directory = resolveInsideRepo(
    evidenceDir || join('.build', 'evidence', contract.slug),
    root,
    'evidence directory',
  );
  const ledgerPath = join(directory, 'ledger.json');
  const diagnostics = [];
  let ledger;
  if (!existsSync(ledgerPath)) {
    diagnostic(diagnostics, 'E_EVIDENCE_LEDGER_MISSING', 'ledger', ledgerPath);
    return { ok: false, diagnostics, ledger: null };
  }
  try {
    ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
  } catch (error) {
    diagnostic(diagnostics, 'E_EVIDENCE_LEDGER_JSON', 'ledger', error.message);
    return { ok: false, diagnostics, ledger: null };
  }

  const expectedLedgerHash = sha256(canonicalJson(ledgerCore(ledger)));
  if (ledger.ledger_hash !== expectedLedgerHash) {
    diagnostic(diagnostics, 'E_EVIDENCE_LEDGER_HASH', 'ledger.ledger_hash', expectedLedgerHash);
  }
  if (
    ledger.contract_hash !== contract.contract_hash
    || ledger.plan_hash !== contract.source.sha256
    || ledger.compiler_version !== contract.compiler.version
  ) {
    diagnostic(diagnostics, 'E_RECEIPT_STALE', 'ledger.contract', 'plan, contract, or compiler changed');
  }

  const current = await captureRepositoryIdentity({ repoRoot: root, evidenceDir: directory });
  if (ledger.repository?.fingerprint !== current.fingerprint) {
    diagnostic(diagnostics, 'E_RECEIPT_STALE', 'ledger.repository', 'repository identity changed');
  }
  const ledgerCommands = Array.isArray(ledger.commands) ? ledger.commands : [];
  const ledgerReceipts = Array.isArray(ledger.receipts) ? ledger.receipts : [];
  if (!Array.isArray(ledger.commands) || !Array.isArray(ledger.receipts)) {
    diagnostic(diagnostics, 'E_EVIDENCE_LEDGER_SCHEMA', 'ledger', 'commands and receipts must be arrays');
  }
  const commandsSeen = new Set();
  for (const [index, item] of ledgerReceipts.entries()) {
    const path = `ledger.receipts[${index}]`;
    if (commandsSeen.has(item.command)) {
      diagnostic(diagnostics, 'E_EVIDENCE_DUPLICATE', path, item.command);
    }
    commandsSeen.add(item.command);
    let receipt;
    try {
      const receiptPath = resolveInsideRepo(item.path, root, `${path}.path`, { mustExist: true });
      receipt = readEvidenceReceipt(receiptPath);
    } catch (error) {
      diagnostic(diagnostics, error.code || 'E_RECEIPT_INVALID', path, error.message);
      continue;
    }
    if (item.receipt_hash !== receipt.receipt_hash || item.command !== receipt.command) {
      diagnostic(diagnostics, 'E_RECEIPT_REFERENCE', path, 'ledger reference does not match receipt');
    }
    if (!evidenceReceiptStableFor(
      receipt,
      item.command,
      current,
      contract,
      ledger.max_output_bytes,
    )) {
      diagnostic(diagnostics, 'E_RECEIPT_STALE', path, 'receipt is not stable at current identity');
    }
    if (receipt.exit_code !== 0 || receipt.signal) {
      diagnostic(diagnostics, 'E_EVIDENCE_COMMAND_FAILED', path, item.command);
    }
  }
  for (const command of ledgerCommands) {
    if (!commandsSeen.has(command)) {
      diagnostic(diagnostics, 'E_EVIDENCE_COVERAGE', 'ledger.commands', command);
    }
  }
  if (ledgerReceipts.length !== ledgerCommands.length) {
    diagnostic(diagnostics, 'E_EVIDENCE_COVERAGE', 'ledger.receipts', 'receipt count mismatch');
  }
  diagnostics.sort((left, right) =>
    left.code.localeCompare(right.code)
      || left.path.localeCompare(right.path)
      || left.message.localeCompare(right.message));
  return { ok: diagnostics.length === 0, diagnostics, ledger };
}
