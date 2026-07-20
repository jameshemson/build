#!/usr/bin/env node

import { compilePlan, BuildctlError, resolveCompilerVersion } from './plan-contract.js';

function usage() {
  return [
    'Usage:',
    '  buildctl validate-plan --plan <plan.md|plan.yaml> [--out <contract.json>]',
    '  buildctl run-evidence --contract <contract.json> [--command <exact>]...',
    '      [--evidence-dir <dir>] [--max-output-bytes <0..1048576>] [--force]',
    '  buildctl run-evidence --contract <contract.json> [--evidence-dir <dir>] --check-only',
    '  buildctl --version',
  ].join('\n');
}

function parseArgs(args) {
  const flags = { command: [] };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--force' || arg === '--check-only') {
      flags[arg.slice(2)] = true;
      continue;
    }
    if (!arg.startsWith('--')) {
      throw new BuildctlError('E_ARGUMENT', `Unexpected argument: ${arg}`);
    }
    const key = arg.slice(2);
    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new BuildctlError('E_ARGUMENT', `${arg} requires a value.`);
    }
    index += 1;
    if (key === 'command') flags.command.push(value);
    else flags[key] = value;
  }
  return flags;
}

function required(flags, key) {
  if (!flags[key]) throw new BuildctlError('E_ARGUMENT', `--${key} is required.`);
  return flags[key];
}

function printError(error) {
  if (Array.isArray(error.diagnostics)) {
    for (const item of error.diagnostics) {
      process.stderr.write(`${item.code} ${item.path}: ${item.message}\n`);
    }
    return;
  }
  process.stderr.write(`${error.code || 'E_BUILDCTL'}: ${error.message}\n`);
}

async function main() {
  if (Number(process.versions.node.split('.')[0]) < 20) {
    throw new BuildctlError('E_NODE_VERSION', 'buildctl requires Node.js 20 or newer.');
  }
  const args = process.argv.slice(2);
  if (args.length === 1 && (args[0] === '--version' || args[0] === '-v')) {
    process.stdout.write(`${resolveCompilerVersion()}\n`);
    return;
  }
  const command = args.shift();
  if (!command || command === '--help' || command === '-h') {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const flags = parseArgs(args);
  if (command === 'validate-plan') {
    const result = compilePlan({
      planPath: required(flags, 'plan'),
      outputPath: flags.out,
    });
    process.stdout.write(`${JSON.stringify({
      contract_hash: result.contract.contract_hash,
      contract_path: result.contractPath,
      ok: true,
      plan_hash: result.contract.source.sha256,
    })}\n`);
    return;
  }
  if (command === 'run-evidence') {
    const { checkEvidence, runEvidence } = await import('./evidence.js');
    const options = {
      commands: flags.command,
      contractPath: required(flags, 'contract'),
      evidenceDir: flags['evidence-dir'],
      force: Boolean(flags.force),
    };
    if (flags['max-output-bytes'] !== undefined) {
      options.maxOutputBytes = Number(flags['max-output-bytes']);
    }
    if (flags['check-only']) {
      const result = await checkEvidence(options);
      process.stdout.write(`${JSON.stringify(result)}\n`);
      if (!result.ok) process.exitCode = 1;
      return;
    }
    const result = await runEvidence(options);
    process.stdout.write(`${JSON.stringify({
      ledger_path: result.ledgerPath,
      passes: result.ledger.passes,
      receipts: result.ledger.receipts.length,
      status: result.ledger.status,
    })}\n`);
    if (result.ledger.status !== 'passed') process.exitCode = 1;
    return;
  }
  throw new BuildctlError('E_ARGUMENT', `Unknown subcommand: ${command}\n${usage()}`);
}

main().catch((error) => {
  printError(error);
  process.exitCode = 1;
});
