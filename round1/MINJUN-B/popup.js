"use strict";

const $ = (selector) => document.querySelector(selector);
document.documentElement.dataset.view = new URLSearchParams(location.search).get("view") === "window" ? "window" : "popup";
const SOURCES = [
  { name: "lotto-api", base: "https://visionary153.github.io/lotto-api/results/" },
  { name: "smok95/lotto", base: "https://smok95.github.io/lotto/results/" },
];
const state = { birthDate: "", day: seoulDay(), theme: "dark", recommendation: null, cache: { latest: null, rounds: {} }, draw: null, requestId: 0 };

function seoulDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = (type) => parts.find((part) => part.type === type).value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function isDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validBirthday(value) { return isDate(value) && value >= "1900-01-01" && value <= seoulDay(); }

function status(id, message = "", type = "") {
  const node = $(id);
  node.textContent = message;
  node.classList.remove("error", "success");
  if (type) node.classList.add(type);
}

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function seededRandom(text) {
  let seed = 2166136261;
  for (const char of text) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  return () => {
    seed += 0x6D2B79F5;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function secureIndex(limit) {
  const value = new Uint32Array(1);
  const ceiling = Math.floor(4294967296 / limit) * limit;
  do { crypto.getRandomValues(value); } while (value[0] >= ceiling);
  return value[0] % limit;
}

function shuffle(values, index = secureIndex) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = index(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

const FORTUNE_COPY = {
  overall: ["속도를 조금 늦추면 놓쳤던 여유가 보여요. 중요한 일부터 차근차근 정리해 보세요.", "익숙한 일 속에 작은 기회가 있어요. 계획한 일을 하나씩 마무리하기 좋은 날이에요.", "가벼운 자신감이 하루를 밝혀줘요. 미뤄 둔 작은 도전을 시작해 보세요."],
  money: ["즉흥적인 결제 전에 장바구니를 다시 살펴보세요.", "필요한 지출을 미리 적어두면 마음이 편안해져요.", "꾸준한 소비 기록에서 기분 좋은 만족을 찾을 수 있어요."],
  love: ["말을 서두르기보다 상대의 이야기를 먼저 들어보세요.", "짧은 안부 한마디가 따뜻한 연결을 만들어요.", "솔직하고 다정한 표현이 좋은 분위기를 더해줘요."],
  health: ["바쁜 일정 사이에 편안하게 쉬는 시간을 챙겨보세요.", "물과 식사, 쉬는 시간을 잊지 않는 하루를 보내세요.", "기분 좋은 컨디션을 가벼운 움직임으로 이어가 보세요."],
};
const COLORS = [
  { name: "네이비", hex: "#253957", outfit: "네이비 셔츠에 편안한 슬랙스, 단정한 로퍼" },
  { name: "차콜", hex: "#49505b", outfit: "차콜 니트와 스트레이트 팬츠로 차분한 댄디룩" },
  { name: "아이보리", hex: "#eee6cf", outfit: "아이보리 셔츠에 데님, 깔끔한 스니커즈" },
  { name: "세이지 그린", hex: "#9eae96", outfit: "무채색 기본 복장에 세이지 그린 가방이나 양말로 포인트" },
  { name: "라벤더", hex: "#b8a4d9", outfit: "편안한 기본 복장에 라벤더색 소품을 가볍게 더하기" },
  { name: "버건디", hex: "#823d51", outfit: "심플한 셔츠에 버건디 스카프나 양말로 포인트" },
];
const ACTIONS = ["집 앞을 가볍게 산책하고 주변 풍경 바라보기", "물 한 잔 마시고 어깨 힘 풀기", "책상 위를 정리하고 창문 열어 환기하기", "고마운 사람에게 짧은 안부 전하기", "오늘 꼭 할 일을 적고 가장 쉬운 것부터 시작하기", "잠깐 휴대폰을 내려놓고 편안하게 쉬기"];

function makeFortune(birthDate, day = seoulDay()) {
  const random = seededRandom(`${birthDate}|${day}|fortune-v1`);
  const scores = Object.fromEntries(["overall", "money", "love", "health"].map((key) => [key, 40 + Math.floor(random() * 60)]));
  const copy = Object.fromEntries(Object.keys(scores).map((key) => [key, FORTUNE_COPY[key][scores[key] < 60 ? 0 : scores[key] < 80 ? 1 : 2]]));
  return { scores, copy, color: COLORS[Math.floor(random() * COLORS.length)], action: ACTIONS[Math.floor(random() * ACTIONS.length)], needsCare: Object.values(scores).some((score) => score <= 60) };
}

function renderFortune() {
  const fortune = makeFortune(state.birthDate, state.day);
  $("#fortune-result").hidden = false;
  $("#fortune-placeholder").hidden = true;
  $("#overall-card").replaceChildren(node("span", "score-title", "✦ 오늘의 총운"), node("strong", "score-value", `${fortune.scores.overall}점`), node("p", "", fortune.copy.overall));
  const cards = [ ["money", "금전운"], ["love", "애정운"], ["health", "건강운"] ].map(([key, label]) => {
    const card = node("article", "score-card");
    const track = node("div", "score-track");
    const fill = node("div", "score-fill");
    fill.style.width = `${fortune.scores[key]}%`;
    track.append(fill);
    card.append(node("h3", "", label), node("strong", "", `${fortune.scores[key]}점`), track, node("p", "", fortune.copy[key]));
    return card;
  });
  $("#fortune-scores").replaceChildren(...cards);
  $("#solution-badge").textContent = fortune.needsCare ? "차분한 기운 채우기" : "좋은 기운 이어가기";
  $("#solution-intro").textContent = fortune.needsCare ? "조금 여유가 필요한 날, 작은 실천으로 기분을 바꿔보세요." : "오늘의 좋은 기분에 작은 행운을 더해보세요.";
  const solution = $("#solution-list");
  solution.replaceChildren();
  for (const [label, text] of [["추천 행동", fortune.action], ["행운의 색상", fortune.color.name], ["추천 복장 · 스타일링", fortune.color.outfit]]) {
    const description = node("dd", "", text);
    if (label === "행운의 색상") {
      const swatch = node("span", "color-swatch");
      swatch.style.backgroundColor = fortune.color.hex;
      swatch.setAttribute("aria-hidden", "true");
      description.prepend(swatch);
    }
    solution.append(node("dt", "", label), description);
  }
}

async function saveBirthday(event) {
  event?.preventDefault();
  const birthDate = $("#birth-date").value;
  if (!validBirthday(birthDate)) {
    status("#fortune-status", "1900년 이후부터 오늘까지의 올바른 생년월일을 입력해 주세요.", "error");
    $("#birth-date").focus();
    return;
  }
  $("#save-birthday").disabled = $("#show-fortune").disabled = true;
  try {
    await chrome.storage.local.set({ birthDate });
    state.birthDate = birthDate;
    state.day = seoulDay();
    $("#delete-birthday").hidden = false;
    renderFortune();
    globalThis.DoraCostumes?.next("fortune");
    status("#fortune-status", "저장했어요. 같은 생년월일의 운세는 한국 시간으로 매일 바뀝니다.", "success");
  } catch { status("#fortune-status", "저장하지 못했습니다. 다시 시도해 주세요.", "error"); }
  finally { $("#save-birthday").disabled = $("#show-fortune").disabled = false; }
}

function validNumbers(numbers) { return Array.isArray(numbers) && numbers.length === 6 && new Set(numbers).size === 6 && numbers.every((n) => Number.isInteger(n) && n >= 1 && n <= 45); }

function recommend(mode, birthDate, day = seoulDay()) {
  const all = Array.from({ length: 45 }, (_, i) => i + 1);
  if (mode === "fortune") {
    const random = seededRandom(`${birthDate}|${day}|lotto-v1`);
    const anchors = shuffle(all, (limit) => Math.floor(random() * limit)).slice(0, 2);
    return [...anchors, ...shuffle(all.filter((n) => !anchors.includes(n))).slice(0, 4)].sort((a, b) => a - b);
  }
  return shuffle(all).slice(0, 6).sort((a, b) => a - b);
}

function ball(number, matched = false) {
  const color = number <= 10 ? "yellow" : number <= 20 ? "blue" : number <= 30 ? "red" : number <= 40 ? "gray" : "green";
  const element = node("span", `ball ${color}${matched ? " matched" : ""}`, number);
  element.setAttribute("aria-label", `${number}번${matched ? ", 추천 번호와 일치" : ""}`);
  return element;
}

function renderRecommendation() {
  if (!state.recommendation) return;
  const { numbers, mode, day } = state.recommendation;
  $("#generated-numbers").replaceChildren(...numbers.map((n) => ball(n)));
  $("#generated-meta").textContent = `${day} · ${mode === "fortune" ? "운세 기반" : "일반 랜덤"} 추천`;
  renderMatch();
}

function matchRank(numbers, draw) {
  const count = numbers.filter((number) => draw.numbers.includes(number)).length;
  const bonus = numbers.includes(draw.bonus);
  const rank = count === 6 ? 1 : count === 5 ? (bonus ? 2 : 3) : count === 4 ? 4 : count === 3 ? 5 : null;
  return { count, bonus, rank };
}

function renderMatch() {
  const output = $("#match-result");
  output.hidden = !state.draw || !state.recommendation;
  if (output.hidden) return;
  const { count, bonus, rank } = matchRank(state.recommendation.numbers, state.draw);
  output.textContent = `${state.draw.round}회와 대조: 본 번호 ${count}개 일치${bonus ? " · 보너스 일치" : ""} → ${rank ? `${rank}등 번호 조합` : "당첨 조합 아님"}. 실제 구매 여부와 관계없는 번호 비교입니다.`;
  renderWinningBalls();
}

function renderWinningBalls() {
  if (!state.draw) return;
  const chosen = state.recommendation?.numbers ?? [];
  const { numbers, bonus } = state.draw;
  const plus = node("span", "bonus-plus", "+");
  plus.setAttribute("aria-label", "보너스 번호");
  $("#winning-numbers").replaceChildren(...numbers.map((n) => ball(n, chosen.includes(n))), plus, ball(bonus, chosen.includes(bonus)));
}

function normalizeDraw(raw, source) {
  const round = raw.round ?? raw.draw_no;
  const date = typeof raw.date === "string" ? raw.date.slice(0, 10) : "";
  const bonus = raw.bonus ?? raw.bonus_no;
  const expectedDate = Number.isInteger(round) && round >= 1 && round <= 10000 ? new Date(Date.UTC(2002, 11, 7) + (round - 1) * 604800000).toISOString().slice(0, 10) : "";
  if (!expectedDate || date !== expectedDate || date > seoulDay() || !validNumbers(raw.numbers) || !Number.isInteger(bonus) || bonus < 1 || bonus > 45 || raw.numbers.includes(bonus) || !SOURCES[source]) throw new Error("당첨 데이터 형식 오류");
  return { round, date, numbers: [...raw.numbers].sort((a, b) => a - b), bonus, source, fetchedAt: new Date().toISOString() };
}

function expectedRound() { return Math.max(1, Math.floor((Date.now() - Date.UTC(2002, 11, 7, 13)) / 604800000) + 1); }

async function fetchJSON(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally { clearTimeout(timer); }
}

async function fetchDraw(round) {
  let best = null;
  for (let source = 0; source < SOURCES.length; source++) {
    try {
      const draw = normalizeDraw(await fetchJSON(`${SOURCES[source].base}${round}.json`), source);
      if (round !== "latest" && draw.round !== round) throw new Error("요청 회차 불일치");
      if (!best || draw.round > best.round) best = draw;
      if (round !== "latest" || draw.round >= expectedRound()) return draw;
    } catch { /* 다음 검증된 데이터 경로를 시도합니다. */ }
  }
  if (best) return best;
  throw new Error("당첨 결과를 가져오지 못했습니다.");
}

function renderRounds(selected = state.cache.latest?.round) {
  const select = $("#draw-round");
  const latest = state.cache.latest?.round;
  if (!latest) return;
  const options = [];
  for (let round = latest; round >= 1; round--) {
    const option = node("option", "", `${round}회${round === latest ? " · 최근 확인 회차" : ""}`);
    option.value = String(round);
    options.push(option);
  }
  select.replaceChildren(...options);
  select.value = String(selected);
}

function renderDraw(draw) {
  state.draw = draw;
  $("#draw-result").hidden = false;
  $("#draw-heading").textContent = `${draw.round}회 당첨 번호`;
  $("#draw-date").textContent = draw.date;
  $("#draw-date").dateTime = draw.date;
  const fetched = new Date(draw.fetchedAt);
  const checked = Number.isNaN(fetched.getTime()) ? "확인 시각 없음" : `${seoulDay(fetched)} ${new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(fetched)} 확인`;
  $("#draw-source").textContent = `출처: ${SOURCES[draw.source].name} · ${checked}`;
  renderWinningBalls();
  renderMatch();
}

async function rememberDraw(draw, latest) {
  state.cache.rounds[draw.round] = draw;
  if (latest && (!state.cache.latest || draw.round >= state.cache.latest.round)) state.cache.latest = draw;
  state.cache.rounds = Object.fromEntries(Object.values(state.cache.rounds).sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt)).slice(0, 32).map((item) => [item.round, item]));
  await chrome.storage.local.set({ lotteryCache: state.cache });
}

async function loadDraw(round = "latest", force = false) {
  const id = ++state.requestId;
  const cached = round === "latest" ? state.cache.latest : state.cache.rounds[round];
  $("#refresh-draw").disabled = true;
  $("#draw-round").disabled = true;
  if (cached) { renderDraw(cached); renderRounds(cached.round); }
  else {
    state.draw = null;
    $("#draw-result").hidden = $("#match-result").hidden = true;
  }
  status("#draw-status", cached ? "저장된 결과 표시 중 · 최신 정보 확인 중…" : "당첨 결과를 불러오는 중…");
  try {
    if (cached && round !== "latest" && !force) {
      status("#draw-status", "저장된 회차 결과입니다. 최신 조회 버튼으로 최근 회차를 확인할 수 있어요.");
      return;
    }
    let draw = await fetchDraw(round);
    if (id !== state.requestId) return;
    if (round === "latest" && cached && cached.round > draw.round) draw = cached;
    let cacheSaved = true;
    try { await rememberDraw(draw, round === "latest"); } catch { cacheSaved = false; }
    if (id !== state.requestId) return;
    renderRounds(draw.round);
    renderDraw(draw);
    const pending = round === "latest" && draw.round < expectedRound();
    status("#draw-status", pending ? "데이터 제공처의 새 회차 반영을 기다리고 있어요. 표시된 회차·날짜를 확인하세요." : cacheSaved ? "조회 완료 · 발표된 추첨 결과입니다." : "조회 완료 · 결과를 기기에 저장하지 못했어요.", pending || !cacheSaved ? "" : "success");
  } catch {
    if (id !== state.requestId) return;
    status("#draw-status", cached ? "연결에 실패해 저장된 결과를 표시합니다. 최신 여부는 공식 사이트에서 확인하세요." : "결과를 불러오지 못했어요. 인터넷 연결을 확인하고 ‘최신 조회’를 눌러주세요.", "error");
  } finally {
    if (id === state.requestId) { $("#refresh-draw").disabled = false; $("#draw-round").disabled = !state.cache.latest; }
  }
}

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  $("#theme-toggle").textContent = theme === "dark" ? "☀" : "☾";
  $("#theme-toggle").setAttribute("aria-label", `${theme === "dark" ? "라이트" : "다크"} 모드로 변경`);
}

