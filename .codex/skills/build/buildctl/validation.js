const TOP_LEVEL = [
  'assumptions',
  'bindings',
  'decisions',
  'delivery_slices',
  'evidence_mode',
  'execution_manifest',
  'requirements',
];
const BINDING_FIELDS = ['id', 'kind', 'must_have_id', 'name', 'task_id'];
const TASK_FIELDS = [
  'decisions',
  'depends_on',
  'done',
  'files_modified',
  'id',
  'must_haves',
  'requirements',
  'verify',
  'wave',
  'workstream',
];
const MUST_HAVE_FIELDS = ['claim', 'evidence', 'id'];
const EVIDENCE_FIELDS = ['kind', 'ref'];
const SLICE_FIELDS = [
  'depends_on',
  'done',
  'goal',
  'id',
  'must_haves',
  'requirements',
  'task_ids',
  'verify',
];
const EVIDENCE_KINDS = new Set([
  'behavioral-test',
  'command-assertion',
  'manual-receipt',
  'structural',
]);
const BINDING_KINDS = new Set(['behavior', 'invariant', 'symbol']);

function diagnostic(list, code, path, message) {
  list.push({ code, path, message });
}

function exactFields(value, fields, path, diagnostics) {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    diagnostic(diagnostics, 'E_SCHEMA_TYPE', path, 'must be a map');
    return false;
  }
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (actual.join('\0') !== expected.join('\0')) {
    diagnostic(
      diagnostics,
      'E_SCHEMA_FIELDS',
      path,
      `expected fields ${expected.join(', ')}; received ${actual.join(', ')}`,
    );
    return false;
  }
  return true;
}

function nonEmptyString(value, path, diagnostics) {
  if (typeof value !== 'string' || !value.trim()) {
    diagnostic(diagnostics, 'E_SCHEMA_TYPE', path, 'must be a non-empty string');
    return false;
  }
  return true;
}

function stringArray(value, path, diagnostics, { nonEmpty = false } = {}) {
  if (!Array.isArray(value) || (nonEmpty && value.length === 0)) {
    diagnostic(diagnostics, 'E_SCHEMA_TYPE', path, `must be ${nonEmpty ? 'a non-empty' : 'an'} array`);
    return false;
  }
  value.forEach((entry, index) => nonEmptyString(entry, `${path}[${index}]`, diagnostics));
  return true;
}

function ids(values, pattern, path, diagnostics) {
  if (!stringArray(values, path, diagnostics)) return new Set();
  const seen = new Set();
  values.forEach((value, index) => {
    if (!pattern.test(value)) diagnostic(diagnostics, 'E_ID_FORMAT', `${path}[${index}]`, value);
    if (seen.has(value)) diagnostic(diagnostics, 'E_ID_DUPLICATE', `${path}[${index}]`, value);
    seen.add(value);
  });
  return seen;
}

function checkRefs(values, declared, path, diagnostics) {
  if (!Array.isArray(values)) return;
  values.forEach((value, index) => {
    if (!declared.has(value)) diagnostic(diagnostics, 'E_ID_REFERENCE', `${path}[${index}]`, value);
  });
}

function pathIsSafe(path) {
  return typeof path === 'string'
    && path.length > 0
    && !path.startsWith('/')
    && !path.startsWith('\\')
    && !/^[A-Za-z]:[\\/]/.test(path)
    && !path.split(/[\\/]/).includes('..');
}

function commandRef(ref) {
  const delimiter = ' :: ';
  const first = ref.indexOf(delimiter);
  if (first <= 0 || first !== ref.lastIndexOf(delimiter)) return null;
  const command = ref.slice(0, first);
  const assertion = ref.slice(first + delimiter.length);
  if (!command.trim() || !assertion.trim()) return null;
  return { command, assertion };
}

function taskCycle(tasks, byId, diagnostics) {
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) {
      diagnostic(diagnostics, 'E_TASK_DAG_CYCLE', `execution_manifest.${id}`, 'dependency cycle');
      return;
    }
    if (visited.has(id) || !byId.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id).depends_on || []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  }
  for (const task of tasks) visit(task.id);
}

