import { normalizeVideoUrl } from "./url.js";
import { resolveVideo, checkMedia, makeFilename } from "./video.js";
let state = { status: "idle", message: "영상 URL을 입력해 주세요.", percent: 0 };
const ready = chrome.storage.local.get("downloadState").then(({ downloadState }) => {
  if (downloadState) state = downloadState;
});
// Serialize starts, snapshots, and download events, including after worker restarts.
let pending = ready;
function enqueue(task) {
  const result = pending.then(task);
  pending = result.catch(() => {});
  return result;
}
async function update(patch) {
  if (Object.entries(patch).every(([key, value]) => state[key] === value)) return;
  state = { ...state, ...patch };
  await chrome.storage.local.set({ downloadState: state });
}
async function refresh() {
  if (state.downloadId != null && state.status === "downloading") {
    const [item] = await chrome.downloads.search({ id: state.downloadId });
    if (!item) return update({ status: "error", message: "크롬에서 해당 다운로드를 찾지 못했습니다." });
    if (item.state === "complete") {
      return update({ status: "complete", percent: 100, message: "다운로드가 완료되었습니다.", file: item.filename, detail: "" });
    }
    if (item.state === "interrupted") {
      return update({ status: "error", message: `다운로드가 중단되었습니다: ${item.error || "알 수 없는 오류"}`, detail: "다시 시도하거나 크롬 다운로드 목록을 확인해 주세요." });
    }
    const percent = item.totalBytes > 0 ? Math.min(100, item.bytesReceived / item.totalBytes * 100) : 0;
    await update({ percent, message: percent ? `다운로드 중 · ${percent.toFixed(0)}%` : "다운로드 중…" });
  } else if (state.status === "starting" && (!state.startedAt || Date.now() - state.startedAt > 45000)) {
    await update({ status: "error", message: "영상 확인이 중단되었습니다. 다시 시도해 주세요." });
  }
}
chrome.downloads.onChanged.addListener((delta) => {
  void enqueue(async () => {
    if (delta.id === state.downloadId) await refresh();
  }).catch(() => {});
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  enqueue(async () => {
    await refresh();
    if (message.type === "snapshot") return { state };
    if (message.type !== "start") throw new Error("알 수 없는 요청입니다.");
    if (["starting", "downloading"].includes(state.status)) throw new Error("이미 다운로드 중입니다. 완료된 뒤 다시 시도해 주세요.");
    const url = normalizeVideoUrl(message.url);
    await update({ status: "starting", message: "직접 저장 가능한 영상 형식을 확인하는 중…", url, startedAt: Date.now(), percent: 0, file: "", detail: "", downloadId: null });
    try {
      const video = await resolveVideo(url);
      await checkMedia(video.url);
      const filename = makeFilename(video.title, new URL(url).searchParams.get("v"));
      const downloadId = await chrome.downloads.download({ url: video.url, filename, saveAs: false, conflictAction: "uniquify" });
      await update({ status: "downloading", message: "다운로드를 시작했습니다.", downloadId, detail: `${video.quality} · 영상과 음성이 포함된 MP4` });
      await refresh();
    } catch (error) {
      await update({ status: "error", message: error.message || "다운로드에 실패했습니다.", detail: "" });
    }
    return { state };
  }).then(respond, (error) => respond({ error: error.message }));
  return true;
});
