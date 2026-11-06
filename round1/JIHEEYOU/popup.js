const STORAGE_KEY = "todos";

const form = document.querySelector("#todo-form");
const input = document.querySelector("#todo-input");
const error = document.querySelector("#input-error");
const list = document.querySelector("#todo-list");
const remaining = document.querySelector("#remaining");
const emptyMessage = document.querySelector("#empty-message");
const weatherStatus = document.querySelector("#weather-status");
const weatherIcon = document.querySelector("#weather-icon");
const weatherBadge = document.querySelector(".weather-badge");

function weatherSymbol(code) {
  if (code === 0 || code === 1) return "☀️";
  if (code === 2) return "🌤️";
  if (code === 3) return "☁️";
  if ([45, 48].includes(code)) return "🌫️";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "❄️";
  if ([95, 96, 97, 99].includes(code)) return "⛈️";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "🌧️";
  return "🌡️";
}

function describeWeather(code) {
  if (code === 0) return "맑음";
  if (code === 1) return "대체로 맑음";
  if (code === 2) return "구름 조금";
  if (code === 3) return "흐림";
  if ([45, 48].includes(code)) return "안개";
  if ([51, 53, 55].includes(code)) return "이슬비";
  if ([56, 57].includes(code)) return "어는 이슬비";
  if ([61, 63, 65].includes(code)) return "비";
  if ([66, 67].includes(code)) return "어는 비";
  if ([71, 73, 75, 77].includes(code)) return "눈";
  if ([80, 81, 82].includes(code)) return "소나기";
  if ([85, 86].includes(code)) return "눈 소나기";
  if ([95, 97].includes(code)) return "뇌우";
  if ([96, 99].includes(code)) return "우박을 동반한 뇌우";
  return "날씨 정보 없음";
}

async function loadWeather() {
  weatherStatus.textContent = "불러오는 중…";
  weatherIcon.textContent = "◌";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.search = new URLSearchParams({
      latitude: "37.5665",
      longitude: "126.9780",
      current: "temperature_2m,weather_code",
      temperature_unit: "celsius",
      timezone: "Asia/Seoul",
      forecast_days: "1",
    }).toString();

    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error("Weather request failed");

    const data = await response.json();
    const temperature = data.current?.temperature_2m;
    const code = data.current?.weather_code;
    if (!Number.isFinite(temperature) || !Number.isInteger(code)) {
      throw new Error("Invalid weather data");
    }

    const description = describeWeather(code);
    weatherIcon.textContent = weatherSymbol(code);
    weatherStatus.textContent = `${temperature.toFixed(1)}°C`;
    weatherBadge.title = `서울 · ${description} · 현재 ${temperature.toFixed(1)}°C · 제공: Open-Meteo`;
    weatherBadge.setAttribute("aria-label", weatherBadge.title);
  } catch {
    weatherIcon.textContent = "☁️";
    weatherStatus.textContent = "날씨를 가져오지 못했어요";
    weatherBadge.title = "서울 · 날씨를 가져오지 못했어요 · 제공: Open-Meteo";
    weatherBadge.setAttribute("aria-label", weatherBadge.title);
  } finally {
    clearTimeout(timeoutId);
  }
}

