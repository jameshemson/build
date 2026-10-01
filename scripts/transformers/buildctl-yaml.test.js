import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { ROOT } from './utils.js';
import {
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
