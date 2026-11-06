import {DEFAULTS,validateSettings,validateRules,makePlan,reconcile,demoData} from './core.js';
import {signIn} from './auth.js';
import {graph,listFolders,listMessages,currentMessage,moveMessage} from './graph.js';

const initial = () => ({settings:{...DEFAULTS},mode:'none',account:null,folders:[],rules:[],preview:null,job:null,history:[],lastError:'',autoLast:null});
const read = async () => ({...initial(),...(await chrome.storage.local.get('state')).state});
const write = state => chrome.storage.local.set({state});
let chain = Promise.resolve(), pumping = false;
function serial(fn) { const p = chain.then(fn); chain = p.catch(() => {}); return p; }
const unfinished = s => s.job && ['running','paused'].includes(s.job.status);
const stamp = () => new Date().toISOString();

async function setupAlarms() {
  await chrome.alarms.create('watchdog',{periodInMinutes:1});
  const s = await read();
  if (s.settings.auto) await chrome.alarms.create('automatic',{periodInMinutes:s.settings.interval});
  else await chrome.alarms.clear('automatic');
}
async function inspect(s,id) {
  if (s.mode === 'demo') {
    const m = s.demoMessages.find(m => m.id === id);
    if (!m) throw Error('샘플 메일을 찾지 못했습니다.');
    return m;
  }
  return currentMessage(s.settings,id);
}
async function move(s,id,to) {
  if (s.mode === 'demo') {s.demoMessages.find(m => m.id === id).parentFolderId = to; return;}
  await moveMessage(s.settings,id,to);
}
function archive(s) {
  if (s.job) s.history = [s.job,...s.history].slice(0,20);
  s.job = null;
}
async function preview(s) {
  if (s.mode === 'none') throw Error('샘플 체험 또는 Outlook 계정 연결을 먼저 진행하세요.');
  if (!s.rules.some(r => r.enabled)) throw Error('활성화된 분류 규칙을 먼저 추가하세요.');
  validateRules(s.rules,s.folders);
  const messages = s.mode === 'demo' ? s.demoMessages.filter(m => m.parentFolderId === 'inbox' && Date.parse(m.receivedDateTime) >= Date.now() - s.settings.days * 86400000).slice(0,s.settings.limit) : await listMessages(s.settings);
  s.preview = {createdAt:stamp(),scanned:messages.length,items:makePlan(messages,s.rules,s.folders)};
  s.lastError = '';
}
function start(s,automatic = false) {
  if (!s.preview || Date.now() - Date.parse(s.preview.createdAt) > 15 * 60000) throw Error('미리보기를 다시 조회하세요. 유효 시간은 15분입니다.');
  if (!s.preview.items.length) throw Error('분류할 메일이 없습니다.');
  archive(s);
  s.job = {id:crypto.randomUUID(),createdAt:stamp(),mode:s.mode,accountId:s.account?.id,
    automatic,direction:'forward',status:'running',items:s.preview.items};
  s.preview = null;
  s.lastError = '';
}

// One durable step at a time; all commands share this lock. A stop runs after
// the current request, so a completed POST always receives a journal entry.
async function step() {
  const s = await read(), job = s.job;
  if (!job || job.status !== 'running') return false;
  const undo = job.direction === 'undo';
  const item = job.items.find(i => i.status === 'pending') || job.items.find(i => i.status === (undo ? 'done' : 'queued'));
  if (!item) {job.status = undo ? 'restored' : 'completed'; job.finishedAt = stamp(); await write(s); return false;}
  try {
    if (job.mode !== s.mode || job.accountId !== s.account?.id) throw Error('작업 계정이 다릅니다. 원래 계정으로 다시 연결하세요.');
    const m = await inspect(s,item.id);
    const result = reconcile(item,m.parentFolderId,undo);
    if (result === 'conflict') throw Error('메일이 다른 폴더로 변경되었습니다. Outlook에서 위치를 확인하세요.');
    if (result === (undo ? 'restored' : 'done')) {
      item.status = result; item.error = ''; await write(s); return true;
    }
    item.status = 'pending'; item.error = ''; await write(s);
    await move(s,item.id,undo ? item.original : item.destination);
    item.status = undo ? 'restored' : 'done'; item.error = ''; await write(s);
    return true;
  } catch (error) {
    // Keep pending on an uncertain network result. Resume verifies its folder.
    item.error = error.message;
    job.status = 'paused'; s.lastError = error.message;
    await write(s); return false;
  }
}
async function pump() {
  if (pumping) return;
  pumping = true;
  try { while (await serial(step)) { /* persisted at every mail */ } }
  catch (e) { console.error('처리 기록 저장 실패:',e.message); }
  finally {pumping = false;}
}