function sliceClosure(sliceId, slicesById, memo = new Map()) {
  if (memo.has(sliceId)) return memo.get(sliceId);
  const closure = new Set();
  memo.set(sliceId, closure);
  for (const dependency of slicesById.get(sliceId)?.depends_on || []) {
    closure.add(dependency);
    for (const inherited of sliceClosure(dependency, slicesById, memo)) closure.add(inherited);
  }
  return closure;
}

function derivedWorkstreams(tasks) {
  const byName = new Map();
  for (const task of tasks) {
    if (!byName.has(task.workstream)) byName.set(task.workstream, { files: new Set(), task_ids: [] });
    const workstream = byName.get(task.workstream);
    workstream.task_ids.push(task.id);
    for (const file of task.files_modified || []) workstream.files.add(file);
  }
  return [...byName.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => ({
      files: [...value.files].sort(),
      name,
      task_ids: value.task_ids,
    }));
}

function evidenceCommands(tasks, slices) {
  const commands = new Map();
  function add(command, consumer) {
    if (!commands.has(command)) commands.set(command, []);
    const key = JSON.stringify(consumer);
    if (!commands.get(command).some((entry) => JSON.stringify(entry) === key)) {
      commands.get(command).push(consumer);
    }
  }
  for (const task of tasks) {
    add(task.verify, {
      authority: 'task',
      must_have_ids: (task.must_haves || []).map((item) => item.id),
      requirements: task.requirements || [],
      task_id: task.id,
    });
  }
  for (const slice of slices) {
    for (const command of slice.verify || []) {
      add(command, {
        authority: 'slice',
        requirements: slice.requirements || [],
        slice_id: slice.id,
      });
    }
  }
  return [...commands.entries()].map(([command, consumers]) => ({ command, consumers }));
}

