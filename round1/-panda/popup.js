"use strict";

const STORAGE_KEY = "todayTasks.v1";
const form = document.querySelector("#task-form");
const input = document.querySelector("#task-input");
const addButton = document.querySelector("#add-button");
const list = document.querySelector("#task-list");
const emptyState = document.querySelector("#empty-state");
const feedback = document.querySelector("#feedback");
const taskSection = document.querySelector("#task-section");
let tasks = [];
let ready = false;
let saving = false;
let composing = false;

const now = new Date();
const today = document.querySelector("#today");
today.textContent = new Intl.DateTimeFormat("ko-KR", {
  month: "long", day: "numeric", weekday: "long"
}).format(now);
today.dateTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

function showMessage(message = "", invalid = false) {
  feedback.textContent = message;
  input.setAttribute("aria-invalid", String(invalid));
}

function setBusy() {
  const disabled = !ready || saving;
  input.disabled = disabled;
  addButton.disabled = disabled;
  list.querySelectorAll("button, input").forEach(control => {
    control.disabled = disabled;
  });
  taskSection.setAttribute("aria-busy", String(disabled));
}

function render() {
  const remaining = tasks.filter(task => !task.done).length;
  const completed = tasks.length - remaining;
  const percentage = tasks.length ? Math.round(completed / tasks.length * 100) : 0;
  document.querySelector("#remaining-count").textContent = remaining;
  document.querySelector("#completion-label").textContent = `전체 ${tasks.length}개 · 완료 ${completed}개`;
  document.querySelector("#progress").setAttribute("aria-valuenow", String(percentage));
  document.querySelector("#progress-fill").style.width = `${percentage}%`;
  emptyState.hidden = !ready || tasks.length > 0;

  const fragment = document.createDocumentFragment();
  tasks.forEach(task => {
    const item = document.createElement("li");
    item.className = `task-item${task.done ? " is-done" : ""}`;
    item.dataset.id = task.id;

    const label = document.createElement("label");
    label.className = "task-label";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "task-check";
    checkbox.checked = task.done;
    const text = document.createElement("span");
    text.className = "task-text";
    text.textContent = task.text;
    label.append(checkbox, text);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete-button";
    remove.setAttribute("aria-label", `${task.text} 삭제`);
    remove.title = "할 일 삭제";
    // This SVG is fixed app markup; task text is only assigned with textContent.
    remove.innerHTML = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5m4-5v5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    item.append(label, remove);
    fragment.append(item);
  });
  list.replaceChildren(fragment);
  setBusy();
}

async function save(nextTasks) {
  if (!ready || saving) return false;
  saving = true;
  setBusy();
  showMessage();
  try {
    // Persist before committing the UI, so a failed write never looks saved.
    await chrome.storage.local.set({ [STORAGE_KEY]: nextTasks });
    tasks = nextTasks;
    return true;
  } catch {
    showMessage("저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
    return false;
  } finally {
    saving = false;
    render();
  }
}

input.addEventListener("compositionstart", () => { composing = true; });
input.addEventListener("compositionend", () => { composing = false; });
input.addEventListener("keydown", event => {
  if (event.key === "Enter" && (composing || event.isComposing || event.keyCode === 229)) {
    event.preventDefault();
  }
});
input.addEventListener("input", () => {
  if (input.getAttribute("aria-invalid") === "true") showMessage();
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (!ready || saving || composing) return;
  const text = input.value.trim();
  if (!text) {
    showMessage("할 일을 먼저 입력해 주세요.", true);
    input.focus();
    return;
  }
  const added = await save([...tasks, { id: crypto.randomUUID(), text, done: false }]);
  if (added) input.value = "";
  input.focus();
});

list.addEventListener("change", async event => {
  if (!event.target.matches(".task-check")) return;
  const id = event.target.closest(".task-item").dataset.id;
  const done = event.target.checked;
  await save(tasks.map(task => task.id === id ? { ...task, done } : task));
  const item = [...list.children].find(row => row.dataset.id === id);
  item?.querySelector(".task-check").focus();
});

list.addEventListener("click", async event => {
  const button = event.target.closest(".delete-button");
  if (!button) return;
  const id = button.closest(".task-item").dataset.id;
  const index = tasks.findIndex(task => task.id === id);
  const removed = await save(tasks.filter(task => task.id !== id));
  const next = list.children[Math.min(index, list.children.length - 1)];
  if (removed && next) next.querySelector(".delete-button").focus();
  else input.focus();
});

async function initialize() {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const value = stored[STORAGE_KEY];
    tasks = Array.isArray(value) ? value.filter(task =>
      task && typeof task.id === "string" && typeof task.text === "string" &&
      task.text.trim() && typeof task.done === "boolean"
    ) : [];
    ready = true;
    render();
    input.focus();
  } catch {
    showMessage("목록을 불러오지 못했어요. 창을 다시 열어 주세요.");
  } finally {
    document.querySelector("#loading").hidden = true;
    setBusy();
  }
}

initialize();