function refreshDay() {
  const day = seoulDay();
  const changed = state.day !== day;
  state.day = day;
  $("#today-label").textContent = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "long" }).format(new Date());
  $("#birth-date").max = day;
  if (changed && state.birthDate && !$("#fortune-result").hidden) renderFortune();
}

async function init() {
  initCostumes();
  const todosReady = initTodos();
  refreshDay();
  try {
    const stored = await chrome.storage.local.get(["birthDate", "theme", "recommendation", "lotteryCache"]);
    applyTheme(["light", "dark"].includes(stored.theme) ? stored.theme : matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    if (validBirthday(stored.birthDate)) {
      state.birthDate = stored.birthDate;
      $("#birth-date").value = stored.birthDate;
      $("#delete-birthday").hidden = false;
      renderFortune();
    }
    if (stored.recommendation && validNumbers(stored.recommendation.numbers) && ["random", "fortune"].includes(stored.recommendation.mode) && isDate(stored.recommendation.day)) {
      state.recommendation = stored.recommendation;
      renderRecommendation();
    }
    const cache = stored.lotteryCache;
    if (cache && typeof cache === "object") {
      for (const record of [cache.latest, ...Object.values(cache.rounds ?? {}).slice(0, 32)]) {
        try {
          const draw = normalizeDraw(record, record.source);
          if (typeof record.fetchedAt !== "string" || Number.isNaN(Date.parse(record.fetchedAt))) continue;
          draw.fetchedAt = record.fetchedAt;
          state.cache.rounds[draw.round] = draw;
          if (record === cache.latest) state.cache.latest = draw;
        } catch { /* 잘못된 저장 데이터는 사용하지 않습니다. */ }
      }
      renderRounds();
    }
  } catch { $("#app-status").textContent = "설정을 불러오지 못했어요. 팝업을 다시 열어주세요."; }
  finally {
    await todosReady;
    bindEvents();
    loadDraw();
    const scroll = Number(new URLSearchParams(location.search).get("scroll"));
    if (Number.isFinite(scroll) && scroll > 0) requestAnimationFrame(() => { $("#dashboard").scrollTop = Math.min(scroll, 10000000); });
  }
}

function bindEvents() {
  const settings = $("#settings-dialog");
  $("#settings-toggle").addEventListener("click", () => settings.showModal());
  $("#settings-close").addEventListener("click", () => settings.close());
  settings.addEventListener("click", (event) => {
    if (event.target !== settings) return;
    const rect = settings.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) settings.close();
  });
  $("#open-app-window").addEventListener("click", async () => {
    $("#open-app-window").disabled = true;
    try {
      const scroll = Math.round($("#dashboard").scrollTop);
      await chrome.windows.create({ url: chrome.runtime.getURL(`popup.html?view=window&scroll=${scroll}`), type: "popup", width: Math.min(580, screen.availWidth), height: Math.min(850, screen.availHeight), focused: true });
      window.close();
    } catch { $("#app-status").textContent = "큰 창을 열지 못했어요. 다시 시도해 주세요."; }
    finally { $("#open-app-window").disabled = false; }
  });
  $("#birthday-form").addEventListener("submit", saveBirthday);
  $("#show-fortune").addEventListener("click", saveBirthday);
  $("#delete-birthday").addEventListener("click", async () => {
    try {
      await chrome.storage.local.remove("birthDate");
      state.birthDate = "";
      $("#birth-date").value = "";
      $("#fortune-result").hidden = true;
      $("#fortune-placeholder").hidden = false;
      $("#delete-birthday").hidden = true;
      status("#fortune-status", "저장된 생년월일을 삭제했어요.", "success");
    } catch { status("#fortune-status", "삭제하지 못했습니다. 다시 시도해 주세요.", "error"); }
  });
  $("#theme-toggle").addEventListener("click", async () => {
    applyTheme(state.theme === "dark" ? "light" : "dark");
    try { await chrome.storage.local.set({ theme: state.theme }); $("#app-status").textContent = ""; }
    catch { $("#app-status").textContent = "테마 설정을 저장하지 못했어요."; }
  });
  document.querySelectorAll('[name="lotto-mode"]').forEach((radio) => radio.addEventListener("change", () => {
    $("#mode-help").textContent = radio.value === "fortune" ? "생년월일·오늘 날짜의 행운 숫자 2개에 랜덤 숫자 4개를 더해요. 당첨 확률은 같아요." : "중복 없이 1~45 중 여섯 숫자를 무작위로 추첨해요.";
  }));
  $("#generate-numbers").addEventListener("click", async () => {
    const mode = $('[name="lotto-mode"]:checked').value;
    if (mode === "fortune" && !validBirthday(state.birthDate)) { status("#lotto-status", "위쪽 운세 영역에서 생년월일을 먼저 저장해 주세요.", "error"); return; }
    refreshDay();
    state.recommendation = { numbers: recommend(mode, state.birthDate, state.day), mode, day: state.day };
    renderRecommendation();
    globalThis.DoraCostumes?.next("lotto");
    try { await chrome.storage.local.set({ recommendation: state.recommendation }); status("#lotto-status", "추천 번호를 저장했어요.", "success"); }
    catch { status("#lotto-status", "번호는 생성했지만 저장하지 못했어요.", "error"); }
  });
  $("#refresh-draw").addEventListener("click", () => loadDraw("latest", true));
  $("#draw-round").addEventListener("change", () => {
    const round = Number($("#draw-round").value);
    if (Number.isInteger(round) && round >= 1 && round <= state.cache.latest?.round) loadDraw(round);
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshDay(); });
}


