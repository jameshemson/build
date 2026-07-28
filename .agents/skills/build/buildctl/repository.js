import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  createReadStream,
  existsSync,
  lstatSync,
  readlinkSync,
  realpathSync,
} from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
  BuildctlError,
  canonicalJson,
  findGitRoot,
  resolveInsideRepo,
  sha256,
} from './plan-contract.js';

const KIBIBYTE = 2 ** 10;
const GIT_BUFFER_LIMIT = 64 * KIBIBYTE * KIBIBYTE;

function git(repoRoot, args, { allowFailure = false, encoding = 'utf8' } = {}) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding,
    maxBuffer: GIT_BUFFER_LIMIT,
  });
  if (result.error) {
    throw new BuildctlError('E_GIT', `Cannot run git ${args.join(' ')}: ${result.error.message}`);
  }
  if (result.status !== 0 && !allowFailure) {
    const stderr = Buffer.isBuffer(result.stderr)
      ? result.stderr.toString('utf8')
      : result.stderr || '';
    throw new BuildctlError(
      'E_GIT',
      `git ${args.join(' ')} failed in ${repoRoot}: ${stderr.trim()}`,
    );
  }
  return result;
}

function nulRecords(buffer) {
  return buffer.toString('utf8').split('\0').filter(Boolean);
}

function posix(path) {
  return path.split(sep).join('/');
}

function excluded(path, excludedPath) {
  return Boolean(excludedPath)
    && (path === excludedPath || path.startsWith(`${excludedPath}/`));
}

async function fileHash(path) {
  const hash = createHash('sha256');
  await new Promise((resolvePromise, reject) => {
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolvePromise);
  });
  return hash.digest('hex');
}

function worktreeType(stat) {
  if (stat.isFile()) return 'file';
  if (stat.isSymbolicLink()) return 'symlink';
  if (stat.isDirectory()) return 'directory';
  if (stat.isSocket()) return 'socket';
  if (stat.isFIFO()) return 'fifo';
  if (stat.isCharacterDevice()) return 'character-device';
  if (stat.isBlockDevice()) return 'block-device';
  return 'other';
}

async function worktreeRecord(repoRoot, path) {
  const absolute = join(repoRoot, ...path.split('/'));
  let stat;
  try {
    stat = lstatSync(absolute);
  } catch (error) {
    if (error.code === 'ENOENT') return { path, type: 'missing' };
    throw error;
  }
  const record = {
    mode: (stat.mode & 0xffff).toString(8),
    path,
    type: worktreeType(stat),
  };
  if (stat.isFile()) {
    record.bytes = stat.size;
    record.sha256 = await fileHash(absolute);
  } else if (stat.isSymbolicLink()) {
    const target = readlinkSync(absolute);
    record.target_sha256 = sha256(Buffer.from(target));
  }
  return record;
}

function submodulePaths(repoRoot) {
  const modules = join(repoRoot, '.gitmodules');
  if (!existsSync(modules)) return [];
  const result = git(
    repoRoot,
    ['config', '-f', modules, '--get-regexp', '^submodule\\..*\\.path$'],
    { allowFailure: true },
  );
  if (result.status === 1 && !result.stdout.trim()) return [];
  if (result.status !== 0) {
    throw new BuildctlError('E_GIT', `Cannot read submodule paths from ${modules}.`);
  }
  return result.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => line.slice(line.search(/\s/) + 1))
    .sort();
}

function ensureDescendant(path, root, label) {
  const rel = relative(root, path);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new BuildctlError('E_PATH_OUTSIDE_REPOSITORY', `${label} escapes ${root}.`);
  }
}

function captureSubmodules(repoRoot, prefix = '') {
  const identities = [];
  for (const configuredPath of submodulePaths(repoRoot)) {
    const absolute = resolve(repoRoot, configuredPath);
    ensureDescendant(absolute, repoRoot, `Submodule ${configuredPath}`);
    if (!existsSync(absolute)) {
      throw new BuildctlError('E_SUBMODULE_UNAVAILABLE', `Submodule is not initialized: ${configuredPath}`);
    }
    const canonical = realpathSync(absolute);
    const status = git(
      canonical,
      ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=none'],
      { encoding: 'buffer' },
    ).stdout;
    const path = posix(join(prefix, configuredPath));
    if (status.length > 0) {
      throw new BuildctlError('E_DIRTY_SUBMODULE', `Submodule has dirty or untracked content: ${path}`);
    }
    const headCommit = git(canonical, ['rev-parse', 'HEAD']).stdout.trim();
    identities.push({ head_commit: headCommit, path });
    identities.push(...captureSubmodules(canonical, path));
  }
  return identities.sort((left, right) => left.path.localeCompare(right.path));
}

