import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { BuildctlError, canonicalJson } from './plan-contract.js';

export function atomicWrite(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = join(
    dirname(path),
    `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`,
  );
  writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx' });
  renameSync(temporary, path);
}

export function writeImmutableJson(path, value, {
  collisionCode = 'E_IMMUTABLE_JSON_COLLISION',
  collisionMessage = `Immutable JSON collision at ${path}.`,
} = {}) {
  const content = canonicalJson(value);
  if (existsSync(path)) {
    if (readFileSync(path, 'utf8') !== content) {
      throw new BuildctlError(collisionCode, collisionMessage);
    }
  } else {
    atomicWrite(path, content);
  }
  return path;
}
