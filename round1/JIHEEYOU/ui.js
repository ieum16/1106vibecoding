/* View coordination only. Persistent data stays in todos / savedArticles. */
globalThis.UsagiUI = (() => {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  let active = "latest";
  let snapshot = [];
  let selectedKeyword = null;
  const tips = [
    { title: "커밋하기 전, 올라갈 변경만 확인하세요.", detail: "git diff --staged는 스테이징된 변경을 보여줍니다. 의도한 파일만 포함했는지 확인하기 좋습니다.", url: "https://git-scm.com/docs/git-diff" },
    { title: "0과 빈 문자열도 값이라면 ??를 사용하세요.", detail: "JavaScript의 ??는 null 또는 undefined일 때만 기본값을 사용합니다. ||와 달리 0과 빈 문자열을 유지합니다.", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Nullish_coalescing" },
    { title: "API 응답은 HTTP 상태도 확인하세요.", detail: "fetch 결과의 response.ok는 HTTP 상태가 200–299일 때 true입니다. JSON을 읽기 전에 상태를 확인하세요.", url: "https://developer.mozilla.org/en-US/docs/Web/API/Response/ok" },
  ];
  function daily(now = Date.now()) {
    const date = NewsRules.day(now);
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const get = type => parts.find(part => part.type === type).value;
    const index = Math.floor(Date.UTC(+get("year"), +get("month") - 1, +get("day")) / 86400000) % tips.length;
    document.querySelector("#today-date").textContent = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short" }).format(now);
    const tip = tips[index];
    document.querySelector("#tip-title").textContent = tip.title;
    document.querySelector("#tip-detail").textContent = tip.detail;
    document.querySelector("#tip-source").href = tip.url;
    return date;
  }
  function select(view, focus = false) {
    const changed = active !== view;
    active = view;
    tabs.forEach(tab => {
      const current = tab.dataset.view === view;
      tab.setAttribute("aria-selected", String(current));
      tab.tabIndex = current ? 0 : -1;
      if (current && focus) tab.focus();
    });
    document.querySelector("#todo-panel").hidden = view !== "todos";
    document.querySelector("#news-panel").hidden = view === "todos";
    document.querySelector("#news-panel").setAttribute("aria-labelledby", view === "saved" ? "news-saved" : "news-latest");
    document.querySelector("#news-title").textContent = view === "saved" ? "저장한 인사이트" : "오늘의 브리핑";
    document.querySelector("#news-subtitle").textContent = view === "saved" ? "다시 꺼내 볼 기술과 아이디어" : "오늘의 발견을 다음 행동으로 연결해 보세요.";
    document.querySelector(".news-criteria").hidden = view === "saved";
    document.dispatchEvent(new CustomEvent("usagi-tab", { detail: view }));
    if (changed) document.querySelector(".tabs").scrollIntoView({ block: "start", behavior: "auto" });
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => select(tab.dataset.view));
    tab.addEventListener("keydown", event => {
      let next;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = tabs.length - 1;
      if (next !== undefined) { event.preventDefault(); select(tabs[next].dataset.view, true); }
    });
  });
  document.querySelectorAll("[data-go]").forEach(button => button.addEventListener("click", () => select(button.dataset.go, true)));
  function keywords(articles) {
    const counts = new Map();
    articles.forEach(article => NewsRules.tags(article).forEach(tag => counts.set(tag, (counts.get(tag) || 0) + 1)));
    return [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).slice(0, 3).map(([tag]) => tag);
  }
  function renderKeywords() {
    const container = document.querySelector("#tech-keywords");
    container.replaceChildren();
    const available = keywords(snapshot);
    if (selectedKeyword && !available.includes(selectedKeyword)) {
      selectedKeyword = null;
      document.dispatchEvent(new CustomEvent("usagi-keyword", { detail: null }));
    }
    if (!available.length) { container.textContent = "뉴스를 받으면 키워드가 보여요."; return; }
    for (const tag of available) {
      const button = document.createElement("button");
      button.type = "button"; button.className = "keyword"; button.textContent = tag;
      button.setAttribute("aria-pressed", String(selectedKeyword === tag));
      button.addEventListener("click", () => {
        selectedKeyword = selectedKeyword === tag ? null : tag;
        select("latest", true);
        document.dispatchEvent(new CustomEvent("usagi-keyword", { detail: selectedKeyword }));
        renderKeywords();
      });
      container.append(button);
    }
  }
  function news(articles, savedCount, ready) {
    snapshot = articles;
    document.querySelector("#stat-news").textContent = String(articles.length);
    document.querySelector("#stat-saved").textContent = ready ? String(savedCount) : "—";
    document.querySelector("#saved-count").textContent = ready ? String(savedCount) : "—";
    renderKeywords();
  }
  function tasks(todos, ready = true) {
    const completed = todos.filter(todo => todo.completed).length;
    const total = todos.length;
    const value = total ? Math.round(completed / total * 100) : 0;
    document.querySelector("#stat-todos").textContent = ready ? `${completed}/${total}` : "—";
    document.querySelector("#task-progress").value = value;
    document.querySelector("#progress-label").textContent = !ready ? "할 일을 불러오지 못했어요" : total ? `전체 ${total}개 · 완료 ${completed}개 · 남은 ${total - completed}개 · ${value}%` : "할 일 하나로 오늘을 시작해 보세요.";
    document.querySelector("#todo-count").textContent = String(total - completed);
  }
  function highlight(id) {
    select("todos", true);
    const item = document.getElementById(`todo-${id}`);
    if (!item) return;
    document.querySelectorAll(".todo-highlight").forEach(node => node.classList.remove("todo-highlight"));
    item.classList.add("todo-highlight");
    item.tabIndex = -1;
    item.focus({ preventScroll: true });
    item.scrollIntoView({ block: "nearest", behavior: "auto" });
  }
  function notify(message) { document.querySelector("#app-feedback").textContent = message; }
  let currentDay = daily();
  const dailyTimer = setInterval(() => { if (NewsRules.day(Date.now()) !== currentDay) currentDay = daily(); }, 1000);
  window.addEventListener("pagehide", () => clearInterval(dailyTimer), { once: true });
  return { select, news, tasks, highlight, notify, daily, keywords, get active() { return active; } };
})();
