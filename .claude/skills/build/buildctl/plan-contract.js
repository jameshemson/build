import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateContract } from './validation.js';

export class BuildctlError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'BuildctlError';
    this.code = code;
    Object.assign(this, details);
  }
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, sortValue(value[key])]),
    );
  }
  return value;
}

export function canonicalJson(value) {
  return `${JSON.stringify(sortValue(value), null, 2)}\n`;
}

const SEMANTIC_VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export function isSemanticVersion(value) {
  return typeof value === 'string' && SEMANTIC_VERSION.test(value);
}

export function findGitRoot(cwd = process.cwd()) {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new BuildctlError(
      'E_NOT_GIT_REPOSITORY',
      `Cannot resolve a Git repository from ${cwd}: ${(result.stderr || '').trim()}`,
    );
  }
  return realpathSync(result.stdout.trim());
}

function nearestExisting(path) {
  const suffix = [];
  let cursor = resolve(path);
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) break;
    suffix.unshift(basename(cursor));
    cursor = parent;
  }
  const base = existsSync(cursor) ? realpathSync(cursor) : cursor;
  return join(base, ...suffix);
}

export function resolveInsideRepo(path, repoRoot, label, { mustExist = false } = {}) {
  const absolute = isAbsolute(path) ? resolve(path) : resolve(repoRoot, path);
  if (mustExist && !existsSync(absolute)) {
    throw new BuildctlError('E_PATH_MISSING', `${label} does not exist: ${absolute}`);
  }
  const canonical = mustExist ? realpathSync(absolute) : nearestExisting(absolute);
  const rel = relative(repoRoot, canonical);
  if (rel === '..' || rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(rel)) {
    throw new BuildctlError(
      'E_PATH_OUTSIDE_REPOSITORY',
      `${label} must resolve inside ${repoRoot}: ${path}`,
    );
  }
  return canonical;
}

function atomicWrite(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = join(
    dirname(path),
    `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`,
  );
  writeFileSync(temp, content, { encoding: 'utf8', flag: 'wx' });
  renameSync(temp, path);
}

function manifestVersion(path, expectedName) {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (
      parsed.name === expectedName
      && isSemanticVersion(parsed.version)
    ) {
      return parsed.version;
    }
  } catch {
    return null;
  }
  return null;
}

export function resolveCompilerVersion(start = dirname(fileURLToPath(import.meta.url))) {
  let cursor = resolve(start);
  while (true) {
    for (const [candidate, expectedName] of [
      [join(cursor, '.codex-plugin/plugin.json'), 'build'],
      [join(cursor, '.claude-plugin/plugin.json'), 'build'],
      [join(cursor, 'package.json'), 'build-plugin'],
    ]) {
      if (!existsSync(candidate)) continue;
      const version = manifestVersion(candidate, expectedName);
      if (version) return version;
    }
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  throw new BuildctlError('E_COMPILER_VERSION', 'No Build version carrier was found.');
}

function stripComment(text) {
  let quote = null;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote === '"' && char === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '#' && (index === 0 || /\s/.test(text[index - 1]))) {
      return text.slice(0, index).trimEnd();
    }
  }
  return text.trimEnd();
}

function unsupportedYaml(text) {
  const clean = stripComment(text);
  let quote = null;
  let escaped = false;
  let outside = '';
  for (const char of clean) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote === '"' && char === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else outside += char;
  }
  return /(^|[\s:[\x7b,])(?:&[A-Za-z0-9_-]+|\*[A-Za-z0-9_-]+|![A-Za-z0-9_-]+)|(^|\s)<<\s*:/.test(outside);
}

class FlowParser {
  constructor(text, line) {
    this.text = text;
    this.line = line;
    this.index = 0;
  }

  error(message) {
    throw new BuildctlError('E_YAML_PARSE', `YAML line ${this.line}: ${message}`);
  }

  skip() {
    while (/\s/.test(this.text[this.index] || '')) this.index += 1;
  }

  parse() {
    this.skip();
    const value = this.value();
    this.skip();
    if (this.index !== this.text.length) this.error(`unexpected ${this.text.slice(this.index)}`);
    return value;
  }

  value() {
    this.skip();
    const char = this.text[this.index];
    if (char === '[') return this.array();
    if (char === '{') return this.object();
    if (char === '"' || char === "'") return this.quoted();
    return this.plain([',', ']', '}']);
  }