let todos = [];
let todosLoaded = false;
let writeQueue = Promise.resolve();

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}
function validTodo(todo) { return todo && typeof todo.text === "string" && todo.id != null; }
function canonicalUrl(value) {
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("Invalid article URL");
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) if (key.startsWith("utm_")) url.searchParams.delete(key);
  return url.href;
}
async function loadTodos() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  if (stored[STORAGE_KEY] !== undefined && !Array.isArray(stored[STORAGE_KEY])) throw new Error("Invalid todo storage");
  todos = stored[STORAGE_KEY] || [];
  todosLoaded = true;
  render();
}
function updateTodos(change) {
  const operation = writeQueue.then(async () => {
    await todosReady;
    if (!todosLoaded) throw new Error("Todo storage unavailable");
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    if (stored[STORAGE_KEY] !== undefined && !Array.isArray(stored[STORAGE_KEY])) throw new Error("Invalid todo storage");
    const current = stored[STORAGE_KEY] || [];
    const next = change(current);
    if (next !== current) await chrome.storage.local.set({ [STORAGE_KEY]: next });
    todos = next;
    render();
  });
  writeQueue = operation.catch(() => {});
  return operation;
}
async function addArticleTodo(article) {
  const url = canonicalUrl(article.url);
  const idea = article.idea || null;
  let existingId, added = false;
  await updateTodos(current => {
    const existing = current.find(todo => {
      if (!validTodo(todo) || !todo.articleUrl) return false;
      try { return canonicalUrl(todo.articleUrl) === url && (!todo.ideaId || todo.ideaId === idea?.id); }
      catch { return false; }
    });
    if (existing) { existingId = existing.id; return current; }
    const id = makeId();
    existingId = id; added = true;
    return [{ id, text: (article.taskLabel || "기사 검토") + ": " + article.title,
      completed: false, articleId: article.id || url, articleUrl: url,
      articleTitle: article.title, ideaId: idea?.id || "review-v1", idea,
      createdAt: Date.now() }, ...current];
  });
  UsagiUI.highlight(existingId);
  UsagiUI.notify(added ? "내 할 일에 추가했어요. 기사와 활용 아이디어도 함께 저장했어요." : "이미 등록한 활용 아이디어예요. 기존 할 일을 표시했어요.");
  return added;
}
function showTaskError() {
  error.textContent = "변경 내용을 저장하지 못했어요. 다시 시도해 주세요.";
  UsagiUI.notify("할 일을 저장하지 못했어요. 기존 데이터는 유지됩니다.");
  render();
}
function render() {
  list.replaceChildren();
  for (const todo of todos.filter(validTodo)) {
    const item = document.createElement("li");
    item.className = `todo-item${todo.completed ? " completed" : ""}`;
    item.id = `todo-${todo.id}`;
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox"; checkbox.checked = Boolean(todo.completed);
    checkbox.setAttribute("aria-label", `${todo.text} 완료 표시`);
    checkbox.addEventListener("change", async () => {
      checkbox.disabled = true;
      const completed = checkbox.checked;
      try {
        await updateTodos(current => current.map(value => value?.id === todo.id ? { ...value, completed } : value));
        error.textContent = "";
        UsagiUI.notify(completed ? "할 일 완료! 오늘도 한 걸음 나아갔어요." : "다시 진행할 할 일로 바꿨어요.");
      } catch { showTaskError(); }
    });
    const text = document.createElement("div");
    text.className = "todo-text";
    const title = document.createElement("span"); title.className = "todo-title"; title.textContent = todo.text;
    text.append(title);
    if (todo.articleUrl) {
      const source = document.createElement("span"); source.className = "todo-source"; source.textContent = "↗ 기술 브리핑에서 가져온 할 일"; text.append(source);
      try {
        const link = document.createElement("a"); link.className = "todo-article-link";
        link.href = canonicalUrl(todo.articleUrl); link.target = "_blank"; link.rel = "noopener noreferrer";
        link.textContent = todo.articleTitle || "기사 다시 보기 ↗"; text.append(link);
      } catch { /* Keep the task; never render an unsafe URL. */ }
      if (todo.idea && typeof todo.idea.label === "string") {
        const details = document.createElement("details"); details.className = "todo-idea";
        const summary = document.createElement("summary"); summary.textContent = "활용 아이디어 다시 보기";
        const label = document.createElement("p"); label.textContent = todo.idea.label;
        const steps = document.createElement("ol");
        for (const step of Array.isArray(todo.idea.steps) ? todo.idea.steps : []) {
          const li = document.createElement("li"); li.textContent = String(step); steps.append(li);
        }
        details.append(summary, label, steps); text.append(details);
      }
    }
    const deleteButton = document.createElement("button"); deleteButton.type = "button";
    deleteButton.className = "delete-button"; deleteButton.textContent = "×";
    deleteButton.setAttribute("aria-label", `${todo.text} 삭제`);
    deleteButton.addEventListener("click", async () => {
      deleteButton.disabled = true;
      try { await updateTodos(current => current.filter(value => value?.id !== todo.id)); error.textContent = ""; UsagiUI.notify("할 일을 삭제했어요."); }
      catch { showTaskError(); }
    });
    item.append(checkbox, text, deleteButton); list.append(item);
  }
  const valid = todos.filter(validTodo);
  remaining.textContent = `남은 할 일 ${valid.filter(todo => !todo.completed).length}개`;
  emptyMessage.hidden = valid.length > 0 || !todosLoaded;
  form.querySelector("button").disabled = !todosLoaded;
  UsagiUI.tasks(valid, todosLoaded);
}
form.addEventListener("submit", async event => {
  event.preventDefault();
  const value = input.value.trim();
  if (!value) { error.textContent = "할 일을 입력해 주세요."; input.focus(); return; }
  const button = form.querySelector("button");
  if (button.disabled) return;
  button.disabled = true;
  try {
    await updateTodos(current => [{ id: makeId(), text: value, completed: false, createdAt: Date.now() }, ...current]);
    if (input.value.trim() === value) input.value = "";
    error.textContent = ""; UsagiUI.notify("새 할 일을 추가했어요."); input.focus();
  } catch { showTaskError(); }
  finally { button.disabled = !todosLoaded; }
});
input.addEventListener("input", () => { if (input.value.trim()) error.textContent = ""; });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[STORAGE_KEY] || !Array.isArray(changes[STORAGE_KEY].newValue)) return;
  todos = changes[STORAGE_KEY].newValue;
  todosLoaded = true; render();
});
loadWeather();
const todosReady = loadTodos().catch(() => {
  error.textContent = "목록을 불러오지 못했어요. 팝업을 다시 열어 주세요.";
  render();
});