function popComic(reason) {
  const sfx = $("#comic-sfx");
  const bubble = $(".speech-bubble");
  bubble.classList.toggle("shout", ["completed", "allDone"].includes(reason));
  if (!sfx || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const words = { fortune: "두근!", lotto: "행운!", added: "짠!", completed: "최고!", allDone: "대성공!", click: "변신!" };
  sfx.textContent = words[reason] ?? "짠!";
  sfx.getAnimations().forEach(animation => animation.cancel());
  sfx.animate([
    { opacity: 0, transform: "scale(.4) rotate(-12deg)" },
    { opacity: 1, transform: "scale(1.12) rotate(-8deg)", offset: .25 },
    { opacity: 0, transform: "translateY(-25px) scale(.95) rotate(-8deg)" },
  ], { duration: 950, easing: "ease-out" });
}

function initCostumes() {
  const crops = [
    [0, 0, 100, 106], [101, 0, 100, 106], [202, 0, 99, 106], [302, 0, 101, 106],
    [0, 106, 105, 111], [104, 106, 110, 111], [215, 106, 87, 111], [302, 106, 101, 111],
    [0, 217, 100, 100], [101, 217, 100, 100], [202, 217, 100, 100], [302, 217, 101, 100],
    [0, 317, 101, 108], [101, 317, 100, 108], [202, 317, 100, 108], [302, 317, 101, 108],
  ];
  const messages = ["오늘도 네 편이야. 작은 일부터 함께 해보자!", "잘하고 있어! 네 속도로 나아가도 괜찮아.", "잠깐 쉬어가도 괜찮아. 내가 응원할게!", "오늘의 작은 도전도 함께 해보자!"];
  const gallery = crops.map((crop, index) => ({ id: "sticker-" + index, crop, message: messages[index % messages.length] }));
  let selected = 0;

  function render(reason = "") {
    const current = gallery[selected];
    for (const art of document.querySelectorAll("[data-dora-art]")) {
      const image = document.createElement("img");
      const [x, y, width, height] = current.crop;
      const viewport = document.createElement("span");
      viewport.className = "sprite-viewport";
      viewport.style.width = Math.min(1, width / height) * 100 + "%";
      viewport.style.aspectRatio = width + " / " + height;
      image.src = chrome.runtime.getURL("assets/dora-sticker-sheet.png");
      image.alt = "도라에몽";
      image.style.width = 403 / width * 100 + "%";
      image.style.transform = "translate(" + (-x / 403 * 100) + "%, " + (-y / 425 * 100) + "%)";
      image.draggable = false;
      image.addEventListener("error", () => {
        const fallback = document.createElement("span");
        fallback.textContent = "🔔";
        fallback.setAttribute("aria-label", "이미지를 불러오지 못했습니다.");
        art.replaceChildren(fallback);
      }, { once: true });
      art.dataset.costumeId = current.id;
      viewport.append(image);
      art.replaceChildren(viewport);
    }
    const prefix = reason === "fortune" ? "오늘의 기운을 확인했어! " : reason === "lotto" ? "새로운 행운 번호와 출발! " : "";
    document.querySelectorAll("[data-costume-message]").forEach(element => { element.textContent = prefix + current.message; });
    document.querySelectorAll("[data-costume-next]").forEach(element => { element.setAttribute("aria-label", "도라에몽 그림을 누르면 다른 그림으로 바뀝니다."); });
    if (reason) popComic(reason);
  }

  function chooseDifferent() {
    const candidates = gallery.map((_, index) => index).filter(index => index !== selected);
    selected = candidates[secureIndex(candidates.length)];
  }

  async function next(reason = "click") {
    chooseDifferent();
    render(reason);
    try { await chrome.storage.local.set({ doraGalleryId: gallery[selected].id }); }
    catch { /* 저장에 실패해도 현재 화면의 새 이미지는 유지합니다. */ }
  }

  globalThis.DoraCostumes = { next, count: gallery.length };
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.doraGalleryId) return;
    const index = gallery.findIndex(item => item.id === changes.doraGalleryId.newValue);
    if (index >= 0 && index !== selected) { selected = index; render(); }
  });
  (async () => {
    try {
      const stored = await chrome.storage.local.get("doraGalleryId");
      const previous = gallery.findIndex(item => item.id === stored.doraGalleryId);
      if (previous >= 0) { selected = previous; chooseDifferent(); }
      else selected = secureIndex(gallery.length);
      await chrome.storage.local.set({ doraGalleryId: gallery[selected].id });
      await chrome.storage.local.remove(["doraCostume", "doraImageVersion"]);
    } catch {}
    render();
    document.querySelectorAll("[data-costume-next]").forEach(element => element.addEventListener("click", () => next()));
  })();
}

