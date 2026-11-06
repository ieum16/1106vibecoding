const STORAGE_KEY = "todos";

const zodiacSigns = [
  "양자리", "황소자리", "쌍둥이자리", "게자리", "사자자리", "처녀자리",
  "천칭자리", "전갈자리", "사수자리", "염소자리", "물병자리", "물고기자리",
];
const zodiacIndex = Math.floor(Math.random() * zodiacSigns.length);
document.querySelector("#horoscope-sign").textContent = zodiacSigns[zodiacIndex];

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

function burstConfetti(checkbox) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const { left, top, width, height } = checkbox.getBoundingClientRect();
  const burst = document.createElement("div");
  burst.className = "confetti-burst";
  burst.setAttribute("aria-hidden", "true");
  burst.style.left = `${left + width / 2}px`;
  burst.style.top = `${top + height / 2}px`;
  document.body.append(burst);

  const colors = ["#689f3f", "#ffca45", "#f06a8a", "#589ce8", "#9464db"];
  const particleCount = 18;
  for (let index = 0; index < particleCount; index++) {
    const particle = document.createElement("span");
    particle.style.backgroundColor = colors[index % colors.length];
    burst.append(particle);

    const angle = (index / particleCount) * 2 * Math.PI;
    const distance = 32 + Math.random() * 45;
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;
    particle.animate([
      { transform: "translate(0, 0) rotate(0deg)", opacity: 1 },
      { transform: `translate(${x}px, ${y}px) rotate(180deg)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${x * 1.2}px, ${y + 48}px) rotate(360deg)`, opacity: 0 },
    ], 650);
  }

  setTimeout(() => burst.remove(), 650);
}

function render() {
  list.replaceChildren();

  for (const todo of todos) {
    const item = document.createElement("li");
    item.className = `todo-item${todo.completed ? " completed" : ""}`;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = todo.completed;
    checkbox.setAttribute("aria-label", `${todo.text} 완료 표시`);
    checkbox.addEventListener("change", async () => {
      todo.completed = checkbox.checked;
      if (todo.completed) burstConfetti(checkbox);
      await saveTodos();
      render();
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

    item.append(checkbox, text, deleteButton);
    list.append(item);
  }

  const remainingCount = todos.filter((todo) => !todo.completed).length;
  remaining.textContent = `남은 할 일 ${remainingCount}개`;
  emptyMessage.hidden = todos.length > 0;
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
  todos.unshift({ id: makeId(), text, completed: false });
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
