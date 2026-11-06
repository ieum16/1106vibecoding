const STORAGE_KEY = "todos";

// 날씨: Open-Meteo (가입·키 없이 쓰는 무료 API) · 서울 시청 좌표
const WEATHER_URL =
  "https://api.open-meteo.com/v1/forecast?latitude=37.5665&longitude=126.978" +
  "&current=temperature_2m,weather_code&timezone=Asia%2FSeoul";

const form = document.querySelector("#todo-form");
const input = document.querySelector("#todo-input");
const error = document.querySelector("#input-error");
const list = document.querySelector("#todo-list");
const remaining = document.querySelector("#remaining");
const emptyMessage = document.querySelector("#empty-message");
const weatherIcon = document.querySelector("#weather-icon");
const weatherText = document.querySelector("#weather-text");

let todos = [];

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

// 같은 할 일인지 비교할 때 쓰는 모양: 앞뒤·중간 띄어쓰기와 영문 대소문자 차이는 무시
function normalize(text) {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
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
  const text = input.value.replace(/\s+/g, " ").trim();

  if (!text) {
    error.textContent = "할 일을 입력해 주세요.";
    input.focus();
    return;
  }

  // 고친 점 1: 같은 할 일이 이미 목록에 있으면 추가하지 않음
  if (todos.some((todo) => normalize(todo.text) === normalize(text))) {
    error.textContent = "이미 목록에 있는 할 일이에요.";
    input.select();
    return;
  }

  error.textContent = "";
  todos.unshift({ id: makeId(), text, completed: false });
  // 저장을 기다리기 전에 입력칸을 비워서, 추가 버튼을 연타해도 두 번 들어가지 않게 함
  input.value = "";
  render();
  input.focus();
  await saveTodos();
});

input.addEventListener("input", () => {
  if (input.value.trim()) {
    error.textContent = "";
  }
});

// 날씨 코드(WMO) → 쉬운 말과 그림
function describeWeather(code) {
  if (code === 0) return ["☀️", "맑음"];
  if (code === 1) return ["🌤️", "대체로 맑음"];
  if (code === 2) return ["⛅", "구름 조금"];
  if (code === 3) return ["☁️", "흐림"];
  if (code === 45 || code === 48) return ["🌫️", "안개"];
  if (code >= 51 && code <= 57) return ["🌦️", "이슬비"];
  if (code >= 61 && code <= 67) return ["🌧️", "비"];
  if (code >= 71 && code <= 77) return ["❄️", "눈"];
  if (code >= 80 && code <= 82) return ["🌧️", "소나기"];
  if (code === 85 || code === 86) return ["🌨️", "눈 소나기"];
  if (code >= 95) return ["⛈️", "뇌우"];
  return ["🌡️", "날씨 정보"];
}

// 고친 점 3: 할 일 목록 위에 서울 오늘 날씨 표시
async function loadWeather() {
  weatherIcon.textContent = "⏳";
  weatherText.textContent = "불러오는 중…";

  try {
    const response = await fetch(WEATHER_URL, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const temperature = Math.round(data.current.temperature_2m);
    const [icon, label] = describeWeather(data.current.weather_code);
    weatherIcon.textContent = icon;
    weatherText.textContent = `서울 ${label} · ${temperature}°C`;
  } catch {
    weatherIcon.textContent = "⚠️";
    weatherText.textContent = "날씨를 가져오지 못했어요";
  }
}

loadTodos().catch(() => {
  error.textContent = "목록을 불러오지 못했습니다. 다시 열어 주세요.";
});

loadWeather();
