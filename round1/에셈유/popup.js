const form = document.querySelector('#todo-form');
const input = document.querySelector('#todo-input');
const list = document.querySelector('#todo-list');
const empty = document.querySelector('#empty');
const remaining = document.querySelector('#remaining');
const message = document.querySelector('#message');
let todos = [];
let pendingSave = Promise.resolve();

function render() {
  list.replaceChildren();
  empty.hidden = todos.length > 0;
  remaining.textContent = `남은 일 ${todos.filter(todo => !todo.done).length}개`;
  todos.forEach(todo => {
    const item = document.createElement('li');
    item.classList.toggle('done', todo.done);
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = todo.done;
    checkbox.id = `todo-${todo.id}`;
    checkbox.addEventListener('change', () => {
      todo.done = checkbox.checked;
      save();
    });
    const label = document.createElement('label');
    label.htmlFor = checkbox.id;
    label.textContent = todo.text;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'delete';
    remove.textContent = '삭제';
    remove.setAttribute('aria-label', `${todo.text} 삭제`);
    remove.addEventListener('click', () => {
      todos = todos.filter(entry => entry.id !== todo.id);
      save();
    });
    item.append(checkbox, label, remove);
    list.append(item);
  });
}

function save() {
  render();
  const snapshot = structuredClone(todos);
  pendingSave = pendingSave.catch(() => {}).then(() => chrome.storage.local.set({ todos: snapshot }));
  pendingSave.then(() => {
    message.textContent = '';
  }).catch(() => {
    message.textContent = '저장하지 못했어요. 다시 시도해 주세요.';
  });
}

form.addEventListener('submit', event => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) {
    message.textContent = '할 일을 입력해 주세요.';
    input.focus();
    return;
  }
  todos.push({ id: crypto.randomUUID(), text, done: false });
  input.value = '';
  save();
  input.focus();
});

chrome.storage.local.get({ todos: [] }).then(result => {
  todos = result.todos;
  render();
  input.disabled = false;
  form.querySelector('button').disabled = false;
}).catch(() => {
  message.textContent = '목록을 불러오지 못했어요. 팝업을 다시 열어 주세요.';
});
