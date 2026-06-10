import { test } from 'node:test';
import assert from 'node:assert/strict';

test('adds numbers', () => {
  // Deliberately failing fixture: the eval asserts verify reports FAILED.
  assert.equal(1 + 1, 3);
});
