// A/B evaluation support for one skill: build blinded old / new / placebo
// variant trees, assign runs to them at random, and unblind graded results.

import { spawnSync } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { ROOT } from './utils.js';

export const DEFAULT_KEY_DIR = join(homedir(), '.cache', 'build-eval-ab');
export const PLACEBO_SKIP_REASON =
  'the change only deletes text, so there is no added prose to match; placebo arm skipped';
const SKILLS_PREFIX = 'source/skills/';
const SKIPPED_NAMES = new Set(['.build', 'node_modules', '.DS_Store']);

// Neutral filler for the placebo arm: factual, directionless, and free of
// Markdown structure, so it adds length without adding guidance.
const NEUTRAL_SENTENCES = [
  'One kilometre is 1,000 metres.',
  'Character code 65 is the letter A.',
  'Seven multiplied by eight is 56.',
  'A leap year has 366 days.',
  'One hour is 60 minutes.',
  'Character code 97 is the letter a.',
  'Nine multiplied by six is 54.',
  'February has 28 days in a common year.',
  'One litre is 1,000 millilitres.',
  'Character code 48 is the digit 0.',
  'Twelve multiplied by twelve is 144.',
  'A week has seven days.',
  'One inch is 2.54 centimetres.',
  'Character code 32 is the space character.',
  'Three multiplied by eleven is 33.',
  'April has 30 days.',
  'One kilogram is 1,000 grams.',
  'Character code 90 is the letter Z.',
  'Six multiplied by seven is 42.',
  'A common year has 365 days.',
  'One mile is about 1.609 kilometres.',
  'Four multiplied by nine is 36.',
  'December has 31 days.',
  'One tonne is 1,000 kilograms.',
];

export function neutralText(targetChars) {
  if (!(targetChars > 0)) return '';
  let full = '';
  for (let i = 0; full.length <= targetChars; i += 1) {
    full += (full ? ' ' : '') + NEUTRAL_SENTENCES[i % NEUTRAL_SENTENCES.length];
  }
  const cut = full.lastIndexOf(' ', targetChars);
  if (cut >= targetChars - Math.ceil(0.05 * targetChars)) return full.slice(0, cut);
  return full.slice(0, targetChars).replace(/ $/, '');
}

function splitLines(text) {
  return text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

// LCS line diff grouped into hunks of contiguous changed lines.
// Each hunk: { oldStart (0-based old line index), oldLines, newLines }.
function diffHunks(oldLines, newLines) {
  const n = oldLines.length;
  const m = newLines.length;
  const width = m + 1;
  const lcs = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i * width + j] = oldLines[i] === newLines[j]
        ? lcs[(i + 1) * width + j + 1] + 1
        : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
    }
  }
  const hunks = [];
  let hunk = null;
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && oldLines[i] === newLines[j]) {
      hunk = null;
      i += 1;
      j += 1;
      continue;
    }
    if (!hunk) {
      hunk = { oldStart: i, oldLines: [], newLines: [] };
      hunks.push(hunk);
    }
    if (j >= m || (i < n && lcs[(i + 1) * width + j] >= lcs[i * width + j + 1])) {
      hunk.oldLines.push(oldLines[i]);
      i += 1;
    } else {
      hunk.newLines.push(newLines[j]);
      j += 1;
    }
  }
  return hunks;
}

function commonPrefixLength(a, b) {
  const limit = Math.min(a.length, b.length);
  let k = 0;
  while (k < limit && a[k] === b[k]) k += 1;
  return k;
}

function commonSuffixLength(a, b) {
  const limit = Math.min(a.length, b.length);
  let k = 0;
  while (k < limit && a[a.length - 1 - k] === b[b.length - 1 - k]) k += 1;
  return k;
}