let isSaving = false;
function initTodos() {
const STORAGE_KEY = "todos";
const form = $("#todo-form");
const input = $("#todo-input");
const error = $("#input-error");
const list = $("#todo-list");
const remaining = $("#remaining");
const emptyMessage = $("#empty-message");
const randomButton = $("#random-button");
const clearButton = $("#clear-button");
const addButton = $("#add-button");
const cheerMessage = $("#cheer-message");
const speechBubble = $(".speech-bubble");
const character = $(".character");
const celebration = $("#celebration");
function normalizeTodos(items) {
  if (!Array.isArray(items)) return [];
  return items.filter(item => item && typeof item.text === "string" && item.text.trim() && item.text.length <= 100 && typeof item.completed === "boolean").map(item => ({ id: typeof item.id === "string" ? item.id : crypto.randomUUID(), text: item.text.trim(), completed: item.completed }));
}
const encouragements = {
  welcome: ["오늘도 반가워! 작은 일부터 함께 해보자!", "내가 옆에서 응원할게. 오늘도 힘내자!", "서두르지 않아도 괜찮아. 하나씩 해보자!"],
  added: ["좋아! 할 일을 담았네. 시작할 준비 완료!", "멋진 시작이야! 하나씩 해내 보자!", "계획을 세웠으니 한 걸음 나아갔어!"],
  completed: ["해냈구나! 정말 멋져!", "또 하나 완료! 네가 해낼 줄 알았어!", "잘했어! 네 노력에 박수를 보낼게!"],
  allDone: ["전부 해냈어! 오늘의 주인공은 너야!", "모두 완료! 정말 수고했어. 이제 편하게 쉬어!"],
};
let celebrationTimer;


function encourage(kind) {
  if (kind !== "welcome") globalThis.DoraCostumes?.next(kind);
  const messages = encouragements[kind];
  const alternatives = messages.filter((message) => message !== cheerMessage.textContent);
  const message = pick(alternatives.length ? alternatives : messages);
  cheerMessage.textContent = message;
  const reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!reducedMotion) {
    speechBubble.getAnimations().forEach((animation) => animation.cancel());
    speechBubble.animate([{ transform: "scale(.96)", opacity: .6 }, { transform: "scale(1)", opacity: 1 }], { duration: 280, easing: "ease-out" });
    character.getAnimations().forEach((animation) => animation.cancel());
    character.animate([{ transform: "translateY(0)" }, { transform: "translateY(-9px) rotate(-4deg)" }, { transform: "translateY(0)" }], { duration: 480, easing: "ease-out" });
  }
  if (kind === "welcome") return;

  clearTimeout(celebrationTimer);
  celebration.replaceChildren();
  const badge = document.createElement("div");
  badge.className = "success-badge";
  badge.textContent = `${kind === "added" ? "✦ 추가 성공!" : "✓ 완료!"} ${message}`;
  celebration.append(badge);
  if (!reducedMotion) {
    for (let index = 0; index < 22; index++) {
      const particle = document.createElement("span");
      particle.className = "confetti";
      particle.textContent = pick(["✦", "●", "■", "★"]);
      particle.style.left = `${randomInt(8, 92)}%`;
      particle.style.color = pick(["#0088d0", "#ffd450", "#ed4c56", "#51c5ab"]);
      particle.style.setProperty("--drift", `${randomInt(-65, 65)}px`);
      particle.style.setProperty("--delay", `${randomInt(0, 180)}ms`);
      celebration.append(particle);
    }
  }
  celebrationTimer = setTimeout(() => celebration.replaceChildren(), 2300);
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(items) {
  return items[randomInt(0, items.length - 1)];
}

// 실제로 함께 쓰이는 대상과 행동만 조합합니다. 시간·수량은 붙이지 않습니다.
const taskGroups = [
  {
    targets: ["거실", "침실", "주방", "욕실", "현관", "베란다"],
    actions: ["바닥 청소하기", "쓰레기 치우기", "물건 제자리에 놓기"],
  },
  {
    targets: ["옷장", "신발장", "책장", "주방 서랍", "책상 서랍", "냉장고"],
    actions: ["정리하기", "안 쓰는 물건 비우기", "선반 닦기"],
  },
  {
    targets: ["수건", "침대 시트", "베개 커버", "양말", "실내복"],
    actions: ["세탁하기", "빨래 널기", "마른 빨래 개기"],
  },
  {
    targets: ["주간 업무 보고서", "회의 자료", "업무 매뉴얼", "프로젝트 제안서", "발표 자료"],
    actions: ["초안 작성하기", "내용 검토하기", "오탈자 수정하기", "최신 내용으로 업데이트하기"],
  },
  {
    targets: ["팀 회의", "고객 미팅", "프로젝트 회의", "주간 회의"],
    actions: ["일정 확인하기", "안건 정리하기", "자료 준비하기", "회의록 정리하기", "후속 업무 정리하기"],
  },
  {
    targets: ["고객 문의 메일", "협업 요청 메일", "미답변 메일"],
    actions: ["확인하기", "답장 작성하기"],
  },
  {
    targets: ["진행 중인 업무", "팀 요청 사항", "이번 주 마감 업무", "미완료 업무"],
    actions: ["진행 상황 확인하기", "우선순위 정리하기", "처리 일정 정리하기"],
  },
];

const practicalTasks = [...new Set([
  ...taskGroups.flatMap(({ targets, actions }) =>
    targets.flatMap((target) => actions.map((action) => `${target} ${action}`))),
  "세탁기 돌리기", "세탁기 먼지 필터 청소하기", "설거지하기", "식기 건조대 정리하기",
  "음식물 쓰레기 버리기", "분리수거하기", "종이상자 접어서 정리하기", "쓰레기봉투 교체하기",
  "싱크대 청소하기", "가스레인지 닦기", "전자레인지 내부 닦기", "식탁 닦기",
  "욕실 세면대 닦기", "변기 청소하기", "욕실 배수구 머리카락 치우기", "거울 닦기",
  "냉장고 식재료 유통기한 확인하기", "장보기 목록 작성하기", "부족한 생필품 확인하기",
  "저녁 식사 준비하기", "남은 반찬 정리하기", "쌀 씻어 밥 짓기", "택배 포장 정리하기",
  "공과금 납부 내역 확인하기", "관리비 납부하기", "택배 반품 접수하기",
  "오늘 업무 일정 확인하기", "내일 업무 목록 정리하기", "담당 업무 마감일 확인하기",
  "동료에게 업무 진행 상황 공유하기", "결재 요청 문서 확인하기", "경비 정산 내역 작성하기",
  "영수증 정리하기", "공유 문서 접근 권한 확인하기", "프로젝트 폴더 정리하기",
  "업무 파일 백업하기", "완료한 업무 상태 업데이트하기", "거래처 요청 사항 확인하기",
])];

function makeRandomTask() {
  const existing = new Set(todos.map((todo) => todo.text));
  const candidates = practicalTasks.filter((text) => !existing.has(text));
  return pick(candidates.length > 0 ? candidates : practicalTasks);
}

let todos = [];

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

async function loadTodos() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  todos = normalizeTodos(stored[STORAGE_KEY]);
  render();
  encourage("welcome");
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
      if (isSaving) { checkbox.checked = todo.completed; return; }
      const completed = checkbox.checked;
      const saved = await updateList(todos.map((entry) => entry.id === todo.id ? { ...entry, completed } : entry));
      if (saved && completed) encourage(todos.every((entry) => entry.completed) ? "allDone" : "completed");
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
      await updateList(todos.filter((item) => item.id !== todo.id));
    });

    item.append(checkbox, text, deleteButton);
    if (todo.completed) item.append(node("span", "completion-stamp", "참 잘했어요"));
    list.append(item);
  }

  const remainingCount = todos.filter((todo) => !todo.completed).length;
  remaining.textContent = `남은 할 일 ${remainingCount}개`;
  emptyMessage.hidden = todos.length > 0;
  clearButton.disabled = todos.length === 0;
  randomButton.disabled = false;
}

