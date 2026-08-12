'use strict';

const { DEFAULT_SETTINGS, mergeSettings } = require('./defaults');

function clampInteger(value, minimum, maximum, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

function normalizeServerInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return { server: '', protocol: 'http', inferredPort: null };

  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
  let parsed;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new Error('Enter a valid server name or URL.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error('The Vantage server must use HTTP or HTTPS.');
  }
  return {
    server: parsed.hostname,
    protocol: parsed.protocol.slice(0, -1),
    inferredPort: parsed.port ? Number(parsed.port) : null
  };
}

function validateSettings(input) {
  const settings = mergeSettings(DEFAULT_SETTINGS, input || {});
  const incomingDashboard = input?.dashboard || {};
  const serverIncludesProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(String(settings.vantage.server || '').trim());
  const normalizedServer = normalizeServerInput(settings.vantage.server);
  settings.vantage.server = normalizedServer.server;
  settings.vantage.protocol = serverIncludesProtocol
    ? normalizedServer.protocol
    : (settings.vantage.protocol === 'https' ? 'https' : 'http');
  settings.vantage.port = clampInteger(
    normalizedServer.inferredPort || settings.vantage.port,
    1,
    65535,
    DEFAULT_SETTINGS.vantage.port
  );
  settings.vantage.requestTimeoutSeconds = clampInteger(settings.vantage.requestTimeoutSeconds, 2, 120, 15);
  settings.dashboard.refreshSeconds = clampInteger(settings.dashboard.refreshSeconds, 5, 3600, 10);
  settings.dashboard.webPort = clampInteger(settings.dashboard.webPort, 1024, 65535, 8765);
  const workflowIds = Array.isArray(incomingDashboard.workflowIds)
    ? incomingDashboard.workflowIds
    : (incomingDashboard.workflowId && incomingDashboard.workflowId !== 'all' ? [incomingDashboard.workflowId] : []);
  settings.dashboard.workflowIds = [...new Set(workflowIds
    .map((workflowId) => String(workflowId).trim())
    .filter((workflowId) => workflowId && workflowId !== 'all'))];
  delete settings.dashboard.workflowId;
  settings.vantage.protocol = settings.vantage.protocol === 'https' ? 'https' : 'http';
  settings.vantage.authType = ['none', 'basic', 'bearer', 'apikey'].includes(settings.vantage.authType)
    ? settings.vantage.authType
    : 'none';
  settings.dashboard.view = ['current', 'recent', 'all'].includes(settings.dashboard.view)
    ? settings.dashboard.view
    : 'current';
  settings.vantage.verifyTls = Boolean(settings.vantage.verifyTls);
  settings.dashboard.showSummary = Boolean(settings.dashboard.showSummary);
  settings.dashboard.exposeToLan = Boolean(settings.dashboard.exposeToLan);
  settings.desktop.autostart = Boolean(settings.desktop.autostart);
  settings.desktop.alwaysOnTop = Boolean(settings.desktop.alwaysOnTop);
  settings.desktop.resizeLocked = Boolean(settings.desktop.resizeLocked);
  return settings;
}

module.exports = { clampInteger, normalizeServerInput, validateSettings };
