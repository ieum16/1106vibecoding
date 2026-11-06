const STORAGE_KEY = "todos";

const form = document.querySelector("#todo-form");
const input = document.querySelector("#todo-input");
const error = document.querySelector("#input-error");
const list = document.querySelector("#todo-list");
const remaining = document.querySelector("#remaining");
const emptyMessage = document.querySelector("#empty-message");
const weatherStatus = document.querySelector("#weather-status");

// 수원 중심 좌표. Open-Meteo의 WMO 날씨 코드를 한국어로 표시합니다.
const WEATHER_DESCRIPTIONS = {
  0: "맑음", 1: "대체로 맑음", 2: "구름 조금", 3: "흐림",
  45: "안개", 48: "착빙 안개",
  51: "약한 이슬비", 53: "이슬비", 55: "강한 이슬비",
  56: "약한 어는 이슬비", 57: "강한 어는 이슬비",
  61: "약한 비", 63: "비", 65: "강한 비",
  66: "약한 어는 비", 67: "강한 어는 비",
  71: "약한 눈", 73: "눈", 75: "강한 눈", 77: "싸락눈",
  80: "약한 소나기", 81: "소나기", 82: "강한 소나기",
  85: "약한 눈 소나기", 86: "강한 눈 소나기",
  95: "뇌우", 96: "우박을 동반한 뇌우", 97: "강한 뇌우", 99: "강한 우박을 동반한 뇌우"
};

async function loadWeather() {
  weatherStatus.textContent = "불러오는 중…";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.search = new URLSearchParams({
      latitude: "37.2636",
      longitude: "127.0286",
      current: "temperature_2m,weather_code",
      temperature_unit: "celsius",
      timezone: "Asia/Seoul",
      forecast_days: "1"
    }).toString();

    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error("Weather request failed");

    const data = await response.json();
    const temperature = data.current?.temperature_2m;
    const description = WEATHER_DESCRIPTIONS[data.current?.weather_code];
    if (!Number.isFinite(temperature) || !description) {
      throw new Error("Invalid weather data");
    }

    weatherStatus.textContent = `수원 오늘 · 현재 ${temperature.toFixed(1)}°C · ${description}`;
  } catch {
    weatherStatus.textContent = "날씨를 가져오지 못했어요";
  } finally {
    clearTimeout(timeout);
  }
}

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

loadWeather();