async function updateList(nextTodos) {
  if (isSaving) return false;
  isSaving = true;
  const previousTodos = todos;
  todos = nextTodos;
  randomButton.disabled = true;
  clearButton.disabled = true;
  addButton.disabled = true;
  let saved = false;
  try {
    await saveTodos();
    error.textContent = "";
    saved = true;
  } catch {
    todos = previousTodos;
    error.textContent = "목록을 저장하지 못했습니다. 다시 시도해 주세요.";
  }
  isSaving = false;
  addButton.disabled = false;
  render();
  return saved;
}

randomButton.addEventListener("click", async () => {
  const text = makeRandomTask();
  if (await updateList([{ id: makeId(), text, completed: false }, ...todos])) encourage("added");
});

clearButton.addEventListener("click", async () => {
  await updateList([]);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = input.value.trim();

  if (!text) {
    error.textContent = "할 일을 입력해 주세요.";
    input.focus();
    return;
  }

  const saved = await updateList([{ id: makeId(), text, completed: false }, ...todos]);
  if (!saved) return;
  input.value = "";
  encourage("added");
  input.focus();
});

input.addEventListener("input", () => {
  if (input.value.trim()) {
    error.textContent = "";
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[STORAGE_KEY] || isSaving) return;
  const scrollTop = list.scrollTop;
  todos = normalizeTodos(changes[STORAGE_KEY].newValue);
  render();
  list.scrollTop = scrollTop;
});

