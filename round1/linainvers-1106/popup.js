'use strict';
const C = PlannerCalendar;
const $ = id => document.getElementById(id);
let week = C.monday(new Date());
let data = {};
let busy = false;
let editing = null;
const customKey = 'planner.customHolidays';
const taskKey = date => `planner.tasks.${date}`;
const tasksFor = date => Array.isArray(data[taskKey(date)]) ? data[taskKey(date)] : [];
const custom = () => data[customKey] || {};
const expanded = new URLSearchParams(location.search).has('expanded');
if (expanded) { document.body.classList.add('expanded'); $('expand').hidden = true; }

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(text, label, action, className = '') {
  const node = el('button', className, text);
  node.type = 'button'; node.title = label; node.setAttribute('aria-label', label);
  node.addEventListener('click', action); return node;
}
function status(text, error = false) {
  $('save-status').textContent = text;
  $('save-status').classList.toggle('error', error);
}
async function change(key, update) {
  if (busy) return false;
  busy = true;
  status('저장 중…');
  try {
    const latest = await chrome.storage.local.get(key);
    const value = update(latest[key]);
    await chrome.storage.local.set({ [key]: value });
    data[key] = value;
    status('자동 저장 완료');
    render();
    return true;
  } catch (error) {
    console.error(error);
    status('저장하지 못했습니다. 내용을 유지한 채 다시 시도해 주세요.', true);
    return false;
  } finally { busy = false; }
}
function changeTask(date, id, update) {
  return change(taskKey(date), latest => (latest || []).map(task => task.id === id ? update(task) : task));
}
function showEdit(date, task) {
  editing = { date, id: task.id };
  $('edit-text').value = task.text;
  $('edit-dialog').showModal();
  $('edit-text').focus();
}
function renderTask(date, task) {
  const row = el('li', `task${task.important ? ' important' : ''}${task.done ? ' done' : ''}`);
  const checkbox = el('input'); checkbox.type = 'checkbox'; checkbox.checked = task.done;
  checkbox.setAttribute('aria-label', `${task.text} 완료`);
  checkbox.addEventListener('change', async () => {
    const value = checkbox.checked;
    checkbox.disabled = true;
    if (!await changeTask(date, task.id, t => ({ ...t, done: value }))) {
      checkbox.checked = task.done; checkbox.disabled = false;
    }
  });
  const star = button(task.important ? '★' : '☆', task.important ? '중요 표시 해제' : '중요 업무로 표시', () => changeTask(date, task.id, t => ({ ...t, important: !t.important })), 'star');
  star.setAttribute('aria-pressed', String(task.important));
  const remove = button('×', '업무 삭제', () => {
    if (confirm(`이 업무를 삭제할까요?\n${task.text}`)) change(taskKey(date), latest => (latest || []).filter(t => t.id !== task.id));
  }, 'remove');
  row.append(checkbox, el('span','task-text',task.text), star, button('수정','업무 수정', () => showEdit(date,task)), remove);
  return row;
}
function renderDay(date) {
  const key = C.key(date);
  const tasks = tasksFor(key);
  const today = key === C.key(new Date());
  const card = el('article', `day${today ? ' today' : ''}`);
  const header = el('div','day-header');
  const weekday = new Intl.DateTimeFormat('ko-KR', { weekday:'long' }).format(date);
  header.append(el('h3','',weekday),el('span','date',`${date.getMonth()+1}.${String(date.getDate()).padStart(2,'0')}`));
  if (today) header.append(el('span','today-tag','오늘'));
  header.append(el('span','day-count',`${tasks.filter(t=>t.done).length}/${tasks.length}`));
  card.append(header);
  const list = el('ul','tasks');
  const visible = tasks.filter(t => !$('important-only').checked || t.important);
  visible.forEach(task => list.append(renderTask(key,task)));
  card.append(list);
  if (!visible.length) card.append(el('p','empty-day', $('important-only').checked ? '중요 업무가 없어요' : '작은 할 일부터 적어보세요.'));
  const form = el('form','add-form');
  const input = el('input'); input.placeholder = '+ 할 일 입력'; input.maxLength = 300; input.required = true;
  input.setAttribute('aria-label',`${key} ${weekday} 새 업무`);
  const add = el('button','','추가'); add.type = 'submit';
  form.append(input, add);
  form.addEventListener('submit', async e => {
    e.preventDefault(); const text = input.value.trim();
    if (!text || busy) return;
    input.disabled = true; add.disabled = true;
    const success = await change(taskKey(key), latest => [...(latest || []), {id:crypto.randomUUID(),text,done:false,important:false}]);
    if (success) {
      const nextInput = document.querySelector(`input[aria-label="${key} ${weekday} 새 업무"]`);
      if (nextInput) { nextInput.value = ''; nextInput.focus(); }
    }
    else {input.disabled = false; add.disabled = false; input.focus();}
  });
  card.append(form); return card;
}
function render() {
  // Preserve unsent additions when another date or an open view is updated.
  const drafts = new Map(Array.from(document.querySelectorAll('.add-form input')).map(n=>[n.getAttribute('aria-label'),n.value]));
  const focused = document.activeElement?.getAttribute('aria-label');
  const selection = document.activeElement?.selectionStart;
  const end = C.addDays(week,4);
  const format = date => `${date.getFullYear()}.${String(date.getMonth()+1).padStart(2,'0')}.${String(date.getDate()).padStart(2,'0')}`;
  $('week-title').textContent = `${format(week)} – ${format(end)}`;
  $('prev').disabled = week.getFullYear() <= 1900;
  $('next').disabled = end.getFullYear() >= 9999;
  const dates = Array.from({length:5},(_,i)=>C.addDays(week,i));
  const working = dates.filter(d=>!C.holiday(d,custom()));
  const skipped = dates.filter(d=>C.holiday(d,custom()));
  $('excluded').hidden = !skipped.length;
  $('excluded').textContent = '쉬는 날 · ' + skipped.map(d=>`${d.getMonth()+1}/${d.getDate()} ${C.holiday(d,custom())}${tasksFor(C.key(d)).length ? ' (업무 보관 중)' : ''}`).join(' · ');
  const unsupported = [...new Set(dates.map(d=>d.getFullYear()))].filter(y=>!C.supported(y));
  $('coverage').hidden = !unsupported.length;
  $('coverage').textContent = `${unsupported.join(', ')}년 공휴일 자료는 제공되지 않습니다. 주말만 자동 제외되므로 아래 휴일 관리에서 공휴일을 직접 추가해 주세요.`;
  $('days').replaceChildren(...working.map(renderDay));
  if (!working.length) $('days').append(el('p','week-empty','이번 주 평일은 모두 휴일이에요. 편안한 휴식 보내세요!'));
  const tasks = working.flatMap(d=>tasksFor(C.key(d)));
  const done = tasks.filter(t=>t.done).length;
  const percent = tasks.length ? Math.round(done/tasks.length*100) : 0;
  $('completed').textContent = done; $('total').textContent = ` / ${tasks.length}개 완료`;
  $('percent').textContent = `${percent}%`; $('progress').value = percent;
  const list = $('custom-holidays'); list.replaceChildren();
  Object.entries(custom()).sort(([a],[b])=>a.localeCompare(b)).forEach(([date,name])=>{
    const row = el('li');
    row.append(el('span','',`${date} · ${name}`),button('해제',`${date} 휴일 해제`,()=>change(customKey,latest=>{const value={...latest}; delete value[date];return value;})));
    list.append(row);
  });
  document.querySelectorAll('.add-form input').forEach(input=>{
    const label=input.getAttribute('aria-label');
    if (drafts.has(label)) input.value = drafts.get(label);
    if (focused===label) {input.focus(); if (typeof selection==='number') input.setSelectionRange(selection,selection);}
  });
}
$('prev').addEventListener('click',()=>{ week=C.addDays(week,-7);render(); });
$('next').addEventListener('click',()=>{ week=C.addDays(week,7);render(); });
$('today').addEventListener('click',()=>{week=C.monday(new Date());render();});
$('important-only').addEventListener('change',render);
$('expand').addEventListener('click',()=>chrome.tabs.create({url:chrome.runtime.getURL('popup.html?expanded=1')}));
$('holiday-form').addEventListener('submit', async e=>{
  e.preventDefault();
  const date=$('holiday-date').value; const name=$('holiday-name').value.trim();
  if (!date || !name || busy) return;
  if (await change(customKey,latest=>({...latest,[date]:name}))) { $('holiday-name').value=''; }
});
$('edit-cancel').addEventListener('click',()=>$('edit-dialog').close());
$('edit-form').addEventListener('submit',async e=>{
  e.preventDefault(); const text=$('edit-text').value.trim();
  if (!text || !editing || busy) return;
  const submit=$('edit-form').querySelector('[type=submit]'); submit.disabled=true;
  try { if (await changeTask(editing.date,editing.id,t=>({...t,text}))) $('edit-dialog').close(); }
  finally {submit.disabled=false;}
});
chrome.storage.onChanged.addListener((changes,area)=>{
  if (area!=='local') return;
  for (const [key,value] of Object.entries(changes)) {
    if (key.startsWith('planner.')) {if (value.newValue===undefined) delete data[key];else data[key]=value.newValue;}
  }
  if (!busy) render();
});
(async()=>{
  try {data=await chrome.storage.local.get(null);render();}
  catch(error) {console.error(error);status('저장된 업무를 불러오지 못했습니다. 확장프로그램을 다시 열어 주세요.',true);}
})();
