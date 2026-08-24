/* global document, window */

const { chromium } = require('C:/Users/bsancken/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:8765', { waitUntil: 'networkidle' });
  const rowHeights = await page.locator('.job-row').evaluateAll((rows) => rows.map((row) => Math.round(row.getBoundingClientRect().height)));
  const queueWaitPreview = await page.evaluate(() => {
    const preview = document.createElement('div');
    preview.style.position = 'fixed';
    preview.style.left = '-10000px';
    preview.innerHTML = window.renderJob({
      id: 'visual-check',
      name: 'Queued visual check.mov',
      workflowName: 'Visual check',
      state: 'Complete',
      progress: 100,
      started: new Date().toISOString(),
      updated: new Date().toISOString(),
      runTimeSeconds: 90,
      queueTimeSeconds: 125
    });
    document.body.appendChild(preview);
    const note = preview.querySelector('.timing-note');
    const row = preview.querySelector('.job-row');
    const progressFill = preview.querySelector('.progress-fill');
    const result = note ? {
      text: note.textContent,
      opacity: window.getComputedStyle(note).opacity,
      railWidth: window.getComputedStyle(row, '::before').width,
      railColor: window.getComputedStyle(row, '::before').backgroundColor,
      progressColor: window.getComputedStyle(progressFill).backgroundColor
    } : null;
    preview.remove();
    return result;
  });
  if (!queueWaitPreview || queueWaitPreview.text !== 'Queue wait 2:05') {
    throw new Error('Conditional queue-wait detail did not render correctly.');
  }
  if (queueWaitPreview.railWidth !== '4px' || queueWaitPreview.railColor !== queueWaitPreview.progressColor) {
    throw new Error('Completed status rail and progress color did not render correctly.');
  }
  const statusColorPreview = await page.evaluate(() => {
    const preview = document.createElement('div');
    preview.style.position = 'fixed';
    preview.style.left = '-10000px';
    preview.innerHTML = [
      { state: 'Active', progress: 40 },
      { state: 'Waiting', progress: 20 },
      { state: 'Failed', progress: 0 },
      { state: 'Complete', progress: 100 }
    ].map((job, index) => window.renderJob({
      id: `color-${index}`,
      name: `Color ${index}.mov`,
      workflowName: 'Visual check',
      started: new Date().toISOString(),
      updated: new Date().toISOString(),
      runTimeSeconds: 10,
      queueTimeSeconds: 0,
      ...job
    })).join('');
    document.body.appendChild(preview);
    const result = [...preview.querySelectorAll('.job-row')].map((row) => ({
      state: row.querySelector('.status-chip').textContent,
      railColor: window.getComputedStyle(row, '::before').backgroundColor,
      progressColor: window.getComputedStyle(row.querySelector('.progress-fill')).backgroundColor,
      progressPattern: window.getComputedStyle(row.querySelector('.progress-fill')).backgroundImage,
      trackPattern: window.getComputedStyle(row.querySelector('.progress-track')).backgroundImage
    }));
    preview.remove();
    return result;
  });
  if (statusColorPreview.some((entry) => entry.railColor !== entry.progressColor)) {
    throw new Error('One or more progress bars do not match their status color.');
  }
  const failedPreview = statusColorPreview.find((entry) => entry.state === 'Failed');
  if (!failedPreview?.trackPattern.includes('repeating-linear-gradient') || !failedPreview.progressPattern.includes('repeating-linear-gradient')) {
    throw new Error('Failed jobs did not render the red hatched progress treatment.');
  }
  const failedExpiryPreview = await page.evaluate(() => {
    const now = Date.now();
    return {
      freshFailureVisible: !window.issueExpired({ state: 'Failed', updated: new Date(now - (59 * 60 * 1000)).toISOString() }, 60, now),
      oldFailureExpired: window.issueExpired({ state: 'Failed', updated: new Date(now - (61 * 60 * 1000)).toISOString() }, 60, now),
      oldActiveVisible: !window.issueExpired({ state: 'Active', updated: new Date(now - (61 * 60 * 1000)).toISOString() }, 60, now)
    };
  });
  if (!Object.values(failedExpiryPreview).every(Boolean)) {
    throw new Error('Failed-job expiry did not preserve fresh or active jobs correctly.');
  }
  await page.screenshot({ path: 'visual-board.png', fullPage: true });
  const webSettingsHidden = await page.locator('#settingsButton').evaluate((element) => element.ownerDocument.defaultView.getComputedStyle(element).display === 'none');
  await page.evaluate(() => document.body.classList.add('desktop'));
  await page.click('#settingsButton');
  await page.waitForTimeout(300);
  const installationPreview = await page.evaluate(() => {
    window.renderInstallationStatus({
      available: true,
      installed: false,
      portable: true,
      packaged: true,
      started: false,
      error: null,
      installDirectory: 'C:\\Users\\Newsroom\\AppData\\Local\\Programs\\vantage-statusboard'
    });
    const portable = {
      title: document.querySelector('#installationTitle').textContent,
      detail: document.querySelector('#installationDetail').textContent,
      buttonText: document.querySelector('#installButton').textContent,
      buttonDisabled: document.querySelector('#installButton').disabled
    };
    window.renderInstallationStatus({ available: false, installed: true, portable: false, packaged: true });
    const installed = {
      title: document.querySelector('#installationTitle').textContent,
      buttonText: document.querySelector('#installButton').textContent,
      buttonDisabled: document.querySelector('#installButton').disabled
    };
    return { portable, installed };
  });
  if (installationPreview.portable.buttonDisabled
    || installationPreview.portable.buttonText !== 'Install'
    || !installationPreview.installed.buttonDisabled
    || installationPreview.installed.buttonText !== 'Installed') {
    throw new Error('Portable and installed application states did not render correctly.');
  }
  const initialScale = await page.locator('#scaleValue').evaluate((element) => Number(element.dataset.percent));
  const previewDirection = initialScale < 130 ? 1 : -1;
  await page.click(previewDirection > 0 ? '#scaleUpButton' : '#scaleDownButton');
  await page.waitForTimeout(100);
  const uiScalePreview = await page.evaluate(() => ({
    percent: Number(document.querySelector('#scaleValue').dataset.percent),
    label: document.querySelector('#scaleValue').value,
    zoom: document.documentElement.style.zoom,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
  }));
  if (uiScalePreview.percent !== initialScale + (previewDirection * 5) || uiScalePreview.horizontalOverflow) {
    throw new Error('Interface scale preview did not apply cleanly.');
  }
  await page.click(previewDirection > 0 ? '#scaleDownButton' : '#scaleUpButton');
  await page.waitForTimeout(100);
  await page.click('#workflowPicker > summary');
  await page.screenshot({ path: 'visual-workflows.png', fullPage: true });
  await page.locator('#workflowOptions input').evaluateAll((inputs) => {
    inputs.forEach((input) => { input.checked = false; });
    inputs[0]?.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.locator('#workflowOptions input').nth(0).check();
  await page.locator('#workflowOptions input').nth(1).check();
  const multiSelectSummary = await page.locator('#workflowSummary').textContent();
  const footerBeforeScroll = await page.locator('.drawer-actions').boundingBox();
  await page.locator('.settings-scroll').evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await page.waitForTimeout(100);
  const footerAfterScroll = await page.locator('.drawer-actions').boundingBox();
  await page.screenshot({ path: 'visual-settings.png', fullPage: true });
  const result = await page.evaluate(() => ({
    title: document.title,
    jobs: document.querySelectorAll('.job-row').length,
    drawerOpen: document.querySelector('#settingsDrawer').classList.contains('open'),
    horizontalOverflow: document.body.scrollWidth > window.innerWidth,
    viewport: [window.innerWidth, window.innerHeight],
    drawerBounds: (() => {
      const bounds = document.querySelector('#settingsDrawer').getBoundingClientRect();
      return { left: bounds.left, right: bounds.right, width: bounds.width };
    })(),
    settingsScrolls: document.querySelector('.settings-scroll').scrollHeight > document.querySelector('.settings-scroll').clientHeight,
    workflowOptionCount: document.querySelectorAll('#workflowOptions input[type="checkbox"]').length
  }));
  result.footerPinned = Boolean(footerBeforeScroll && footerAfterScroll
    && Math.abs(footerBeforeScroll.y - footerAfterScroll.y) < 1
    && Math.abs((footerAfterScroll.y + footerAfterScroll.height) - 900) < 1);
  result.multiSelectSummary = multiSelectSummary;
  result.webSettingsHidden = webSettingsHidden;
  result.installationPreview = installationPreview;
  result.rowHeights = rowHeights;
  result.queueWaitPreview = queueWaitPreview;
  result.statusColorPreview = statusColorPreview;
  result.failedExpiryPreview = failedExpiryPreview;
  result.uiScalePreview = uiScalePreview;

  const prefixPage = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const prefixRequests = [];
  const prefixErrors = [];
  prefixPage.on('console', (message) => { if (message.type() === 'error') prefixErrors.push(message.text()); });
  prefixPage.on('pageerror', (error) => prefixErrors.push(error.message));
  await prefixPage.route('http://127.0.0.1:8765/vantage/**', async (route) => {
    const requestedUrl = new URL(route.request().url());
    prefixRequests.push(requestedUrl.pathname);
    requestedUrl.pathname = requestedUrl.pathname.replace(/^\/vantage(?=\/|$)/, '') || '/';
    const upstreamResponse = await route.fetch({ url: requestedUrl.toString() });
    await route.fulfill({ response: upstreamResponse });
  });
  await prefixPage.goto('http://127.0.0.1:8765/vantage/', { waitUntil: 'networkidle' });
  const prefixHosting = await prefixPage.evaluate(() => ({
    pagePath: window.location.pathname,
    statusApiPath: window.apiUrl('status').pathname,
    connected: document.querySelector('#connectionState').dataset.state === 'connected'
  }));
  prefixHosting.requests = prefixRequests;
  prefixHosting.errors = prefixErrors;
  if (prefixHosting.pagePath !== '/vantage/'
    || prefixHosting.statusApiPath !== '/vantage/api/status'
    || !prefixRequests.includes('/vantage/api/bootstrap')
    || prefixErrors.length) {
    throw new Error('Subpath hosting did not keep assets and API requests below /vantage/.');
  }
  result.prefixHosting = prefixHosting;
  await prefixPage.close();
  process.stdout.write(JSON.stringify({ result, errors }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
