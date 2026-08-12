'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeServerInput, validateSettings } = require('../src/shared/validation');

test('normalizes a bare Vantage server name', () => {
  assert.deepEqual(normalizeServerInput('SERVER-NAME.test.local'), {
    server: 'server-name.test.local', protocol: 'http', inferredPort: null
  });
});

test('extracts protocol and port from a full URL', () => {
  assert.deepEqual(normalizeServerInput('https://vantage.example.test:9443/Rest'), {
    server: 'vantage.example.test', protocol: 'https', inferredPort: 9443
  });
});

test('preserves a stored HTTPS protocol with a normalized hostname', () => {
  const settings = validateSettings({ vantage: { server: 'vantage.example.test', protocol: 'https' } });
  assert.equal(settings.vantage.protocol, 'https');
});

test('validates ranges and preserves safe defaults', () => {
  const settings = validateSettings({
    vantage: { server: 'vantage.test', port: 99999, requestTimeoutSeconds: 1 },
    dashboard: { webPort: 20, refreshSeconds: 1 }
  });
  assert.equal(settings.vantage.port, 65535);
  assert.equal(settings.vantage.requestTimeoutSeconds, 2);
  assert.equal(settings.dashboard.webPort, 1024);
  assert.equal(settings.dashboard.refreshSeconds, 5);
  assert.equal(settings.dashboard.showSummary, false);
});

test('keeps the optional summary hidden unless enabled', () => {
  assert.equal(validateSettings({ dashboard: {} }).dashboard.showSummary, false);
  assert.equal(validateSettings({ dashboard: { showSummary: true } }).dashboard.showSummary, true);
});

test('normalizes multiple workflow selections and removes duplicates', () => {
  const settings = validateSettings({ dashboard: { workflowIds: ['one', 'two', 'one', '', 'all'] } });
  assert.deepEqual(settings.dashboard.workflowIds, ['one', 'two']);
});

test('migrates the previous single-workflow setting', () => {
  assert.deepEqual(validateSettings({ dashboard: { workflowId: 'legacy-id' } }).dashboard.workflowIds, ['legacy-id']);
  assert.deepEqual(validateSettings({ dashboard: { workflowId: 'all' } }).dashboard.workflowIds, []);
});
