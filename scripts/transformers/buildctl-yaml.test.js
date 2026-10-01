import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { ROOT } from './utils.js';
import {
  BuildctlError,
  parseYaml,
  parseMarkdownYamlSection,
} from '../../source/skills/build/buildctl/plan-contract.js';

const GOLDEN_PATH = join(ROOT, 'scripts/fixtures/buildctl/yaml-golden.json');
const FIXTURE_DIRS = ['scripts/fixtures/buildctl', 'source/skills/eval/fixtures'];
const YAML_DIRS = ['scripts/fixtures/buildctl'];
const EXTRA_MARKDOWN = [
  'source/skills/review-plan/SKILL.md',
  'source/skills/verify/SKILL.md',
  'source/skills/architect-review/SKILL.md',
];
const SECTIONS = ['Execution manifest', 'Delivery slices', 'Machine result'];

const ANCHOR_KEYS = [
  'scripts/fixtures/buildctl/kemet-lite/valid-plan.md#Execution manifest',
  'scripts/fixtures/buildctl/kemet-lite/valid-plan.md#Delivery slices',
  'scripts/fixtures/buildctl/kemet-lite/valid-plan.yaml#',
  'scripts/fixtures/buildctl/phase-results/plan-review.md#Machine result',
  'scripts/fixtures/buildctl/phase-results/verify.md#Machine result',
  'scripts/fixtures/buildctl/phase-results/architect-review.md#Machine result',
];

function toPosix(path) {
  return path.split(sep).join('/');
}

function compareCodePoints(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

// Recursively list files under a repo-relative directory whose names match, as
// repo-relative POSIX paths.
function listFiles(relDir, pattern) {
  const found = [];
  const walk = (absDir) => {
    for (const entry of readdirSync(absDir, { withFileTypes: true })) {
      const absPath = join(absDir, entry.name);
      if (entry.isDirectory()) walk(absPath);
      else if (entry.isFile() && pattern.test(entry.name)) {
        found.push(toPosix(relative(ROOT, absPath)));
      }
    }
  };
  walk(join(ROOT, relDir));
  return found;
}

// Parse one golden source. `key` is "<repo-relative path>#<section>"; an empty
// section means the whole file is YAML. Throws when the source does not parse.
function parseKey(key) {
  const hash = key.lastIndexOf('#');
  const path = key.slice(0, hash);
  const section = key.slice(hash + 1);
  const text = readFileSync(join(ROOT, path), 'utf8');
  return section === '' ? parseYaml(text) : parseMarkdownYamlSection(text, section);
}

// Every candidate golden key, deterministically sorted. Candidates that do not
// parse are filtered out by collectGolden.
function candidateKeys() {
  const markdown = new Set(EXTRA_MARKDOWN);
  for (const dir of FIXTURE_DIRS) {
    for (const path of listFiles(dir, /\.md$/)) markdown.add(path);
  }
  const keys = [];
  for (const path of markdown) {
    for (const section of SECTIONS) keys.push(`${path}#${section}`);
  }
  for (const dir of YAML_DIRS) {
    for (const path of listFiles(dir, /\.ya?ml$/)) keys.push(`${path}#`);
  }
  return keys.sort(compareCodePoints);
}

function collectGolden() {
  const golden = {};
  for (const key of candidateKeys()) {
    try {
      golden[key] = parseKey(key);
    } catch {
      // Only successful parses are recorded.
    }
  }
  return golden;
}

test('yaml golden: fixture documents parse unchanged', () => {
  // Regenerating the golden file is legitimate only before a deliberate parser
  // change, never to make a failing comparison pass.
  if (process.env.UPDATE_YAML_GOLDEN === '1') {
    const golden = collectGolden();
    const sorted = {};
    for (const key of Object.keys(golden).sort(compareCodePoints)) sorted[key] = golden[key];
    writeFileSync(GOLDEN_PATH, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
    return;
  }

  const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));
  for (const anchor of ANCHOR_KEYS) {
    assert.ok(Object.hasOwn(golden, anchor), `golden file is missing anchor key: ${anchor}`);
  }
  for (const key of Object.keys(golden)) {
    let parsed;
    try {
      parsed = parseKey(key);
    } catch (error) {
      assert.fail(`golden key no longer parses: ${key}: ${error.message}`);
    }
    assert.deepEqual(parsed, golden[key], `parse result changed for golden key: ${key}`);
  }
  console.log('yaml golden complete');
});

const CLI = join(ROOT, 'source/skills/build/buildctl/cli.js');
const VALID_PLAN_MD = join(ROOT, 'scripts/fixtures/buildctl/kemet-lite/valid-plan.md');

const MACHINE_RESULT = {
  schema_version: 1,
  phase: 'verify',
  verdict: 'partial',
  subjects: [{ name: 'plan', sha256: 'abc' }],
  findings: [
    { id: 'VR-001', severity: 'minor', summary: 'The build passes, but X' },
  ],
};

const MACHINE_RESULT_YAML = [
  'schema_version: 1',
  'phase: verify',
  'verdict: partial',
  'subjects:',
  '  - { name: plan, sha256: "abc" }',
  'findings:',
  '  - id: VR-001',
  '    severity: minor',
  '    summary: The build passes, but X',
].join('\n');

const FENCE = '```';