  quoted() {
    const quote = this.text[this.index];
    const start = this.index;
    this.index += 1;
    let value = '';
    while (this.index < this.text.length) {
      const char = this.text[this.index];
      if (quote === '"' && char === '\\') {
        this.index += 1;
        if (this.index >= this.text.length) this.error('unterminated escape');
        value += `\\${this.text[this.index]}`;
        this.index += 1;
        continue;
      }
      if (char === quote) {
        if (quote === "'" && this.text[this.index + 1] === "'") {
          value += "'";
          this.index += 2;
          continue;
        }
        this.index += 1;
        if (quote === '"') {
          try {
            return JSON.parse(this.text.slice(start, this.index));
          } catch {
            this.error('invalid double-quoted scalar');
          }
        }
        return value;
      }
      value += char;
      this.index += 1;
    }
    this.error('unterminated quoted scalar');
  }

  plain(stops) {
    const start = this.index;
    while (this.index < this.text.length && !stops.includes(this.text[this.index])) {
      this.index += 1;
    }
    const raw = this.text.slice(start, this.index).trim();
    if (!raw) this.error('empty scalar');
    if (raw === 'null' || raw === '~') return null;
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    if (/^-?(?:0|(?!0)\d+)$/.test(raw)) return Number(raw);
    if (/^-?(?:0|(?!0)\d+)\.\d+$/.test(raw)) return Number(raw);
    return raw;
  }

  array() {
    const values = [];
    this.index += 1;
    this.skip();
    if (this.text[this.index] === ']') {
      this.index += 1;
      return values;
    }
    while (this.index < this.text.length) {
      values.push(this.value());
      this.skip();
      const char = this.text[this.index];
      if (char === ']') {
        this.index += 1;
        return values;
      }
      if (char !== ',') this.error('expected comma or ]');
      this.index += 1;
    }
    this.error('unterminated flow array');
  }

  key() {
    this.skip();
    if (this.text[this.index] === '"' || this.text[this.index] === "'") return this.quoted();
    const start = this.index;
    while (this.index < this.text.length && this.text[this.index] !== ':') this.index += 1;
    const key = this.text.slice(start, this.index).trim();
    if (!key) this.error('empty mapping key');
    return key;
  }

  object() {
    const value = {};
    this.index += 1;
    this.skip();
    if (this.text[this.index] === '}') {
      this.index += 1;
      return value;
    }
    while (this.index < this.text.length) {
      const key = this.key();
      this.skip();
      if (this.text[this.index] !== ':') this.error('expected colon in flow mapping');
      this.index += 1;
      if (Object.hasOwn(value, key)) this.error(`duplicate key ${key}`);
      value[key] = this.value();
      this.skip();
      const char = this.text[this.index];
      if (char === '}') {
        this.index += 1;
        return value;
      }
      if (char !== ',') this.error('expected comma or }');
      this.index += 1;
    }
    this.error('unterminated flow mapping');
  }
}

function splitMapping(text, line) {
  let quote = null;
  let escaped = false;
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote === '"' && char === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === '[' || char === '{') depth += 1;
    else if (char === ']' || char === '}') depth -= 1;
    else if (char === ':' && depth === 0) {
      return [text.slice(0, index).trim(), text.slice(index + 1).trim()];
    }
  }
  throw new BuildctlError('E_YAML_PARSE', `YAML line ${line}: expected mapping colon`);
}

function scalar(text, line) {
  return new FlowParser(text, line).parse();
}

function yamlLines(source) {
  const lines = [];
  const rawLines = source.replace(/\r\n?/g, '\n').split('\n');
  rawLines.forEach((raw, index) => {
    if (/^\s*\t/.test(raw) || /^ +\t/.test(raw)) {
      throw new BuildctlError('E_YAML_PARSE', `YAML line ${index + 1}: tabs are not allowed`);
    }
    if (unsupportedYaml(raw)) {
      throw new BuildctlError(
        'E_YAML_UNSUPPORTED',
        `YAML line ${index + 1}: anchors, aliases, tags, and merge keys are not supported`,
      );
    }
    const clean = stripComment(raw);
    if (!clean.trim()) return;
    const indent = clean.match(/^ */)[0].length;
    lines.push({ indent, text: clean.slice(indent), line: index + 1 });
  });
  return lines;
}

