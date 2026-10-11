// A/B evaluation support for one skill: build blinded old / new / placebo
// variant trees, assign runs to them at random, and unblind graded results.

import { spawnSync } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { ROOT } from './utils.js';

export const DEFAULT_KEY_DIR = join(homedir(), '.cache', 'build-eval-ab');
export const PLACEBO_SKIP_REASON =
  'the change adds no Markdown prose (it only deletes text or edits other files), so there is nothing to match; placebo arm skipped';
export const PLACEBO_TOLERANCE = 0.05;
const DEFAULT_RUNS = 5;
const DEFAULT_HEADROOM_RUNS = 3;
const GIT_MAX_BUFFER = 256 * 1024 * 1024;
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
  if (cut >= targetChars - Math.ceil(PLACEBO_TOLERANCE * targetChars)) return full.slice(0, cut);
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

// Each changed hunk with the prose it adds: the new text left once the characters it
// shares with the old hunk at either end are trimmed.
function changes(oldLines, newLines) {
  return diffHunks(oldLines, newLines).map((hunk) => {
    const oldHunk = hunk.oldLines.join('');
    const newHunk = hunk.newLines.join('');
    const prefix = commonPrefixLength(oldHunk, newHunk);
    const oldRest = oldHunk.slice(prefix);
    const newRest = newHunk.slice(prefix);
    const added = newRest.slice(0, newRest.length - commonSuffixLength(oldRest, newRest));
    return { ...hunk, oldHunk, prefix, added, core: added.trim() };
  });
}

// The leading YAML frontmatter block, delimiters included, or '' when the text has none.
function frontmatter(text) {
  return text.match(/^---\n[\s\S]*?\n---(?:\n|$)/)?.[0] ?? '';
}

// Old text with neutral text inserted wherever new text adds prose. Old text is never removed,
// and filler never splits an old line: an edit inside a line gets its filler on the next line.
// Prose added to the frontmatter is matched at the top of the body, so the YAML stays valid.
export function buildPlacebo(oldText, newText) {
  const oldHead = frontmatter(oldText);
  const newHead = oldHead ? frontmatter(newText) : '';
  const headLines = splitLines(oldHead).length;
  const headChars = changes(splitLines(oldHead), splitLines(newHead))
    .reduce((sum, change) => sum + change.core.length, 0);
  const oldLines = splitLines(oldText.slice(oldHead.length));
  const newLines = splitLines(newText.slice(newHead.length));
  const insertions = [];
  const out = [oldHead];
  const insert = (oldLine, addedChars, render) => {
    const neutral = neutralText(addedChars);
    out.push(render(neutral));
    insertions.push({ oldLine: headLines + oldLine, addedChars, placeboChars: neutral.length });
  };
  if (headChars > 0) insert(1, headChars, (neutral) => (oldHead.endsWith('\n') ? `${neutral}\n` : `\n${neutral}`));
  let cursor = 0;
  for (const change of changes(oldLines, newLines)) {
    out.push(...oldLines.slice(cursor, change.oldStart));
    cursor = change.oldStart + change.oldLines.length;
    const { oldHunk, prefix, added, core } = change;
    if (core === '') {
      out.push(oldHunk);
      continue;
    }
    const startsLine = prefix === 0 || oldHunk[prefix - 1] === '\n';
    const endsLine = added.endsWith('\n') || (prefix === oldHunk.length && cursor === oldLines.length);
    if (startsLine && endsLine) {
      // Whole new lines: the filler goes where they go, with the same surrounding whitespace.
      const lead = added.match(/^\s*/)[0];
      const trail = added.match(/\s*$/)[0];
      out.push(oldHunk.slice(0, prefix));
      insert(change.oldStart + 1, core.length, (neutral) => lead + neutral + trail);
      out.push(oldHunk.slice(prefix));
    } else {
      out.push(oldHunk);
      insert(change.oldStart + 1, core.length, (neutral) => (oldHunk.endsWith('\n') ? `${neutral}\n` : `\n${neutral}`));
    }
  }
  out.push(...oldLines.slice(cursor));
  return { text: out.join(''), insertions };
}

function git(repo, args, encoding = 'utf8') {
  return spawnSync('git', ['-C', repo, ...args], { encoding, maxBuffer: GIT_MAX_BUFFER });
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

function isInside(child, parent) {
  const rel = relative(parent, child);
  return rel === '' || !(rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel));
}