// Old text with neutral text inserted wherever new text adds prose. Old text is never removed.
export function buildPlacebo(oldText, newText) {
  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);
  const insertions = [];
  const out = [];
  let cursor = 0;
  for (const hunk of diffHunks(oldLines, newLines)) {
    out.push(...oldLines.slice(cursor, hunk.oldStart));
    cursor = hunk.oldStart + hunk.oldLines.length;
    const oldHunk = hunk.oldLines.join('');
    const newHunk = hunk.newLines.join('');
    const prefix = commonPrefixLength(oldHunk, newHunk);
    const oldRest = oldHunk.slice(prefix);
    const newRest = newHunk.slice(prefix);
    const added = newRest.slice(0, newRest.length - commonSuffixLength(oldRest, newRest));
    if (added.trim() === '') {
      out.push(oldHunk);
      continue;
    }
    const lead = added.match(/^\s*/)[0];
    const trail = added.match(/\s*$/)[0];
    const core = added.slice(lead.length, added.length - trail.length);
    const neutral = neutralText(core.length);
    out.push(oldHunk.slice(0, prefix), lead, neutral, trail, oldHunk.slice(prefix));
    insertions.push({ oldLine: hunk.oldStart + 1, addedChars: core.length, placeboChars: neutral.length });
  }
  out.push(...oldLines.slice(cursor));
  return { text: out.join(''), insertions };
}

function git(repo, args, encoding = 'utf8') {
  return spawnSync('git', ['-C', repo, ...args], { encoding, maxBuffer: 256 * 1024 * 1024 });
}

export function resolveBase(repo, base) {
  let ref = base;
  if (!ref) {
    const described = git(repo, ['describe', '--tags', '--abbrev=0', '--match', 'v*']);
    ref = described.status === 0 ? described.stdout.trim() : 'HEAD';
  }
  const parsed = git(repo, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  if (parsed.status !== 0) throw new Error(`base ref does not resolve: ${ref}`);
  return { base: ref, baseSha: parsed.stdout.trim() };
}

// Every file under `prefix` at commit `sha`, keyed by its path relative to `prefix`.
export function readTreeAtRef(repo, sha, prefix) {
  const listed = git(repo, ['ls-tree', '-r', '-z', '--name-only', sha, '--', prefix]);
  if (listed.status !== 0) throw new Error(`git ls-tree failed for ${sha}: ${listed.stderr.trim()}`);
  const files = new Map();
  for (const path of listed.stdout.split('\0').filter(Boolean)) {
    const shown = git(repo, ['show', `${sha}:${path}`], 'buffer');
    if (shown.status !== 0) throw new Error(`git show failed for ${sha}:${path}`);
    files.set(path.slice(prefix.length), shown.stdout);
  }
  return files;
}

// The skill's files on disk (untracked included), keyed by path relative to the skill, or null.
export function readWorkingSkill(repo, skill) {
  const root = join(repo, ...SKILLS_PREFIX.split('/').filter(Boolean), skill);
  if (!existsSync(root)) return null;
  const files = new Map();
  const walk = (dir, rel) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (SKIPPED_NAMES.has(entry.name)) continue;
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(join(dir, entry.name), childRel);
      else if (entry.isFile()) files.set(childRel, readFileSync(join(dir, entry.name)));
    }
  };
  walk(root, '');
  return files;
}

const isMarkdown = (path) => /\.md$/i.test(path);

// Placebo skill tree: old files, with neutral text matched to every prose addition in Markdown.
export function placeboTree(oldFiles, newFiles) {
  const files = new Map();
  const insertions = [];
  const paths = [...new Set([...oldFiles.keys(), ...newFiles.keys()])].sort();
  for (const file of paths) {
    const oldFile = oldFiles.get(file);
    const newFile = newFiles.get(file);
    if (!isMarkdown(file) || !newFile) {
      if (oldFile) files.set(file, oldFile);
      continue;
    }
    if (oldFile) {
      const placebo = buildPlacebo(oldFile.toString('utf8'), newFile.toString('utf8'));
      files.set(file, placebo.text);
      for (const insertion of placebo.insertions) insertions.push({ file, ...insertion });
      continue;
    }
    const text = newFile.toString('utf8');
    if (text.trim() === '') {
      files.set(file, text);
      continue;
    }
    const neutral = neutralText(text.length);
    files.set(file, neutral);
    insertions.push({ file, oldLine: 1, addedChars: text.length, placeboChars: neutral.length });
  }
  return { files, insertions };
}

