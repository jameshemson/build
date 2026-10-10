import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitBill } from '../src/split.js';

test('splits an even total equally', () => {
  assert.deepEqual(splitBill(1000, 4), [250, 250, 250, 250]);
});

test('one person pays the whole bill', () => {
  assert.deepEqual(splitBill(1234, 1), [1234]);
});

test('rejects a negative total', () => {
  assert.throws(() => splitBill(-1, 2), RangeError);
});

test('rejects zero people', () => {
  assert.throws(() => splitBill(1000, 0), RangeError);
});
