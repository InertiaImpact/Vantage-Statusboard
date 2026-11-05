/* global document, window */

const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('C:/Users/bsancken/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { DEFAULT_SETTINGS, deepClone } = require('../src/shared/defaults');
const { BUILT_IN_THEMES } = require('../src/shared/themes');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));

  const settings = deepClone(DEFAULT_SETTINGS);
  settings.vantage.server = 'vantage.example.test';
  settings.dashboard.showStats = false;
  settings.dashboard.statsShowOverall = true;
  settings.dashboard.statsWorkflowIds = ['wf-news', 'wf-import'];
  const stats = {
    startedAt: '2026-09-10T14:00:00Z',
    groups: [
      { id: 'overall', name: 'Overall', counts: { pastHour: 12, today: 48, past24Hours: 73, total: 1240 } },
      { id: 'wf-news', name: 'RDN Export', counts: { pastHour: 8, today: 31, past24Hours: 49, total: 840 } },
      { id: 'wf-import', name: 'Universal Import Flip64', counts: { pastHour: 4, today: 17, past24Hours: 24, total: 400 } }
    ]
  };
  const status = {
    connected: true,
    fetchedAt: new Date().toISOString(),
    jobs: [],
    warnings: [],
    workflowOptions: [
      { id: 'wf-news', name: 'RDN Export' },
      { id: 'wf-import', name: 'Universal Import Flip64' }
    ],
    stats
  };
  const activeTheme = BUILT_IN_THEMES[0];
  await page.addInitScript((bootstrap) => {
    window.desktopBridge = {
      isDesktop: true,
      getInstallationStatus: async () => ({ available: false, installed: false, portable: false, packaged: false, installDirectory: '' }),
      previewUiScale: async () => 100,
      windowAction: async () => ({}),
      onStatusUpdate: () => {},
      onDesktopState: () => {},
      onInstallationState: () => {}
    };
    window.fetch = async () => ({ ok: true, json: async () => bootstrap });
  }, { settings, themes: BUILT_IN_THEMES, activeTheme, status, version: '1.4.8' });

  const source = path.join(__dirname, '..', 'src', 'renderer', 'index.html');
  await page.goto(pathToFileURL(source).href, { waitUntil: 'networkidle' });
  const before = await page.evaluate(() => ({
    connectionLeft: document.querySelector('#connectionState').getBoundingClientRect().left,
    actionsLeft: document.querySelector('.window-actions').getBoundingClientRect().left
  }));
  const preview = await page.evaluate((statsPayload) => {
    window.eval('state.settings.dashboard.showStats = true');
    window.eval(`state.status.stats = ${JSON.stringify(statsPayload)}`);
    window.renderStatus();
    const bar = document.querySelector('.app-bar').getBoundingClientRect();
    const statsElement = document.querySelector('#topbarStats');
    const statsBounds = statsElement.getBoundingClientRect();
    return {
      barHeight: Math.round(bar.height),
      groupCount: statsElement.querySelectorAll('.stats-group').length,
      metricCount: statsElement.querySelectorAll('.stats-metric').length,
      statsInsideBar: statsBounds.top >= bar.top && statsBounds.bottom <= bar.bottom,
      statsOverflow: statsElement.scrollWidth > statsElement.clientWidth,
      pageOverflow: document.body.scrollWidth > window.innerWidth,
      titleSingleLine: document.querySelector('h1').getBoundingClientRect().height < 25,
      version: document.querySelector('#versionTag').textContent,
      connectionLeft: document.querySelector('#connectionState').getBoundingClientRect().left,
      actionsLeft: document.querySelector('.window-actions').getBoundingClientRect().left
    };
  }, stats);

  if (preview.barHeight !== 72
    || preview.groupCount !== 3
    || preview.metricCount !== 12
    || !preview.statsInsideBar
    || preview.statsOverflow
    || preview.pageOverflow
    || !preview.titleSingleLine
    || preview.version !== 'v1.4.8'
    || preview.connectionLeft !== before.connectionLeft
    || preview.actionsLeft !== before.actionsLeft
    || errors.length) {
    throw new Error(`Top-bar statistics visual check failed: ${JSON.stringify({ preview, errors })}`);
  }

  await page.screenshot({ path: 'visual-stats.png', fullPage: true });
  process.stdout.write(JSON.stringify({ preview, errors }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
