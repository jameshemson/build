import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync, readdirSync } from 'fs';
import { join } from 'path';
import { ROOT } from './utils.js';
import { VERSION_CARRIERS } from './version-carriers.js';

const codexPluginPath = join(ROOT, 'plugins/build/.codex-plugin/plugin.json');
const marketplacePath = join(ROOT, '.agents/plugins/marketplace.json');
const codexRepoSkillsDir = join(ROOT, '.agents/skills');
const codexSkillsDir = join(ROOT, 'plugins/build/skills');
const codexCrossSkillsDir = join(ROOT, '.codex/skills');
const opencodeCommandsDir = join(ROOT, '.opencode/commands');
const sourceCommandsDir = join(ROOT, 'source/commands');
const sourceSkillsDir = join(ROOT, 'source/skills');
const readmePath = join(ROOT, 'README.md');
const harnessesPath = join(ROOT, 'HARNESSES.md');

const OPENCODE_SKILLS = ['architect-review', 'impl-plan', 'review-plan', 'verify'];
const CODEX_SKILLS = ['architect-review', 'build', 'impl-plan', 'review-plan', 'verify'];

function assertExactSkillSet(actual, expected, label) {
  assert.deepEqual(
    [...actual].sort(),
    [...expected].sort(),
    `${label} must contain exactly ${expected.length} skills: ${expected.join(', ')}`,
  );
}

function assertCodexSkillSet(actual, label = 'Codex skill set') {
  assertExactSkillSet(actual, CODEX_SKILLS, label);
}

function assertNoObsoleteCodexClaims(content, label = 'Codex copy') {
  const obsoleteClaims = [
    /Codex[^.\n]{0,100}(?:has no|does not (?:have|support)|lacks)[^.\n]{0,80}sub-?agents?/i,
    /(?:orchestrator|`build`)[^.\n]{0,100}(?:not shipped|not available|Claude Code only)/i,
    /\|\s*Sub-?agent[^|\n]*\|[^|\n]*\|[^|\n]*\|\s*No\s*\|/i,
    /\|\s*`build`[^|\n]*\|\s*(?:Yes|✓)\s*\|\s*(?:No|—)\s*\|\s*(?:No|—)\s*\|/i,
    /Four skills are available in OpenCode and Codex/i,
    /(?:Four|4) portable skills ship in the (?:Codex )?plugin/i,
    /Codex (?:installs|ships|has|includes|exposes) (?:only )?(?:four|4) skills/i,
  ];
  for (const pattern of obsoleteClaims) {
    assert.doesNotMatch(content, pattern, `${label} contains obsolete Codex capability wording`);
  }
}

function readDescription(mdPath) {
  const content = readFileSync(mdPath, 'utf8');
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) throw new Error(`No frontmatter in ${mdPath}`);
  const line = match[1].split('\n').find((l) => l.startsWith('description:'));
  if (!line) throw new Error(`No description in ${mdPath}`);
  return line.slice('description:'.length).trim();
}

// Known-good Codex manifest enum values, verified against
// https://developers.openai.com/codex/plugins/build on 2026-04-22.
// If Codex changes these enums, update here and re-run manual install test.
const VALID_SOURCE_TYPES = new Set(['local', 'url', 'git-subdir']);
const VALID_INSTALLATION_POLICIES = new Set([
  'AVAILABLE',
  'INSTALLED_BY_DEFAULT',
  'NOT_AVAILABLE',
]);
const VALID_AUTHENTICATION_POLICIES = new Set(['ON_INSTALL']);

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

test('Codex plugin.json parses and has required fields', () => {
  const plugin = readJson(codexPluginPath);
  assert.equal(plugin.name, 'build');
  assert.match(plugin.version, /^\d+\.\d+\.\d+$/);
  assert.equal(typeof plugin.description, 'string');
  assert.ok(plugin.description.length > 0);
  assert.equal(plugin.skills, './skills/');
});

test('Codex plugin.json describes five skills and the end-to-end build workflow', () => {
  const plugin = readJson(codexPluginPath);
  const copy = [
    plugin.description,
    plugin.interface?.shortDescription,
    plugin.interface?.longDescription,
  ].join('\n');
  assert.match(copy, /(?:five|5)(?:[- ]Codex)?[- ]skills?/i);
  assert.match(copy, /end-to-end/i);
  assert.match(copy, /\bplan\b[\s\S]*\breview\b[\s\S]*\bimplement\b[\s\S]*\bverify\b[\s\S]*architect/i);
  assertNoObsoleteCodexClaims(copy, 'Codex plugin.json');
});

test('all release-version carriers agree', () => {
  const carriers = VERSION_CARRIERS.map((c) => ({
    path: c.path,
    version: c.get(readJson(join(ROOT, c.path))),
  }));
  const unique = [...new Set(carriers.map((c) => c.version))];
  assert.equal(
    unique.length,
    1,
    `Version drift across release files: ${carriers.map((c) => `${c.path}=${c.version}`).join(', ')}. Bump all ${carriers.length} together.`,
  );
  assert.equal(unique[0], '1.9.0', 'release version must be 1.9.0');
});

test('Codex marketplace.json parses', () => {
  const market = readJson(marketplacePath);
  assert.equal(typeof market, 'object');
  assert.ok(market !== null);
});

test('Codex marketplace.json lists the build plugin with expected source shape', () => {
  const market = readJson(marketplacePath);
  assert.equal(market.plugins.length, 1);
  const entry = market.plugins[0];
  assert.equal(entry.name, 'build');
  assert.equal(entry.source.source, 'local');
  assert.equal(entry.source.path, './plugins/build');
});

