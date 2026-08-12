'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { BUILT_IN_THEMES, validateTheme } = require('../src/shared/themes');

test('all built-in themes satisfy the import schema', () => {
  for (const theme of BUILT_IN_THEMES) {
    assert.doesNotThrow(() => validateTheme({ ...theme, id: `custom-${theme.id}` }));
  }
});

test('rejects incomplete themes', () => {
  assert.throws(() => validateTheme({ id: 'broken', name: 'Broken', tokens: {} }), /missing/i);
});
