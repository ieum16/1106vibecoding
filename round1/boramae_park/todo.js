const NAME = "고라파덕";
const KEY = "psyduck-todo-v1";
const $ = id => document.getElementById(id);

const isPopup = !new URLSearchParams(location.search).has("full");
if (isPopup) document.documentElement.classList.add("popup");
$("openFull").onclick = () => {
  const url = "todo.html?full=1";
  if (window.chrome?.tabs) { chrome.tabs.create({ url }); window.close(); }
  else window.open(url, "_blank");
};

const bubble = $("bubble"), list = $("list"), input = $("input"), mascot = $("mascot");
let todos = load(), typingTimer = null, nextTimer = null;

function load() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(todos)); } catch {} }
function esc(text) { return text.replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[char]); }
function pick(items) { return items[Math.floor(Math.random() * items.length)]; }
function iga(word) { const n = word.trim().slice(-1).charCodeAt(0) - 0xac00; return n >= 0 && n <= 11171 && n % 28 ? "이" : "가"; }
function iya(word) { const n = word.trim().slice(-1).charCodeAt(0) - 0xac00; return n >= 0 && n <= 11171 ? (n % 28 ? "이야" : "야") : "(이)야"; }

function animate(kind) {
  mascot.classList.remove("talk", "cheer");
  mascot.offsetWidth;
  mascot.classList.add(kind);
}
function say(html, { shout = false } = {}) {
  clearInterval(typingTimer);
  bubble.classList.toggle("shout", shout);
  const text = document.createElement("div"); text.innerHTML = html;
  const full = text.textContent, output = $("bubbleText");
  let index = 0; output.textContent = "";
  typingTimer = setInterval(() => {
    index += 1; output.textContent = full.slice(0, index);
    if (index >= full.length) { clearInterval(typingTimer); output.innerHTML = html; }
  }, 32);
  animate(shout ? "cheer" : "talk");
}
function popSfx() {
  ["sfx", "sfx2"].forEach(id => { const el = $(id); el.classList.remove("pop"); el.offsetWidth; el.classList.add("pop"); });
}
function sayToday(text) { say(`${NAME}${iga(NAME)} 함께 할 일은 <b>${esc(text)}</b>${iya(text)}!`); }
function sayNextOrDone() {
  const left = todos.filter(todo => !todo.done);
  if (!todos.length) say("안녕! 오늘은 뭘 해볼까?");
  else if (!left.length) say("오늘 할 일을 전부 끝냈어! 정말 멋져!", { shout:true });
  else say(`다음은 <b>${esc(left[0].text)}</b>${iya(left[0].text)}! 남은 건 ${left.length}개야.`);
}

function render() {
  list.replaceChildren();
  todos.forEach(todo => {
    const item = document.createElement("li"); if (todo.done) item.className = "done";
    item.innerHTML = `<div class="mini" aria-hidden="true"><img src="img/psyduck-reference.jpg" alt=""></div><div class="item-bubble" title="눌러서 친구에게 말하기">${esc(todo.text)}${todo.done ? '<span class="stamp">해냈다!</span>' : ""}</div>${todo.done ? '<button class="btn btn-undo" type="button" data-act="undo">되돌리기</button>' : '<button class="btn btn-ok" type="button" data-act="ok">완료</button>'}<button class="del" type="button" data-act="del" aria-label="삭제">✕</button>`;
    item.querySelector(".item-bubble").onclick = () => todo.done ? say(`<b>${esc(todo.text)}</b>, 이미 해냈지! 정말 잘했어!`) : sayToday(todo.text);
    item.querySelectorAll("button").forEach(button => button.onclick = () => act(todo, button.dataset.act));
    list.append(item);
  });
  $("count").textContent = `${todos.filter(todo => todo.done).length} / ${todos.length}`;
  $("empty").hidden = Boolean(todos.length);
}
function act(todo, action) {
  clearTimeout(nextTimer);
  if (action === "ok") {
    todo.done = true; popSfx();
    say(pick([`<b>${esc(todo.text)}</b> 끝! 정말 잘했어!`, `와, <b>${esc(todo.text)}</b> 해냈구나!`, "차근차근 해내는 네가 멋져!" ]), { shout:true });
    nextTimer = setTimeout(sayNextOrDone, 2500);
  } else if (action === "undo") { todo.done = false; sayToday(todo.text); }
  else if (action === "del") { todos = todos.filter(item => item !== todo); sayNextOrDone(); }
  save(); render();
}
$("form").onsubmit = event => {
  event.preventDefault(); const text = input.value.trim();
  if (!text) { say("할 일을 먼저 적어줘!"); input.focus(); return; }
  todos.push({ id: crypto.randomUUID?.() ?? Date.now(), text, done:false }); input.value = "";
  save(); render(); clearTimeout(nextTimer); sayToday(text); input.focus();
};
render();
const firstLeft = todos.find(todo => !todo.done);
if (firstLeft) sayToday(firstLeft.text); else sayNextOrDone();
