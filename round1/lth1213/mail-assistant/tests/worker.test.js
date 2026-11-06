import test from 'node:test';
import assert from 'node:assert/strict';
import {demoData,DEFAULTS} from '../core.js';

async function harness(live = false) {
  const local = {}, session = {}, callbacks = {}, alarms = new Map();
  const storage = data => ({async get(key) {return {[key]:structuredClone(data[key])};},async set(values) {Object.assign(data,structuredClone(values));},async remove(key) {delete data[key];}});
  const event = name => ({addListener(fn) {callbacks[name] = fn;}});
  globalThis.chrome = {
    storage:{local:storage(local),session:storage(session)},
    identity:{getRedirectURL:() => 'https://test.chromiumapp.org/'},
    alarms:{async create(name,options) {alarms.set(name,options);},async clear(name) {alarms.delete(name);},onAlarm:event('alarm')},
    runtime:{id:'test',getURL:path => `chrome-extension://test/${path}`,onMessage:event('message'),onInstalled:event('installed'),onStartup:event('startup'),openOptionsPage:async () => {}},
    action:{onClicked:event('click')}
  };
  let calls = [], fault = null, gate = null;
  const d = demoData();
  const mailbox = new Map(d.messages.map(m => [m.id,{...m}]));
  if (live) {
    local.state = {settings:{...DEFAULTS},mode:'live',account:{id:'account-1'},rules:d.rules,folders:d.folders,history:[],preview:{createdAt:new Date().toISOString(),scanned:6,items:d.messages.filter(m => m.id !== 'demo-3').map(m => ({id:m.id,subject:m.subject,original:'inbox',destination:m.id === 'demo-5' ? 'junk' : 'finance',status:'queued'}))}};
    session.auth = {accessToken:'test-only',clientId:'',tenant:'common',expiresAt:Date.now()+3600000};
  }
  globalThis.fetch = async (url,opts) => {
    const u = new URL(url), parts = u.pathname.split('/'), id = decodeURIComponent(parts[4]), m = mailbox.get(id);
    if (!m) return new Response('{}',{status:404});
    if (opts.method === 'POST') {
      const to = JSON.parse(opts.body).destinationId;
      calls.push({id,to});
      if (gate) await gate();
      m.parentFolderId = to;
      if (fault) {const e = fault; fault = null; throw e;}
    }
    return new Response(JSON.stringify({id:m.id,parentFolderId:m.parentFolderId}),{status:200,headers:{'Content-Type':'application/json'}});
  };
  await import(`../background.js?test=${crypto.randomUUID()}`);
  async function command(type,payload) {
    return new Promise((resolve,reject) => callbacks.message({type,payload},{id:'test',url:'chrome-extension://test/dashboard.html'},r => r.ok ? resolve(r.data) : reject(Error(r.error))));
  }
  return {local,session,alarms,mailbox,calls,command,callbacks,setFault:e => {fault=e;},setGate:fn => {gate=fn;}};
}
async function until(check) {
  for (let i=0;i<300;i++) {if (check()) return; await new Promise(r => setTimeout(r,5));}
  assert.fail('작업이 예상 상태에 도달하지 못함');
}

test('샘플: 미리보기는 무변경, 실행 후 복구, 스팸 규칙 자동 실행',async () => {
  const h = await harness();
  await h.command('demo'); await h.command('preview');
  assert.equal(h.local.state.demoMessages.filter(m => m.parentFolderId === 'inbox').length,6);
  assert.equal(h.local.state.preview.items.length,5);
  await h.command('start'); await until(() => h.local.state.job.status === 'completed');
  assert.equal(h.local.state.demoMessages.filter(m => m.parentFolderId === 'inbox').length,1);
  assert.equal(h.local.state.demoMessages.find(m => m.id === 'demo-5').parentFolderId,'junk');
  await h.command('undo',{id:h.local.state.job.id}); await until(() => h.local.state.job.status === 'restored');
  assert.equal(h.local.state.demoMessages.filter(m => m.parentFolderId === 'inbox').length,6);
  await h.command('saveRules',{rules:h.local.state.rules,enableAuto:true});
  assert.equal(h.local.state.settings.auto,true); assert.equal(h.alarms.get('automatic').periodInMinutes,15);
  h.callbacks.alarm({name:'automatic'}); await until(() => h.local.state.job.status === 'completed');
  assert.equal(h.local.state.history.length,1);
  await h.command('stop'); assert.equal(h.local.state.settings.auto,false); assert.equal(h.alarms.has('automatic'),false);
});
test('API 응답 유실: 이어하기가 이미 이동한 메일을 중복 요청하지 않음',async () => {
  const h = await harness(true); h.setFault(Error('응답 유실'));
  await h.command('start'); await until(() => h.local.state.job.status === 'paused');
  const item = h.local.state.job.items[0]; assert.equal(item.status,'pending');
  assert.equal(h.mailbox.get(item.id).parentFolderId,item.destination);
  await h.command('resume'); await until(() => h.local.state.job.status === 'completed');
  assert.equal(h.calls.filter(c => c.id === item.id).length,1);
  await h.command('undo',{id:h.local.state.job.id}); await until(() => h.local.state.job.status === 'restored');
  assert.equal([...h.mailbox.values()].filter(m => m.parentFolderId === 'inbox').length,6);
});
test('요청 도중 중단: 현재 한 건만 완료하고 나머지는 이어하기',async () => {
  const h = await harness(true);
  let release, entered;
  const ready = new Promise(r => {entered=r;});
  h.setGate(() => {entered(); return new Promise(r => {release=r;});});
  await h.command('start'); await ready;
  const stop = h.command('stop'); release(); await stop;
  await until(() => h.local.state.job.status === 'paused');
  assert.equal(h.calls.length,1);
  assert.equal(h.local.state.job.items.filter(i => i.status === 'done').length,1);
  h.setGate(null); await h.command('resume'); await until(() => h.local.state.job.status === 'completed');
  assert.equal(h.calls.length,5);
});
test('사용자가 다른 폴더로 옮긴 메일은 자동으로 덮어쓰지 않음',async () => {
  const h = await harness(true); h.mailbox.get('demo-0').parentFolderId = 'external-folder';
  await h.command('start'); await until(() => h.local.state.job.status === 'paused');
  assert.equal(h.calls.length,0); assert.match(h.local.state.lastError,/다른 폴더/);
  await assert.rejects(h.command('preview'),/현재 작업/);
});
test('중단 기록 pending을 재기동한 워커가 실제 위치로 복구',async () => {
  const h = await harness(true); await h.command('start'); await until(() => h.local.state.job.status === 'completed');
  const i = h.local.state.job.items[0]; i.status = 'pending'; h.local.state.job.status = 'running';
  const count = h.calls.length;
  await import(`../background.js?restart=${crypto.randomUUID()}`);
  h.callbacks.alarm({name:'watchdog'});
  await until(() => h.local.state.job.status === 'completed');
  assert.equal(h.calls.length,count); assert.equal(h.local.state.job.items[0].status,'done');
});
