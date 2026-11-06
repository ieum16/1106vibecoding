// Run with: node tests/ui-smoke.mjs <absolute path to playwright/index.mjs>
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {mkdir} from 'node:fs/promises';
import {readFile} from 'node:fs/promises';
import http from 'node:http';
const {chromium} = await import(process.argv[2]);
const root = path.resolve(fileURLToPath(new URL('..',import.meta.url)));
// Uses installed Chrome headlessly and a Chrome API shim, without a real account.
// Background, UI, and rule code are the same modules shipped in the extension.
const server = http.createServer(async (req,res) => {
  try {
    const relative = new URL(req.url,'http://localhost').pathname.slice(1);
    const target = path.resolve(root,relative);
    if (!target.startsWith(root + path.sep)) {res.writeHead(403).end(); return;}
    let data = await readFile(target);
    if (relative === 'dashboard.html') data = Buffer.from(data.toString().replace('<script type="module" src="dashboard.js"></script>','<script type="module">import "./background.js"; await import("./dashboard.js");</script>'));
    res.setHeader('Content-Type',relative.endsWith('.js') ? 'text/javascript' : relative.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(data);
  } catch {res.writeHead(404).end();}
});
await new Promise(r => server.listen(0,'127.0.0.1',r));
let context;
try {
  const browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  context = await browser.newContext({viewport:{width:1440,height:1100}});
  await context.addInitScript(() => {
    const listeners = [], callbacks = {}, event = name => ({addListener(fn) {callbacks[name] = fn;}});
    const storage = area => {
      const data = {};
      return {async get(key) {return {[key]:structuredClone(data[key])};},async set(values) {Object.assign(data,structuredClone(values)); listeners.forEach(fn => fn(Object.fromEntries(Object.entries(values).map(([k,v]) => [k,{newValue:v}])),area));},async remove(key) {delete data[key];}};
    };
    globalThis.chrome = {
      storage:{local:storage('local'),session:storage('session'),onChanged:{addListener:fn => listeners.push(fn)}},
      identity:{getRedirectURL:() => 'https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.chromiumapp.org/'},
      alarms:{create:async () => {},clear:async () => {},onAlarm:event('alarm')},
      action:{onClicked:event('click')},
      runtime:{id:'test',getURL:p => `${location.origin}/${p}`,onInstalled:event('install'),onStartup:event('startup'),onMessage:event('message'),sendMessage:message => new Promise(resolve => callbacks.message(message,{id:'test',url:`${location.origin}/dashboard.html`},resolve))}
    };
  });
  const page = await context.newPage(), errors = [];
  page.on('pageerror',e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/dashboard.html`);
  await page.locator('#redirectUri').filter({hasText:'chromiumapp.org'}).waitFor();
  await page.locator('#demo').click();
  await page.locator('#ruleList .rule').nth(3).waitFor();
  await page.locator('#preview').click();
  await page.waitForFunction(() => document.querySelectorAll('#previewRows tr').length === 5);
  await page.locator('#start').click();
  await page.waitForFunction(() => document.getElementById('jobStatus').textContent === '분류 완료');
  assert.equal(await page.locator('#doneCount').textContent(),'5');
  page.on('dialog',dialog => dialog.accept());
  await page.locator('#undo').click();
  await page.waitForFunction(() => document.getElementById('jobStatus').textContent === '되돌리기 · 복구 완료');
  await page.locator('#ruleName').fill('추가 스팸 차단');
  await page.locator('#ruleKind').selectOption('spam');
  await page.locator('#ruleKeywords').fill('불법 광고, 무료 이벤트');
  await page.locator('#saveRule').click();
  await page.waitForFunction(() => document.getElementById('autoStatus').textContent === '15분마다');
  assert.equal(await page.locator('#ruleList .rule').count(),5);
  await page.locator('#stop').click();
  await page.waitForFunction(() => document.getElementById('autoStatus').textContent === '꺼짐');
  await page.locator('#preview').click();
  await page.waitForFunction(() => document.querySelectorAll('#previewRows tr').length === 5);
  await mkdir(path.join(root,'screenshots'),{recursive:true});
  await page.evaluate(() => window.scrollTo(0,0));
  await page.screenshot({path:path.join(root,'screenshots','dashboard-preview.png')});
  await page.screenshot({path:path.join(root,'screenshots','dashboard-desktop.png'),fullPage:true});
  await page.setViewportSize({width:414,height:896});
  await page.screenshot({path:path.join(root,'screenshots','dashboard-mobile.png'),fullPage:true});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true,'모바일 수평 넘침');
  assert.deepEqual(errors,[]);
  console.log('PASS: Chrome 화면 테스트 (API 모형): 샘플 미리보기, 실행, 복구, 스팸 저장 후 자동 실행, 중단, 모바일 화면');
  await browser.close();
} finally {if (context) await context.browser()?.close(); server.close();}