function repositoryCore(identity) {
  const copy = structuredClone(identity);
  delete copy.fingerprint;
  return copy;
}

export async function captureRepositoryIdentity({ repoRoot = process.cwd(), evidenceDir } = {}) {
  const root = findGitRoot(repoRoot);
  const evidence = resolveInsideRepo(
    evidenceDir || join('.build', 'evidence'),
    root,
    'evidence directory',
  );
  const evidencePath = posix(relative(root, evidence));
  if (!evidencePath) {
    throw new BuildctlError('E_EVIDENCE_PATH', 'Evidence directory cannot be the repository root.');
  }

  const indexRecords = nulRecords(
    git(root, ['ls-files', '--stage', '-z'], { encoding: 'buffer' }).stdout,
  ).filter((record) => {
    const tab = record.indexOf('\t');
    const path = tab >= 0 ? record.slice(tab + 1) : '';
    return !excluded(path, evidencePath);
  });

  const paths = nulRecords(
    git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      encoding: 'buffer',
    }).stdout,
  ).filter((path) => !excluded(path, evidencePath)).sort();

  const worktreeRecords = [];
  for (const path of paths) worktreeRecords.push(await worktreeRecord(root, path));

  const submodules = captureSubmodules(root);
  const headCommit = git(root, ['rev-parse', 'HEAD']).stdout.trim();
  const headTree = git(root, ['rev-parse', 'HEAD^{tree}']).stdout.trim();
  const indexSha256 = sha256(canonicalJson(indexRecords));
  const worktreeSha256 = sha256(canonicalJson(worktreeRecords));
  const submodulesSha256 = sha256(canonicalJson(submodules));
  const dirtyWorktreeFingerprint = sha256(canonicalJson({
    head_tree: headTree,
    index_sha256: indexSha256,
    submodules_sha256: submodulesSha256,
    worktree_sha256: worktreeSha256,
  }));
  const identity = {
    dirty_worktree_fingerprint: dirtyWorktreeFingerprint,
    excluded_evidence_path: evidencePath,
    head_commit: headCommit,
    head_tree: headTree,
    index_entry_count: indexRecords.length,
    index_sha256: indexSha256,
    repository_root_sha256: sha256(Buffer.from(root)),
    schema_version: 1,
    submodules,
    submodules_sha256: submodulesSha256,
    worktree_path_count: worktreeRecords.length,
    worktree_sha256: worktreeSha256,
  };
  identity.fingerprint = sha256(canonicalJson(repositoryCore(identity)));
  return identity;
}

export function repositoryCleanStatus({ repoRoot = process.cwd() } = {}) {
  const root = findGitRoot(repoRoot);
  const status = git(root, [
    'status',
    '--porcelain=v1',
    '-z',
    '--untracked-files=all',
    '--ignore-submodules=none',
  ], { encoding: 'buffer' }).stdout;
  return { clean: status.length === 0, status_sha256: sha256(status) };
}

// Paths this check reads. Reported verbatim as test_shrink.bounds so a narrow
// scan never reads as a clean whole-repository result.
const TEST_PATH_PATTERN = /(^|\/)(__tests__|tests?|spec|fixtures?|seeds?)\/|\.(test|spec)\.[A-Za-z0-9]+$|_test\.[A-Za-z0-9]+$|(^|\/)conftest\.py$/;

