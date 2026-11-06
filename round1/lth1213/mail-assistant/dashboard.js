const $ = id => document.getElementById(id);
let state, busy = false, folderSignature = '';
const statusNames = {queued:'대기',pending:'결과 확인 중',done:'이동 완료',restored:'복구 완료',running:'처리 중',paused:'중단됨',completed:'분류 완료'};
const fieldNames = {all:'전체',subject:'제목',sender:'보낸 사람',body:'본문'};
const formatDate = value => new Date(value).toLocaleString('ko-KR');
const active = () => state?.job && ['running','paused'].includes(state.job.status);
function el(tag,text,cls) {const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (cls) node.className = cls; return node;}
function notice(message,error = false) {const n = $('notice'); n.hidden = !message; n.textContent = message; n.className = `notice${error ? ' error' : ''}`;}
async function send(type,payload) {
  const response = await chrome.runtime.sendMessage({type,payload});
  if (!response?.ok) throw Error(response?.error || '확장 프로그램에 연결할 수 없습니다. 확장 프로그램을 새로고침하세요.');
  return response.data;
}
async function refresh(hydrate = false) {
  state = await send('state');
  if (hydrate) {
    for (const key of ['clientId','tenant','days','limit','interval']) $(key).value = state.settings[key];
  }
  render();
}
async function action(fn,message = '',hydrate = false) {
  if (busy) return;
  busy = true; notice('처리 중입니다…'); buttons();
  try {await fn(); await refresh(hydrate); notice(message);}
  catch (e) {notice(e.message,true);}
  finally {busy = false; buttons();}
}
function buttons() {
  if (!state) return;
  document.querySelectorAll('button').forEach(b => {b.disabled = busy;});
  const blocked = !!active(), running = state.job?.status === 'running';
  const connected = state.mode === 'demo' || (state.mode === 'live' && state.connected);
  $('preview').disabled = busy || blocked || !connected;
  $('start').disabled = busy || blocked || !connected || !state.preview?.items.length;
  $('stop').disabled = busy || (!running && !state.settings.auto);
  $('resume').disabled = busy || state.job?.status !== 'paused' || !connected;
  $('undo').disabled = busy || running || !connected || !state.job || state.job.direction === 'undo';
  $('connect').disabled = busy || running;
  $('demo').disabled = busy || blocked;
  $('disconnect').disabled = busy || running;
  $('folders').disabled = busy || blocked || !connected;
  $('reset').disabled = busy || running;
  document.querySelectorAll('#ruleForm button[type=submit], #autoForm button[type=submit], #connectionForm button[type=submit]').forEach(b => b.disabled = busy || blocked);
  document.querySelectorAll('[data-rule-action]').forEach(b => b.disabled = busy || blocked);
  document.querySelectorAll('[data-rule-toggle]').forEach(b => b.disabled = busy || blocked);
  document.querySelectorAll('[data-history-id]').forEach(b => b.disabled = busy || blocked || !connected || b.dataset.restored === 'true');
}
function render() {
  $('modeBadge').textContent = state.mode === 'demo' ? '샘플 체험 중' : state.connected ? 'Outlook 연결됨' : '연결 전';
  $('accountName').textContent = state.mode === 'demo' ? '샘플 메일로 안전하게 체험 중' : state.account?.name || 'Outlook을 연결해 주세요';
  $('accountDetail').textContent = state.mode === 'demo' ? '실제 메일은 변경하지 않습니다. Outlook 연결 시 샘플 기록은 초기화됩니다.' : state.account ? `${state.account.email} · ${state.connected ? '본인 사서함에 연결되었습니다.' : '다시 연결하면 기존 작업을 이어갈 수 있습니다.'}` : '아래 연결 설정을 저장하거나 샘플 메일로 먼저 체험해 보세요.';
  $('connect').textContent = state.connected ? '계정 다시 연결' : 'Outlook 연결';
  $('demo').hidden = state.mode === 'live';
  $('disconnect').hidden = state.mode !== 'live' || !state.connected;
  $('redirectUri').textContent = state.redirect;
  $('ruleCount').textContent = state.rules.filter(r => r.enabled).length;
  $('previewCount').textContent = state.preview ? state.preview.items.length : '—';
  $('doneCount').textContent = state.job?.items.filter(i => i.status === 'done').length || 0;
  $('autoStatus').textContent = state.settings.auto ? `${state.settings.interval}분마다` : '꺼짐';
  $('autoDetail').textContent = state.autoLast ? `최근 확인 ${formatDate(state.autoLast)}` : state.settings.auto ? '다음 주기에 받은편지함을 확인해요' : '수동으로 시작할 수 있어요';
  $('autoEnabled').checked = state.settings.auto;
  $('persistentError').hidden = !state.lastError;
  $('persistentError').textContent = state.lastError;
  const signature = JSON.stringify(state.folders);
  if (signature !== folderSignature) {
    folderSignature = signature;
    const select = $('ruleDestination'), previous = select.value;
    const folders = state.folders.filter(f => !f.isInbox);
    select.replaceChildren(...(folders.length ? folders.map(f => {const o = el('option',f.name); o.value = f.id; return o;}) : [el('option','먼저 계정을 연결하세요')]));
    if (folders.some(f => f.id === previous)) select.value = previous;
  }
  renderRules(); renderPreview(); renderJob(); buttons();
}
function renderRules() {
  if (!state.rules.length) {$('ruleList').replaceChildren(el('p','아직 등록된 규칙이 없습니다. 아래에서 첫 규칙을 추가하세요.','hint')); return;}
  $('ruleList').replaceChildren(...state.rules.map((r,index) => {
    const card = el('div',undefined,`rule${r.enabled ? '' : ' disabled'}`), top = el('div',undefined,'rule-top');
    const check = el('input'); check.type = 'checkbox'; check.checked = r.enabled; check.dataset.ruleToggle = r.id; check.setAttribute('aria-label',`${r.name} 활성화`);
    top.append(el('span',String(index + 1).padStart(2,'0'),'rule-order'),check,el('strong',r.name));
    if (r.kind === 'spam') top.append(el('span','스팸','spam-badge'));
    const meta = el('div',`${fieldNames[r.field]} · ${r.match === 'every' ? '모두 포함' : '하나라도 포함'} → ${state.folders.find(f => f.id === r.destination)?.name || '폴더 없음'}`,'rule-meta');
    const keywords = el('div'); r.keywords.forEach(k => keywords.append(el('span',k,'keyword')));
    const controls = el('div',undefined,'rule-actions');
    for (const [name,label] of [['up','↑'],['down','↓'],['edit','수정'],['delete','삭제']]) {
      const b = el('button',label,'text-button'); b.dataset.ruleAction = name; b.dataset.id = r.id; b.setAttribute('aria-label',`${r.name} ${label}`); controls.append(b);
    }
    card.append(top,meta,keywords,controls); return card;
  }));
}
function renderPreview() {
  const p = state.preview;
  $('previewSummary').textContent = p ? `${p.scanned}개 확인 · ${p.items.length}개 분류 예정` : '아직 조회하지 않았어요';
  $('clearPreview').hidden = !p;
  $('previewTime').textContent = p ? `${formatDate(p.createdAt)} 조회 · 15분간 유효` : '미리보기 유효 시간 · 15분';
  $('previewEmpty').hidden = !!p?.items.length;
  $('previewEmpty').replaceChildren(el('span',p ? '✓' : '↗','empty-icon'),el('strong',p ? '현재 규칙에 해당하는 메일이 없습니다' : '메일이 정리될 경로를 먼저 확인하세요'),el('p',p ? '조회 범위나 키워드를 변경한 후 다시 확인해 보세요.' : '규칙을 추가한 후 미리보기를 조회해 주세요.'));
  $('previewRows').replaceChildren(...(p?.items || []).map(i => {
    const tr = el('tr'), td = el('td',i.subject); td.append(el('small',i.sender)); tr.append(td,el('td',i.ruleName),el('td',`→ ${i.folderName}`)); return tr;
  }));
}
function renderJob() {
  const job = state.job;
  $('jobStatus').textContent = job ? `${job.direction === 'undo' ? '되돌리기 · ' : ''}${statusNames[job.status]}` : '대기';
  const finished = job?.items.filter(i => job.direction === 'undo' ? ['restored','queued'].includes(i.status) : i.status === 'done').length || 0;
  $('progress').max = job?.items.length || 1; $('progress').value = finished;
  $('jobSummary').textContent = job ? `${job.automatic ? '자동' : '수동'} 작업 · ${formatDate(job.createdAt)} · ${finished} / ${job.items.length}건 처리${job.direction === 'undo' ? ' (미이동 메일 제외)' : ''}` : '실행한 작업의 진행 상황을 이곳에서 확인할 수 있습니다.';
  $('activityList').replaceChildren(...(job?.items || []).map(i => {
    const row = el('div',undefined,'activity-item'), text = el('div',i.subject);
    text.append(el('small',`${i.ruleName} → ${i.folderName}`));
    if (i.error) text.append(el('small',i.error,'item-error'));
    row.append(el('span',statusNames[i.status] || i.status),text); return row;
  }));
  $('historyList').replaceChildren(...state.history.map(j => {
    const row = el('div',undefined,'history-row'), text = el('span',`${formatDate(j.createdAt)} · ${statusNames[j.status]} · ${j.items.length}건`), button = el('button','되돌리기','text-button');
    button.dataset.historyId = j.id; button.dataset.restored = String(j.direction === 'undo'); row.append(text,button); return row;
  }));
  if (!state.history.length) $('historyList').append(el('p','이전 작업이 없습니다.','hint'));
}
function resetEditor() {$('ruleForm').reset(); $('editId').value = ''; $('saveRule').textContent = '규칙 저장'; kindChanged();}
function kindChanged() {const spam = $('ruleKind').value === 'spam'; $('destinationLabel').hidden = spam; $('ruleDestination').required = !spam; $('spamHint').hidden = !spam;}
$('ruleKind').addEventListener('change',kindChanged);
$('cancelEdit').addEventListener('click',resetEditor);

