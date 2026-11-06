const STORAGE_KEY = "todos";

const form = document.querySelector("#todo-form");
const input = document.querySelector("#todo-input");
const error = document.querySelector("#input-error");
const list = document.querySelector("#todo-list");
const remaining = document.querySelector("#remaining");
const emptyMessage = document.querySelector("#empty-message");

let todos = [];
let filter = 'all';
document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
  filter = button.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
  render();
}));

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

  const visible = todos.filter(todo => filter === 'all' || (filter === 'completed' ? todo.completed : !todo.completed));
  for (const todo of visible) {
    const item = document.createElement("li");
    item.className = `todo-item${todo.completed ? " completed" : ""}`;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = todo.completed;
    checkbox.setAttribute("aria-label", `${todo.text} 완료 표시`);
    checkbox.addEventListener("change", async () => {
      todo.completed = checkbox.checked;
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

    const content = document.createElement('div'); content.className = 'todo-content';
    const meta = document.createElement('div'); meta.className = 'todo-meta';
    const priority = document.createElement('span');
    const level = ['high','normal','low'].includes(todo.priority) ? todo.priority : 'normal';
    priority.className = 'priority ' + level;
    priority.textContent = {high:'높음',normal:'보통',low:'낮음'}[level];meta.append(priority);
    if (todo.due) {
      const date = document.createElement('span');
      const now = new Date(); const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
      const overdue = !todo.completed && todo.due < today;
      date.textContent = `${todo.due}${overdue ? ' · 기한 지남' : ''}`;
      if(overdue) date.className = 'overdue';meta.append(date);
    }
    content.append(text,meta);item.append(checkbox, content, deleteButton);
    list.append(item);
  }

  const remainingCount = todos.filter((todo) => !todo.completed).length;
  remaining.textContent = `남은 할 일 ${remainingCount}개`;
  emptyMessage.hidden = visible.length > 0;
  emptyMessage.textContent = todos.length === 0 ? '할 일을 추가해 보세요.' : '해당하는 할 일이 없습니다.';
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
  const next = { id: makeId(), text, completed: false, due:document.querySelector('#due').value, priority:document.querySelector('#priority').value };
  todos.unshift(next);
  try { await saveTodos(); } catch { todos = todos.filter(t => t !== next); error.textContent = '저장하지 못했습니다. 다시 시도해 주세요.'; return; }
  document.querySelector('#due').value = '';document.querySelector('#priority').value = 'normal';
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
