'use strict';

const byId = (id) => document.getElementById(id);
const state = {
  settings: null,
  themes: [],
  status: null,
  desktopState: { alwaysOnTop: false, resizeLocked: false },
  timer: null
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[character]));
}

function compactState(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function groupFor(job) {
  const status = compactState(job.state);
  if (['active', 'inprocess', 'processing', 'running'].includes(status)) return 'active';
  if (['waiting', 'waitingtoretry', 'queued', 'queuedforsubmission', 'paused'].includes(status)) return 'waiting';
  if (['complete', 'completed', 'success', 'succeeded'].includes(status)) return 'complete';
  return 'issue';
}

function statusOrder(job) {
  return { active: 0, waiting: 1, issue: 2, complete: 3 }[groupFor(job)];
}

function parseDate(value) {
  if (!value) return null;
  const text = String(value);
  const serialized = text.match(/\/Date\((\d+)/);
  const normalized = text.replace(/(\.\d{3})\d+(?=Z$|[+-]\d{2}:?\d{2}$)/, '$1');
  const date = serialized ? new Date(Number(serialized[1])) : new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function jobRecency(job) {
  const date = parseDate(job.updated) || parseDate(job.started);
  return date ? date.getTime() : 0;
}

function formatClock(value) {
  const date = parseDate(value);
  return date ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—';
}

function formatDuration(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  if (seconds < 45) return '< 1 min';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${Math.max(1, minutes)} min`;
}

function formatEstimate(value) {
  if (value === null || value === undefined || value === '') return 'Unavailable';
  const seconds = Math.max(0, Math.round(Number(value)));
  if (!Number.isFinite(seconds)) return 'Unavailable';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function cleanName(value) {
  return String(value || 'Unnamed job').replace(/_[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}(?=\.[^.]+$|$)/i, '');
}

function applyTheme(theme) {
  if (!theme?.tokens) return;
  const tokenMap = {
    background: '--background', surface: '--surface', surfaceRaised: '--surface-raised',
    border: '--border', text: '--text', muted: '--muted', primary: '--primary',
    active: '--active', waiting: '--waiting', danger: '--danger', success: '--success', radius: '--radius'
  };
  for (const [key, property] of Object.entries(tokenMap)) {
    document.documentElement.style.setProperty(property, theme.tokens[key]);
  }
  document.body.dataset.density = theme.tokens.density;
}

function renderThemePreview() {
  const theme = state.themes.find((item) => item.id === byId('themeInput').value);
  if (!theme) return;
  const keys = ['background', 'surfaceRaised', 'primary', 'active', 'waiting', 'danger', 'success'];
  byId('themePreview').innerHTML = keys.map((key) => `<span class="theme-swatch" title="${key}" style="background:${escapeHtml(theme.tokens[key])}"></span>`).join('');
  applyTheme(theme);
}

function visibleJobs() {
  if (!state.status?.jobs) return [];
  const dashboard = state.settings.dashboard;
  const cutoff = Date.now() - (2 * 60 * 60 * 1000);
  return state.status.jobs.filter((job) => {
    if (job.isMonitor) return false;
    if (dashboard.workflowIds.length && !dashboard.workflowIds.includes(job.workflowId)) return false;
    const group = groupFor(job);
    if (dashboard.view === 'current' && group === 'complete') return false;
    if (dashboard.view === 'recent' && group === 'complete') {
      const updated = parseDate(job.updated);
      if (!updated || updated.getTime() < cutoff) return false;
    }
    const query = dashboard.search.trim().toLowerCase();
    if (query && ![job.name, job.workflowName, job.state].some((value) => String(value).toLowerCase().includes(query))) return false;
    return true;
  }).sort((left, right) => statusOrder(left) - statusOrder(right)
    || jobRecency(right) - jobRecency(left)
    || left.workflowName.localeCompare(right.workflowName)
    || left.name.localeCompare(right.name));
}

function renderStatus() {
  const status = state.status;
  if (!status) return;
  byId('summaryGrid').hidden = !state.settings.dashboard.showSummary;
  document.body.classList.toggle('show-summary', state.settings.dashboard.showSummary);
  const jobs = visibleJobs();
  const counts = { active: 0, waiting: 0, issue: 0 };
  jobs.forEach((job) => {
    const group = groupFor(job);
    if (counts[group] !== undefined) counts[group] += 1;
  });
  byId('activeCount').textContent = counts.active;
  byId('waitingCount').textContent = counts.waiting;
  byId('issueCount').textContent = counts.issue;
  byId('shownCount').textContent = jobs.length;

  const connection = byId('connectionState');
  connection.dataset.state = status.connected ? 'connected' : 'error';
  byId('connectionTitle').textContent = status.connected ? 'Vantage connected' : 'Connection unavailable';
  byId('connectionServer').textContent = state.settings.vantage.server
    ? `${state.settings.vantage.server}:${state.settings.vantage.port}`
    : 'Server not configured';
  byId('connectionDetail').textContent = status.connected
    ? `Updated ${formatClock(status.fetchedAt)} · ${jobs.length} shown`
    : (status.error || 'Open Settings to configure Vantage');

  const warnings = [...(status.warnings || [])];
  if (status.error) warnings.unshift(status.error);
  byId('notice').hidden = warnings.length === 0;
  byId('notice').textContent = warnings.join('\n');

  if (!jobs.length) {
    byId('jobList').innerHTML = `<div class="empty-state"><strong>No matching jobs</strong><span>${status.connected ? 'The board is clear for the current filters.' : 'Check the Vantage connection in Settings.'}</span></div>`;
    return;
  }
  byId('jobList').innerHTML = jobs.map(renderJob).join('');
}

function renderJob(job) {
  const group = groupFor(job);
  const complete = group === 'complete';
  const progressAvailable = Number.isFinite(Number(job.progress));
  const progress = complete ? 100 : (progressAvailable ? Math.min(100, Math.max(0, Number(job.progress))) : 0);
  const indeterminate = group === 'active' && !progressAvailable;
  let estimate = 'Unavailable';
  let estimateLabel = 'not exposed by REST';
  if (complete) { estimate = 'Done'; estimateLabel = 'completed'; }
  else if (group === 'waiting') { estimate = 'Pending'; estimateLabel = 'waiting for service'; }
  else if (group === 'issue') { estimate = 'Stopped'; estimateLabel = 'check Vantage'; }
  else if (job.etaSeconds !== null && job.etaSeconds !== undefined && Number.isFinite(Number(job.etaSeconds))) {
    estimate = formatEstimate(job.etaSeconds);
    estimateLabel = 'Vantage remaining';
  }

  return `<article class="job-row is-${group}">
    <div class="job-identity"><span class="status-chip">${escapeHtml(job.state)}</span><div class="job-name" title="${escapeHtml(job.name)}">${escapeHtml(cleanName(job.name))}</div><div class="workflow-name">${escapeHtml(job.workflowName)}</div></div>
    <div><div class="progress-copy"><strong>${progressAvailable || complete ? `${Math.round(progress)}%` : 'Preparing'}</strong></div><div class="progress-track ${indeterminate ? 'indeterminate' : ''}"><div class="progress-fill" style="width:${indeterminate ? 28 : progress}%"></div></div></div>
    <div class="eta-card"><strong>${escapeHtml(estimate)}</strong><span>${escapeHtml(estimateLabel)}</span></div>
    <div class="timing"><div><span>Started</span><strong>${escapeHtml(formatClock(job.started))}</strong></div><div><span>Run time</span><strong>${escapeHtml(formatDuration(job.runTimeSeconds))}</strong></div></div>
  </article>`;
}

function populateSettings() {
  const { vantage, dashboard, desktop } = state.settings;
  byId('serverInput').value = vantage.protocol === 'https' ? `https://${vantage.server}` : vantage.server;
  byId('vantagePortInput').value = vantage.port;
  byId('authTypeInput').value = vantage.authType;
  byId('usernameInput').value = vantage.username;
  byId('passwordInput').value = '';
  byId('tokenInput').value = '';
  byId('apiKeyHeaderInput').value = vantage.apiKeyHeader;
  byId('refreshInput').value = dashboard.refreshSeconds;
  byId('viewInput').value = dashboard.view;
  byId('searchInput').value = dashboard.search;
  byId('summaryInput').checked = dashboard.showSummary;
  byId('webPortInput').value = dashboard.webPort;
  byId('lanInput').checked = dashboard.exposeToLan;
  byId('themeInput').innerHTML = state.themes.map((theme) => `<option value="${escapeHtml(theme.id)}">${escapeHtml(theme.name)}${theme.builtIn ? '' : ' · custom'}</option>`).join('');
  byId('themeInput').value = dashboard.themeId;
  byId('autostartInput').checked = desktop.autostart;
  byId('verifyTlsInput').checked = vantage.verifyTls;
  byId('timeoutInput').value = vantage.requestTimeoutSeconds;
  populateWorkflows();
  renderAuthFields();
  renderThemePreview();
}

function populateWorkflows() {
  const workflows = state.status?.workflowOptions || [];
  const selected = new Set(state.settings.dashboard.workflowIds);
  const availableIds = new Set(workflows.map((workflow) => workflow.id));
  const options = [
    ...workflows,
    ...[...selected].filter((workflowId) => !availableIds.has(workflowId)).map((workflowId) => ({ id: workflowId, name: `Saved workflow · ${workflowId}` }))
  ];
  byId('workflowOptions').innerHTML = options.length
    ? options.map((workflow) => `<label class="workflow-option"><input type="checkbox" value="${escapeHtml(workflow.id)}" ${selected.has(workflow.id) ? 'checked' : ''}><span>${escapeHtml(workflow.name)}</span></label>`).join('')
    : '<p class="workflow-empty">Workflows will appear after Vantage connects.</p>';
  byId('workflowPicker').open = false;
  updateWorkflowSummary();
}

function selectedWorkflowIds() {
  return [...byId('workflowOptions').querySelectorAll('input:checked')].map((input) => input.value);
}

function updateWorkflowSummary() {
  const selected = selectedWorkflowIds();
  if (!selected.length) {
    byId('workflowSummary').textContent = 'All workflows';
    return;
  }
  if (selected.length === 1) {
    const selectedInput = byId('workflowOptions').querySelector(`input[value="${CSS.escape(selected[0])}"]`);
    byId('workflowSummary').textContent = selectedInput?.nextElementSibling?.textContent || '1 workflow selected';
    return;
  }
  byId('workflowSummary').textContent = `${selected.length} workflows selected`;
}

function renderAuthFields() {
  const authType = byId('authTypeInput').value;
  document.querySelectorAll('.auth-basic').forEach((element) => { element.hidden = authType !== 'basic'; });
  document.querySelectorAll('.auth-token').forEach((element) => { element.hidden = !['bearer', 'apikey'].includes(authType); });
  document.querySelectorAll('.auth-apikey').forEach((element) => { element.hidden = authType !== 'apikey'; });
}

function openSettings() {
  populateSettings();
  byId('settingsScrim').hidden = false;
  byId('settingsDrawer').classList.add('open');
  byId('settingsDrawer').setAttribute('aria-hidden', 'false');
  byId('serverInput').focus();
}

function closeSettings() {
  byId('settingsDrawer').classList.remove('open');
  byId('settingsDrawer').setAttribute('aria-hidden', 'true');
  setTimeout(() => { byId('settingsScrim').hidden = true; }, 220);
  applyTheme(state.themes.find((theme) => theme.id === state.settings.dashboard.themeId));
}

async function saveSettings(event) {
  event.preventDefault();
  byId('settingsError').hidden = true;
  const payload = {
    vantage: {
      server: byId('serverInput').value,
      protocol: /^https:\/\//i.test(byId('serverInput').value.trim()) ? 'https' : 'http',
      port: Number(byId('vantagePortInput').value),
      authType: byId('authTypeInput').value,
      username: byId('usernameInput').value,
      password: byId('passwordInput').value,
      token: byId('tokenInput').value,
      apiKeyHeader: byId('apiKeyHeaderInput').value,
      verifyTls: byId('verifyTlsInput').checked,
      requestTimeoutSeconds: Number(byId('timeoutInput').value)
    },
    dashboard: {
      refreshSeconds: Number(byId('refreshInput').value),
      workflowIds: selectedWorkflowIds(),
      view: byId('viewInput').value,
      search: byId('searchInput').value,
      showSummary: byId('summaryInput').checked,
      themeId: byId('themeInput').value,
      webPort: Number(byId('webPortInput').value),
      exposeToLan: byId('lanInput').checked
    },
    desktop: { autostart: byId('autostartInput').checked }
  };
  try {
    const previousWebPort = state.settings.dashboard.webPort;
    const response = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to save settings.');
    state.settings = result.settings;
    state.themes = result.themes;
    applyTheme(result.activeTheme);
    renderStatus();
    closeSettings();
    showToast('Settings saved. Reconnecting to Vantage…');
    scheduleRefresh();
    if (!window.desktopBridge?.isDesktop && previousWebPort !== state.settings.dashboard.webPort) {
      const nextUrl = new URL(window.location.href);
      nextUrl.port = String(state.settings.dashboard.webPort);
      setTimeout(() => window.location.assign(nextUrl), 150);
    }
  } catch (error) {
    byId('settingsError').hidden = false;
    byId('settingsError').textContent = error.message;
  }
}

async function importTheme(file) {
  if (!file) return;
  try {
    const response = await fetch('/api/themes/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: await file.text() }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to import theme.');
    state.themes = result.themes;
    byId('themeInput').innerHTML = state.themes.map((theme) => `<option value="${escapeHtml(theme.id)}">${escapeHtml(theme.name)}${theme.builtIn ? '' : ' · custom'}</option>`).join('');
    byId('themeInput').value = result.theme.id;
    renderThemePreview();
    showToast(`${result.theme.name} imported.`);
  } catch (error) {
    byId('settingsError').hidden = false;
    byId('settingsError').textContent = error.message;
  }
}

async function refresh() {
  byId('connectionState').dataset.state = 'loading';
  byId('connectionTitle').textContent = 'Refreshing';
  try {
    const response = await fetch('/api/refresh', { method: 'POST' });
    state.status = await response.json();
    renderStatus();
  } catch (error) {
    byId('connectionState').dataset.state = 'error';
    byId('connectionTitle').textContent = 'Refresh failed';
    byId('connectionDetail').textContent = error.message;
  }
}

async function readCachedStatus() {
  try {
    const response = await fetch('/api/status');
    if (!response.ok) throw new Error('Unable to read status.');
    state.status = await response.json();
    renderStatus();
  } catch (error) {
    byId('connectionState').dataset.state = 'error';
    byId('connectionTitle').textContent = 'Status unavailable';
    byId('connectionDetail').textContent = error.message;
  }
}

function scheduleRefresh() {
  clearInterval(state.timer);
  state.timer = setInterval(readCachedStatus, Math.max(5, state.settings.dashboard.refreshSeconds) * 1000);
}

function showToast(message) {
  const toast = byId('toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.hidden = true; }, 3000);
}

function updateDesktopState(desktopState) {
  state.desktopState = { ...state.desktopState, ...desktopState };
  byId('pinButton').setAttribute('aria-pressed', String(state.desktopState.alwaysOnTop));
  byId('lockButton').setAttribute('aria-pressed', String(state.desktopState.resizeLocked));
  byId('pinButton').title = state.desktopState.alwaysOnTop ? 'Release always-on-top' : 'Keep window on top';
  byId('lockButton').title = state.desktopState.resizeLocked ? 'Unlock window position and size' : 'Lock window position and size';
}

async function initialize() {
  document.body.classList.toggle('desktop', Boolean(window.desktopBridge?.isDesktop));
  const response = await fetch('/api/bootstrap');
  const bootstrap = await response.json();
  state.settings = bootstrap.settings;
  state.themes = bootstrap.themes;
  state.status = bootstrap.status;
  updateDesktopState({
    alwaysOnTop: state.settings.desktop.alwaysOnTop,
    resizeLocked: state.settings.desktop.resizeLocked
  });
  applyTheme(bootstrap.activeTheme);
  renderStatus();
  scheduleRefresh();

  window.desktopBridge?.onStatusUpdate((status) => { state.status = status; renderStatus(); });
  window.desktopBridge?.onDesktopState(updateDesktopState);
}

byId('settingsButton').addEventListener('click', openSettings);
byId('closeSettingsButton').addEventListener('click', closeSettings);
byId('cancelSettingsButton').addEventListener('click', closeSettings);
byId('settingsScrim').addEventListener('click', closeSettings);
byId('settingsForm').addEventListener('submit', saveSettings);
byId('authTypeInput').addEventListener('change', renderAuthFields);
byId('themeInput').addEventListener('change', renderThemePreview);
byId('workflowOptions').addEventListener('change', updateWorkflowSummary);
byId('workflowAllButton').addEventListener('click', () => {
  byId('workflowOptions').querySelectorAll('input:checked').forEach((input) => { input.checked = false; });
  updateWorkflowSummary();
});
byId('themeFileInput').addEventListener('change', (event) => importTheme(event.target.files[0]));
byId('refreshButton').addEventListener('click', refresh);
byId('pinButton').addEventListener('click', async () => updateDesktopState(await window.desktopBridge.windowAction('toggle-pin')));
byId('lockButton').addEventListener('click', async () => updateDesktopState(await window.desktopBridge.windowAction('toggle-lock')));
byId('minimizeButton').addEventListener('click', () => window.desktopBridge.windowAction('minimize'));
byId('closeButton').addEventListener('click', () => window.desktopBridge.windowAction('close'));
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeSettings(); });

initialize().catch((error) => {
  byId('connectionState').dataset.state = 'error';
  byId('connectionTitle').textContent = 'Application error';
  byId('connectionDetail').textContent = error.message;
});
