const STORAGE_KEY = "todos";

const form = document.querySelector("#todo-form");
const input = document.querySelector("#todo-input");
const error = document.querySelector("#input-error");
const list = document.querySelector("#todo-list");
const remaining = document.querySelector("#remaining");
const emptyMessage = document.querySelector("#empty-message");

let todos = [];

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

async function loadTodos() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  todos = Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];
  render();
}

async function saveTodos() {
  await chrome.storage.local.set({ [STORAGE_KEY]: todos });
}

function render() {
  list.replaceChildren();

  for (const todo of todos) {
    const item = document.createElement("li");
    item.className = `todo-item${todo.completed ? " completed" : ""}${todo.missed ? " missed" : ""}`;
    item.dataset.todoId = todo.id;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = todo.completed;
    checkbox.setAttribute("aria-label", `${todo.text} 완료 표시`);
    checkbox.title = "완료";
    checkbox.addEventListener("change", async () => {
      todo.completed = checkbox.checked;
      if (todo.completed) todo.missed = false;
      await saveTodos();
      render();
      if (todo.completed) celebrate(todo.id);
    });

    const missedCheckbox = document.createElement("input");
    missedCheckbox.type = "checkbox";
    missedCheckbox.checked = Boolean(todo.missed);
    missedCheckbox.className = "missed-checkbox";
    missedCheckbox.setAttribute("aria-label", `${todo.text} 하지 못함 표시`);
    missedCheckbox.title = "하지 못함";
    missedCheckbox.addEventListener("change", async () => {
      todo.missed = missedCheckbox.checked;
      if (todo.missed) todo.completed = false;
      await saveTodos();
      render();
      if (todo.missed) makeItRain(todo.id);
    });

    const text = document.createElement("span");
    text.className = "todo-text";
    text.textContent = todo.text;

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-button";
    deleteButton.textContent = "×";
    deleteButton.setAttribute("aria-label", `${todo.text} 삭제`);
    deleteButton.addEventListener("click", async () => {
      todos = todos.filter((item) => item.id !== todo.id);
      await saveTodos();
      render();
    });

    item.append(checkbox, missedCheckbox, text, deleteButton);
    list.append(item);
  }

  const remainingCount = todos.filter((todo) => !todo.completed).length;
  remaining.textContent = `남은 할 일 ${remainingCount}개`;
  emptyMessage.hidden = todos.length > 0;
}

function celebrate(todoId) {
  const item = [...list.children].find((element) => element.dataset.todoId === todoId);
  if (!item) return;

  const fireworks = document.createElement("span");
  fireworks.className = "firework-burst";
  fireworks.setAttribute("aria-hidden", "true");

  for (let burstIndex = 0; burstIndex < 5; burstIndex += 1) {
    const burst = document.createElement("span");
    burst.className = "firework-center";
    burst.style.setProperty("--burst-left", `${10 + Math.random() * 80}%`);
    burst.style.setProperty("--burst-top", `${10 + Math.random() * 80}%`);
    burst.style.setProperty("--burst-delay", `${burstIndex * 130}ms`);

    for (let index = 0; index < 12; index += 1) {
      const spark = document.createElement("span");
      const angle = (Math.PI * 2 * index) / 12;
      const distance = 20 + Math.random() * 30;
      spark.className = "firework-spark";
      spark.style.setProperty("--spark-x", `${Math.cos(angle) * distance}px`);
      spark.style.setProperty("--spark-y", `${Math.sin(angle) * distance}px`);
      spark.style.setProperty("--spark-color", ["#f4b942", "#ef6f6c", "#67b7a5", "#8e78d6"][index % 4]);
      burst.append(spark);
    }

    fireworks.append(burst);
  }

  item.append(fireworks);
  window.setTimeout(() => fireworks.remove(), 1500);
}

function makeItRain(todoId) {
  const item = [...list.children].find((element) => element.dataset.todoId === todoId);
  if (!item) return;

  const rain = document.createElement("span");
  rain.className = "rain-burst";
  rain.setAttribute("aria-hidden", "true");

  for (let index = 0; index < 18; index += 1) {
    const drop = document.createElement("span");
    drop.className = "rain-drop";
    drop.style.setProperty("--drop-left", `${Math.random() * 100}%`);
    drop.style.setProperty("--drop-delay", `${Math.random() * 300}ms`);
    drop.style.setProperty("--drop-duration", `${450 + Math.random() * 350}ms`);
    rain.append(drop);
  }

  item.append(rain);
  window.setTimeout(() => rain.remove(), 1000);
}
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = input.value.trim();

  if (!text) {
    error.textContent = "할 일을 입력해 주세요.";
    input.focus();
    return;
  }

  error.textContent = "";
  todos.unshift({ id: makeId(), text, completed: false, missed: false });
  await saveTodos();
  input.value = "";
  render();
  input.focus();
});

input.addEventListener("input", () => {
  if (input.value.trim()) {
    error.textContent = "";
  }
});

loadTodos().catch(() => {
  error.textContent = "목록을 불러오지 못했습니다. 다시 열어 주세요.";
});
