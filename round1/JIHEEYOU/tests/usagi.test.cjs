const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');

const extension = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'usagi-v2-test-'));
const executablePath = process.env.USAGI_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const fixed = Date.parse('2026-11-06T01:00:00Z');
const entries = Array.from({ length: 8 }, (_, i) => `<entry><title>${i % 2 ? 'Rust' : 'RAG'} 도구 공개 ${i}</title><link href="https://news.hada.io/topic?id=test-${i}"/><published>${new Date(fixed - i * 60000).toISOString()}</published><content>개발 도구 구현과 검색 모델 지원</content></entry>`);
const feed = `<feed xmlns="http://www.w3.org/2005/Atom">${entries.join('')}${entries[0]}<entry><title>AI 사기 광고 매출</title><link href="https://news.hada.io/topic?id=exclude"/><published>${new Date(fixed).toISOString()}</published><content>LLM 모델 공개</content></entry></feed>`;
let feedRequests = 0, failNetwork = false;

(async () => {
  const context = await chromium.launchPersistentContext(profile, {
    executablePath, headless: true, viewport: { width: 460, height: 600 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  try {
    await context.route('https://feeds.feedburner.com/**', route => {
      feedRequests++;
      return route.fulfill({ status: failNetwork ? 503 : 200, contentType: 'application/xml', body: feed });
    });
    await context.route('https://api.open-meteo.com/**', route => route.fulfill({ status: failNetwork ? 503 : 200, contentType: 'application/json', body: JSON.stringify({ current: { temperature_2m: -2, weather_code: 73 } }) }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('edge://extensions/');
    const id = (await page.evaluate(() => chrome.management.getAll())).find(value => value.installType === 'development').id;
    const url = `chrome-extension://${id}/popup.html`;
    await page.clock.install({ time: fixed });
    await page.goto(url);
    await page.waitForFunction(() => document.querySelectorAll('.news-card').length === 5);
    const legacy = {
      todos: [{ id: 'legacy-1', text: '이전 일반 할 일', completed: true, customField: 'keep' }, { id: 'legacy-2', text: '이전 기사 할 일', completed: false, articleUrl: 'https://news.hada.io/topic?id=legacy' }],
      savedArticles: [{ title: '이전 Rust 도구 공개', url: 'https://news.hada.io/topic?id=old', publishedAt: fixed - 86400000, description: '오픈소스 도구', source: 'GeekNews', customField: 'keep' }],
    };
    await page.evaluate(data => chrome.storage.local.set(data), legacy);
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#stat-todos').textContent === '1/2');
    assert.deepEqual(await page.evaluate(() => chrome.storage.local.get(['todos', 'savedArticles'])), legacy);
    assert.equal(await page.locator('#stat-saved').innerText(), '1');
    assert.equal(await page.locator('#task-progress').getAttribute('max'), '100');
    await page.waitForFunction(() => document.querySelectorAll('.news-card').length === 5);
    assert.equal(await page.locator('#stat-news').innerText(), '5');
    assert((await page.locator('#weather-status').innerText()).includes('-2.0'));
    const tip = await page.locator('#tip-title').innerText();
    const keywordTexts = await page.locator('.keyword').allTextContents();
    assert(keywordTexts.length > 0 && keywordTexts.length <= 3);
    await page.locator('.keyword').first().click();
    assert(await page.locator('.news-card').count() <= 5);
    await page.locator('.keyword[aria-pressed=true]').click();
    assert.equal(await page.locator('.news-card').count(), 5);
    await page.locator('.news-application summary').first().click();
    assert.equal(await page.locator('.news-application').first().locator('ol li').count(), 3);
    await page.locator('.news-add-todo').first().click();
    await page.waitForFunction(() => document.querySelectorAll('.todo-item').length === 3);
    assert.equal(await page.locator('#todo-tab').getAttribute('aria-selected'), 'true');
    const first = (await page.evaluate(() => chrome.storage.local.get('todos'))).todos[0];
    for (const key of ['articleId', 'articleUrl', 'articleTitle', 'idea', 'ideaId', 'createdAt']) assert(first[key]);
    assert(!first.text.includes('실험'));
    await page.locator('.todo-idea summary').first().click();
    assert.equal(await page.locator('.todo-idea').first().locator('li').count(), 3);
    await page.locator('#news-latest').click();
    if (!(await page.locator('.news-application').first().evaluate(node => node.open))) await page.locator('.news-application summary').first().click();
    await page.locator('.news-add-todo').first().click();
    await page.waitForFunction(() => document.querySelector('#todo-tab').getAttribute('aria-selected') === 'true');
    assert.equal((await page.evaluate(() => chrome.storage.local.get('todos'))).todos.length, 3);
    assert.equal(await page.locator('.todo-highlight').count(), 1);
    await page.locator('#todo-input').fill('일반 할 일 추가');
    await page.locator('#todo-form button').click();
    await page.waitForFunction(() => document.querySelectorAll('.todo-item').length === 4);
    await page.locator('.todo-item input').first().check();
    await page.waitForFunction(() => document.querySelector('#stat-todos').textContent === '2/4');
    await page.locator('.delete-button').first().click();
    await page.waitForFunction(() => document.querySelector('#stat-todos').textContent === '1/3');
    await page.locator('#news-latest').click();
    await page.locator('.news-save').first().click();
    await page.waitForFunction(() => document.querySelector('#stat-saved').textContent === '2');
    await page.locator('[data-go=saved]').click();
    assert.equal(await page.locator('.news-card').count(), 2);
    assert(await page.locator('.news-title').filter({ hasText: '이전 Rust' }).count());
    await page.locator('.news-save').first().click();
    await page.waitForFunction(() => document.querySelector('#stat-saved').textContent === '1');
    // Storage errors must not mutate UI state or discard the legacy records.
    const beforeFailure = await page.evaluate(() => chrome.storage.local.get(null));
    await page.evaluate(() => { window.originalSet = chrome.storage.local.set; chrome.storage.local.set = async () => { throw Error('quota'); }; });
    await page.locator('#todo-tab').click(); await page.locator('#todo-input').fill('저장 실패 테스트'); await page.locator('#todo-form button').click();
    await page.waitForFunction(() => document.querySelector('#input-error').textContent.includes('저장하지 못했'));
    assert.deepEqual(await page.evaluate(() => chrome.storage.local.get(null)), beforeFailure);
    await page.evaluate(() => { chrome.storage.local.set = window.originalSet; });
    await page.reload(); await page.waitForFunction(() => document.querySelector('#stat-todos').textContent === '1/3');
    assert.equal(await page.locator('#tip-title').innerText(), tip);
    assert.deepEqual((await page.evaluate(() => chrome.storage.local.get('todos'))).todos.find(todo => todo.id === 'legacy-1'), legacy.todos[0]);
    await page.locator('#news-latest').focus(); await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#todo-tab').getAttribute('aria-selected'), 'true');
    await page.clock.fastForward(86400000);
    await page.waitForFunction(() => document.querySelector('#stat-news').textContent === '0');
    assert.notEqual(await page.locator('#tip-title').innerText(), tip);
    assert.equal(await page.locator('.keyword').count(), 0);
    assert.equal(await page.locator('#stat-saved').innerText(), '1');
    assert(feedRequests >= 2);
    failNetwork = true;
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#news-status').textContent.includes('가져오지 못했'));
    await page.waitForFunction(() => document.querySelector('#weather-status').textContent.includes('가져오지 못했'));
    await page.locator('#todo-tab').click(); assert.equal(await page.locator('.todo-item').count(), 3);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.querySelector('.content-scroll').scrollWidth <= document.querySelector('.content-scroll').clientWidth));
    assert.deepEqual(errors, []);
    const persisted = await page.evaluate(() => chrome.storage.local.get(null));
    await context.close();
    const reopened = await chromium.launchPersistentContext(profile, { executablePath, headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
    try {
      const fresh = await reopened.newPage(); await fresh.goto(url);
      assert.deepEqual(await fresh.evaluate(() => chrome.storage.local.get(null)), persisted);
    } finally { await reopened.close(); }
    console.log('PASS: legacy preservation; CRUD; 5-news limit; ideas and metadata; dedup; stats; keyword filter; daily tip; midnight; scrap retention; storage errors; API failures; keyboard tabs; no overflow; no page errors; browser restart persistence.');
  } finally { if (context.browser()?.isConnected()) await context.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
