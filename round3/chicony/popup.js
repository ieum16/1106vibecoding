import { normalizeVideoUrl } from "./url.js";
const form = document.querySelector("#download-form");
const input = document.querySelector("#url");
const button = document.querySelector("#download");
const status = document.querySelector("#status");
let busy = false;
function showError(message) { status.textContent = message; status.className = "error"; }
function render(state) {
  busy = ["starting", "downloading"].includes(state.status);
  button.disabled = busy;
  button.textContent = busy ? "다운로드 진행 중…" : "다운로드 시작";
  status.textContent = state.message;
  status.className = state.status === "error" ? "error" : "";
  const progress = document.querySelector("#progress");
  if (busy && !state.percent) progress.removeAttribute("value");
  else progress.value = state.percent || 0;
  document.querySelector("#detail").textContent = state.detail || "";
  document.querySelector("#file").textContent = state.file ? `저장한 파일: ${state.file}` : "";
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.downloadState?.newValue) render(changes.downloadState.newValue);
});
async function request(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (response.error) throw new Error(response.error);
  return response.state;
}
request({ type: "snapshot" }).then((state) => {
  render(state);
  if (!input.value && state.url) input.value = state.url;
}).catch((error) => showError(error.message));
// Download byte counts are read from Chrome while the popup is open.
setInterval(() => {
  if (busy) request({ type: "snapshot" }).then(render).catch((error) => showError(error.message));
}, 1000);
document.querySelector("#current-tab").addEventListener("click", async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    input.value = normalizeVideoUrl(tab?.url || "");
    input.focus();
  } catch { showError("현재 탭에서 유튜브 영상을 찾지 못했습니다. 영상 URL을 직접 입력해 주세요."); }
});
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const url = normalizeVideoUrl(input.value);
    button.disabled = true;
    render(await request({ type: "start", url }));
  } catch (error) {
    button.disabled = false;
    showError(error.message);
  }
});
