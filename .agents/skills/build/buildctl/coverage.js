import {
  evidenceReceiptStableFor,
  readEvidenceReceipt,
} from './evidence.js';
import { resolveInsideRepo } from './plan-contract.js';

function diagnostic(code, path, message) {
  return { code, path, message };
}

export function receiptIndex({ ledger, contract, identity, repoRoot, diagnostics }) {
  const receipts = new Map();
  for (const [index, reference] of (ledger?.receipts || []).entries()) {
    try {
      const path = resolveInsideRepo(
        reference.path,
        repoRoot,
        `ledger.receipts[${index}].path`,
        { mustExist: true },
      );
      const receipt = readEvidenceReceipt(path);
      if (receipts.has(reference.command)) {
        diagnostics.push(diagnostic(
          'E_COMPLETION_RECEIPT_DUPLICATE',
          `ledger.receipts[${index}]`,
          reference.command,
        ));
      } else if (evidenceReceiptStableFor(
        receipt,
        reference.command,
        identity,
        contract,
        ledger.max_output_bytes,
      )) {
        receipts.set(reference.command, receipt);
      }
    } catch (error) {
      diagnostics.push(diagnostic(
        error.code || 'E_COMPLETION_RECEIPT',
        `ledger.receipts[${index}]`,
        error.message,
      ));
    }
  }
  return receipts;
}

export function splitEvidenceRef(ref, path, diagnostics) {
  const delimiter = ref.lastIndexOf(' :: ');
  if (delimiter <= 0 || delimiter === ref.length - 4) {
    diagnostics.push(diagnostic(
      'E_EXPECTED_OBSERVATION_SCHEMA',
      path,
      'Expected <exact command> :: <literal observation>.',
    ));
    return null;
  }
  return { command: ref.slice(0, delimiter), observation: ref.slice(delimiter + 4) };
}

function commandConsumer(contract, command, predicate) {
  const evidence = contract.evidence_commands.find((entry) => entry.command === command);
  return evidence?.consumers.some(predicate) || false;
}

export function evaluateCoverage({ contract, slice, receipts, judgments, diagnostics }) {
  const tasks = contract.execution_manifest.filter((task) => slice.task_ids.includes(task.id));
  const resolvedRequirements = new Set();
  const requiredCommands = new Set(slice.verify);
  for (const task of tasks) {
    requiredCommands.add(task.verify);
    const binding = contract.bindings.find((entry) => entry.task_id === task.id);
    const mustHave = task.must_haves.find((entry) => entry.id === binding?.must_have_id);
    let resolved = Boolean(binding && mustHave);
    if (!resolved) diagnostics.push(diagnostic(
      'E_COMPLETION_BINDING',
      `tasks.${task.id}`,
      'Task has no exact binding/must-have chain.',
    ));
    if (resolved && ['behavioral-test', 'command-assertion'].includes(mustHave.evidence.kind)) {
      const parsed = splitEvidenceRef(
        mustHave.evidence.ref,
        `tasks.${task.id}.must_haves.${mustHave.id}.evidence.ref`,
        diagnostics,
      );
      resolved = Boolean(parsed);
      if (parsed) {
        requiredCommands.add(parsed.command);
        const receipt = receipts.get(parsed.command);
        const consumed = commandConsumer(contract, parsed.command, (consumer) =>
          consumer.authority === 'task'
          && consumer.task_id === task.id
          && consumer.must_have_ids?.includes(mustHave.id));
        const output = receipt ? `${receipt.stdout.tail}\n${receipt.stderr.tail}` : '';
        if (!receipt || !consumed || !output.includes(parsed.observation)) {
          resolved = false;
          diagnostics.push(diagnostic(
            !receipt ? 'E_COMPLETION_RECEIPT_MISSING'
              : !consumed ? 'E_COMPLETION_CONSUMER'
                : 'E_EXPECTED_OBSERVATION',
            `tasks.${task.id}.must_haves.${mustHave.id}`,
            !receipt ? parsed.command
              : !consumed ? `No exact consumer for ${parsed.command}.`
                : `Expected literal ${JSON.stringify(parsed.observation)} in stored output.`,
          ));
        }
      }
    } else if (resolved) {
      resolved = judgments.has(`binding:${binding.id}`);
    }
    if (resolved) for (const requirement of task.requirements) resolvedRequirements.add(requirement);
    if (!commandConsumer(contract, task.verify, (consumer) =>
      consumer.authority === 'task' && consumer.task_id === task.id)) {
      diagnostics.push(diagnostic(
        'E_COMPLETION_CONSUMER',
        `tasks.${task.id}.verify`,
        `No task consumer for ${task.verify}.`,
      ));
    }
  }
  for (const [index, claim] of slice.must_haves.entries()) {
    const id = `slice:${slice.id}:must-have:${index}`;
    if (!judgments.has(id)) diagnostics.push(diagnostic(
      'E_JUDGMENT_MISSING',
      `slice.must_haves[${index}]`,
      `Slice judgment ${id} is not accepted for ${JSON.stringify(claim)}.`,
    ));
  }
  for (const requirement of slice.requirements) {
    if (!resolvedRequirements.has(requirement)) diagnostics.push(diagnostic(
      'E_COMPLETION_REQUIREMENT',
      `slice.requirements.${requirement}`,
      'No resolved task must-have covers this requirement.',
    ));
  }
  for (const command of requiredCommands) {
    if (!receipts.has(command)) diagnostics.push(diagnostic(
      'E_COMPLETION_RECEIPT_MISSING',
      'slice.commands',
      command,
    ));
  }
  for (const command of slice.verify) {
    if (!commandConsumer(contract, command, (consumer) =>
      consumer.authority === 'slice' && consumer.slice_id === slice.id)) {
      diagnostics.push(diagnostic(
        'E_COMPLETION_CONSUMER',
        'slice.verify',
        `No slice consumer for ${command}.`,
      ));
    }
  }
  return { requiredCommands: [...requiredCommands].sort(), resolvedRequirements };
}

