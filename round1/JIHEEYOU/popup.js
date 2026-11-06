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

loadWeather();

loadTodos().catch(() => {
  error.textContent = "목록을 불러오지 못했습니다. 다시 열어 주세요.";
});
