import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './utils.js';
import { transform } from './transform.js';
import { PROVIDERS } from './providers.js';
import { VERSION_CARRIERS } from './version-carriers.js';
import { parseMarkdownYamlSection } from '../../source/skills/build/buildctl/plan-contract.js';

const SKILLS = {
  'impl-plan': {
    path: 'source/skills/impl-plan/SKILL.md',
    artifact: '.build/plans/{slug}-plan.md',
  },
  'review-plan': {
    path: 'source/skills/review-plan/SKILL.md',
    artifact: '.build/plans/{slug}-review.md',
  },
  verify: {
    path: 'source/skills/verify/SKILL.md',
    artifact: '.build/plans/{slug}-verify.md',
  },
  'architect-review': {
    path: 'source/skills/architect-review/SKILL.md',
    artifact: '.build/plans/{slug}-architect-review.md',
  },
};

const SHARED_PATH = 'source/skills/impl-plan/reference/standalone-artifacts.md';

function read(path) {
  return readFileSync(join(ROOT, path), 'utf8');
}

function assertOrdered(content, terms, label) {
  let cursor = -1;
  for (const term of terms) {
    const next = content.indexOf(term, cursor + 1);
    assert.ok(next >= 0, `${label} missing ${JSON.stringify(term)}`);
    cursor = next;
  }
}

function assertSharedContract(content) {
  assertOrdered(content.replace(/\s+/g, ' '), [
    '## Mode and supplied inputs',
    'Use an explicitly supplied artifact path before request text',
    'plan, contract, ledger, requirements, context, implementation-summary, or Verify result',
    'Do not search for, infer, or fabricate missing siblings',
    '## Deterministic slug and collision rule',
    'lowercase ASCII',
    'outside `[a-z0-9]`',
    'first 48 characters',
    'fallback slug is `artifact`',
    'lowest available numeric suffix, starting with `-2`',
    'Never overwrite an existing artifact',
    '## Saving without changing the response',
    'write the exact Markdown body',
    'return that same body unchanged',
    '## buildctl availability and authority',
    'Node.js 20 or newer',
    '`../build/buildctl/cli.js`',
    '`source/skills/build/buildctl/cli.js`',
    'package `buildctl` bin',
    '`runtime-not-found`',
    '`node-version`',
    '`execution-unavailable`',
    'Runnable compiler or evidence diagnostics are authoritative and must not select fallback.',
    'Markdown/YAML remains authored authority; generated JSON remains generated.',
    '## Standalone authority boundary',
    'never create or mutate `*-state.md`',
    'The Build orchestrator remains the only workflow-state owner.',
  ], SHARED_PATH);
}

function assertPortableSkill(name, content) {
  const contract = SKILLS[name];
  assert.match(content, /\[standalone artifact rules\]\(\.\.\/impl-plan\/reference\/standalone-artifacts\.md\)|\[standalone artifact rules\]\(reference\/standalone-artifacts\.md\)/);
  assert.ok(content.includes(contract.artifact), `${name} missing ${contract.artifact}`);
  assert.match(content, /same (?:plan|report|Markdown) body/);
  assert.match(content, /supplied/);
  assert.match(content, /standalone/);
}

test('shared reference defines deterministic, collision-safe standalone artifacts', () => {
  const shared = read(SHARED_PATH);
  assertSharedContract(shared);
  for (const example of [
    'Request `Add OAuth / SSO` resolves to `add-oauth-sso`.',
    '`.build/plans/billing-review.md`',
    '`.build/plans/billing-2-review.md`',
    '`.build/contracts/billing/contract.json`',
  ]) {
    assert.ok(shared.includes(example), `shared contract missing path example ${example}`);
  }
});

test('every portable skill saves its natural artifact without replacing its response', () => {
  const shared = read(SHARED_PATH);
  for (const [name, { path }] of Object.entries(SKILLS)) {
    assertPortableSkill(name, read(path));
    assert.ok(shared.includes(SKILLS[name].artifact), `shared contract missing ${SKILLS[name].artifact}`);
  }
});

test('published phase-result examples use the compiler Markdown and YAML shape', () => {
  for (const [name, phase, verdict] of [
    ['review-plan', 'plan-review', 'proceed'],
    ['verify', 'verify', 'verified'],
    ['architect-review', 'architect-review', 'pass'],
  ]) {
    const parsed = parseMarkdownYamlSection(read(SKILLS[name].path), 'Machine result');
    assert.equal(parsed.schema_version, 1, name);
    assert.equal(parsed.phase, phase, name);
    assert.equal(parsed.verdict, verdict, name);
    assert.ok(Array.isArray(parsed.subjects), name);
    assert.ok(Array.isArray(parsed.findings), name);
  }
});

