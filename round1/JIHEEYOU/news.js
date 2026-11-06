(() => {
  const STORAGE_KEY = "savedArticles";
  const FEED_URL = "https://feeds.feedburner.com/geeknews-feed";
  const FEED_ORIGIN = "https://feeds.feedburner.com/*";
  const list = document.querySelector("#news-list");
  const status = document.querySelector("#news-status");
  const storageError = document.querySelector("#news-storage-error");
  const refresh = document.querySelector("#news-refresh");
  const latestTab = document.querySelector("#news-latest");
  const savedTab = document.querySelector("#news-saved");
  const permissionButton = document.querySelector("#news-permission");
  const restartButton = document.querySelector("#news-restart");
  let articles = [];
  let saved = [];
  let view = "latest";
  let loading = false;
  let loadFailed = false;
  let permissionMissing = false;
  let permissionMessage = "";
  let requestingPermission = false;
  let storageReady = false;
  let saving = false;
  let lastUpdated = null;
  let keyword = null;
  const validSaved = () => saved.filter(article => article && typeof article.title === "string" && safeUrl(article.url) && Number.isFinite(article.publishedAt));
  const checkedTime = () => lastUpdated ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(lastUpdated) : "";

  function safeUrl(value) {
    try {
      const url = new URL(value);
      if (!["https:", "http:"].includes(url.protocol)) return null;
      url.hash = "";
      for (const key of [...url.searchParams.keys()]) {
        if (key.startsWith("utm_")) url.searchParams.delete(key);
      }
      return url.href;
    } catch { return null; }
  }

  function plainText(value) {
    const doc = new DOMParser().parseFromString(value, "text/html");
    doc.querySelectorAll("script, style").forEach(node => node.remove());
    return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
  }

  function parseFeed(xml) {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.querySelector("parsererror")) throw new Error("Invalid RSS");
    if (!doc.querySelector("feed, rss")) throw new Error("Not a news feed");
    const seenLinks = new Set();
    const seenTitles = new Set();
    return [...doc.querySelectorAll("entry, item")].map(entry => {
      const text = selector => entry.querySelector(selector)?.textContent?.trim() || "";
      const link = entry.querySelector('link[rel="alternate"]') || entry.querySelector("link");
      const url = safeUrl(link?.getAttribute("href") || link?.textContent || "");
      const title = plainText(text("title"));
      const publishedAt = Date.parse(text("published") || text("pubDate") || text("updated"));
      const description = plainText(text("summary") || text("description") || text("content"));
      return { title, url, publishedAt, source: "GeekNews", description: description.slice(0, 4000) };
    }).filter(article => article.url && article.title && Number.isFinite(article.publishedAt))
      .filter(article => NewsRules.isToday(article.publishedAt) && NewsRules.classify(article.title, article.description))
      .sort((a, b) => b.publishedAt - a.publishedAt)
      .filter(article => {
        const titleKey = article.title.replace(/\s+/g, "").toLowerCase();
        if (seenLinks.has(article.url) || seenTitles.has(titleKey)) return false;
        seenLinks.add(article.url);
        seenTitles.add(titleKey);
        return true;
      }).slice(0, 5);
  }

  function renderNews() {
    articles = articles.filter(article => NewsRules.isToday(article.publishedAt));
    UsagiUI.news(articles, validSaved().length, storageReady);
    refresh.disabled = loading;
    permissionButton.hidden = !permissionMissing;
    permissionButton.disabled = requestingPermission;
    if (view === "saved") {
      status.textContent = !storageReady ? "저장한 기사를 불러오지 못했어요" : validSaved().length ? `저장한 기사 ${validSaved().length}개 · 날짜와 관계없이 보관합니다` : "아직 저장한 기사가 없어요. ☆ 저장을 눌러 보세요.";
    } else {
      status.textContent = loading ? "뉴스를 불러오는 중…" : permissionMissing
        ? permissionMessage || "뉴스 사이트 접근이 허용되지 않았어요. ‘뉴스 접근 허용’을 눌러 주세요."
        : loadFailed
        ? (articles.length ? "새 뉴스를 가져오지 못했어요. 이전에 불러온 기사를 표시합니다." : "뉴스를 가져오지 못했어요. 새로고침을 눌러 주세요.")
        : articles.length ? `오늘의 신기술 ${articles.length}개 · 최신순 · ${checkedTime()} 확인`
        : `오늘 조건에 맞는 신기술 기사가 아직 없어요. · ${checkedTime()} 확인`;
    }
    const openCards = new Set([...list.querySelectorAll(".news-application[open]")].map(node => node.dataset.url));
    list.replaceChildren();
    const visible = view === "saved" ? validSaved() : articles.filter(article => !keyword || NewsRules.tags(article).includes(keyword));
    if (view === "latest" && keyword && !loading && !loadFailed) status.textContent += ` · ${keyword}: ${visible.length}개 (키워드를 다시 누르면 해제)`;
    list.setAttribute("aria-busy", String(loading));
    document.querySelector("#news-empty").hidden = visible.length > 0 || (view === "latest" && loading);
    for (const article of visible) {
      const item = document.createElement("li");
      item.className = "news-card";
      const title = document.createElement("a");
      title.className = "news-title";
      title.textContent = article.title;
      title.href = safeUrl(article.url);
      title.target = "_blank";
      title.rel = "noopener noreferrer";
      const meta = document.createElement("p");
      meta.className = "news-meta";
      meta.textContent = `${article.source} · ${new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(article.publishedAt)}`;
      const description = document.createElement("p");
      description.className = "news-description";
      description.textContent = article.description ? article.description.slice(0, 160) + (article.description.length > 160 ? "…" : "") : "제목을 눌러 원문을 확인해 보세요.";
      const plan = NewsRules.plan(article);
      const application = document.createElement("details");
      application.className = "news-application";
      application.dataset.url = article.url;
      application.open = openCards.has(article.url);
      const heading = document.createElement("summary");
      heading.textContent = plan ? "활용 아이디어 보기" : "이전 저장 기사 · 활용 아이디어 없음";
      application.append(heading);
      if (plan) {
        for (const [label, content] of [["이 기술이 중요한 이유", plan.why], ["활용 목적 · " + plan.label, plan.purpose], ["적용 환경·직무", plan.environment]]) {
          const h = document.createElement("h3"); h.textContent = label;
          const p = document.createElement("p"); p.textContent = content;
          application.append(h, p);
        }
        const stepTitle = document.createElement("h3"); stepTitle.textContent = "업무에 연결하는 3단계"; application.append(stepTitle);
        const steps = document.createElement("ol");
        for (const step of plan.steps) {
          const li = document.createElement("li"); li.textContent = step; steps.append(li);
        }
        const note = document.createElement("p"); note.className = "idea-note"; note.textContent = "제목·분야 기반 일반 제안 · AI 원문 분석 아님. " + plan.note;
        application.append(steps, note);
      }
      const button = document.createElement("button");
      button.type = "button";
      button.className = "news-save";
      const isSaved = validSaved().some(value => safeUrl(value.url) === safeUrl(article.url));
      button.textContent = isSaved ? "★ 저장 해제" : "☆ 저장";
      button.setAttribute("aria-label", `${article.title} ${isSaved ? "저장 해제" : "저장"}`);
      button.setAttribute("aria-pressed", String(isSaved));
      button.disabled = !storageReady || saving;
      button.addEventListener("click", () => toggleSaved(article));
      const todoButton = document.createElement("button");
      todoButton.type = "button";
      todoButton.className = "news-save news-add-todo";
      todoButton.textContent = "+ 내 할 일에 추가";
      todoButton.setAttribute("aria-label", `${article.title} 할 일로 추가`);
      todoButton.addEventListener("click", async () => {
        todoButton.disabled = true;
        try {
          const added = await addArticleTodo({ ...article, taskLabel: plan?.label || "기사 검토", idea: plan });
          todoButton.textContent = added ? "✓ 할 일에 추가됨" : "✓ 이미 추가한 기사";
          status.textContent = added ? "할 일에 추가했어요. 기사 링크도 함께 저장했어요." : "이미 추가한 기사예요. 기존 할 일을 확인해 주세요.";
        } catch {
          status.textContent = "할 일에 추가하지 못했어요. 잠시 후 다시 시도해 주세요.";
          UsagiUI.notify("할 일에 추가하지 못했어요. 기존 데이터는 유지됩니다.");
        } finally { todoButton.disabled = false; }
      });
      const top = document.createElement("div"); top.className = "card-top";
      const category = document.createElement("span"); category.className = "category";
      category.dataset.category = plan?.category || "tool"; category.textContent = plan?.categoryLabel || "저장한 기사";
      top.append(category, button);
      const actions = document.createElement("div"); actions.className = "card-actions";
      const original = document.createElement("a"); original.textContent = "원문 보기 ↗"; original.href = title.href; original.target = "_blank"; original.rel = "noopener noreferrer";
      actions.append(original);
      application.append(todoButton);
      item.append(top, title, meta, description, actions, application);
      list.append(item);
    }
  }

  async function toggleSaved(article) {
    if (!storageReady || saving) return;
    saving = true;
    storageError.hidden = true;
    renderNews();
    try {
      const stored = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY];
      if (stored !== undefined && !Array.isArray(stored)) throw new Error("Invalid saved storage");
      const current = stored || [];
      const exists = current.some(value => value && safeUrl(value.url) === safeUrl(article.url));
      const next = exists ? current.filter(value => !value || safeUrl(value.url) !== safeUrl(article.url)) : [{ ...article, savedAt: Date.now() }, ...current];
      await chrome.storage.local.set({ [STORAGE_KEY]: next });
      saved = next;
      UsagiUI.notify(exists ? "스크랩을 해제했어요." : "인사이트를 저장했어요. 저장한 기사 탭에서 다시 볼 수 있어요.");
    } catch {
      storageError.textContent = "저장 상태를 변경하지 못했어요. 다시 시도해 주세요.";
      storageError.hidden = false;
    } finally {
      saving = false;
      renderNews();
    }
  }

  async function loadNews() {
    if (loading) return;
    loading = true;
    loadFailed = false;
    permissionMissing = false;
    permissionMessage = "";
    restartButton.hidden = true;
    renderNews();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const granted = await chrome.permissions.contains({ origins: [FEED_ORIGIN] });
      if (!granted) {
        permissionMissing = true;
        throw new Error("RSS host permission is not granted. Reload the extension at chrome://extensions.");
      }
      const response = await fetch(FEED_URL, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error(`RSS request failed: HTTP ${response.status}`);
      const next = parseFeed(await response.text());
      articles = next;
      lastUpdated = Date.now();
    } catch (error) {
      loadFailed = true;
      console.warn("IT news request failed:", error);
    } finally {
      clearTimeout(timer);
      loading = false;
      renderNews();
    }
  }

  async function initializeNews() {
    try {
      const stored = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY];
      if (stored !== undefined && !Array.isArray(stored)) throw new Error("Invalid saved storage");
      saved = stored || [];
      storageReady = true;
    } catch {
      storageError.textContent = "저장한 기사를 불러오지 못했어요. 팝업을 다시 열어 주세요.";
      storageError.hidden = false;
    }
    loadNews();
  }

  document.addEventListener("usagi-tab", event => {
    if (event.detail === "todos") return;
    view = event.detail; renderNews();
  });
  document.addEventListener("usagi-keyword", event => { keyword = event.detail; renderNews(); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && Array.isArray(changes[STORAGE_KEY]?.newValue)) {
      saved = changes[STORAGE_KEY].newValue; storageReady = true; renderNews();
    }
  });
  permissionButton.addEventListener("click", async () => {
    if (requestingPermission) return;
    const manifest = chrome.runtime.getManifest();
    const declared = [...(manifest.host_permissions || []), ...(manifest.optional_host_permissions || [])];
    if (!declared.includes(FEED_ORIGIN)) {
      permissionMessage = "크롬이 이전 설정을 사용하고 있어요. ‘확장 다시 시작’을 누른 뒤 팝업을 다시 열어 주세요.";
      restartButton.hidden = false;
      renderNews();
      return;
    }
    requestingPermission = true;
    try {
      // Request directly from the click so Chrome retains the user gesture.
      const result = chrome.permissions.request({ origins: [FEED_ORIGIN] });
      renderNews();
      if (await result) {
        await loadNews();
      } else {
        permissionMessage = "뉴스 접근을 허용해야 기사를 가져올 수 있어요. 다시 허용할 수 있습니다.";
      }
    } catch (error) {
      console.warn("IT news permission request failed:", error);
      permissionMessage = "권한을 적용하지 못했어요. ‘확장 다시 시작’을 누른 뒤 팝업을 다시 열어 주세요.";
      restartButton.hidden = false;
    } finally {
      requestingPermission = false;
      renderNews();
    }
  });
  restartButton.addEventListener("click", () => chrome.runtime.reload());
  refresh.addEventListener("click", loadNews);
  initializeNews();
  const refreshTimer = setInterval(() => { if (!document.hidden) loadNews(); }, 15 * 60 * 1000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      renderNews();
      if (!lastUpdated || Date.now() - lastUpdated >= 15 * 60 * 1000 || NewsRules.day(lastUpdated) !== NewsRules.day(Date.now())) loadNews();
    }
  });
  // Drop yesterday's results even if the popup remains open across midnight.
  const dateTimer = setInterval(() => { if (articles.some(article => !NewsRules.isToday(article.publishedAt))) renderNews(); }, 1000);
  window.addEventListener("pagehide", () => { clearInterval(refreshTimer); clearInterval(dateTimer); }, { once: true });
})();
