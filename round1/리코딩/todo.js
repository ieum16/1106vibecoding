const KEY = "pokemon-quest-v2";
const LEGACY_KEY = "sheriff-todo-v1";
const SIZE_KEY = "pokemon-popup-size-v1";
const G = PokemonGame;
const $ = id => document.getElementById(id);
const isPopup = !new URLSearchParams(location.search).has("full");
if (isPopup) document.documentElement.classList.add("popup");
$("openFull").onclick = () => {
  const url = "todo.html?full=1";
  if (window.chrome?.tabs) { chrome.tabs.create({ url }); window.close(); }
  else window.open(url, "_blank");
};
function readJSON(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
let state = G.normalize(readJSON(KEY), readJSON(LEGACY_KEY));
let todos = state.todos;
let typingTimer = null, nextTimer = null;
const bubble = $("bubble"), list = $("list"), input = $("input"), character = $("pikachu");
const partnerButtons = [...document.querySelectorAll("[data-partner]")];

// 목록과 성장 상태를 하나의 키로 저장하여 경험치와 완료 상태를 함께 유지합니다.
function commit(change) {
  const previous = JSON.stringify(state);
  change();
  state.todos = todos;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    $("status").textContent = "";
    return true;
  } catch {
    state = G.normalize(JSON.parse(previous));
    todos = state.todos;
    render();
    $("status").textContent = "저장하지 못했습니다. 다시 시도해 주세요.";
    return false;
  }
}
const esc = s => s.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
function iya(word) {
  const code = word.trim().slice(-1).charCodeAt(0) - 0xac00;
  return code < 0 || code > 11171 ? "(이)야" : code % 28 ? "이야" : "야";
}
function iga(word) {
  const code = word.slice(-1).charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 ? "이" : "가";
}
function animate(cls) {
  character.classList.remove("talk", "cheer");
  void character.offsetWidth;
  character.classList.add(cls);
}
function say(html, { shout = false } = {}) {
  clearInterval(typingTimer);
  bubble.classList.toggle("shout", shout);
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  const full = tmp.textContent;
  const out = $("bubbleText");
  let i = 0;
  out.textContent = "";
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) out.innerHTML = html;
  else typingTimer = setInterval(() => {
    out.textContent = full.slice(0, ++i);
    if (i >= full.length) { clearInterval(typingTimer); out.innerHTML = html; }
  }, 35);
  animate(shout ? "cheer" : "talk");
}
function popSfx(word = "잘했어!") {
  $("sfx").textContent = word;
  ["sfx", "sfx2"].forEach(id => {
    const el = $(id);
    el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");
  });
}
function sayToday(text) {
  const name = G.info(state).form.name;
  say(`${name}${iga(name)} 응원할게! 오늘 할 일은 <b>${esc(text)}</b>${iya(text)}!`);
}
function sayNextOrDone() {
  const left = todos.filter(t => !t.done), name = G.info(state).form.name;
  if (!todos.length) say(`${name}와 함께 오늘의 퀘스트를 시작해 볼까?`);
  else if (!left.length) say("오늘 할 일 전부 끝! 넌 최고의 트레이너야!", { shout: true });
  else say(`다음 할 일은 <b>${esc(left[0].text)}</b>${iya(left[0].text)}! 남은 건 ${left.length}개!`);
}
function renderGrowth() {
  const info = G.info(state), partner = G.partners[state.selected];
  character.src = G.image(info.form);
  character.alt = `응원하는 ${info.form.name}`;
  document.querySelector(".stage").style.backgroundColor = partner.color;
  $("partnerName").textContent = info.form.name;
  $("partnerLevel").textContent = `Lv.${info.level}`;
  $("xpBar").value = info.progress;
  $("xpText").textContent = `${info.progress} / 50 XP · 다음 레벨까지 ${50 - info.progress} XP`;
  $("evolutionHint").textContent = info.next
    ? `Lv.${info.next.level}에 ${info.next.name}${iga(info.next.name)} 돼요! (${(info.next.level - 1) * 50 - info.xp} XP 남음)`
    : "최종 진화 완료! 계속 함께 성장해요.";
  $("evolutionPath").innerHTML = partner.forms.map((form, index) =>
    `${index ? '<span aria-hidden="true">→</span>' : ''}<div class="evolution-form ${form.id === info.form.id ? 'current' : info.level < form.level ? 'locked' : ''}"><img src="${G.image(form)}" alt=""><span>${form.name}<br>Lv.${form.level}</span></div>`).join("");
  partnerButtons.forEach(button => {
    const key = button.dataset.partner, member = G.info(state, key);
    button.setAttribute("aria-pressed", String(state.selected === key));
    button.querySelector("img").src = G.image(member.form);
    button.querySelector("span").textContent = member.form.name;
    $("level-" + key).textContent = `Lv.${member.level}`;
    button.setAttribute("aria-label", `${member.form.name}, 레벨 ${member.level} 선택`);
  });
}
function render() {
  renderGrowth();
  list.innerHTML = "";
  todos.forEach(t => {
    const li = document.createElement("li");
    if (t.done) li.className = "done";
    li.innerHTML = `
      <div class="mini"><img src="${G.image(G.info(state).form)}" alt=""></div>
      <div class="item-bubble" title="눌러서 말하게 하기">${esc(t.text)}${t.done ? '<span class="stamp">퀘스트 완료</span>' : ''}</div>
      ${t.done ? '<button class="btn btn-undo" type="button" data-act="undo">되돌리기</button>' : '<button class="btn btn-ok" type="button" data-act="ok">완료</button>'}
      <button class="del" type="button" data-act="del" aria-label="${esc(t.text)} 삭제">✕</button>`;
    li.querySelector(".item-bubble").onclick = () => t.done
      ? say(`<b>${esc(t.text)}</b>, 이미 끝낸 퀘스트야! 잘했어!`) : sayToday(t.text);
    li.querySelectorAll("button").forEach(b => b.onclick = () => act(t, b.dataset.act));
    list.appendChild(li);
  });
  const done = todos.filter(t => t.done).length;
  $("count").textContent = `${done} / ${todos.length}`;
  $("empty").style.display = todos.length ? "none" : "block";
  $("clearAll").disabled = !todos.length;
  $("clearCompleted").disabled = !done;
}
function act(t, what) {
  if (!todos.includes(t)) return;
  clearTimeout(nextTimer);
  if (what === "ok") {
    if (t.done) return;
    const owner = t.rewardPartner || state.selected, before = G.info(state, owner);
    if (!commit(() => G.complete(state, t))) return;
    const after = G.info(state, owner);
    render();
    if (before.form.id !== after.form.id) {
      popSfx("진화!");
      say(`축하해! <b>${before.form.name}</b>${iga(before.form.name)} <b>${after.form.name}</b>로 진화했어! Lv.${after.level}`, {shout:true});
    } else if (after.level > before.level) {
      popSfx("레벨 업!");
      say(`<b>${after.form.name}</b> Lv.${after.level}! 한 단계 더 성장했어!`, {shout:true});
    } else {
      popSfx(pick(["최고!", "+10 XP", "잘했어!"]));
      say(`<b>${esc(t.text)}</b> 완료! ${after.form.name} 경험치 +10!`, {shout:true});
    }
    nextTimer = setTimeout(sayNextOrDone, 3200);
  } else if (what === "undo") {
    if (!t.done || !commit(() => G.undo(state, t))) return;
    render(); sayToday(t.text);
  } else if (what === "del") {
    if (!commit(() => { todos = todos.filter(x => x !== t); })) return;
    render(); sayNextOrDone();
  }
}
partnerButtons.forEach(button => button.onclick = () => {
  const key = button.dataset.partner;
  if (!G.valid(key) || key === state.selected) return;
  if (!commit(() => { state.selected = key; })) return;
  clearTimeout(nextTimer);
  render();
  const info = G.info(state);
  say(`좋아! Lv.${info.level} <b>${info.form.name}</b>와 함께 모험하자!`);
});
$("form").onsubmit = e => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) { say("오늘의 퀘스트를 입력해 줘, 트레이너!"); input.focus(); return; }
  if (!commit(() => { todos.push({id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`, text, done:false}); })) return;
  input.value = ""; render(); clearTimeout(nextTimer); sayToday(text); input.focus();
};
function clearTodos(completedOnly) {
  const count = completedOnly ? todos.filter(t => t.done).length : todos.length;
  if (!count || !window.confirm(completedOnly ? `완료된 할 일 ${count}개를 삭제할까요? 성장 기록은 유지돼요.` : `할 일 ${count}개를 모두 삭제할까요? 성장 기록은 유지돼요.`)) return;
  if (!commit(() => { todos = completedOnly ? todos.filter(t => !t.done) : []; })) return;
  clearTimeout(nextTimer); render();
  $("status").textContent = `할 일 ${count}개를 삭제했습니다. 성장 기록은 유지됩니다.`;
  sayNextOrDone(); input.focus();
}
$("clearAll").onclick = () => clearTodos(false);
$("clearCompleted").onclick = () => clearTodos(true);

// 가로·세로 변과 모서리 드래그. 브라우저의 현재 표시 영역을 기준으로 제한합니다.
async function setupResize() {
  if (!isPopup) return;
  const handles = [...document.querySelectorAll('[data-resize]')];
  let limits = {width:800, height:600}, drag = null, revision = 0;
  let preferred = readJSON(SIZE_KEY);
  if (!preferred || !Number.isFinite(preferred.width) || !Number.isFinite(preferred.height)) preferred = {width:400,height:600};
  function applySize(width, height) {
    const size = {
      width: Math.round(Math.max(Math.min(360, limits.width), Math.min(limits.width, width))),
      height: Math.round(Math.max(Math.min(240, limits.height), Math.min(limits.height, height)))
    };
    document.body.style.width = size.width + 'px';
    document.body.style.height = size.height + 'px';
    return size;
  }
  function remember(size) {
    preferred = size;
    try { localStorage.setItem(SIZE_KEY, JSON.stringify(size)); } catch {}
  }
  async function refreshLimits() {
    const current = ++revision;
    let tab, browser;
    try { if (window.chrome?.tabs?.query) [tab] = await chrome.tabs.query({active:true,currentWindow:true}); } catch {}
    try { if (window.chrome?.windows?.getCurrent) browser = await chrome.windows.getCurrent(); } catch {}
    if (current !== revision) return;
    const positive = values => values.filter(n => Number.isFinite(n) && n > 0);
    // Tab.width/height excludes browser controls; leave a small margin for popup borders.
    const widths = positive([800, tab?.width && tab.width - 16, browser?.width && browser.width - 16, screen.availWidth && screen.availWidth - 16]);
    const heights = positive([600, tab?.height && tab.height - 16, browser?.height && browser.height - 96, screen.availHeight && screen.availHeight - 16]);
    if (!tab && !browser) {
      if (window.outerWidth > 0) widths.push(Math.max(25, window.outerWidth - 16));
      if (window.outerHeight > 0) heights.push(Math.max(25, window.outerHeight - 96));
    }
    limits = {width:Math.max(25, Math.floor(Math.min(...widths))),height:Math.max(25, Math.floor(Math.min(...heights)))};
    applySize(preferred.width, preferred.height);
  }
  await refreshLimits();
  function sizeNow() { const rect = document.body.getBoundingClientRect(); return {width:rect.width,height:rect.height}; }
  handles.forEach(handle => {
    const axes = handle.dataset.resize;
    handle.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault();
      drag = {id:e.pointerId, handle, x:e.screenX, y:e.screenY, ...sizeNow()};
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener('pointermove', e => {
      if (!drag || drag.handle !== handle || drag.id !== e.pointerId) return;
      const dx = axes.includes('x') ? e.screenX - drag.x : 0;
      const dy = axes.includes('y') ? e.screenY - drag.y : 0;
      preferred = applySize(drag.width + dx, drag.height + dy);
    });
    const end = e => {
      if (!drag || drag.handle !== handle || drag.id !== e.pointerId) return;
      remember(sizeNow()); drag = null;
      if (handle.hasPointerCapture(e.pointerId)) handle.releasePointerCapture(e.pointerId);
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    handle.addEventListener('lostpointercapture', () => {
      if (drag?.handle === handle) { remember(sizeNow()); drag = null; }
    });
    handle.addEventListener('keydown', e => {
      const delta = {ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]}[e.key];
      if (!delta || (delta[0] && !axes.includes('x')) || (delta[1] && !axes.includes('y'))) return;
      e.preventDefault(); const size = sizeNow();
      remember(applySize(size.width + delta[0], size.height + delta[1]));
    });
  });
  // Browser bounds can change while the popup is open. Re-clamp without losing the saved preference.
  window.chrome?.windows?.onBoundsChanged?.addListener(refreshLimits);
  window.addEventListener('resize', refreshLimits);
}
window.addEventListener("storage", e => {
  if (e.key !== KEY || !e.newValue) return;
  try { state = G.normalize(JSON.parse(e.newValue)); } catch { return; }
  todos = state.todos; clearTimeout(nextTimer); render(); sayNextOrDone();
});
render(); setupResize();
const firstLeft = todos.find(t => !t.done);
if (firstLeft) sayToday(firstLeft.text); else sayNextOrDone();