document.querySelectorAll('[data-command]').forEach(button => button.addEventListener('click',() => {
  const type = button.dataset.command;
  void action(() => send(type),{demo:'샘플 메일 6개와 규칙을 준비했습니다. 미리보기를 조회해 보세요.',connect:'Outlook에 연결했습니다. 규칙의 목적지 폴더를 선택하세요.',stop:'작업을 중단하고 자동 실행을 껐습니다.',start:'분류를 시작했습니다.',resume:'작업을 이어갑니다.'}[type] || '',type === 'demo' || type === 'connect');
}));
$('preview').addEventListener('click',() => void action(async () => {
  await send('saveSettings',{...state.settings,days:Number($('days').value),limit:Number($('limit').value)});
  await send('preview');
},'미리보기를 확인한 후 분류 실행을 눌러 주세요.'));
$('connectionForm').addEventListener('submit',event => {event.preventDefault(); void action(() => send('saveSettings',{...state.settings,clientId:$('clientId').value.trim(),tenant:$('tenant').value.trim()}),'연결 설정을 저장했습니다. Outlook 연결을 눌러 주세요.',true);});
$('autoForm').addEventListener('submit',event => {event.preventDefault(); const enabled = $('autoEnabled').checked; void action(() => send('saveSettings',{...state.settings,auto:enabled,interval:Number($('interval').value)}),enabled ? '자동 실행을 켰습니다. 다음 주기부터 모든 활성 규칙을 적용합니다.' : '자동 실행을 껐습니다.',true);});
$('ruleForm').addEventListener('submit',event => {
  event.preventDefault();
  const spam = $('ruleKind').value === 'spam', junk = state.folders.find(f => f.isJunk);
  if (spam && !junk) {notice('정크 메일 폴더를 찾지 못했습니다. 계정을 연결한 후 폴더를 새로고침하세요.',true); return;}
  const old = state.rules.find(r => r.id === $('editId').value);
  const r = {id:old?.id || crypto.randomUUID(),name:$('ruleName').value.trim(),kind:spam ? 'spam' : 'folder',field:$('ruleField').value,match:$('ruleMatch').value,keywords:[...new Set($('ruleKeywords').value.split(/[,\n]/).map(k => k.trim()).filter(Boolean))],destination:spam ? junk.id : $('ruleDestination').value,enabled:old?.enabled ?? true};
  const rules = old ? state.rules.map(i => i.id === old.id ? r : i) : spam ? [r,...state.rules] : [...state.rules,r];
  void action(async () => {await send('saveRules',{rules,enableAuto:spam && r.enabled}); resetEditor();},spam && r.enabled ? '스팸 규칙을 저장하고 자동 실행을 켰습니다. 다음 주기에 모든 활성 규칙을 적용합니다.' : '규칙을 저장했습니다. 미리보기로 분류 대상을 확인하세요.');
});
$('ruleList').addEventListener('change',event => {
  const id = event.target.dataset.ruleToggle; if (!id) return;
  void action(() => send('saveRules',{rules:state.rules.map(r => r.id === id ? {...r,enabled:event.target.checked} : r)}),'규칙 사용 여부를 저장했습니다.');
});
$('ruleList').addEventListener('click',event => {
  const button = event.target.closest('[data-rule-action]'); if (!button) return;
  const {id,ruleAction:name} = button.dataset, index = state.rules.findIndex(r => r.id === id), r = state.rules[index];
  if (name === 'edit') {
    $('editId').value = r.id; $('ruleName').value = r.name; $('ruleKind').value = r.kind || 'folder'; $('ruleField').value = r.field; $('ruleKeywords').value = r.keywords.join(', '); $('ruleMatch').value = r.match; $('ruleDestination').value = r.destination; $('ruleEditor').open = true; $('saveRule').textContent = '수정 저장'; kindChanged(); $('ruleName').focus(); return;
  }
  const rules = [...state.rules];
  if (name === 'delete') {if (!confirm(`“${r.name}” 규칙을 삭제할까요?`)) return; rules.splice(index,1);}
  else {const next = index + (name === 'up' ? -1 : 1); if (next < 0 || next >= rules.length) return; [rules[index],rules[next]] = [rules[next],rules[index]];}
  void action(() => send('saveRules',{rules}),'규칙을 변경했습니다.');
});
function undo(id) {if (confirm('이 작업에서 이동한 메일을 원래 폴더로 되돌릴까요? 자동 실행도 꺼집니다.')) void action(() => send('undo',{id}),'되돌리기를 시작했습니다.');}
$('undo').addEventListener('click',() => undo(state.job.id));
$('historyList').addEventListener('click',event => {const button = event.target.closest('[data-history-id]'); if (button) undo(button.dataset.historyId);});
$('reset').addEventListener('click',() => {if (confirm('설정과 모든 복구 기록을 지울까요? 이미 이동된 메일은 그대로 남으며, 이 프로그램으로 되돌릴 수 없게 됩니다.')) void action(async () => {await send('reset'); resetEditor();},'설정과 기록을 초기화했습니다.',true);});
$('copyRedirect').addEventListener('click',async () => {try {await navigator.clipboard.writeText(state.redirect); notice('리디렉션 URI를 복사했습니다.');} catch {notice('자동 복사가 제한되었습니다. 표시된 URI를 직접 복사해 주세요.',true);}});
chrome.storage.onChanged.addListener((changes,area) => {if (area === 'local' && changes.state && !busy) void refresh().catch(e => notice(e.message,true));});
void refresh(true).catch(e => notice(e.message,true));
