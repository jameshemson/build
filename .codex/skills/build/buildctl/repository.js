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
