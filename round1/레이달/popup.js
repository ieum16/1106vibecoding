const NAME = "계수정 선생님";           // 말하는 캐릭터 이름 (바꾸고 싶으면 여기만 고치면 돼요)
const KEY = "todos";

const $ = id => document.getElementById(id);

// 툴바 아이콘으로 열면 작은 팝업, "크게 보기"로 열면 새 탭 전체 화면
const isPopup = !new URLSearchParams(location.search).has("full");
if (isPopup) document.documentElement.classList.add("popup");
function openFullTab() {
  const url = chrome.runtime.getURL("popup.html?full=1");
  if (window.chrome?.tabs) { chrome.tabs.create({ url }); window.close(); }
  else window.open(url, "_blank");
}
$("openFull").onclick = openFullTab;
const bubble = $("bubble"), list = $("list"), input = $("input");
const woody = $("woody");
// 평소에는 서 있는 모습, 칭찬할 때는 점프하는 모습
const POSE = { talk: "img/sujeong-stand.png", cheer: "img/sujeong-cheer.png" };
Object.values(POSE).forEach(src => { new Image().src = src; });

let todos = [];
let typingTimer = null, nextTimer = null;

function normalize(item) {
  return {
    id: item.id,
    text: item.text,
    done: Boolean(item.done ?? item.completed),
  };
}
async function load() {
  const stored = await chrome.storage.local.get(KEY);
  const fromStorage = Array.isArray(stored[KEY]) ? stored[KEY] : [];
  if (fromStorage.length) return fromStorage.map(normalize);
  try {
    const legacy = JSON.parse(localStorage.getItem("sheriff-todo-v1") || "[]");
    return Array.isArray(legacy) ? legacy.map(normalize) : [];
  } catch {
    return [];
  }
}
async function save() {
  await chrome.storage.local.set({
    [KEY]: todos.map((item) => ({
      id: item.id,
      text: item.text,
      completed: item.done,
      done: item.done,
    })),
  });
}

// 받침 있으면 "이야", 없으면 "야"
function iya(word) {
  const last = word.trim().slice(-1);
  const code = last.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return "(이)야";
  return code % 28 ? "이야" : "야";
}
function esc(s) {
  return s.replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
}
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// 말풍선에 한 글자씩 타이핑
function say(html, { shout = false } = {}) {
  clearInterval(typingTimer);
  bubble.classList.remove("shout");
  if (shout) {
    bubble.offsetHeight;
    bubble.classList.add("shout");
  }
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  const full = tmp.textContent;
  const out = $("bubbleText");
  let i = 0;
  out.textContent = "";
  typingTimer = setInterval(() => {
    i++;
    out.textContent = full.slice(0, i);
    if (i >= full.length) { clearInterval(typingTimer); out.innerHTML = html; }
  }, 35);
  animate(shout ? "cheer" : "talk");
}
function animate(cls) {
  woody.src = POSE[cls];
  woody.classList.toggle("closeup", cls === "cheer");
  woody.classList.remove("talk", "cheer");
  woody.offsetWidth;
  woody.classList.add(cls);
}
function popSfx() {
  const word = pick(["팡!", "짠!", "최고!", "와우!"]);
  $("sfx").textContent = word;
  ["sfx", "sfx2"].forEach(id => {
    const el = $(id);
    el.classList.remove("pop"); el.offsetWidth; el.classList.add("pop");
  });
}

function sayToday(text) {
  say(`${NAME}이 알려 드립니다. 오늘 할 일은 <b>${esc(text)}</b>${iya(text)}!`);
}
function sayNextOrDone() {
  const left = todos.filter(t => !t.done);
  if (todos.length === 0) say(`안녕하세요! 오늘 할 일을 알려주세요.`);
  else if (left.length === 0) say(`오늘 할 일을 모두 마쳤어요!`, { shout: true });
  else say(`다음 할 일은 <b>${esc(left[0].text)}</b>${iya(left[0].text)}! 남은 건 ${left.length}개!`);
}

function render() {
  list.innerHTML = "";
  todos.forEach(t => {
    const li = document.createElement("li");
    if (t.done) li.className = "done";
    li.innerHTML = `
      <div class="mini">${miniFace()}</div>
      <div class="item-bubble" title="눌러서 말하게 하기">${esc(t.text)}${t.done ? '<span class="stamp">참 잘했어요</span>' : ""}</div>
      ${t.done
        ? `<button class="btn btn-undo" type="button" data-act="undo">되돌리기</button>`
        : `<button class="btn btn-ok" type="button" data-act="ok">확인</button>`}
      <button class="del" type="button" data-act="del" aria-label="삭제">✕</button>`;
    li.querySelector(".item-bubble").onclick = () => t.done
      ? say(`<b>${esc(t.text)}</b>, 그건 이미 끝냈지! 잘했어!`)
      : sayToday(t.text);
    li.querySelectorAll("button").forEach(b => b.onclick = () => act(t, b.dataset.act));
    list.appendChild(li);
  });
  const done = todos.filter(t => t.done).length;
  $("count").textContent = `${done} / ${todos.length}`;
  $("empty").style.display = todos.length ? "none" : "block";
}

function act(t, what) {
  clearTimeout(nextTimer);
  if (what === "ok") {
    t.done = true;
    popSfx();
    say(pick([
      `잘했어! <b>${esc(t.text)}</b> 끝!`,
      `잘했어, 파트너! <b>${esc(t.text)}</b> 해냈구나!`,
      `잘했어! 역시 내 파트너야!`,
    ]), { shout: true });
    nextTimer = setTimeout(sayNextOrDone, 2600);
  } else if (what === "undo") {
    t.done = false;
    sayToday(t.text);
  } else if (what === "del") {
    todos = todos.filter(x => x !== t);
    sayNextOrDone();
  }
  save(); render();
}

$("form").onsubmit = e => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) { say("뭘 해야 하는지 적어줘야지, 파트너!"); return; }
  todos.push({ id: Date.now(), text, done: false });
  input.value = "";
  save(); render();
  clearTimeout(nextTimer);
  sayToday(text);
};

function miniFace() {
  return `<img src="img/sujeong-face.png" alt="">`;
}

load().then((loaded) => {
  todos = loaded;
  render();
  const firstLeft = todos.find((item) => !item.done);
  if (firstLeft) sayToday(firstLeft.text);
  else sayNextOrDone();
}).catch(() => {
  say("목록을 불러오지 못했습니다. 다시 열어 주세요.");
});