test('supplied artifacts are direct inputs and missing workflow context is never synthesized', () => {
  const shared = read(SHARED_PATH);
  for (const artifact of [
    'plan',
    'contract',
    'ledger',
    'requirements',
    'context',
    'implementation-summary',
    'Verify result',
  ]) {
    assert.ok(shared.includes(artifact), `shared contract missing supplied ${artifact}`);
  }
  assert.match(read(SKILLS['review-plan'].path), /supplied plan[\s\S]*contract[\s\S]*requirements[\s\S]*context/);
  assert.match(read(SKILLS.verify.path), /supplied plan[\s\S]*contract[\s\S]*ledger[\s\S]*requirements[\s\S]*context[\s\S]*implementation-summary/);
  assert.match(read(SKILLS['architect-review'].path), /supplied plan[\s\S]*implementation-summary[\s\S]*Verify result/);
  assert.match(shared, /Missing inputs stay explicitly\s+missing or `N\/A`/);
});

test('standalone Plan compiles with runnable buildctl and cannot demote diagnostics to fallback', () => {
  const shared = read(SHARED_PATH);
  const planner = read(SKILLS['impl-plan'].path);
  assertSharedContract(shared);
  assertOrdered(planner, [
    '.build/plans/{slug}-plan.md',
    '`validate-plan --plan .build/plans/{slug}-plan.md --out .build/contracts/{slug}/contract.json`',
    'report the generated contract path and compiler result without modifying the compiled plan',
  ], SKILLS['impl-plan'].path);
  assert.match(planner, /runnable diagnostic[\s\S]*authoritative/);
});

test('standalone skills have no workflow-state or git mutation authority', () => {
  const shared = read(SHARED_PATH);
  assert.match(shared, /no phase\s+transitions or auto-continuation/);
  assert.match(shared, /no branches, commits, merges, archives, checkpoints,\s+tags, releases, or git mutation/);
  assert.match(shared, /no synthetic context, requirements, implementation\s+summaries, ledgers, contracts, or receipts/);
  for (const { path } of Object.values(SKILLS)) {
    const content = read(path);
    assert.doesNotMatch(content, /git (?:switch|add|commit|merge|tag|push|checkout|reset)\b/);
    assert.doesNotMatch(content, /(?:create|write|update|mutate) (?:the )?[^\n]*-state\.md/i);
  }
});

test('negative mutations break the shared standalone authority contract', () => {
  const shared = read(SHARED_PATH).replace(/\s+/g, ' ');
  for (const phrase of [
    'Use an explicitly supplied artifact path before request text',
    'lowest available numeric suffix, starting with `-2`',
    'Runnable compiler or evidence diagnostics are authoritative and must not select fallback.',
    'never create or mutate `*-state.md`',
  ]) {
    assert.ok(shared.includes(phrase), `fixture missing ${phrase}`);
    assert.throws(() => assertSharedContract(shared.replace(phrase, '')));
  }
});

test('all provider transforms retain portable artifact behavior without syntax leakage', () => {
  const codexBodies = new Map();
  for (const [providerName, config] of Object.entries(PROVIDERS)) {
    if (config.exclude.includes('impl-plan')) continue;
    const shared = transform(read(SHARED_PATH), providerName, config);
    assertSharedContract(shared);
    const bodies = [];
    for (const [skillName, { path }] of Object.entries(SKILLS)) {
      const output = transform(read(path), providerName, config);
      assertPortableSkill(skillName, output);
      if (providerName !== 'claude') {
        assert.doesNotMatch(output, /\$ARGUMENTS/);
        assert.doesNotMatch(output, /\/build:[\w-]+/);
      }
      bodies.push(output);
    }
    if (providerName.startsWith('codex')) codexBodies.set(providerName, bodies);
  }
  assert.deepEqual(codexBodies.get('codex-plugin'), codexBodies.get('codex'));
  assert.deepEqual(codexBodies.get('codex-cross'), codexBodies.get('codex'));
});

test('v1.14 standalone release preserves artifact continuity', () => {
  for (const carrier of VERSION_CARRIERS) {
    const json = JSON.parse(read(carrier.path));
    assert.equal(carrier.get(json), '1.14.1', carrier.path);
  }
  assert.match(read('README.md'), /standalone[\s\S]*\.build\/plans\/\{slug\}-(?:plan|review|verify|architect-review)\.md/i);
  assert.match(read('HARNESSES.md'), /standalone Plan[\s\S]*buildctl[\s\S]*OpenCode[\s\S]*fallback/i);
  assert.match(read('CHANGELOG.md'), /## 1\.12\.1 - 2026-07-21[\s\S]*standalone artifact/i);
});