export function validateContract(document, approachMarkers) {
  const diagnostics = [];
  if (!exactFields(document, TOP_LEVEL, 'contract', diagnostics)) {
    return { diagnostics, evidenceCommands: [], workstreams: [] };
  }
  if (document.evidence_mode !== 'typed') {
    diagnostic(diagnostics, 'E_EVIDENCE_MODE', 'evidence_mode', 'must equal typed');
  }
  const requirementIds = ids(document.requirements, /^REQ-\d{3}$/, 'requirements', diagnostics);
  const decisionIds = ids(document.decisions, /^D-\d{3}$/, 'decisions', diagnostics);
  ids(document.assumptions, /^A-\d{3}$/, 'assumptions', diagnostics);
  const markerIds = ids(approachMarkers, /^B-\d{3}$/, 'approach_bindings', diagnostics);

  const bindings = Array.isArray(document.bindings) ? document.bindings : [];
  if (!Array.isArray(document.bindings)) {
    diagnostic(diagnostics, 'E_SCHEMA_TYPE', 'bindings', 'must be an array');
  }
  const bindingIds = new Set();
  bindings.forEach((binding, index) => {
    const path = `bindings[${index}]`;
    if (!exactFields(binding, BINDING_FIELDS, path, diagnostics)) return;
    if (!/^B-\d{3}$/.test(binding.id)) diagnostic(diagnostics, 'E_ID_FORMAT', `${path}.id`, binding.id);
    if (bindingIds.has(binding.id)) diagnostic(diagnostics, 'E_ID_DUPLICATE', `${path}.id`, binding.id);
    bindingIds.add(binding.id);
    if (!BINDING_KINDS.has(binding.kind)) diagnostic(diagnostics, 'E_BINDING_KIND', `${path}.kind`, binding.kind);
    nonEmptyString(binding.name, `${path}.name`, diagnostics);
  });
  if (
    markerIds.size !== bindingIds.size
    || [...markerIds].some((id) => !bindingIds.has(id))
    || [...bindingIds].some((id) => !markerIds.has(id))
  ) {
    diagnostic(
      diagnostics,
      'E_APPROACH_BINDING_COVERAGE',
      'approach_bindings',
      `markers=${[...markerIds].sort().join(',')} bindings=${[...bindingIds].sort().join(',')}`,
    );
  }

  const tasks = Array.isArray(document.execution_manifest) ? document.execution_manifest : [];
  if (!Array.isArray(document.execution_manifest)) {
    diagnostic(diagnostics, 'E_SCHEMA_TYPE', 'execution_manifest', 'must be an array');
  }
  const taskIds = new Set();
  const mustHaveIds = new Set();
  const byTask = new Map();
  tasks.forEach((task, index) => {
    const path = `execution_manifest[${index}]`;
    if (!exactFields(task, TASK_FIELDS, path, diagnostics)) return;
    if (!/^T-\d{3}$/.test(task.id)) diagnostic(diagnostics, 'E_ID_FORMAT', `${path}.id`, task.id);
    if (taskIds.has(task.id)) diagnostic(diagnostics, 'E_ID_DUPLICATE', `${path}.id`, task.id);
    taskIds.add(task.id);
    byTask.set(task.id, task);
    if (!Number.isInteger(task.wave) || task.wave < 0) {
      diagnostic(diagnostics, 'E_SCHEMA_TYPE', `${path}.wave`, 'must be a non-negative integer');
    }
    stringArray(task.depends_on, `${path}.depends_on`, diagnostics);
    stringArray(task.requirements, `${path}.requirements`, diagnostics, { nonEmpty: true });
    stringArray(task.decisions, `${path}.decisions`, diagnostics, { nonEmpty: true });
    checkRefs(task.requirements, requirementIds, `${path}.requirements`, diagnostics);
    checkRefs(task.decisions, decisionIds, `${path}.decisions`, diagnostics);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(task.workstream || '')) {
      diagnostic(diagnostics, 'E_WORKSTREAM_NAME', `${path}.workstream`, task.workstream);
    }
    if (stringArray(task.files_modified, `${path}.files_modified`, diagnostics, { nonEmpty: true })) {
      const files = new Set();
      task.files_modified.forEach((file, fileIndex) => {
        if (!pathIsSafe(file)) diagnostic(diagnostics, 'E_FILE_PATH', `${path}.files_modified[${fileIndex}]`, file);
        if (files.has(file)) diagnostic(diagnostics, 'E_FILE_DUPLICATE', `${path}.files_modified[${fileIndex}]`, file);
        files.add(file);
      });
    }
    nonEmptyString(task.verify, `${path}.verify`, diagnostics);
    nonEmptyString(task.done, `${path}.done`, diagnostics);
    if (!Array.isArray(task.must_haves) || task.must_haves.length !== 1) {
      diagnostic(diagnostics, 'E_TASK_ATOMICITY', `${path}.must_haves`, 'compiled tasks require exactly one must-have');
    }
    for (const [mustIndex, mustHave] of (task.must_haves || []).entries()) {
      const mustPath = `${path}.must_haves[${mustIndex}]`;
      if (!exactFields(mustHave, MUST_HAVE_FIELDS, mustPath, diagnostics)) continue;
      if (!/^MH-\d{3}$/.test(mustHave.id)) diagnostic(diagnostics, 'E_ID_FORMAT', `${mustPath}.id`, mustHave.id);
      if (mustHaveIds.has(mustHave.id)) diagnostic(diagnostics, 'E_ID_DUPLICATE', `${mustPath}.id`, mustHave.id);
      mustHaveIds.add(mustHave.id);
      nonEmptyString(mustHave.claim, `${mustPath}.claim`, diagnostics);
      if (!exactFields(mustHave.evidence, EVIDENCE_FIELDS, `${mustPath}.evidence`, diagnostics)) continue;
      const evidence = mustHave.evidence;
      if (!EVIDENCE_KINDS.has(evidence.kind)) {
        diagnostic(diagnostics, 'E_EVIDENCE_KIND', `${mustPath}.evidence.kind`, evidence.kind);
      }
      if (!nonEmptyString(evidence.ref, `${mustPath}.evidence.ref`, diagnostics)) continue;
      if (evidence.kind === 'behavioral-test' || evidence.kind === 'command-assertion') {
        const parsed = commandRef(evidence.ref);
        if (!parsed) {
          diagnostic(
            diagnostics,
            'E_EVIDENCE_REF',
            `${mustPath}.evidence.ref`,
            'requires <exact command> :: <expected observation>',
          );
        } else if (parsed.command !== task.verify) {
          diagnostic(
            diagnostics,
            'E_EVIDENCE_COMMAND_MISMATCH',
            `${mustPath}.evidence.ref`,
            `evidence command ${parsed.command} differs from task verify ${task.verify}`,
          );
        }
      }
    }
  });

  const usedRequirements = new Set(tasks.flatMap((task) => task.requirements || []));
  const usedDecisions = new Set(tasks.flatMap((task) => task.decisions || []));
  for (const requirement of requirementIds) {
    if (!usedRequirements.has(requirement)) diagnostic(diagnostics, 'E_ID_COVERAGE', 'requirements', requirement);
  }
  for (const decision of decisionIds) {
    if (!usedDecisions.has(decision)) diagnostic(diagnostics, 'E_ID_COVERAGE', 'decisions', decision);
  }

  const bindingByTask = new Map();
  bindings.forEach((binding, index) => {
    const path = `bindings[${index}]`;
    if (!taskIds.has(binding.task_id)) diagnostic(diagnostics, 'E_ID_REFERENCE', `${path}.task_id`, binding.task_id);
    if (!mustHaveIds.has(binding.must_have_id)) {
      diagnostic(diagnostics, 'E_ID_REFERENCE', `${path}.must_have_id`, binding.must_have_id);
    }
    if (!bindingByTask.has(binding.task_id)) bindingByTask.set(binding.task_id, []);
    bindingByTask.get(binding.task_id).push(binding);
    const task = byTask.get(binding.task_id);
    if (task && !(task.must_haves || []).some((item) => item.id === binding.must_have_id)) {
      diagnostic(diagnostics, 'E_BINDING_OWNERSHIP', path, `${binding.must_have_id} is not owned by ${binding.task_id}`);
    }
    const mustHave = task?.must_haves?.find((item) => item.id === binding.must_have_id);
    if (binding.kind === 'behavior' && mustHave?.evidence?.kind === 'structural') {
      diagnostic(diagnostics, 'E_EVIDENCE_KIND_MISMATCH', path, 'behavior cannot use structural evidence');
    }
  });
  for (const task of tasks) {
    if ((bindingByTask.get(task.id) || []).length !== 1) {
      diagnostic(diagnostics, 'E_TASK_ATOMICITY', `execution_manifest.${task.id}`, 'requires exactly one binding');
    }
  }

  for (const task of tasks) {
    for (const dependency of task.depends_on || []) {
      if (!byTask.has(dependency)) {
        diagnostic(diagnostics, 'E_TASK_DAG_REFERENCE', `execution_manifest.${task.id}.depends_on`, dependency);
      } else if (byTask.get(dependency).wave >= task.wave) {
        diagnostic(
          diagnostics,
          'E_TASK_DAG_WAVE',
          `execution_manifest.${task.id}.depends_on`,
          `${dependency} wave ${byTask.get(dependency).wave} is not earlier than ${task.wave}`,
        );
      }
    }
  }
  taskCycle(tasks, byTask, diagnostics);
  for (let left = 0; left < tasks.length; left += 1) {
    for (let right = left + 1; right < tasks.length; right += 1) {
      if (tasks[left].wave !== tasks[right].wave) continue;
      const overlap = (tasks[left].files_modified || []).filter((file) =>
        (tasks[right].files_modified || []).includes(file));
      if (overlap.length > 0) {
        diagnostic(
          diagnostics,
          'E_FILE_OWNERSHIP_OVERLAP',
          `execution_manifest.${tasks[left].id}/${tasks[right].id}`,
          overlap.sort().join(', '),
        );
      }
    }
  }

  const slices = Array.isArray(document.delivery_slices) ? document.delivery_slices : [];
  if (!Array.isArray(document.delivery_slices) || slices.length === 0) {
    diagnostic(diagnostics, 'E_SCHEMA_TYPE', 'delivery_slices', 'must be a non-empty array');
  }
  const sliceIds = new Set();
  const slicesById = new Map();
  const taskMembership = new Map();
  slices.forEach((slice, index) => {
    const path = `delivery_slices[${index}]`;
    if (!exactFields(slice, SLICE_FIELDS, path, diagnostics)) return;
    if (!/^S-\d{3}$/.test(slice.id)) diagnostic(diagnostics, 'E_ID_FORMAT', `${path}.id`, slice.id);
    if (sliceIds.has(slice.id)) diagnostic(diagnostics, 'E_ID_DUPLICATE', `${path}.id`, slice.id);
    sliceIds.add(slice.id);
    slicesById.set(slice.id, slice);
    nonEmptyString(slice.goal, `${path}.goal`, diagnostics);
    nonEmptyString(slice.done, `${path}.done`, diagnostics);
    stringArray(slice.depends_on, `${path}.depends_on`, diagnostics);
    stringArray(slice.task_ids, `${path}.task_ids`, diagnostics, { nonEmpty: true });
    stringArray(slice.requirements, `${path}.requirements`, diagnostics, { nonEmpty: true });
    stringArray(slice.must_haves, `${path}.must_haves`, diagnostics, { nonEmpty: true });
    stringArray(slice.verify, `${path}.verify`, diagnostics, { nonEmpty: true });
    checkRefs(slice.requirements, requirementIds, `${path}.requirements`, diagnostics);
    for (const dependency of slice.depends_on || []) {
      const dependencyIndex = slices.findIndex((candidate) => candidate.id === dependency);
      if (dependencyIndex < 0 || dependencyIndex >= index) {
        diagnostic(diagnostics, 'E_SLICE_DAG', `${path}.depends_on`, dependency);
      }
    }
    for (const taskId of slice.task_ids || []) {
      const task = byTask.get(taskId);
      if (!task) diagnostic(diagnostics, 'E_SLICE_TASK_REFERENCE', `${path}.task_ids`, taskId);
      else if (task.wave === 0) diagnostic(diagnostics, 'E_SLICE_WAVE_ZERO', `${path}.task_ids`, taskId);
      if (!taskMembership.has(taskId)) taskMembership.set(taskId, []);
      taskMembership.get(taskId).push(slice.id);
      if (task) {
        for (const requirement of task.requirements || []) {
          if (!(slice.requirements || []).includes(requirement)) {
            diagnostic(diagnostics, 'E_SLICE_REQUIREMENT_COVERAGE', path, `${taskId}:${requirement}`);
          }
        }
      }
    }
  });
  for (const task of tasks) {
    const count = (taskMembership.get(task.id) || []).length;
    if (task.wave === 0 && count !== 0) {
      diagnostic(diagnostics, 'E_SLICE_MEMBERSHIP', `execution_manifest.${task.id}`, `Wave 0 count ${count}`);
    }
    if (task.wave > 0 && count !== 1) {
      diagnostic(diagnostics, 'E_SLICE_MEMBERSHIP', `execution_manifest.${task.id}`, `count ${count}`);
    }
  }
  for (const slice of slices) {
    const closure = sliceClosure(slice.id, slicesById);
    for (const taskId of slice.task_ids || []) {
      const task = byTask.get(taskId);
      for (const dependency of task?.depends_on || []) {
        const dependencyTask = byTask.get(dependency);
        if (!dependencyTask || dependencyTask.wave === 0 || (slice.task_ids || []).includes(dependency)) continue;
        const owner = (taskMembership.get(dependency) || [])[0];
        if (!closure.has(owner)) {
          diagnostic(
            diagnostics,
            'E_SLICE_DEPENDENCY_CLOSURE',
            `delivery_slices.${slice.id}`,
            `${taskId} depends on ${dependency} in ${owner}`,
          );
        }
      }
    }
  }

  diagnostics.sort((a, b) =>
    a.code.localeCompare(b.code) || a.path.localeCompare(b.path) || a.message.localeCompare(b.message));
  return {
    diagnostics,
    evidenceCommands: evidenceCommands(tasks, slices),
    workstreams: derivedWorkstreams(tasks),
  };
}