function machineResultMarkdown(language, body) {
  return `# Verify\n\nPartial.\n\n## Machine result\n\n${FENCE}${language}\n${body}\n${FENCE}\n`;
}

// Compile a rewritten copy of valid-plan.md in a throwaway Git repository and
// return the CLI result.
function validateRewrittenPlan(rewrite) {
  const repo = mkdtempSync(join(tmpdir(), 'buildctl-yaml-'));
  try {
    const init = spawnSync('git', ['init', '-q'], { cwd: repo, encoding: 'utf8' });
    assert.equal(init.status, 0, init.stderr);
    const original = readFileSync(VALID_PLAN_MD, 'utf8');
    const rewritten = rewrite(original);
    assert.notEqual(rewritten, original, 'plan rewrite must change the fixture');
    writeFileSync(join(repo, 'plan.md'), rewritten, 'utf8');
    return spawnSync(process.execPath, [
      CLI,
      'validate-plan',
      '--plan', 'plan.md',
      '--out', join(repo, '.build/contracts/plan/contract.json'),
    ], { cwd: repo, encoding: 'utf8' });
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

test('yaml block scalars: a block map value keeps its comma', () => {
  assert.deepEqual(parseYaml('summary: The build passes, but X'), {
    summary: 'The build passes, but X',
  });
});

test('yaml block scalars: a block sequence item keeps its comma', () => {
  assert.deepEqual(parseYaml('- a, b'), ['a, b']);
});

test('yaml block scalars: flow collections still split on commas', () => {
  assert.deepEqual(parseYaml('key: [a, b]'), { key: ['a', 'b'] });
  assert.deepEqual(parseYaml('key: { name: x, sha256: "abc" }'), {
    key: { name: 'x', sha256: 'abc' },
  });
});

test('yaml block scalars: quoted scalars keep their commas', () => {
  assert.deepEqual(parseYaml('a: "x, y"'), { a: 'x, y' });
  assert.deepEqual(parseYaml("a: 'x, y'"), { a: 'x, y' });
});

test('yaml block scalars: plain scalar coercion is unchanged', () => {
  assert.deepEqual(parseYaml('a: true'), { a: true });
  assert.deepEqual(parseYaml('a: 3'), { a: 3 });
  assert.deepEqual(parseYaml('a: 1.5'), { a: 1.5 });
  assert.deepEqual(parseYaml('a: ~'), { a: null });
  assert.deepEqual(parseYaml('a: null'), { a: null });
  assert.deepEqual(parseYaml('a: 1, 2'), { a: '1, 2' });
});

test('yaml block scalars: a JSON object in a yaml Machine result fence parses like its YAML form', () => {
  const fromYaml = parseMarkdownYamlSection(
    machineResultMarkdown('yaml', MACHINE_RESULT_YAML),
    'Machine result',
  );
  const fromJson = parseMarkdownYamlSection(
    machineResultMarkdown('yaml', JSON.stringify(MACHINE_RESULT, null, 2)),
    'Machine result',
  );
  assert.deepEqual(fromYaml, MACHINE_RESULT);
  assert.deepEqual(fromJson, fromYaml);
});

test('yaml block scalars: invalid JSON in a Machine result fence reports E_YAML_PARSE', () => {
  assert.throws(
    () => parseMarkdownYamlSection(machineResultMarkdown('yaml', '{ "a": 1,'), 'Machine result'),
    (error) => error instanceof BuildctlError && error.code === 'E_YAML_PARSE',
  );
});

test('yaml block scalars: an unbracketed depends_on reports only a schema type error', () => {
  const result = validateRewrittenPlan((source) => source.replace(
    '    depends_on: []\n    workstream: legacy-pose',
    '    depends_on: T-001, T-002\n    workstream: legacy-pose',
  ));
  assert.equal(result.status, 1, result.stderr);
  assert.ok(result.stderr.includes('E_SCHEMA_TYPE'), result.stderr);
  assert.ok(result.stderr.includes('depends_on: must be an array'), result.stderr);
  assert.ok(!result.stderr.includes('E_TASK_DAG_REFERENCE'), result.stderr);
});

test('yaml block scalars: json fences are accepted for Machine result but not plan sections', () => {
  const fromJson = parseMarkdownYamlSection(
    machineResultMarkdown('json', JSON.stringify(MACHINE_RESULT, null, 2)),
    'Machine result',
  );
  const fromYaml = parseMarkdownYamlSection(
    machineResultMarkdown('yaml', MACHINE_RESULT_YAML),
    'Machine result',
  );
  assert.deepEqual(fromJson, fromYaml);

  // A valid JSON manifest in a json fence is still not a YAML fence.
  const result = validateRewrittenPlan((source) => {
    const manifest = parseMarkdownYamlSection(source, 'Execution manifest');
    const [before, after] = source.split('## Delivery slices');
    const jsonFence = `${FENCE}json\n${JSON.stringify(manifest, null, 2)}\n${FENCE}`;
    const rewritten = before.replace(/```yaml\n[\s\S]*?```/, () => jsonFence);
    return `${rewritten}## Delivery slices${after}`;
  });
  assert.equal(result.status, 1, result.stderr);
  assert.ok(result.stderr.includes('E_MARKDOWN_SECTION'), result.stderr);
  assert.ok(result.stderr.includes('## Execution manifest'), result.stderr);
  console.log('yaml block scalars complete');
});