const ready = loadTodos().catch(() => {
  error.textContent = "목록을 불러오지 못했습니다. 다시 열어 주세요.";
});

(() => {
  const exportButton = document.querySelector("#export-todos");
  const importInput = document.querySelector("#import-todos");
  const output = document.querySelector("#transfer-status");

  function validate(payload) {
    const items = Array.isArray(payload) ? payload : payload?.todos;
    if (!Array.isArray(items) || items.length > 2000) throw new Error("할 일 목록 형식이 아니거나 항목이 2,000개를 넘습니다.");
    if (!items.every((item) => item && typeof item.text === "string" && item.text.trim() && item.text.length <= 100 && typeof item.completed === "boolean")) throw new Error("파일에 올바르지 않은 할 일이 있습니다.");
    return items.map((item) => ({ id: typeof item.id === "string" ? item.id : crypto.randomUUID(), text: item.text.trim(), completed: item.completed }));
  }

  exportButton.addEventListener("click", async () => {
    if (typeof isSaving !== "undefined" && isSaving) { output.textContent = "저장 완료 후 다시 눌러주세요."; return; }
    try {
      const stored = await chrome.storage.local.get("todos");
      const todos = validate(stored.todos ?? []);
      const blob = new Blob([JSON.stringify({ version: 1, todos }, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "today-todos.json";
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      output.textContent = `${todos.length}개 할 일을 내보냈어요. 새 프로그램에서 이 파일을 가져오세요.`;
    } catch { output.textContent = "내보내지 못했습니다. 다시 시도해 주세요."; }
  });

  importInput.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    if (typeof isSaving !== "undefined" && isSaving) { output.textContent = "저장 완료 후 다시 시도해 주세요."; importInput.value = ""; return; }
    exportButton.disabled = importInput.disabled = true;
    try {
      if (file.size > 1024 * 1024) throw new Error("1MB 이하의 JSON 파일을 선택해 주세요.");
      const incoming = validate(JSON.parse(await file.text()));
      const stored = await chrome.storage.local.get("todos");
      const existing = validate(stored.todos ?? []);
      const texts = new Set(existing.map((item) => item.text));
      const additions = [];
      for (const item of incoming) {
        if (texts.has(item.text)) continue;
        texts.add(item.text);
        additions.push({ ...item, id: crypto.randomUUID() });
      }
      if (existing.length + additions.length > 2000) throw new Error("합친 할 일이 2,000개를 넘습니다.");
      await chrome.storage.local.set({ todos: [...existing, ...additions] });
      output.textContent = `${additions.length}개를 가져왔어요. 기존 할 일은 유지하고 같은 내용은 건너뛰었어요.`;
    } catch (error) { output.textContent = error instanceof SyntaxError ? "올바른 JSON 파일이 아닙니다." : error.message || "가져오지 못했습니다."; }
    finally { exportButton.disabled = importInput.disabled = false; importInput.value = ""; }
  });
})();

return ready;
}

init();
