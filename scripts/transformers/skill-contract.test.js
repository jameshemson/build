import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ROOT } from './utils.js';

const REQUIRED_TERMS = {
  'source/skills/impl-plan/SKILL.md': [
    'Discovery level',
    'quick_verify',
    'standard_research',
    'deep_dive',
    'Requirements and decisions',
    'Wave 0 validation design',
    'execution_manifest',
    'files_modified',
    'must_haves',
    'depends_on',
    'Workflow artifacts',
    'UI contract',
  ],
  'source/skills/review-plan/SKILL.md': [
    'REQ-',
    'D-',
    'Wave 0',
    'execution_manifest',
    'wave graph',
    'files_modified',
    'must_haves',
    'required artifact',
  ],
  'source/skills/build/SKILL.md': [
    'base_ref',
    'git rev-parse HEAD',
    'execution_manifest',
    'completed_tasks',
    'depends_on',
    '{slug}-context.md',
    '{slug}-requirements.md',
    '{slug}-implementation-summary.md',
  ],
  'source/skills/verify/SKILL.md': [
    'execution_manifest',
    'uncovered requirements',
    'PARTIAL',
    'must_haves',
    '{slug}-implementation-summary.md',
  ],
  'source/skills/architect-review/SKILL.md': [
    'base_ref',
    'files_modified',
    'skipped tests',
    'assertion-free tests',
    'tautological',
    '{slug}-architect-review.md',
  ],
};

const HARD_LINE_LIMITS = {
  'source/skills/build/SKILL.md': 320,
  'source/skills/impl-plan/SKILL.md': 230,
  'source/skills/review-plan/SKILL.md': 160,
  'source/skills/verify/SKILL.md': 150,
  'source/skills/architect-review/SKILL.md': 130,
  'source/skills/impl-plan/reference/plan-quality.md': 220,
};

function readRel(path) {
  return readFileSync(join(ROOT, path), 'utf8');
}

function lineCount(content) {
  return content.split('\n').length - (content.endsWith('\n') ? 1 : 0);
}

function assertRequiredTerms(content, terms, path) {
  for (const term of terms) {
    assert.ok(
      content.includes(term),
      `${path} must include required contract term ${JSON.stringify(term)}`,
    );
  }
}

test('source skills retain required execution-contract terms', () => {
  for (const [path, terms] of Object.entries(REQUIRED_TERMS)) {
    assertRequiredTerms(readRel(path), terms, path);
  }
});

test('required-term contract fails when a term is missing', () => {
  assert.throws(
    () => assertRequiredTerms('Discovery level\nexecution_manifest\n', [
      'Discovery level',
      'must_haves',
    ], 'fixture/SKILL.md'),
    /must include required contract term "must_haves"/,
  );
});

test('impl-plan execution_manifest example includes a routable task shape', () => {
  const content = readRel('source/skills/impl-plan/SKILL.md');
  const match = content.match(/```yaml\n([\s\S]*?execution_manifest:[\s\S]*?)```/);
  assert.ok(match, 'impl-plan must include a fenced yaml execution_manifest example');

  const manifest = match[1];
  for (const field of [
    '- id: T-001',
    'wave:',
    'depends_on:',
    'files_modified:',
    'requirements:',
    'must_haves:',
    'verify:',
    'done:',
  ]) {
    assert.ok(
      manifest.includes(field),
      `execution_manifest example must include ${JSON.stringify(field)}`,
    );
  }
});

test('source skills stay below hard prompt-size ceilings', () => {
  for (const [path, limit] of Object.entries(HARD_LINE_LIMITS)) {
    const lines = lineCount(readRel(path));
    assert.ok(
      lines <= limit,
      `${path} has ${lines} lines, exceeding hard ceiling ${limit}`,
    );
  }
});
