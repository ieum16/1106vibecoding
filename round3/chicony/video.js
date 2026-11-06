// Parse only JSON data from the page. Never execute YouTube's remote scripts.
export function extractPlayerResponse(html) {
  const marker = /(?:var\s+ytInitialPlayerResponse|window\s*\[\s*["']ytInitialPlayerResponse["']\s*\]|\bytInitialPlayerResponse)\s*=\s*/g;
  for (const match of html.matchAll(marker)) {
    const start = match.index + match[0].length;
    if (html[start] !== "{") continue;
    let depth = 0, quoted = false, escaped = false;
    for (let i = start; i < html.length; i++) {
      const char = html[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === "{") depth++;
      else if (char === "}" && --depth === 0) {
        try { return JSON.parse(html.slice(start, i + 1)); } catch { break; }
      }
    }
  }
  throw new Error("영상 정보를 찾지 못했습니다. 유튜브의 동의 화면이나 페이지 변경으로 이 영상은 지원하지 않을 수 있습니다.");
}

export function validateMediaUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      !url.hostname.endsWith(".googlevideo.com") || url.pathname !== "/videoplayback") {
    throw new Error("유튜브의 직접 다운로드 주소를 확인하지 못했습니다.");
  }
  // The n parameter needs YouTube player code to transform it. Do not send
  // unprocessed URLs that can be throttled or rejected as if they were supported.
  if (url.searchParams.has("n")) throw new Error("재생 주소에 추가 처리가 필요합니다.");
  return url.href;
}

export function selectVideo(player, expectedId) {
  if (player.videoDetails?.videoId !== expectedId) throw new Error("요청한 영상과 응답의 영상이 일치하지 않습니다.");
  if (player.playabilityStatus?.status !== "OK") {
    const reason = player.playabilityStatus?.reason;
    throw new Error(reason ? `이 영상은 다운로드할 수 없습니다: ${reason}` : "이 영상은 공개 재생이 불가능하거나 접근이 제한되어 있습니다.");
  }
  if (player.videoDetails?.isLiveContent && !player.videoDetails?.lengthSeconds) {
    throw new Error("진행 중인 라이브 영상은 지원하지 않습니다.");
  }
  // Only progressive MP4 files with BOTH audio and video. Adaptive streams
  // must not silently produce a silent video or an audio-only download.
  const formats = (player.streamingData?.formats || []).filter((format) =>
    format.mimeType?.startsWith("video/mp4") && format.audioQuality &&
    (format.width || format.height) && !format.drmFamilies?.length
  ).sort((a, b) => (b.height || 0) - (a.height || 0) || (b.bitrate || 0) - (a.bitrate || 0));
  for (const format of formats) {
    try {
      let address = format.url;
      if (!address && (format.signatureCipher || format.cipher)) {
        const cipher = new URLSearchParams(format.signatureCipher || format.cipher);
        if (cipher.has("s")) continue;
        const url = new URL(cipher.get("url"));
        const signature = cipher.get("sig") || cipher.get("signature");
        if (signature) url.searchParams.set(cipher.get("sp") || "signature", signature);
        address = url.href;
      }
      const url = validateMediaUrl(address);
      return { url, title: player.videoDetails.title || expectedId, quality: format.qualityLabel || `${format.height}p` };
    } catch { /* Try the next directly usable, combined format. */ }
  }
  throw new Error("이 영상은 확장 프로그램 단독 다운로드를 지원하지 않습니다. 영상·음성 분리, 서명 해독 또는 재생 주소 추가 처리가 필요한 형식입니다.");
}

export function makeFilename(title, id) {
  const safe = title.replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, "_").replace(/[. ]+$/g, "").trim().slice(0, 100);
  return `YouTube/${safe || "video"} [${id}].mp4`;
}

export async function resolveVideo(url) {
  let response;
  try {
    response = await fetch(url, { credentials: "omit", signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const player = extractPlayerResponse(await response.text());
    return selectVideo(player, new URL(url).searchParams.get("v"));
  } catch (error) {
    if (["TimeoutError", "AbortError"].includes(error.name)) throw new Error("유튜브 응답 시간이 초과되었습니다. 다시 시도해 주세요.");
    throw error;
  }
}

export async function checkMedia(url) {
  let response;
  try {
    response = await fetch(url, {
      credentials: "omit", headers: { Range: "bytes=0-0" }, signal: AbortSignal.timeout(10000),
    });
    if (!response.ok || !response.headers.get("content-type")?.toLowerCase().startsWith("video/mp4")) {
      throw new Error(`영상 파일에 직접 접근할 수 없습니다 (HTTP ${response.status}). 이 영상은 단독 방식에서 지원하지 않습니다.`);
    }
  } catch (error) {
    if (error instanceof TypeError || ["TimeoutError", "AbortError"].includes(error.name)) {
      throw new Error("영상 파일 접근에 실패했습니다. 네트워크 상태 또는 유튜브의 접근 제한으로 다운로드할 수 없습니다.");
    }
    throw error;
  } finally {
    if (response?.body) await response.body.cancel().catch(() => {});
  }
}
