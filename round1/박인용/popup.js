"use strict";

const STORAGE_KEY = "todayTodos";
const form = document.querySelector("#todo-form");
const input = document.querySelector("#todo-input");
const addButton = document.querySelector("#add-button");
const list = document.querySelector("#todo-list");
const remaining = document.querySelector("#remaining");
const emptyState = document.querySelector("#empty-state");
const message = document.querySelector("#message");
const saveStatus = document.querySelector("#save-status");
let todos = [];
let busy = false;

function render() {
  list.replaceChildren();
  const count = todos.filter(todo => !todo.completed).length;
  remaining.textContent = `남은 할 일 ${count}개`;
  emptyState.hidden = todos.length > 0;

  for (const todo of todos) {
    const item = document.createElement("li");
    item.className = `todo-item${todo.completed ? " completed" : ""}`;
    const label = document.createElement("label");
    label.className = "todo-label";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = todo.completed;
    checkbox.disabled = busy;
    checkbox.addEventListener("change", async () => {
      const saved = await commit(todos.map(entry => entry.id === todo.id
        ? { ...entry, completed: checkbox.checked } : entry));
      if (!saved) checkbox.checked = todo.completed;
    });
    const text = document.createElement("span");
    text.className = "todo-text";
    text.textContent = todo.text;
    label.append(checkbox, text);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete-button";
    remove.textContent = "삭제";
    remove.disabled = busy;
    remove.setAttribute("aria-label", `${todo.text} 삭제`);
    remove.addEventListener("click", () => commit(todos.filter(entry => entry.id !== todo.id)));
    item.append(label, remove);
    list.append(item);
  }
}

async function commit(nextTodos) {
  if (busy) return false;
  busy = true;
  addButton.disabled = true;
  list.querySelectorAll("input, button").forEach(control => { control.disabled = true; });
  message.textContent = "";
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: nextTodos });
    todos = nextTodos;
    saveStatus.textContent = "목록은 이 브라우저에 자동 저장됩니다.";
    return true;
  } catch (error) {
    message.textContent = "저장하지 못했어요. 다시 시도해 주세요.";
    saveStatus.textContent = "변경 사항이 저장되지 않았습니다.";
    return false;
  } finally {
    busy = false;
    addButton.disabled = false;
    render();
  }
}

input.addEventListener("input", () => {
  input.setCustomValidity("");
  message.textContent = "";
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (busy) return;
  const text = input.value.trim();
  if (!text) {
    message.textContent = "빈칸은 추가할 수 없어요. 할 일을 적어 주세요.";
    input.setCustomValidity("할 일을 적어 주세요.");
    input.reportValidity();
    input.focus();
    return;
  }
  input.disabled = true;
  const saved = await commit([...todos, { id: crypto.randomUUID(), text, completed: false }]);
  if (saved) input.value = "";
  input.disabled = false;
  input.focus();
});

async function initialize() {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    todos = Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY].filter(todo =>
      todo && typeof todo.id === "string" && typeof todo.text === "string" &&
      todo.text.trim() && typeof todo.completed === "boolean") : [];
    render();
    input.disabled = false;
    addButton.disabled = false;
    input.focus();
  } catch (error) {
    remaining.textContent = "목록을 불러오지 못했어요";
    message.textContent = "창을 닫았다가 다시 열어 주세요.";
  }
}

initialize();
