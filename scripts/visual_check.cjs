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
  await page.screenshot({ path: 'visual-board.png', fullPage: true });
  const webSettingsHidden = await page.locator('#settingsButton').evaluate((element) => element.ownerDocument.defaultView.getComputedStyle(element).display === 'none');
  await page.evaluate(() => document.body.classList.add('desktop'));
  await page.click('#settingsButton');
  await page.waitForTimeout(300);
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
  process.stdout.write(JSON.stringify({ result, errors }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
