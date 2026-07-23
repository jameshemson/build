#!/usr/bin/env node

import { compilePlan, BuildctlError, resolveCompilerVersion } from './plan-contract.js';

const MINIMUM_NODE_MAJOR = 2 * 10;
const MAX_OUTPUT_BYTES = 2 ** (2 * 10);

function usage() {
  return [
    'Usage:',
    '  buildctl validate-plan --plan <plan.md|plan.yaml> [--out <contract.json>]',
    '  buildctl run-evidence --contract <contract.json> [--command <exact>]...',
    `      [--evidence-dir <dir>] [--max-output-bytes <0..${MAX_OUTPUT_BYTES}>] [--force]`,
    '  buildctl run-evidence --contract <contract.json> [--evidence-dir <dir>] --check-only',
    '  buildctl check-counters --state <state.md>',
    '  buildctl compile-result --state <state.md> --contract <contract.json>',
    '      --artifact <phase-report.md> [--evidence-dir <dir>] [--receipts-dir <dir>]',
    '  buildctl complete-slice --state <state.md> --contract <contract.json>',
    '      --summary <implementation-summary.md> --judgments <judgments.yaml>',
    '      [--evidence-dir <dir>] [--receipts-dir <dir>]',
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
  if (Number(process.versions.node.split('.')[0]) < MINIMUM_NODE_MAJOR) {
    throw new BuildctlError('E_NODE_VERSION', `buildctl requires Node.js ${MINIMUM_NODE_MAJOR} or newer.`);
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
  if (command === 'check-counters') {
    const [{ evaluateCircuitEvents }, { loadWorkflowState }] = await Promise.all([
      import('./counters.js'),
      import('./workflow-state.js'),
    ]);
    const state = loadWorkflowState({
      statePath: required(flags, 'state'),
      required: ['counter_events'],
    });
    const result = evaluateCircuitEvents(state.values.counter_events);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.status !== 'allow') process.exitCode = 1;
    return;
  }
  if (command === 'compile-result') {
    const { compilePhaseResult } = await import('./phase-results.js');
    const result = await compilePhaseResult({
      artifactPath: required(flags, 'artifact'),
      contractPath: required(flags, 'contract'),
      evidenceDir: flags['evidence-dir'],
      receiptsDir: flags['receipts-dir'],
      statePath: required(flags, 'state'),
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (command === 'complete-slice') {
    const { completeSlice } = await import('./completion.js');
    const result = await completeSlice({
      contractPath: required(flags, 'contract'),
      evidenceDir: flags['evidence-dir'],
      judgmentsPath: required(flags, 'judgments'),
      receiptsDir: flags['receipts-dir'],
      statePath: required(flags, 'state'),
      summaryPath: required(flags, 'summary'),
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.status === 'blocked') process.exitCode = 1;
    return;
  }
  throw new BuildctlError('E_ARGUMENT', `Unknown subcommand: ${command}\n${usage()}`);
}

main().catch((error) => {
  printError(error);
  process.exitCode = 1;
});