function timestamp(now) {
  const pad = (value) => String(value).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `${date}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function runIds(count) {
  const width = Math.max(2, String(count).length);
  return Array.from({ length: count }, (_, index) => `r${String(index + 1).padStart(width, '0')}`);
}

function writeVariant(runDir, variant, skill, skillFiles, siblings) {
  const variantDir = join(runDir, 'variants', variant);
  writeTree(join(variantDir, skill), skillFiles);
  for (const [name, files] of siblings) writeTree(join(variantDir, name), files);
}

function sameTree(a, b) {
  if (a.size !== b.size) return false;
  for (const [path, content] of a) {
    if (!b.has(path) || !Buffer.from(content).equals(Buffer.from(b.get(path)))) return false;
  }
  return true;
}

// Every skill under source/skills/ at `sha`: skill name -> (path within the skill -> content).
function readSkillsAtRef(repo, sha) {
  const skills = new Map();
  for (const [path, content] of readTreeAtRef(repo, sha, SKILLS_PREFIX)) {
    const slash = path.indexOf('/');
    if (slash < 0) continue;
    const name = path.slice(0, slash);
    if (!skills.has(name)) skills.set(name, new Map());
    skills.get(name).set(path.slice(slash + 1), content);
  }
  return skills;
}

// Random arm -> variant mapping, then `runsPerArm` main runs per arm plus `controlRuns`
// control runs on the new arm, shuffled and numbered r01, r02, ...
export function assignRuns(armList, runsPerArm, controlRuns, rng) {
  const variants = armList.map((_, index) => `s${index + 1}`);
  const arms = { old: null, new: null, placebo: null };
  shuffle(armList, rng).forEach((arm, index) => {
    arms[arm] = variants[index];
  });
  const slots = [];
  for (const arm of armList) {
    for (let i = 0; i < runsPerArm; i += 1) slots.push({ arm, input: 'main' });
  }
  for (let i = 0; i < controlRuns; i += 1) slots.push({ arm: 'new', input: 'control' });
  const ids = runIds(slots.length);
  const runs = shuffle(slots, rng).map((slot, index) => ({
    run: ids[index],
    variant: arms[slot.arm],
    arm: slot.arm,
    input: slot.input,
  }));
  return { variants, arms, runs };
}

function writeRuns(runDir, skill, baseRef, variants, runs) {
  for (const { run } of runs) mkdirSync(join(runDir, 'runs', run, 'scratch'), { recursive: true });
  writeJson(join(runDir, 'assignment.json'), {
    run_id: basename(runDir),
    skill,
    base_ref: baseRef,
    variants,
    runs: runs.map(({ run, variant, input }) => ({ run, variant, input })),
  });
}

export function prepare({
  repo = ROOT,
  skill,
  base,
  runs,
  controlRuns = 0,
  headroom = false,
  seed,
  keyDir = DEFAULT_KEY_DIR,
  runDir,
  now = new Date(),
} = {}) {
  if (!skill) throw new Error('skill is required');
  repo = resolve(repo);
  const runsPerArm = runs ?? (headroom ? DEFAULT_HEADROOM_RUNS : DEFAULT_RUNS);
  checkInteger('runs', runsPerArm, 1);
  checkInteger('controlRuns', controlRuns, 0);
  if (headroom && controlRuns > 0) {
    throw new Error('control runs need the new arm; headroom builds only the base variant');
  }
  runDir = resolve(runDir ?? join(repo, '.build', 'eval', `${timestamp(now)}-${headroom ? 'headroom' : 'ab'}`));
  keyDir = resolve(keyDir);
  if (!headroom && (isInside(keyDir, runDir) || isInside(keyDir, repo))) {
    throw new Error(`key directory must be outside the run directory and the repository: ${keyDir}`);
  }
  if (existsSync(runDir) && readdirSync(runDir).length > 0) {
    throw new Error(`run directory already exists: ${runDir}`);
  }
  const runId = basename(runDir);
  const keyPath = headroom ? null : join(keyDir, `${runId}.json`);
  if (keyPath && existsSync(keyPath)) throw new Error(`key already exists: ${keyPath}`);

  const { base: baseRef, baseSha } = resolveBase(repo, base);
  const skillsAtBase = readSkillsAtRef(repo, baseSha);
  const oldSkill = skillsAtBase.get(skill);
  if (!oldSkill) throw new Error(`skill ${skill} does not exist at ${baseRef}`);
  const siblings = [...skillsAtBase].filter(([name]) => name !== skill);
  const result = { runDir, runId, base: baseRef, baseSha };

  if (headroom) {
    // One unblinded base arm, no key: measures headroom before an A/B comparison.
    const headroomRuns = runIds(runsPerArm).map((run) => ({ run, variant: 's1', input: 'main' }));
    writeVariant(runDir, 's1', skill, oldSkill, siblings);
    writeRuns(runDir, skill, baseRef, ['s1'], headroomRuns);
    return { ...result, variants: ['s1'], runs: headroomRuns, arms: null, placebo: null, keyPath: null };
  }

  const newSkill = readWorkingSkill(repo, skill);
  if (!newSkill) throw new Error(`skill ${skill} does not exist in the working tree`);
  if (sameTree(oldSkill, newSkill)) {
    throw new Error(`skill ${skill} is identical at ${baseRef} and in the working tree; check --base`);
  }
  const placebo = placeboTree(oldSkill, newSkill);
  const skipped = placebo.insertions.length === 0;
  const trees = { old: oldSkill, new: newSkill, placebo: placebo.files };

  const usedSeed = seed ?? randomInt(2 ** 31);
  const armList = skipped ? ['old', 'new'] : ['old', 'new', 'placebo'];
  const { variants, arms, runs: keyRuns } = assignRuns(armList, runsPerArm, controlRuns, mulberry32(usedSeed));

  // Write in variant order, not arm order, so file timestamps cannot rank the arms.
  const armOf = Object.fromEntries(armList.map((arm) => [arms[arm], arm]));
  for (const variant of variants) writeVariant(runDir, variant, skill, trees[armOf[variant]], siblings);
  writeRuns(runDir, skill, baseRef, variants, keyRuns);

  const placeboRecord = {
    skipped,
    reason: skipped ? PLACEBO_SKIP_REASON : null,
    insertions: placebo.insertions,
  };
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
    ...result,
    variants,
    runs: keyRuns.map(({ run, variant, input }) => ({ run, variant, input })),
    arms,
    placebo: placeboRecord,
    keyPath,
  };
}

// Join grades with the key: true counts per arm per question, noise reference, and keep/drop.
export function unblind({ runDir, grades, keyDir = DEFAULT_KEY_DIR, margin = 2 } = {}) {
  if (!runDir) throw new Error('run directory is required');
  if (!Array.isArray(grades)) throw new Error('grades must be a JSON array of objects');
  if (typeof margin !== 'number' || Number.isNaN(margin)) throw new Error('margin must be a number');
  runDir = resolve(runDir);
  const runId = basename(runDir);
  const keyPath = join(resolve(keyDir), `${runId}.json`);
  if (!existsSync(keyPath)) throw new Error(`no key for run ${runId} at ${keyPath}`);
  const key = JSON.parse(readFileSync(keyPath, 'utf8'));
  if (key.run_dir && resolve(key.run_dir) !== runDir) {
    throw new Error(`key ${keyPath} belongs to run directory ${key.run_dir}, not ${runDir}`);
  }

  const keyRuns = new Map(key.runs.map((entry) => [entry.run, entry]));
  const graded = new Map();
  for (const grade of grades) {
    const id = grade?.run;
    if (!keyRuns.has(id)) throw new Error(`grade for unknown run ${id}`);
    if (graded.has(id)) throw new Error(`run ${id} graded twice`);
    graded.set(id, grade);
  }
  for (const id of keyRuns.keys()) {
    if (!graded.has(id)) throw new Error(`run ${id} has no grade`);
  }

  const questions = [];
  for (const grade of grades) {
    for (const [field, value] of Object.entries(grade)) {
      if (field !== 'run' && typeof value === 'boolean' && !questions.includes(field)) questions.push(field);
    }
  }

  const placeboSkipped = !key.arms.placebo;
  const armOrder = placeboSkipped ? ['old', 'new'] : ['old', 'placebo', 'new'];
  const tally = () => ({ n: 0, counts: Object.fromEntries(questions.map((q) => [q, 0])) });
  const arms = Object.fromEntries(armOrder.map((arm) => [arm, tally()]));
  const control = tally();
  for (const [id, grade] of graded) {
    const entry = keyRuns.get(id);
    const bucket = entry.input === 'control' ? control : arms[entry.arm];
    if (!bucket) throw new Error(`key maps run ${id} to unknown arm ${entry.arm}`);
    bucket.n += 1;
    for (const q of questions) if (grade[q] === true) bucket.counts[q] += 1;
  }

  const count = (arm, q) => arms[arm].counts[q];
  const noise = placeboSkipped
    ? null
    : Object.fromEntries(questions.map((q) => [q, Math.abs(count('placebo', q) - count('old', q))]));
  const decisions = Object.fromEntries(questions.map((q) => {
    const beatsOld = count('new', q) - count('old', q) >= margin;
    const beatsPlacebo = placeboSkipped || count('new', q) - count('placebo', q) >= margin;
    return [q, beatsOld && beatsPlacebo ? 'keep' : 'drop'];
  }));

  const row = (cells) => `| ${cells.join(' | ')} |`;
  const countCells = ({ n, counts }) => questions.map((q) => `${counts[q]}/${n}`);
  const lines = [row(['Arm', ...questions]), row(['Arm', ...questions].map(() => '---'))];
  for (const arm of armOrder) lines.push(row([arm, ...countCells(arms[arm])]));
  if (control.n > 0) lines.push(row(['new (control input)', ...countCells(control)]));
  if (noise) lines.push(row(['noise (abs placebo - old)', ...questions.map((q) => String(noise[q]))]));
  lines.push(row([`decision (margin ${margin})`, ...questions.map((q) => decisions[q])]));
  const markdown = `${lines.join('\n')}\n`;

  const summary = {
    run_id: runId,
    skill: key.skill,
    base_ref: key.base_ref,
    margin,
    questions,
    placebo_skipped: placeboSkipped,
    arms,
    control: control.n > 0 ? control : null,
    noise,
    decisions,
  };
  writeJson(join(runDir, 'unblinded.json'), summary);
  return { markdown, summary };
}