test('Codex marketplace plugin name matches plugin.json name', () => {
  const market = readJson(marketplacePath);
  const plugin = readJson(codexPluginPath);
  assert.equal(market.plugins[0].name, plugin.name);
});

test('plugins/build/skills directory exists', () => {
  assert.ok(statSync(codexSkillsDir).isDirectory());
});

test('all Codex skill directories contain exactly the five expected skills', () => {
  for (const [label, dir] of [
    ['.agents/skills', codexRepoSkillsDir],
    ['plugins/build/skills', codexSkillsDir],
    ['.codex/skills', codexCrossSkillsDir],
  ]) {
    assertCodexSkillSet(readdirSync(dir), label);
  }
});

test('Codex marketplace source.source is a known Codex-recognised value', () => {
  const market = readJson(marketplacePath);
  const value = market.plugins[0].source.source;
  assert.ok(
    VALID_SOURCE_TYPES.has(value),
    `source.source="${value}" is not in Codex enum {${[...VALID_SOURCE_TYPES].join(', ')}}`,
  );
});

test('Codex marketplace policy.installation is a known Codex-recognised value', () => {
  const market = readJson(marketplacePath);
  const value = market.plugins[0].policy.installation;
  assert.ok(
    VALID_INSTALLATION_POLICIES.has(value),
    `policy.installation="${value}" is not in Codex enum {${[...VALID_INSTALLATION_POLICIES].join(', ')}}`,
  );
});

test('Codex marketplace policy.authentication is a known Codex-recognised value', () => {
  const market = readJson(marketplacePath);
  const value = market.plugins[0].policy.authentication;
  assert.ok(
    VALID_AUTHENTICATION_POLICIES.has(value),
    `policy.authentication="${value}" is not in Codex enum {${[...VALID_AUTHENTICATION_POLICIES].join(', ')}}`,
  );
});

test('Codex plugin.json category and marketplace category are non-empty strings', () => {
  const plugin = readJson(codexPluginPath);
  const market = readJson(marketplacePath);
  // Codex docs treat category as a free string; assert it's set.
  assert.equal(typeof plugin.interface.category, 'string');
  assert.ok(plugin.interface.category.length > 0);
  assert.equal(typeof market.plugins[0].category, 'string');
  assert.ok(market.plugins[0].category.length > 0);
});

test('.opencode/commands/ contains exactly the four expected command files', () => {
  const entries = readdirSync(opencodeCommandsDir).sort();
  assertExactSkillSet(
    entries,
    OPENCODE_SKILLS.map((n) => `${n}.md`),
    '.opencode/commands',
  );
});

test('OpenCode skill output contains exactly the four standalone skills', () => {
  assertExactSkillSet(
    readdirSync(join(ROOT, '.opencode/skills')),
    OPENCODE_SKILLS,
    '.opencode/skills',
  );
});

test('Codex documentation describes instructed subagents, shared-workspace safety, and model fallback', () => {
  const copy = [readFileSync(readmePath, 'utf8'), readFileSync(harnessesPath, 'utf8')].join('\n');
  assert.match(copy, /\$build:build <feature>/);
  assert.match(copy, /instructed subagents/i);
  assert.match(copy, /shared workspace/i);
  assert.match(copy, /disjoint/i);
  assert.match(copy, /gpt-5\.6-sol/i);
  assert.match(copy, /gpt-5\.6-luna/i);
  assert.match(copy, /\| Plan \/ Plan Review \|[^\n]*gpt-5\.6-sol[^\n]*xhigh/i);
  assert.match(copy, /model_fallback/);
  assertNoObsoleteCodexClaims(copy, 'README.md and HARNESSES.md');
});

test('negative fixture rejects four-skill Codex set', () => {
  assert.throws(
    () => assertCodexSkillSet(OPENCODE_SKILLS, 'four-skill fixture'),
    /must contain exactly 5 skills/,
  );
});

test('negative fixture rejects obsolete Codex no-subagent/no-orchestrator wording', () => {
  const obsolete = [
    'Codex does not support sub-agents.',
    'The `build` orchestrator is not shipped for Codex.',
  ].join('\n');
  assert.throws(
    () => assertNoObsoleteCodexClaims(obsolete, 'obsolete fixture'),
    /obsolete Codex capability wording/,
  );
});

test('each source/commands/*.md description matches the corresponding source/skills/<name>/SKILL.md description', () => {
  // Command descriptions are maintained by hand; this test locks in
  // skill/command description parity so the OpenCode TUI shows the same
  // description as the skill's own SKILL.md frontmatter.
  for (const name of OPENCODE_SKILLS) {
    const cmd = readDescription(join(sourceCommandsDir, `${name}.md`));
    const skill = readDescription(join(sourceSkillsDir, name, 'SKILL.md'));
    assert.equal(
      cmd,
      skill,
      `description mismatch for ${name}: command="${cmd}" skill="${skill}"`,
    );
  }
});

test('source/commands/ name set matches portable skill name set', () => {
  // Parity gate promised by the "rename scenario" in the plan: if a
  // contributor renames a skill but forgets to rename its command wrapper,
  // this test fires.
  const skillNames = readdirSync(sourceSkillsDir)
    .filter((n) => !['build', 'eval'].includes(n))
    .sort();
  const commandNames = readdirSync(sourceCommandsDir)
    .map((f) => f.replace(/\.md$/, ''))
    .sort();
  assert.deepEqual(
    commandNames,
    skillNames,
    'source/commands/ must have one .md file per OpenCode skill (build and eval are excluded)',
  );
});
