// A/B evaluation support for one skill: build blinded old / new / placebo
// variant trees, assign runs to them at random, and unblind graded results.

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
