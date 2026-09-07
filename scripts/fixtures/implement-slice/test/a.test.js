const test = require('node:test');
const assert = require('node:assert/strict');
const { a } = require('../src/a.js');

test('a returns a', () => {
  assert.equal(a(), 'a');
});
