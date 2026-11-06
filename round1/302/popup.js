const $ = (selector) => document.querySelector(selector);

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function renderUpcoming(items) {
  const list = $("#upcoming-list");
  list.replaceChildren();
  for (const item of items.slice(0, 3)) {
    const li = document.createElement("li");
    const date = document.createElement("span");
    date.className = "item-date";
    date.textContent = item.date.slice(5).replace("-", ".");
    const text = document.createElement("span");
    text.className = "item-text";
    text.textContent = item.text;
    li.append(date, text);
    list.append(li);
  }
  $("#empty-upcoming").hidden = items.length > 0;
}

async function load() {
  const data = await chrome.storage.local.get(["hr_people", "hr_jobs", "hr_trainings", "todos"]);
  const people = Array.isArray(data.hr_people) ? data.hr_people : [];
  const jobs = Array.isArray(data.hr_jobs) ? data.hr_jobs : [];
  const trainings = Array.isArray(data.hr_trainings) ? data.hr_trainings : [];
  const todos = Array.isArray(data.todos) ? data.todos : [];
  const today = todayKey();
  $("#people-count").textContent = people.filter((p) => p.status !== "완료" && p.date >= today).length;
  $("#jobs-count").textContent = jobs.filter((j) => j.status !== "완료").length;
  $("#trainings-count").textContent = trainings.filter((t) => t.status !== "완료" && t.date >= today).length;
  $("#todos-count").textContent = todos.filter((t) => !t.completed).length;
  const upcoming = [
    ...people.filter((p) => p.status !== "완료" && p.date >= today).map((p) => ({ date: p.date, text: `${p.eventType || "입사"} · ${p.name || "이름 없음"}` })),
    ...trainings.filter((t) => t.status !== "완료" && t.date >= today).map((t) => ({ date: t.date, text: `교육 · ${t.title || "교육명 없음"}` }))
  ].filter((x) => x.date).sort((a, b) => a.date.localeCompare(b.date));
  renderUpcoming(upcoming);
}

$("#today").textContent = new Intl.DateTimeFormat("ko-KR", { dateStyle: "full" }).format(new Date());
$("#open-dashboard").addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") }));
load().catch(() => { $("#load-error").textContent = "데이터를 불러오지 못했습니다. 다시 열어 주세요."; });
