const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
(async () => {
  const ext = path.resolve(__dirname, '..');
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'usagi-live-')), {
    executablePath: process.env.USAGI_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true,
    viewport: { width: 460, height: 600 }, args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
  try {
    const p = await ctx.newPage(), errors = [];
    p.on('pageerror', error => errors.push(error.message));
    p.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await p.goto('edge://extensions/');
    const info = (await p.evaluate(() => chrome.management.getAll())).find(value => value.installType === 'development');
    assert.deepEqual(info.hostPermissions.sort(), ['https://api.open-meteo.com/*', 'https://feeds.feedburner.com/*'].sort());
    await p.goto(`chrome-extension://${info.id}/popup.html`);
    await p.waitForFunction(() => document.querySelectorAll('.news-card').length > 0, null, { timeout: 15000 });
    await p.waitForFunction(() => document.querySelector('#weather-status').textContent.includes('C'));
    await p.evaluate(() => chrome.storage.local.set({ todos: [
      { id: 'preview-1', text: '오늘의 기술 브리핑 읽기', completed: true },
      { id: 'preview-2', text: '관심 기술의 적용 가능성 메모하기', completed: false },
    ] }));
    await p.locator('.news-save').first().click();
    await p.waitForFunction(() => document.querySelector('#stat-saved').textContent === '1');
    await p.locator('.brand img').evaluate(image => image.decode());
    await p.evaluate(() => UsagiUI.notify(''));
    await p.evaluate(() => { document.querySelector('.app').scrollTop = 0; });
    await p.screenshot({ path: path.join(ext, 'screenshot.png'), animations: 'disabled' });
    await p.locator('.news-application summary').first().click();
    await p.locator('.news-application').first().scrollIntoViewIfNeeded();
    await p.screenshot({ path: path.join(ext, 'screenshot-2.png'), animations: 'disabled' });
    await p.locator('.news-add-todo').first().click();
    await p.waitForFunction(() => document.querySelector('#stat-todos').textContent === '1/3');
    await p.screenshot({ path: path.join(ext, 'screenshot-3.png'), animations: 'disabled' });
    assert.deepEqual(errors, []);
    console.log('LIVE PASS: ' + await p.locator('#stat-news').innerText() + ' articles; ' + await p.locator('#weather-status').innerText() + '; permissions unchanged; no page errors; 3 screenshots.');
  } finally { await ctx.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
