import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync, readdirSync } from 'fs';
import { join } from 'path';
import { ROOT } from './utils.js';
import { VERSION_CARRIERS } from './version-carriers.js';

const codexPluginPath = join(ROOT, 'plugins/build/.codex-plugin/plugin.json');
const marketplacePath = join(ROOT, '.agents/plugins/marketplace.json');
const codexSkillsDir = join(ROOT, 'plugins/build/skills');

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

test('plugins/build/skills contains exactly the four portable skills', () => {
  const entries = readdirSync(codexSkillsDir).sort();
  assert.deepEqual(entries, [
    'architect-review',
    'impl-plan',
    'review-plan',
    'verify',
  ]);
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
