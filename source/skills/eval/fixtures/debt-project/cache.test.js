import { test } from 'node:test';
import assert from 'node:assert/strict';
import { put, get } from './src/cache.js';

test('put stores a value that get returns', () => {
  put('k', 'v');
  assert.equal(get('k'), 'v');
});
