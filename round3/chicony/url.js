export function normalizeVideoUrl(value) {
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error("올바른 유튜브 영상 URL을 입력해 주세요."); }
  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    throw new Error("https://로 시작하는 유튜브 영상 URL을 입력해 주세요.");
  }
  let id;
  if (url.hostname === "youtu.be") {
    id = url.pathname.slice(1);
  } else if (["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"].includes(url.hostname)) {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else id = /^\/(?:shorts|live|embed)\/([^/]+)\/?$/.exec(url.pathname)?.[1];
  }
  if (!/^[A-Za-z0-9_-]{11}$/.test(id ?? "")) {
    throw new Error("유튜브 영상 한 개의 URL을 입력해 주세요. 재생목록만 있는 URL은 지원하지 않습니다.");
  }
  return `https://www.youtube.com/watch?v=${id}`;
}