async function command(type,payload = {}) {
  const s = await read();
  switch(type) {
    case 'state': return {...s,redirect:chrome.identity.getRedirectURL(),connected:!!(await chrome.storage.session.get('auth')).auth};
    case 'demo': {
      if (s.mode === 'live') throw Error('실제 계정 기록을 보호하기 위해 샘플 모드 전환을 제한합니다. 초기화 후 체험하세요.');
      if (unfinished(s)) throw Error('진행 중인 작업을 완료하거나 되돌린 후 다시 체험하세요.');
      const d = demoData(); Object.assign(s,initial(),{mode:'demo',folders:d.folders,rules:d.rules,demoMessages:d.messages});
      break;
    }
    case 'saveSettings': {
      if (unfinished(s)) throw Error('작업을 완료하거나 되돌린 후 설정을 변경하세요.');
      const settings = validateSettings(payload);
      const authChanged = settings.clientId !== s.settings.clientId || settings.tenant !== s.settings.tenant;
      if (authChanged && s.mode === 'live' && (s.job || s.history.length)) throw Error('복구 기록이 남아 있습니다. 앱 ID를 바꾸려면 기록을 먼저 초기화하세요.');
      if (settings.auto && s.mode === 'none') throw Error('계정을 연결하거나 샘플 모드를 시작하세요.');
      if (settings.auto && !s.rules.some(r => r.enabled)) throw Error('자동 실행 전에 규칙을 추가하세요.');
      if (authChanged) await chrome.storage.session.remove('auth');
      s.settings = settings; s.preview = null;
      break;
    }
    case 'connect': {
      if (s.job?.status === 'running') throw Error('작업을 중단한 후 연결하세요.');
      await signIn(s.settings);
      const me = await graph(s.settings,'/me?$select=id,displayName,mail,userPrincipalName');
      if (s.mode === 'live' && s.account && s.account.id !== me.id) {
        await chrome.storage.session.remove('auth');
        throw Error('기존 기록의 계정과 다릅니다. 원래 계정으로 연결하거나 기록을 초기화하세요.');
      }
      if (s.mode === 'demo') {const settings = s.settings; Object.assign(s,initial(),{settings:{...settings,auto:false}});}
      s.account = {id:me.id,name:me.displayName,email:me.mail || me.userPrincipalName}; s.mode = 'live';
      s.folders = await listFolders(s.settings); s.preview = null; s.lastError = '';
      break;
    }
    case 'disconnect':
      if (s.job?.status === 'running') throw Error('먼저 작업을 중단하세요.');
      await chrome.storage.session.remove('auth'); s.settings.auto = false; s.preview = null; break;
    case 'folders':
      if (unfinished(s)) throw Error('작업을 완료하거나 되돌린 후 폴더를 새로고침하세요.');
      if (s.mode === 'live') s.folders = await listFolders(s.settings);
      s.preview = null; break;
    case 'saveRules':
      if (unfinished(s)) throw Error('작업을 완료하거나 되돌린 후 규칙을 변경하세요.');
      s.rules = validateRules(payload.rules,s.folders); s.preview = null;
      if (payload.enableAuto) s.settings.auto = true;
      if (!s.rules.some(r => r.enabled)) s.settings.auto = false;
      break;
    case 'preview':
      if (unfinished(s)) throw Error('현재 작업을 완료하거나 되돌린 후 미리보기를 조회하세요.');
      await preview(s); break;
    case 'clearPreview': s.preview = null; break;
    case 'start':
      if (unfinished(s)) throw Error('현재 작업을 먼저 마무리하세요.');
      start(s); break;
    case 'stop':
      s.settings.auto = false;
      if (s.job?.status === 'running') s.job.status = 'paused';
      break;
    case 'resume':
      if (s.job?.status !== 'paused') throw Error('이어할 작업이 없습니다.');
      s.job.status = 'running'; s.lastError = ''; break;
    case 'undo': {
      if (s.job?.status === 'running') throw Error('먼저 실행 중인 작업을 중단하세요.');
      if (payload.id !== s.job?.id) {
        if (unfinished(s)) throw Error('현재 작업을 마무리한 후 이전 기록을 복구하세요.');
        const target = s.history.find(j => j.id === payload.id);
        if (!target) throw Error('복구할 기록이 없습니다.');
        s.history = s.history.filter(j => j.id !== payload.id); archive(s); s.job = target;
      }
      if (!s.job) throw Error('복구할 기록이 없습니다.');
      if (s.job.direction === 'undo') throw Error('이미 되돌리기 중입니다. 이어하기를 누르세요.');
      // Resolve uncertain moves before switching direction, including a timed-out POST.
      for (const i of s.job.items.filter(i => i.status === 'pending')) {
        const m = await inspect(s,i.id);
        const result = reconcile(i,m.parentFolderId);
        if (result === 'conflict') throw Error('처리 결과가 불확실한 메일의 위치를 먼저 확인하세요.');
        i.status = result;
      }
      s.job.direction = 'undo'; s.job.status = 'running'; s.settings.auto = false; s.preview = null; s.lastError = '';
      break;
    }
    case 'reset':
      if (s.job?.status === 'running') throw Error('먼저 작업을 중단하세요.');
      await chrome.storage.session.remove('auth'); await write(initial()); await setupAlarms(); return;
    default: throw Error('지원하지 않는 명령입니다.');
  }
  await write(s);
  await setupAlarms();
}

chrome.runtime.onMessage.addListener((message,sender,respond) => {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL('dashboard.html'))) return;
  serial(() => command(message.type,message.payload)).then(data => {respond({ok:true,data}); void pump();},error => respond({ok:false,error:error.message}));
  return true;
});
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
chrome.runtime.onInstalled.addListener(() => void serial(setupAlarms));
chrome.runtime.onStartup.addListener(() => void serial(setupAlarms).then(pump));
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'watchdog') {void pump(); return;}
  if (alarm.name !== 'automatic') return;
  void serial(async () => {
    const s = await read();
    if (!s.settings.auto || unfinished(s) || s.preview) return;
    try {
      await preview(s); s.autoLast = stamp();
      if (s.preview.items.length) start(s,true);
      else s.preview = null;
    } catch (e) {s.settings.auto = false; s.lastError = e.message;}
    await write(s); await setupAlarms();
  }).then(pump).catch(e => console.error(e.message));
});
