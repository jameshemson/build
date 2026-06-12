import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import { ROOT } from './utils.js';

const SCRIPT = join(
  ROOT,
  'source/skills/architect-review/reference/shape-scan.sh',
);

let sandbox;

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'shape-scan-'));
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

function fixture(name, content) {
  const p = join(sandbox, name);
  writeFileSync(p, content, 'utf8');
  return p;
}

function run(...files) {
  const res = spawnSync('sh', [SCRIPT, ...files], { encoding: 'utf8' });
  assert.equal(res.status, 0, `script must always exit 0, got ${res.status}: ${res.stderr}`);
  return res.stdout;
}

function bigAndTiny() {
  // bigOne spans exactly 200 lines (open line + 198 body lines + close line).
  const lines = ['function bigOne(a, b) {'];
  for (let i = 0; i < 198; i++) lines.push(`  const v${i} = a;`);
  lines.push('}');
  lines.push('function tiny() {');
  lines.push('  return 1;');
  lines.push('}');
  return lines.join('\n') + '\n';
}

test('shape-scan script exists at the architect-review reference path', () => {
  assert.ok(existsSync(SCRIPT), `expected script at ${SCRIPT}`);
});

test('reports an over-150-line function with path, start line, and length', () => {
  const f = fixture('big.js', bigAndTiny());
  const out = run(f);
  assert.ok(
    out.includes(`FUNCTION ${f}:1:200`),
    `expected "FUNCTION ${f}:1:200" in:\n${out}`,
  );
  assert.match(out, /SUMMARY functions=2 over80=1 over150=1 max=200/);
});

test('functions at or under 80 lines produce no FUNCTION offender line', () => {
  const f = fixture('small.js', 'function tiny() {\n  return 1;\n}\n');
  const out = run(f);
  assert.ok(!out.includes('FUNCTION '), `no offender expected in:\n${out}`);
  assert.match(out, /SUMMARY functions=1 over80=0 over150=0 max=3/);
});

test('counts magic numbers excluding {0,1,2,10,100,1000}, identifiers, and hex', () => {
  const f = fixture(
    'magic.js',
    [
      'const a = 42;',
      'const b = 1000;',
      'const c = 7;',
      'const d = 0;',
      'const e = 0x1F;',
      "const url = 'h2';",
      'const v3 = 2;',
    ].join('\n') + '\n',
  );
  const out = run(f);
  assert.match(out, /SUMMARY magic_numbers=2/, `expected 2 (42 and 7) in:\n${out}`);
});

test('test files are excluded from the magic-number count', () => {
  const f = fixture('magic.test.js', 'const q = 42;\nconst r = 7;\n');
  const out = run(f);
  assert.match(out, /SUMMARY magic_numbers=0/, `test file must not count in:\n${out}`);
});

test('unknown extensions yield UNSUPPORTED, missing paths yield MISSING', () => {
  const u = fixture('notes.xyz', 'def thing():\n    pass\n');
  const ghost = join(sandbox, 'ghost.js');
  const out = run(u, ghost);
  assert.ok(out.includes(`UNSUPPORTED ${u}`), `expected UNSUPPORTED in:\n${out}`);
  assert.ok(out.includes(`MISSING ${ghost}`), `expected MISSING in:\n${out}`);
});

test('aggregates across files and still emits both SUMMARY lines with no args', () => {
  const f1 = fixture('big.js', bigAndTiny());
  const f2 = fixture('magic.js', 'const a = 42;\n');
  const out = run(f1, f2);
  assert.match(out, /SUMMARY functions=2 over80=1 over150=1 max=200/);
  assert.match(out, /SUMMARY magic_numbers=1/);

  const empty = run();
  assert.match(empty, /SUMMARY functions=0 over80=0 over150=0 max=0/);
  assert.match(empty, /SUMMARY magic_numbers=0/);
});
