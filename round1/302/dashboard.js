const $ = (selector) => document.querySelector(selector);
const KEYS = { people: "hr_people", jobs: "hr_jobs", trainings: "hr_trainings", todos: "todos" };
const LABELS = { people: "입·퇴사 관리", jobs: "채용 관리", trainings: "교육 관리", todos: "할 일" };
const DESCRIPTIONS = {
  people: "입사자와 퇴사자의 일정 및 처리 상태를 관리하세요.",
  jobs: "부서별 채용 인원과 진행 상태를 확인하세요.",
  trainings: "교육 일정과 대상자, 참석 현황을 관리하세요.",
  todos: "기존 할 일을 이어서 관리하세요."
};
const FIELDS = {
  people: [
    { key: "eventType", label: "구분", type: "select", options: ["입사", "퇴사"], required: true },
    { key: "status", label: "진행 상태", type: "select", options: ["예정", "진행 중", "완료"], required: true },
    { key: "name", label: "이름", type: "text", required: true, max: 60 },
    { key: "department", label: "부서", type: "text", required: true, max: 80 },
    { key: "date", label: "입·퇴사 날짜", type: "date", required: true },
    { key: "note", label: "메모", type: "textarea", wide: true, max: 300 }
  ],
  jobs: [
    { key: "department", label: "부서", type: "text", required: true, max: 80 },
    { key: "role", label: "담당 업무", type: "text", required: true, max: 120 },
    { key: "headcount", label: "채용 인원", type: "number", required: true, min: 1, max: 999 },
    { key: "filled", label: "충원 인원", type: "number", required: true, min: 0, max: 999 },
    { key: "location", label: "근무지", type: "text", required: true, max: 100 },
    { key: "status", label: "채용 상태", type: "select", options: ["진행 중", "완료"], required: true },
    { key: "note", label: "메모", type: "textarea", wide: true, max: 300 }
  ],
  trainings: [
    { key: "title", label: "교육명", type: "text", required: true, max: 120 },
    { key: "date", label: "교육 날짜", type: "date", required: true },
    { key: "audience", label: "교육 대상자", type: "textarea", required: true, wide: true, max: 300 },
    { key: "location", label: "장소", type: "text", required: true, max: 100 },
    { key: "status", label: "교육 상태", type: "select", options: ["예정", "진행 중", "완료"], required: true },
    { key: "expected", label: "대상 인원", type: "number", required: true, min: 0, max: 9999 },
    { key: "attended", label: "참석 인원", type: "number", required: true, min: 0, max: 9999 },
    { key: "absent", label: "불참 인원", type: "number", required: true, min: 0, max: 9999 },
    { key: "note", label: "메모", type: "textarea", wide: true, max: 300 }
  ],
  todos: [
    { key: "text", label: "업무 상세 내용", type: "textarea", required: true, wide: true, max: 300 },
    { key: "recipient", label: "업무 수신 대상자", type: "text", required: true, max: 100 },
    { key: "date", label: "등록 날짜", type: "date", required: true },
    { key: "completion", label: "상태", type: "select", options: ["미완료", "완료"], required: true }
  ]
};
const state = { people: [], jobs: [], trainings: [], todos: [] };
let section = "overview";
let editingId = null;

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function makeId() { return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`; }
function dateLabel(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? value.replaceAll("-", ".") : "날짜 미입력"; }
function make(tag, className, value) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (value !== undefined) el.textContent = String(value);
  return el;
}
function isDone(item, type) { return type === "todos" ? Boolean(item.completed) : item.status === "완료"; }
function statusOf(item, type) { return type === "todos" ? (item.completed ? "완료" : "미완료") : item.status || "진행 중"; }
function showError(message) { $("#global-error").textContent = message; $("#global-error").hidden = !message; }

function setSection(next) {
  section = next;
  for (const button of document.querySelectorAll(".nav-item")) button.classList.toggle("active", button.dataset.section === next);
  $("#overview-panel").hidden = next !== "overview";
  $("#list-panel").hidden = next === "overview";
  $("#add-button").hidden = next === "overview";
  $("#page-title").textContent = next === "overview" ? "전체 현황" : LABELS[next];
  $("#page-description").textContent = next === "overview" ? "오늘 확인할 인사 업무를 한눈에 살펴보세요." : DESCRIPTIONS[next];
  $("#search-input").value = "";
  const filter = $("#status-filter");
  filter.replaceChildren();
  const options = next === "overview" ? [] : next === "todos" ? ["전체 상태", "미완료", "완료"] : next === "jobs" ? ["전체 상태", "진행 중", "완료"] : ["전체 상태", "예정", "진행 중", "완료"];
  for (const option of options) filter.add(new Option(option, option));
  render();
}

function renderOverview() {
  const today = todayKey();
  $("#metric-people").textContent = state.people.filter((x) => !isDone(x, "people") && x.date >= today).length;
  $("#metric-jobs").textContent = state.jobs.filter((x) => !isDone(x, "jobs")).length;
  $("#metric-trainings").textContent = state.trainings.filter((x) => !isDone(x, "trainings") && x.date >= today).length;
  $("#metric-todos").textContent = state.todos.filter((x) => !x.completed).length;
  const schedule = [
    ...state.people.filter((x) => !isDone(x, "people") && x.date >= today).map((x) => ({ date: x.date, title: `${x.eventType || "입사"} · ${x.name || "이름 없음"}`, sub: x.department || "부서 미입력" })),
    ...state.trainings.filter((x) => !isDone(x, "trainings") && x.date >= today).map((x) => ({ date: x.date, title: `교육 · ${x.title || "교육명 없음"}`, sub: x.location || "장소 미입력" }))
  ].filter((x) => x.date).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
  const scheduleList = $("#schedule-list");
  scheduleList.replaceChildren();
  for (const item of schedule) {
    const li = make("li");
    const date = make("span", "schedule-date", item.date.slice(5).replace("-", "."));
    const info = make("div");
    info.append(make("strong", "", item.title), make("small", "", item.sub));
    li.append(date, info);
    scheduleList.append(li);
  }
  $("#schedule-empty").hidden = schedule.length > 0;
  renderPreview("#job-preview", "#job-preview-empty", state.jobs.filter((x) => !isDone(x, "jobs")).slice(0, 3).map((x) => ({ title: x.role || "담당 업무 미입력", sub: `${x.department || "부서 미입력"} · ${x.location || "근무지 미입력"}`, right: `${Number(x.filled) || 0} / ${Number(x.headcount) || 0}명` })));
  renderPreview("#todo-preview", "#todo-preview-empty", state.todos.filter((x) => !x.completed).slice(0, 3).map((x) => ({ title: x.text || "업무 내용 없음", sub: `수신 대상자: ${x.recipient || "미입력"}`, right: dateLabel(x.date) })));
}
function renderPreview(listSelector, emptySelector, items) {
  const list = $(listSelector);
  list.replaceChildren();
  for (const item of items) {
    const row = make("div", "preview-item");
    const info = make("div");
    info.append(make("strong", "", item.title), make("small", "", item.sub));
    row.append(info, make("span", "", item.right));
    list.append(row);
  }
  $(emptySelector).hidden = items.length > 0;
}

function sortedItems(type) {
  const items = [...state[type]];
  if (type === "people" || type === "trainings") items.sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
  else items.sort((a, b) => Number(isDone(a, type)) - Number(isDone(b, type)));
  return items;
}
function detail(container, label, value) {
  const row = make("span");
  row.append(make("b", "", label), document.createTextNode(String(value ?? "")));
  container.append(row);
}
function recordInfo(item, type) {
  if (type === "people") return { title: item.name || "이름 없음", sub: item.department || "부서 미입력", badge: `${item.eventType || "입사"} · ${statusOf(item, type)}`, details: [["일자", dateLabel(item.date)], ["메모", item.note || "—"]] };
  if (type === "jobs") return { title: item.role || "담당 업무 미입력", sub: item.department || "부서 미입력", badge: statusOf(item, type), details: [["채용", `${Number(item.filled) || 0} / ${Number(item.headcount) || 0}명`], ["근무지", item.location || "—"], ["메모", item.note || "—"]] };
  if (type === "trainings") return { title: item.title || "교육명 없음", sub: item.audience || "대상자 미입력", badge: statusOf(item, type), details: [["일자", dateLabel(item.date)], ["장소", item.location || "—"], ["대상", `${Number(item.expected) || 0}명`], ["참석", `${Number(item.attended) || 0}명`], ["불참", `${Number(item.absent) || 0}명`], ["메모", item.note || "—"]] };
  return { title: item.text || "업무 내용 없음", sub: `업무 수신 대상자 · ${item.recipient || "미입력"}`, badge: statusOf(item, type), details: [["등록일", dateLabel(item.date)]] };
}
function renderList() {
  const query = $("#search-input").value.trim().toLocaleLowerCase("ko-KR");
  const filter = $("#status-filter").value;
  const items = sortedItems(section).filter((item) => (filter === "전체 상태" || statusOf(item, section) === filter) && (!query || Object.values(item).some((value) => String(value ?? "").toLocaleLowerCase("ko-KR").includes(query))));
  $("#result-count").textContent = `${items.length}건`;
  const list = $("#card-list");
  list.replaceChildren();
  for (const item of items) {
    const info = recordInfo(item, section);
    const card = make("article", "record-card");
    const body = make("div");
    const top = make("div", "record-top");
    const badge = make("span", `badge ${isDone(item, section) ? "done" : statusOf(item, section) === "예정" ? "soon" : ""}`, info.badge);
    top.append(make("h2", "record-title", info.title), badge);
    body.append(top, make("p", "record-sub", info.sub));
    const details = make("div", "record-details");
    for (const [label, value] of info.details) detail(details, label, value);
    body.append(details);
    const actions = make("div", "record-actions");
    if (section === "todos") {
      const toggle = make("button", "", item.completed ? "다시 열기" : "완료");
      toggle.type = "button";
      toggle.addEventListener("click", () => toggleTodo(item.id));
      actions.append(toggle);
    }
    const edit = make("button", "", "수정");
    edit.type = "button";
    edit.setAttribute("aria-label", `${info.title} 수정`);
    edit.addEventListener("click", () => openEditor(item));
    const remove = make("button", "delete", "삭제");
    remove.type = "button";
    remove.setAttribute("aria-label", `${info.title} 삭제`);
    remove.addEventListener("click", () => deleteRecord(item.id, info.title));
    actions.append(edit, remove);
    card.append(body, actions);
    list.append(card);
  }
  $("#list-empty").hidden = items.length > 0;
}
function render() { renderOverview(); if (section !== "overview") renderList(); }

function openEditor(item = null) {
  editingId = item?.id ?? null;
  $("#dialog-title").textContent = `${LABELS[section]} ${item ? "수정" : "등록"}`;
  $("#form-error").textContent = "";
  const fields = $("#form-fields");
  fields.replaceChildren();
  for (const spec of FIELDS[section]) {
    const label = make("label", `field${spec.wide ? " wide" : ""}`, spec.label + (spec.required ? " *" : ""));
    const control = document.createElement(spec.type === "select" ? "select" : spec.type === "textarea" ? "textarea" : "input");
    if (control.tagName === "INPUT") control.type = spec.type;
    control.name = spec.key;
    control.required = Boolean(spec.required);
    if (spec.max !== undefined && spec.type !== "number") control.maxLength = spec.max;
    if (spec.min !== undefined) control.min = spec.min;
    if (spec.max !== undefined && spec.type === "number") control.max = spec.max;
    if (spec.type === "number") control.step = "1";
    if (spec.options) for (const option of spec.options) control.add(new Option(option, option));
    const fallback = spec.key === "date" ? todayKey() : spec.key === "filled" || spec.key === "expected" || spec.key === "attended" || spec.key === "absent" ? "0" : "";
    control.value = spec.key === "completion" ? (item?.completed ? "완료" : "미완료") : String(item?.[spec.key] ?? fallback);
    label.append(control);
    fields.append(label);
  }
  $("#editor").showModal();
  fields.querySelector("input, select, textarea")?.focus();
}
function readForm() {
  const result = {};
  const form = $("#editor-form");
  for (const spec of FIELDS[section]) {
    const control = form.elements.namedItem(spec.key);
    const raw = control.value.trim();
    if (spec.required && !raw) { control.focus(); throw new Error(`${spec.label}을(를) 입력해 주세요.`); }
    if (spec.type === "number") {
      const num = Number(raw);
      if (!Number.isInteger(num) || num < spec.min || num > spec.max) { control.focus(); throw new Error(`${spec.label}은(는) ${spec.min}~${spec.max} 사이의 정수로 입력해 주세요.`); }
      result[spec.key] = num;
    } else if (spec.key === "completion") result.completed = raw === "완료";
    else result[spec.key] = raw;
  }
  if (section === "jobs" && result.filled > result.headcount) throw new Error("충원 인원은 채용 인원을 넘을 수 없습니다.");
  if (section === "trainings" && result.attended + result.absent > result.expected) throw new Error("참석·불참 인원의 합계는 대상 인원을 넘을 수 없습니다.");
  return result;
}
async function saveCollection(type, next) {
  await chrome.storage.local.set({ [KEYS[type]]: next });
  state[type] = next;
  showError("");
  render();
}
async function saveForm(event) {
  event.preventDefault();
  const button = $("#save-button");
  try {
    const values = readForm();
    const old = state[section].find((x) => x.id === editingId);
    const record = { ...old, ...values, id: editingId || makeId() };
    const next = editingId ? state[section].map((x) => x.id === editingId ? record : x) : [record, ...state[section]];
    button.disabled = true;
    await saveCollection(section, next);
    $("#editor").close();
  } catch (error) { $("#form-error").textContent = error.message || "저장하지 못했습니다. 다시 시도해 주세요."; }
  finally { button.disabled = false; }
}
async function deleteRecord(id, title) {
  if (!window.confirm(`“${title}” 항목을 삭제할까요?`)) return;
  try { await saveCollection(section, state[section].filter((x) => x.id !== id)); }
  catch { showError("삭제하지 못했습니다. 다시 시도해 주세요."); }
}
async function toggleTodo(id) {
  try { await saveCollection("todos", state.todos.map((x) => x.id === id ? { ...x, completed: !x.completed } : x)); }
  catch { showError("상태를 변경하지 못했습니다. 다시 시도해 주세요."); }
}
async function load() {
  const data = await chrome.storage.local.get(Object.values(KEYS));
  for (const [type, key] of Object.entries(KEYS)) state[type] = Array.isArray(data[key]) ? data[key] : [];
  render();
}

$("#today").textContent = new Intl.DateTimeFormat("ko-KR", { dateStyle: "full" }).format(new Date());
for (const button of document.querySelectorAll(".nav-item")) button.addEventListener("click", () => setSection(button.dataset.section));
for (const button of document.querySelectorAll("[data-go]")) button.addEventListener("click", () => setSection(button.dataset.go));
$("#add-button").addEventListener("click", () => openEditor());
$("#search-input").addEventListener("input", renderList);
$("#status-filter").addEventListener("change", renderList);
$("#editor-form").addEventListener("submit", saveForm);
$("#close-dialog").addEventListener("click", () => $("#editor").close());
$("#cancel-dialog").addEventListener("click", () => $("#editor").close());
$("#editor").addEventListener("click", (event) => { if (event.target === $("#editor")) $("#editor").close(); });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  for (const [type, key] of Object.entries(KEYS)) if (changes[key]) state[type] = Array.isArray(changes[key].newValue) ? changes[key].newValue : [];
  render();
});
load().catch(() => showError("데이터를 불러오지 못했습니다. 페이지를 새로고침해 주세요."));
