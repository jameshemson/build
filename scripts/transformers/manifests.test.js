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
const packagePath = join(ROOT, 'package.json');
const readmePath = join(ROOT, 'README.md');
const harnessesPath = join(ROOT, 'HARNESSES.md');
const roadmapPath = join(ROOT, 'ROADMAP.md');
const changelogPath = join(ROOT, 'CHANGELOG.md');

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
  assert.equal(unique[0], '1.16.0', 'release version must be 1.16.0');
});

test('package exposes the canonical self-contained buildctl CLI', () => {
  const packageJson = readJson(packagePath);
  assert.equal(packageJson.bin?.buildctl, 'source/skills/build/buildctl/cli.js');
  const cli = readFileSync(join(ROOT, packageJson.bin.buildctl), 'utf8');
  assert.ok(cli.startsWith('#!/usr/bin/env node\n'));
  for (const file of [
    'completion.js', 'counters.js', 'coverage.js', 'evidence.js', 'immutable-json.js',
    'phase-results.js', 'plan-contract.js', 'repository.js', 'transition.js', 'validation.js',
    'workflow-state.js',
  ]) {
    assert.ok(statSync(join(ROOT, 'source/skills/build/buildctl', file)).isFile());
  }
});

test('v1.14 release documents deterministic phase receipts and preserves standalone continuity', () => {
  for (const carrier of VERSION_CARRIERS) {
    assert.equal(carrier.get(readJson(join(ROOT, carrier.path))), '1.16.0', carrier.path);
  }
  for (const [path, pattern] of [
    [readmePath, /compile-result[\s\S]*Plan Review[\s\S]*Verify[\s\S]*Architect Review/i],
    [harnessesPath, /deterministic phase result receipts[\s\S]*root-only/i],
    [roadmapPath, /v1\.14\.0 — deterministic phase receipts \(shipped\)/i],
    [changelogPath, /## 1\.14\.0 - 2026-07-24[\s\S]*compile-result/i],
  ]) assert.match(readFileSync(path, 'utf8'), pattern, path);
  for (const skill of ['review-plan', 'verify', 'architect-review']) {
    const source = readFileSync(join(sourceSkillsDir, skill, 'SKILL.md'), 'utf8');
    assert.match(source, /## Machine result/);
    assert.match(source, /Machine result: N\/A — missing subjects:/);
  }
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

test('Codex documentation describes provider phase authority, custom routing, shared-workspace safety, and fallbacks', () => {
  const copy = [readFileSync(readmePath, 'utf8'), readFileSync(harnessesPath, 'utf8')].join('\n');
  assert.match(copy, /\$build:build <feature>/);
  assert.match(copy, /Claude[\s\S]*subagents[\s\S]*worktrees/i);
  assert.match(copy, /Codex[\s\S]*Plan, Implement, and Architect Review[\s\S]*inline/i);
  assert.match(copy, /Plan Review and Verify[\s\S]*fresh-context/i);
  assert.match(copy, /silence is unknown, not failure evidence/i);
  assert.match(copy, /20-minute hard deadline/i);
  assert.match(copy, /Sol[\s\S]*high effort/i);
  assert.match(copy, /shared workspace/i);
  assert.match(copy, /disjoint/i);
  assert.match(copy, /gpt-5\.6-sol/i);
  assert.match(copy, /model_fallback/);

  assert.match(copy, /`evidence_mode: typed`/);
  assert.match(copy, /behavioral-test[^\n]*command-assertion[^\n]*structural[^\n]*manual-receipt/);
  assert.match(copy, /Changed files[^\n]*only structural claims[^\n]*cannot prove behavior/i);
  assert.match(copy, /missing mode[^\n]*`legacy-untyped`/i);
  assert.match(copy, /reopened(?: legacy)? tasks?[^\n]*upgrade/i);
  assert.match(copy, /missing or mismatched behavioral evidence[^\n]*`PARTIAL`/i);
  assert.match(copy, /Markdown\/YAML[^\n]*authored authority/i);
  assert.match(copy, /generated `contract\.json`/i);
  assert.match(copy, /`buildctl validate-plan`/i);
  assert.match(copy, /`buildctl run-evidence`/i);
  assert.match(copy, /bounded[^\n]*receipts/i);
  assert.match(copy, /complete repository identity/i);
  assert.match(copy, /Verify[^\n]*receipt[^\n]*without (?:re-)?running/i);
  assert.match(copy, /prompt-only fallback/i);
  assert.match(copy, /complete-slice[^\n]*(?:authoriz|transition)/i);

  assert.match(copy, /optional literal `## Build agent routing` block/i);
  assert.match(copy, /- plan: [^\n]+[\s\S]*- review: [^\n]+[\s\S]*- explore: [^\n]+[\s\S]*- implement: [^\n]+[\s\S]*- verify: [^\n]+[\s\S]*- architect-review: [^\n]+/);
  assert.match(copy, /`review` also controls the mid-implementation review/i);
  assert.match(copy, /resolve(?:s)? each key independently[\s\S]*invocation > effective `AGENTS\.md` > Build default/i);

  assert.match(copy, /block ends at the next H2 heading or EOF/i);
  assert.match(copy, /blank lines and one or more exact `- <key>: <value>` entries/i);
  assert.match(copy, /trims only surrounding delimiter whitespace[\s\S]*preserves the opaque remainder exactly/i);
  assert.match(copy, /rejects? duplicate blocks, duplicate keys, unknown keys, non-list content, and blank values/i);
  assert.match(copy, /before workflow mutation[\s\S]*offending source and key/i);

  assert.match(copy, /Agent names are opaque and externally owned/i);
  assert.match(copy, /never discovers, validates, normalizes, aliases, creates, copies, edits, installs, bundles, or overwrites agent profiles/i);
  assert.doesNotMatch(copy, /Build (?:discovers|validates|normalizes|aliases|creates|copies|edits|installs|bundles|overwrites) (?:an? )?agent profiles?/i);
  assert.match(copy, /non-null requested profile[\s\S]*`profile-owned`[\s\S]*no Build model or effort override[\s\S]*`fork_turns: "none"`/i);
  assert.match(copy, /null Build-default route[\s\S]*no named selection attempt[\s\S]*no `agent_selection_fallback` record/i);

  assert.match(copy, /exact custom selection is unavailable or rejected[\s\S]*append(?:s)? `agent_selection_fallback` before[\s\S]*Build-default model route/i);
  assert.match(copy, /later model override failure[\s\S]*independent `model_fallback`/i);
  assert.match(copy, /execution failure[\s\S]*existing `agent_failures` path/i);

  assert.match(copy, /saved route snapshot wins unless the current invocation contains a valid block/i);
  assert.match(copy, /valid invocation block overrides only named keys[\s\S]*old and new values/i);
  assert.match(copy, /Changed `AGENTS\.md`[\s\S]*never silently changes live state/i);
  assert.match(copy, /invalid current mapping leaves the snapshot and history unchanged/i);
  assert.match(copy, /legacy state missing routes resolves once after valid input[\s\S]*logs that resolution/i);

  assert.match(copy, /`default` is an opaque selectable agent name, not a reserved sentinel/i);
  assert.match(copy, /For a fresh workflow, restore adaptive Build default by removing or editing the `AGENTS\.md` mapping before invocation/i);
  assert.match(copy, /A live workflow keeps its saved snapshot/i);
  assert.match(copy, /`AGENTS\.md` edits do not change it/i);
  assert.match(copy, /only a valid current invocation block may replace named keys/i);
  assert.match(copy, /requests the exact profile only where the active API exposes agent selection[\s\S]*documented fallback/i);
  assert.match(copy, /does not add host selectors/i);
  assertNoObsoleteCodexClaims(copy, 'README.md and HARNESSES.md');
});

test('ROADMAP sequences deterministic Build authority without claiming deferred machinery is shipped', () => {
  const roadmap = readFileSync(roadmapPath, 'utf8');
  assert.match(roadmap, /v1\.11\.1[\s\S]*typed evidence[\s\S]*provider-specific Codex execution/i);
  assert.match(roadmap, /v1\.12[\s\S]*validate-plan[\s\S]*compile[\s\S]*contract\.json[\s\S]*run-evidence/i);
  assert.match(roadmap, /v1\.12\.0[^\n]*(?:shipped|complete)/i);
  assert.match(roadmap, /v1\.13[\s\S]*complete-slice[\s\S]*transition/i);
  assert.match(roadmap, /portable[\s\S]*(?:fallback|OpenCode|Codex)/i);
  assert.match(roadmap, /Deferred[\s\S]*leases[\s\S]*domain[\s\S]*trajectory[\s\S]*routing/i);
  // Same Deferred-order chain, extended: the workflow-mode deferrals must stay
  // inside Deferred and after the existing routing entry, not drift above it.
  assert.match(
    roadmap,
    /Deferred[\s\S]*leases[\s\S]*domain[\s\S]*trajectory[\s\S]*routing[\s\S]*presets[\s\S]*relay failure paths/i,
  );
});

test('workflow-mode docs scope modes to Claude and routing to both orchestrators', () => {
  const readme = readFileSync(readmePath, 'utf8');
  const harnesses = readFileSync(harnessesPath, 'utf8');
  assert.match(readme, /### Workflow modes/);
  assert.match(readme, /mode=(opus|fable|mixed)/);
  assert.match(readme, /Codex and Claude Code users may add/);
  assert.match(harnesses, /named workflow modes are Claude-orchestrator-only today/);
});

test('v1.13 shipped docs retain bounded completion authority under v1.14', () => {
  const roadmap = readFileSync(roadmapPath, 'utf8');
  const changelog = readFileSync(changelogPath, 'utf8');
  const docs = `${readFileSync(readmePath, 'utf8')}\n${readFileSync(harnessesPath, 'utf8')}`;
  assert.match(roadmap, /v1\.13\.0[^\n]*shipped/i);
  assert.match(roadmap, /does not claim the waived runs occurred/i);
  assert.match(changelog, /1\.13\.0[\s\S]*complete-slice[\s\S]*check-counters/i);
  assert.match(docs, /complete-slice[\s\S]*already_applied/i);
  assert.match(docs, /buildctl never (?:writes workflow state|mutates git)/i);
  assert.deepEqual(
    VERSION_CARRIERS.map((carrier) => carrier.get(readJson(join(ROOT, carrier.path)))),
    ['1.16.0', '1.16.0', '1.16.0', '1.16.0'],
  );
});

test('v1.15 release documents in-plan test weakening and orchestrator agreement', () => {
  for (const carrier of VERSION_CARRIERS) {
    assert.equal(carrier.get(readJson(join(ROOT, carrier.path))), '1.16.0', carrier.path);
  }
  for (const [path, pattern] of [
    [roadmapPath, /v1\.15\.0 — in-plan test weakening and orchestrator agreement \(shipped\)/i],
    [changelogPath, /## 1\.15\.0 - 2026-07-28[\s\S]*test_shrink/i],
    [changelogPath, /## 1\.15\.0[\s\S]*phase-agent-failure/i],
    [changelogPath, /## 1\.15\.0[\s\S]*literal substring/i],
  ]) assert.match(readFileSync(path, 'utf8'), pattern, path);
  // The soft-gate choice is the release's load-bearing decision; record why it
  // is soft so a later hardening is a deliberate call, not a silent drift.
  assert.match(readFileSync(roadmapPath, 'utf8'), /Keep it soft on first release/i);
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
