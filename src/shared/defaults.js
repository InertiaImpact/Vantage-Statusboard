'use strict';

const DEFAULT_SETTINGS = Object.freeze({
  vantage: {
    server: 'KGAN-VANTAGE51.sbgnet.int',
    protocol: 'http',
    port: 8676,
    authType: 'none',
    username: '',
    password: '',
    token: '',
    apiKeyHeader: 'X-Api-Key',
    verifyTls: true,
    requestTimeoutSeconds: 15
  },
  dashboard: {
    refreshSeconds: 10,
    workflowIds: [],
    view: 'current',
    search: '',
    showSummary: false,
    themeId: 'slate',
    webPort: 8765,
    exposeToLan: false
  },
  desktop: {
    autostart: false,
    alwaysOnTop: false,
    resizeLocked: false,
    bounds: null
  }
});

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeSettings(base, incoming) {
  const merged = deepClone(base);
  for (const section of Object.keys(merged)) {
    if (incoming && typeof incoming[section] === 'object' && incoming[section] !== null) {
      Object.assign(merged[section], incoming[section]);
    }
  }
  return merged;
}

module.exports = { DEFAULT_SETTINGS, deepClone, mergeSettings };