export function evaluateWorkflowCoverage({
  completionReceipts,
  contract,
  receipts,
}) {
  const gaps = new Set();
  const resolvedRequirements = new Set();
  const requiredCommands = new Set();
  const failedCommands = [...receipts.entries()]
    .filter(([, receipt]) => receipt.exit_code !== 0 || receipt.signal)
    .map(([command]) => command)
    .sort();
  for (const task of contract.execution_manifest) {
    const slice = contract.delivery_slices.find((entry) => entry.task_ids.includes(task.id));
    const completion = slice ? completionReceipts.get(slice.id) : null;
    const judgments = new Set(completion?.authorized_decision?.judgment_ids || []);
    const binding = contract.bindings.find((entry) => entry.task_id === task.id);
    const mustHave = task.must_haves.find((entry) => entry.id === binding?.must_have_id);
    let resolved = Boolean(slice && completion && binding && mustHave);
    if (!slice) gaps.add(`task:${task.id}:slice`);
    if (!completion) gaps.add(`slice:${slice?.id || 'unknown'}:completion-receipt`);
    if (!binding || !mustHave) gaps.add(`task:${task.id}:binding`);
    requiredCommands.add(task.verify);
    const taskReceipt = receipts.get(task.verify);
    if (!taskReceipt) {
      resolved = false;
      gaps.add(`task:${task.id}:verify-receipt`);
    } else if (taskReceipt.exit_code !== 0 || taskReceipt.signal) {
      resolved = false;
    }
    if (!commandConsumer(contract, task.verify, (consumer) =>
      consumer.authority === 'task' && consumer.task_id === task.id)) {
      resolved = false;
      gaps.add(`task:${task.id}:verify-consumer`);
    }
    if (mustHave && ['behavioral-test', 'command-assertion'].includes(mustHave.evidence.kind)) {
      const parseDiagnostics = [];
      const parsed = splitEvidenceRef(mustHave.evidence.ref, task.id, parseDiagnostics);
      if (!parsed) {
        resolved = false;
        gaps.add(`task:${task.id}:evidence-ref`);
      } else {
        requiredCommands.add(parsed.command);
        const receipt = receipts.get(parsed.command);
        if (!receipt) {
          resolved = false;
          gaps.add(`task:${task.id}:must-have-receipt`);
        } else {
          if (receipt.exit_code !== 0 || receipt.signal) resolved = false;
          const output = `${receipt.stdout.tail}\n${receipt.stderr.tail}`;
          if (!output.includes(parsed.observation)) {
            resolved = false;
            gaps.add(`task:${task.id}:expected-observation`);
          }
        }
        if (!commandConsumer(contract, parsed.command, (consumer) =>
          consumer.authority === 'task'
          && consumer.task_id === task.id
          && consumer.must_have_ids?.includes(mustHave.id))) {
          resolved = false;
          gaps.add(`task:${task.id}:must-have-consumer`);
        }
      }
    } else if (binding && mustHave && !judgments.has(`binding:${binding.id}`)) {
      resolved = false;
      gaps.add(`binding:${binding.id}:judgment`);
    }
    if (resolved) for (const requirement of task.requirements) resolvedRequirements.add(requirement);
  }
  for (const slice of contract.delivery_slices) {
    const completion = completionReceipts.get(slice.id);
    const judgments = new Set(completion?.authorized_decision?.judgment_ids || []);
    for (const command of slice.verify) {
      requiredCommands.add(command);
      if (!receipts.has(command)) gaps.add(`slice:${slice.id}:verify-receipt`);
      if (!commandConsumer(contract, command, (consumer) =>
        consumer.authority === 'slice' && consumer.slice_id === slice.id)) {
        gaps.add(`slice:${slice.id}:verify-consumer`);
      }
    }
    slice.must_haves.forEach((claim, index) => {
      if (!judgments.has(`slice:${slice.id}:must-have:${index}`)) {
        gaps.add(`slice:${slice.id}:must-have:${index}`);
      }
    });
    for (const requirement of slice.requirements) {
      if (!resolvedRequirements.has(requirement)) gaps.add(`requirement:${requirement}`);
    }
  }
  for (const command of requiredCommands) {
    if (!receipts.has(command)) gaps.add(`command:${command}`);
  }
  return {
    failedCommands,
    gaps: [...gaps].sort(),
    requiredCommands: [...requiredCommands].sort(),
    resolvedRequirements: [...resolvedRequirements].sort(),
  };
}