// One line may carry several assertions; this counts lines, not assertions, so
// the number is comparable across a reformat but still falls when checks go.
const ASSERTION_PATTERN = /\bassert\b|\bexpect\s*\(|\bshould\b|^\s*(?:async\s+)?(?:test|it)\s*\(|^\s*def\s+test_|^\s*func\s+Test[A-Z]|#\[test\]/;

function assertionLines(source) {
  if (source === null) return 0;
  return source.split(/\r?\n/).filter((line) => ASSERTION_PATTERN.test(line)).length;
}

// Binary fixtures (images, snapshots) live under the same directories as tests.
// Decoding one as text would produce a meaningless line count, so treat any blob
// containing a NUL byte as absent rather than counting it.
function blobAt(repoRoot, ref, path) {
  const result = git(repoRoot, ['show', `${ref}:${path}`], {
    allowFailure: true,
    encoding: 'buffer',
  });
  if (result.status !== 0) return null;
  return result.stdout.includes(0) ? null : result.stdout.toString('utf8');
}

function requireBaseRef(root, baseRef) {
  if (typeof baseRef !== 'string' || !/^[a-f0-9]{40}$/.test(baseRef)) {
    throw new BuildctlError('E_RESULT_BASE_REF', 'base_ref must be a full lowercase Git SHA.');
  }
  const exists = git(root, ['cat-file', '-e', `${baseRef}^{commit}`], { allowFailure: true });
  if (exists.status !== 0) {
    throw new BuildctlError('E_RESULT_BASE_REF', `base_ref is not a commit: ${baseRef}.`);
  }
}

// -M pairs a rename into one record, so a renamed test file is compared against
// its own former contents instead of reading as a delete plus an unrelated add.
function renameAwareChanges(root, baseRef, headRef) {
  const records = nulRecords(
    git(root, ['diff', '-M', '--name-status', '-z', baseRef, headRef], { encoding: 'buffer' }).stdout,
  );
  const changes = [];
  for (let index = 0; index < records.length;) {
    const status = records[index];
    const renamed = status.startsWith('R') || status.startsWith('C');
    changes.push({
      after: status.startsWith('D') ? null : records[index + (renamed ? 2 : 1)],
      before: records[index + 1],
      status,
    });
    index += renamed ? 3 : 2;
  }
  return changes;
}

export function repositoryTestShrink({
  repoRoot = process.cwd(),
  baseRef,
  headRef = 'HEAD',
} = {}) {
  const root = findGitRoot(repoRoot);
  requireBaseRef(root, baseRef);
  if (headRef !== 'HEAD') requireBaseRef(root, headRef);
  const examined = [];
  const shrunk = [];
  for (const change of renameAwareChanges(root, baseRef, headRef)) {
    if (!TEST_PATH_PATTERN.test(change.before)
      && !(change.after && TEST_PATH_PATTERN.test(change.after))) continue;
    // A path absent at base_ref is new; a new file cannot have lost coverage.
    const source = blobAt(root, baseRef, change.before);
    if (source === null) continue;
    const before = assertionLines(source);
    const after = change.after ? assertionLines(blobAt(root, headRef, change.after)) : 0;
    examined.push(change.after || change.before);
    if (after < before) {
      shrunk.push({
        after,
        before,
        path: change.after || change.before,
        ...(change.after && change.after !== change.before ? { renamed_from: change.before } : {}),
        ...(change.after ? {} : { deleted: true }),
      });
    }
  }
  return {
    bounds: {
      assertion_pattern: ASSERTION_PATTERN.source,
      path_pattern: TEST_PATH_PATTERN.source,
      unit: 'lines matching assertion_pattern',
    },
    examined: examined.sort(),
    shrunk: shrunk.sort((left, right) => left.path.localeCompare(right.path)),
  };
}

export function repositoryFileScope({
  repoRoot = process.cwd(),
  baseRef,
  plannedPaths = [],
} = {}) {
  const root = findGitRoot(repoRoot);
  requireBaseRef(root, baseRef);
  const changed = nulRecords(
    git(root, ['diff', '--name-only', '-z', baseRef, 'HEAD'], { encoding: 'buffer' }).stdout,
  ).sort();
  const planned = [...new Set(plannedPaths)].sort();
  if (planned.some((path) => typeof path !== 'string' || !path)) {
    throw new BuildctlError('E_RESULT_SCOPE', 'Planned paths must be non-empty strings.');
  }
  const changedSet = new Set(changed);
  const plannedSet = new Set(planned);
  return {
    changed,
    out_of_plan: changed.filter((path) => !plannedSet.has(path)),
    planned,
    planned_but_unchanged: planned.filter((path) => !changedSet.has(path)),
  };
}