function parseBlock(lines, start, indent) {
  const sequence = lines[start].text === '-' || lines[start].text.startsWith('- ');
  const output = sequence ? [] : {};
  let index = start;
  while (index < lines.length && lines[index].indent === indent) {
    const item = lines[index];
    const isSequenceItem = item.text === '-' || item.text.startsWith('- ');
    if (isSequenceItem !== sequence) {
      throw new BuildctlError('E_YAML_PARSE', `YAML line ${item.line}: mixed map and list`);
    }
    if (sequence) {
      const rest = item.text.slice(1).trim();
      index += 1;
      if (!rest) {
        if (index >= lines.length || lines[index].indent <= indent) output.push(null);
        else {
          const parsed = parseBlock(lines, index, lines[index].indent);
          output.push(parsed.value);
          index = parsed.index;
        }
        continue;
      }
      if (rest.startsWith('{') || rest.startsWith('[') || rest.startsWith('"') || rest.startsWith("'")) {
        output.push(scalar(rest, item.line));
        continue;
      }
      if (!rest.includes(':')) {
        output.push(scalar(rest, item.line));
        continue;
      }
      const [key, rawValue] = splitMapping(rest, item.line);
      const object = {};
      object[key] = rawValue ? scalar(rawValue, item.line) : null;
      if (index < lines.length && lines[index].indent > indent) {
        const parsed = parseBlock(lines, index, lines[index].indent);
        if (!parsed.value || Array.isArray(parsed.value) || typeof parsed.value !== 'object') {
          throw new BuildctlError('E_YAML_PARSE', `YAML line ${item.line}: list item fields must be a map`);
        }
        for (const [nestedKey, nestedValue] of Object.entries(parsed.value)) {
          if (Object.hasOwn(object, nestedKey)) {
            throw new BuildctlError('E_YAML_PARSE', `YAML line ${item.line}: duplicate key ${nestedKey}`);
          }
          object[nestedKey] = nestedValue;
        }
        index = parsed.index;
      }
      output.push(object);
      continue;
    }

    const [key, rawValue] = splitMapping(item.text, item.line);
    if (Object.hasOwn(output, key)) {
      throw new BuildctlError('E_YAML_PARSE', `YAML line ${item.line}: duplicate key ${key}`);
    }
    index += 1;
    if (/^[|>][+-]?$/.test(rawValue)) {
      const folded = rawValue.startsWith('>');
      const chunks = [];
      while (index < lines.length && lines[index].indent > indent) {
        chunks.push(lines[index].text);
        index += 1;
      }
      output[key] = `${chunks.join(folded ? ' ' : '\n')}\n`;
    } else if (rawValue) {
      output[key] = scalar(rawValue, item.line);
    } else if (index < lines.length && lines[index].indent > indent) {
      const parsed = parseBlock(lines, index, lines[index].indent);
      output[key] = parsed.value;
      index = parsed.index;
    } else {
      output[key] = null;
    }
  }
  return { value: output, index };
}

export function parseYaml(source) {
  const lines = yamlLines(source);
  if (lines.length === 0) return {};
  if (lines[0].indent !== 0) {
    throw new BuildctlError('E_YAML_PARSE', `YAML line ${lines[0].line}: root must start at column 1`);
  }
  const parsed = parseBlock(lines, 0, 0);
  if (parsed.index !== lines.length) {
    throw new BuildctlError('E_YAML_PARSE', `YAML line ${lines[parsed.index].line}: invalid indentation`);
  }
  return parsed.value;
}

function markdownSection(source, name) {
  const pattern = new RegExp(`^##[ \\t]+${name}[ \\t]*$`, 'gm');
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1) {
    throw new BuildctlError(
      'E_MARKDOWN_SECTION',
      `Markdown requires exactly one ## ${name} section; found ${matches.length}.`,
    );
  }
  const start = matches[0].index + matches[0][0].length;
  const next = /^##[ \t]+[^#].*$/gm;
  next.lastIndex = start;
  const endMatch = next.exec(source);
  return source.slice(start, endMatch ? endMatch.index : source.length).trim();
}

function yamlFence(section, name) {
  const fences = [...section.matchAll(/```ya?ml[ \t]*\n([\s\S]*?)```/g)];
  if (fences.length !== 1) {
    throw new BuildctlError(
      'E_MARKDOWN_SECTION',
      `## ${name} requires exactly one YAML fence; found ${fences.length}.`,
    );
  }
  return fences[0][1];
}

function approachBindings(approach) {
  return [...approach.matchAll(/\[(B-\d\d\d)\]/g)].map((match) => match[1]);
}