export function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(array, rng) {
  const out = [...array];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function writeFile(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function writeTree(dir, files) {
  for (const [rel, content] of files) writeFile(join(dir, ...rel.split('/')), content);
}

function writeJson(path, value) {
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function checkInteger(name, value, minimum) {
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${name} must be an integer of at least ${minimum}`);
  }
}

export function prepare({
  repo = ROOT,
  skill,
  base,
  runs,
  seed,
  keyDir = DEFAULT_KEY_DIR,
  runDir,
} = {}) {
  if (!skill) throw new Error('skill is required');
  repo = resolve(repo);
  const runsPerArm = runs ?? 5;
  checkInteger('runs', runsPerArm, 1);
  runDir = resolve(runDir);
  keyDir = resolve(keyDir);
  if (existsSync(runDir) && readdirSync(runDir).length > 0) {
    throw new Error(`run directory already exists: ${runDir}`);
  }

  const { base: baseRef, baseSha } = resolveBase(repo, base);
  const skillsAtBase = new Map();
  for (const [path, content] of readTreeAtRef(repo, baseSha, SKILLS_PREFIX)) {
    const slash = path.indexOf('/');
    if (slash < 0) continue;
    const name = path.slice(0, slash);
    if (!skillsAtBase.has(name)) skillsAtBase.set(name, new Map());
    skillsAtBase.get(name).set(path.slice(slash + 1), content);
  }
  const oldSkill = skillsAtBase.get(skill);
  if (!oldSkill) throw new Error(`skill ${skill} does not exist at ${baseRef}`);
  const siblings = [...skillsAtBase].filter(([name]) => name !== skill);

  const newSkill = readWorkingSkill(repo, skill);
  if (!newSkill) throw new Error(`skill ${skill} does not exist in the working tree`);
  const placebo = placeboTree(oldSkill, newSkill);
  const skipped = placebo.insertions.length === 0;
  const trees = { old: oldSkill, new: newSkill, placebo: placebo.files };

  const usedSeed = seed ?? randomInt(2 ** 31);
  const rng = mulberry32(usedSeed);
  const armList = skipped ? ['old', 'new'] : ['old', 'new', 'placebo'];
  const variants = armList.map((_, index) => `s${index + 1}`);
  const arms = { old: null, new: null, placebo: null };
  shuffle(armList, rng).forEach((arm, index) => {
    arms[arm] = variants[index];
  });

  const slots = [];
  for (const arm of armList) {
    for (let i = 0; i < runsPerArm; i += 1) slots.push({ arm, input: 'main' });
  }
  const width = Math.max(2, String(slots.length).length);
  const keyRuns = shuffle(slots, rng).map((slot, index) => ({
    run: `r${String(index + 1).padStart(width, '0')}`,
    variant: arms[slot.arm],
    arm: slot.arm,
    input: slot.input,
  }));

  for (const arm of armList) {
    const variantDir = join(runDir, 'variants', arms[arm]);
    writeTree(join(variantDir, skill), trees[arm]);
    for (const [name, files] of siblings) writeTree(join(variantDir, name), files);
  }
  for (const { run } of keyRuns) mkdirSync(join(runDir, 'runs', run, 'scratch'), { recursive: true });

  const runId = basename(runDir);
  const placeboRecord = {
    skipped,
    reason: skipped ? PLACEBO_SKIP_REASON : null,
    insertions: placebo.insertions,
  };
  const keyPath = join(keyDir, `${runId}.json`);
  writeJson(keyPath, {
    run_id: runId,
    run_dir: runDir,
    repo,
    skill,
    base_ref: baseRef,
    base_sha: baseSha,
    seed: usedSeed,
    arms,
    runs: keyRuns,
    placebo: placeboRecord,
  });

  return {
    runDir,
    runId,
    base: baseRef,
    baseSha,
    variants,
    runs: keyRuns.map(({ run, variant, input }) => ({ run, variant, input })),
    arms,
    placebo: placeboRecord,
    keyPath,
  };
}