function authoredDocument(source, extension) {
  if (extension === '.yaml' || extension === '.yml') {
    const parsed = parseYaml(source);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      throw new BuildctlError('E_SCHEMA', 'Pure YAML plan root must be a map.');
    }
    if (typeof parsed.approach !== 'string' || !parsed.approach.trim()) {
      throw new BuildctlError('E_SCHEMA', 'Pure YAML plans require a non-empty top-level approach block string.');
    }
    const approach = parsed.approach;
    const document = { ...parsed };
    delete document.approach;
    return { document, approach };
  }
  if (extension !== '.md' && extension !== '.markdown') {
    throw new BuildctlError('E_PLAN_FORMAT', `Unsupported plan extension: ${extension || '(none)'}`);
  }
  const approach = markdownSection(source, 'Approach');
  const manifest = parseYaml(yamlFence(markdownSection(source, 'Execution manifest'), 'Execution manifest'));
  const slices = parseYaml(yamlFence(markdownSection(source, 'Delivery slices'), 'Delivery slices'));
  for (const key of Object.keys(slices)) {
    if (Object.hasOwn(manifest, key)) {
      throw new BuildctlError('E_SCHEMA', `Duplicate top-level contract key across Markdown sections: ${key}`);
    }
  }
  return { document: { ...manifest, ...slices }, approach };
}

function slugFromPlan(planPath) {
  const stem = basename(planPath, extname(planPath)).replace(/-plan$/, '');
  const slug = stem.toLowerCase().replace(/[^a-z\d]+/g, '-').replace(/^-|-$/g, '');
  if (!slug) throw new BuildctlError('E_PLAN_SLUG', `Cannot derive a slug from ${planPath}`);
  return slug;
}

function contractCore(contract) {
  const copy = structuredClone(contract);
  delete copy.contract_hash;
  return copy;
}

export function verifyContractHash(contract) {
  const expected = sha256(canonicalJson(contractCore(contract)));
  if (contract.contract_hash !== expected) {
    throw new BuildctlError('E_CONTRACT_HASH', `Contract hash mismatch: expected ${expected}.`);
  }
  return expected;
}

export function compilePlan({ planPath, outputPath, cwd = process.cwd() }) {
  const repoRoot = findGitRoot(cwd);
  const plan = resolveInsideRepo(planPath, repoRoot, 'plan', { mustExist: true });
  if (!statSync(plan).isFile()) throw new BuildctlError('E_PATH_MISSING', `Plan is not a file: ${plan}`);
  const source = readFileSync(plan);
  const { document, approach } = authoredDocument(source.toString('utf8'), extname(plan).toLowerCase());
  const markers = approachBindings(approach);
  const validation = validateContract(document, markers);
  if (validation.diagnostics.length > 0) {
    throw new BuildctlError('E_PLAN_INVALID', 'Plan validation failed.', {
      diagnostics: validation.diagnostics,
    });
  }

  const slug = slugFromPlan(plan);
  const contract = {
    ...document,
    approach_bindings: markers,
    compiler: { name: 'buildctl', version: resolveCompilerVersion() },
    evidence_commands: validation.evidenceCommands,
    schema_version: 1,
    slug,
    source: {
      path: relative(repoRoot, plan).split('\\').join('/'),
      sha256: sha256(source),
    },
    workstreams: validation.workstreams,
  };
  contract.contract_hash = sha256(canonicalJson(contract));
  const destination = resolveInsideRepo(
    outputPath || join('.build', 'contracts', slug, 'contract.json'),
    repoRoot,
    'contract output',
  );
  atomicWrite(destination, canonicalJson(contract));
  return { contract, contractPath: destination, repoRoot };
}

export function loadContract({ contractPath, cwd = process.cwd() }) {
  const repoRoot = findGitRoot(cwd);
  const path = resolveInsideRepo(contractPath, repoRoot, 'contract', { mustExist: true });
  let contract;
  try {
    contract = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new BuildctlError('E_CONTRACT_JSON', `Cannot parse contract JSON: ${error.message}`);
  }
  verifyContractHash(contract);
  const plan = resolveInsideRepo(contract.source?.path || '', repoRoot, 'contract source plan', {
    mustExist: true,
  });
  const planHash = sha256(readFileSync(plan));
  if (planHash !== contract.source?.sha256) {
    throw new BuildctlError('E_CONTRACT_STALE', `Source plan hash changed for ${contract.source?.path}.`);
  }
  const version = resolveCompilerVersion();
  if (contract.compiler?.version !== version) {
    throw new BuildctlError(
      'E_COMPILER_VERSION_STALE',
      `Contract compiler ${contract.compiler?.version || '(missing)'} does not match ${version}.`,
    );
  }
  return { contract, contractPath: path, repoRoot, planPath: plan };
}
