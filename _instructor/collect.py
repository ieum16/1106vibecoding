"""강사용: 저장소를 pull 하고 라운드별 제출 현황을 dashboard.json 으로 정리한다.

사용법 (저장소 맨 위 폴더에서):
    python _instructor/collect.py            # git pull 후 정리
    python _instructor/collect.py --no-pull  # 지금 있는 파일로만 정리

결과: _instructor/out/dashboard.json, _instructor/out/screenshots/<라운드>/<아이디>[-2|-3].png
      _instructor/out/rows.json (대시보드용 한 줄씩 정리본, 소개 README.md 내용 포함)
      _instructor/out/gallery.html (브라우저로 바로 여는 제출 갤러리)

스크린샷을 대시보드에 올린 주소는 _instructor/image_urls.json 에
{"<파일 sha1>": "<주소>"} 로 적어 두면 rows.json 의 image 칸에 들어간다.
"""

import argparse
import hashlib
import json
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "_instructor" / "out"
IMAGE_URLS = ROOT / "_instructor" / "image_urls.json"
ROUNDS = ["round1", "round2", "round3"]
EXAMPLES_DIR = "[강사예시]"
ROUND_LABELS = {"round1": "1라운드", "round2": "2라운드", "round3": "3라운드", EXAMPLES_DIR: "강사 예시"}
TEXT_EXT = {".html", ".css", ".js", ".json", ".md", ".txt"}
# screenshot.png (대표) + screenshot-2.png, screenshot-3.png (선택)
SCREENSHOT_RE = re.compile(r"^screenshot(?:-([23]))?\.(png|jpe?g)$", re.IGNORECASE)
INTRO_NAME = "readme.md"
# 소개 양식(_양식/README.md)의 ## 제목 → 대시보드 칸 이름
INTRO_SECTIONS = {
    "한 줄 소개": "one_liner",
    "누구를 위해 만들었나요": "audience",
    "주요 기능": "features",
    "화면": "screens",
    "강사 예시에서 바꾼 점": "changes",
    "써 보는 법": "how_to",
    "다음에 붙이고 싶은 기능": "next",
    "만들면서 배운 점": "learned",
}
LIST_SECTIONS = {"features", "changes", "how_to", "next"}
TEMPLATE_TITLE = "확장 프로그램 이름"
IGNORED_NAMES = {".DS_Store", "Thumbs.db", "desktop.ini"}

# 공개 저장소에 올라오면 안 되는 값처럼 보이는 문자열
SECRET_PATTERNS = [
    (re.compile(r"AIza[0-9A-Za-z_\-]{30,}"), "Google API 키"),
    (re.compile(r"sk-[0-9A-Za-z_\-]{20,}"), "OpenAI 계열 키"),
    (re.compile(r"gh[pousr]_[0-9A-Za-z]{30,}"), "깃허브 토큰"),
    (re.compile(r"\b01[016789]-?\d{3,4}-?\d{4}\b"), "휴대폰 번호"),
]


def git(*args):
    result = subprocess.run(
        ["git", *args], cwd=ROOT, capture_output=True, text=True, encoding="utf-8"
    )
    return result.stdout.strip()


def last_commit(path):
    line = git("log", "-1", "--format=%cI|%an|%s", "--", str(path.relative_to(ROOT)))
    if not line:
        return None
    time, author, message = line.split("|", 2)
    return {"time": time, "author": author, "message": message}


def read_text(path):
    try:
        return path.read_text(encoding="utf-8-sig")
    except (UnicodeDecodeError, OSError):
        return None


def collect_files(folder):
    files = {}
    for path in sorted(folder.rglob("*")):
        if not path.is_file() or path.name in IGNORED_NAMES:
            continue
        rel = path.relative_to(folder).as_posix()
        info = {"bytes": path.stat().st_size}
        if path.suffix.lower() in TEXT_EXT:
            text = read_text(path)
            if text is not None:
                info["lines"] = text.count("\n") + 1
        files[rel] = info
    return files


def read_manifest(folder, files):
    issues = []
    if "manifest.json" in files:
        manifest_path = folder / "manifest.json"
    else:
        nested = [p for p in files if p.endswith("/manifest.json")]
        if not nested:
            return None, ["manifest.json 없음"]
        manifest_path = folder / nested[0]
        issues.append(f"manifest.json 이 한 단계 안쪽에 있음 ({nested[0]})")
    try:
        manifest = json.loads(read_text(manifest_path) or "")
    except json.JSONDecodeError:
        return None, issues + ["manifest.json 을 읽을 수 없음"]

    matches = sorted(
        {m for cs in manifest.get("content_scripts", []) for m in cs.get("matches", [])}
    )
    return {
        "name": manifest.get("name"),
        "description": manifest.get("description"),
        "version": manifest.get("version"),
        "permissions": manifest.get("permissions", []),
        "host_permissions": manifest.get("host_permissions", []),
        "content_script_sites": matches,
    }, issues


def read_intro(folder, files):
    """닉네임 폴더 바로 안의 README.md(소개 글)를 ## 제목 기준으로 나눠 읽는다."""
    rel = next((f for f in files if f.lower() == INTRO_NAME), None)
    if not rel:
        return None, ["소개 README.md 없음"]
    text = re.sub(r"<!--.*?-->", "", read_text(folder / rel) or "", flags=re.S)

    intro = {"title": "", "captions": {}}
    for alt, src in re.findall(r"!\[([^\]]*)\]\(([^)\s]+)\)", text):
        intro["captions"][src.lstrip("./")] = alt.strip()

    current = None
    buckets = {}
    for line in text.splitlines():
        if line.startswith("# ") and not intro["title"]:
            intro["title"] = line[2:].strip()
        elif line.startswith("## "):
            current = INTRO_SECTIONS.get(line[3:].strip())
            if current:
                buckets[current] = []
        elif current:
            buckets[current].append(line)

    for key, lines in buckets.items():
        if key == "screens":
            continue
        if key in LIST_SECTIONS:
            items = [re.sub(r"^\s*(?:[-*]|\d+[.)])\s*", "", l).strip() for l in lines]
            intro[key] = [i for i in items if i]
        else:
            intro[key] = " ".join(l.strip() for l in lines if l.strip())

    issues = []
    if intro["title"] in ("", TEMPLATE_TITLE) or not intro.get("features"):
        issues.append("소개 양식을 아직 다 채우지 않음 (이름 또는 주요 기능)")
    return intro, issues


def collect_screenshots(entry, files, round_name, student):
    """screenshot.png 와 screenshot-2/3.png 를 out/screenshots/<라운드>/ 로 모은다."""
    shots = []
    for rel in files:
        m = SCREENSHOT_RE.match(rel)
        if not m:
            continue
        order = int(m.group(1) or 1)
        suffix = "" if order == 1 else f"-{order}"
        dest = OUT / "screenshots" / round_name / f"{student}{suffix}{Path(rel).suffix.lower()}"
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(entry / rel, dest)
        shots.append({
            "order": order,
            "source": rel,
            "file": dest.relative_to(OUT).as_posix(),
            "sha1": hashlib.sha1(dest.read_bytes()).hexdigest(),
        })
    return sorted(shots, key=lambda s: s["order"])


def scan_secrets(folder, files):
    found = []
    for rel in files:
        if Path(rel).suffix.lower() not in TEXT_EXT:
            continue
        text = read_text(folder / rel) or ""
        for pattern, label in SECRET_PATTERNS:
            if pattern.search(text):
                found.append(f"{rel}: {label}처럼 보이는 값")
    return found


def compare(prev_files, files):
    added = [f for f in files if f not in prev_files]
    removed = [f for f in prev_files if f not in files]
    changed = []
    for f in files:
        if f in prev_files and files[f] != prev_files[f]:
            delta = files[f].get("lines", 0) - prev_files[f].get("lines", 0)
            changed.append({"file": f, "line_delta": delta})
    return {"added": added, "removed": removed, "changed": changed}


def collect_round(round_name, prev_round_files):
    round_dir = ROOT / round_name
    submissions = {}
    stray = []
    if not round_dir.exists():
        return submissions, stray

    for entry in sorted(round_dir.iterdir()):
        if entry.is_file():
            if entry.name != "README.md" and entry.name not in IGNORED_NAMES:
                stray.append(entry.name)
            continue
        if entry.name.startswith((".", "_")):
            continue

        student = entry.name
        files = collect_files(entry)
        manifest, issues = read_manifest(entry, files)
        shots = collect_screenshots(entry, files, round_name, student)
        screenshot = next((s for s in shots if s["order"] == 1), None)
        if not screenshot:
            issues.append("screenshot.png 없음")
        intro, intro_issues = read_intro(entry, files)
        if round_name != EXAMPLES_DIR:
            issues += intro_issues

        submission = {
            "manifest": manifest,
            "intro": intro,
            "screenshot": screenshot,
            "screenshots": shots,
            "files": files,
            "total_lines": sum(f.get("lines", 0) for f in files.values()),
            "last_commit": last_commit(entry),
            "issues": issues,
            "secret_warnings": scan_secrets(entry, files),
        }
        if student in prev_round_files:
            submission["changes_from_previous_round"] = compare(
                prev_round_files[student], files
            )
        submissions[student] = submission

    return submissions, stray


def to_rows(rounds, examples):
    """대시보드가 읽는 한 줄 = 한 사람의 한 라운드 제출."""
    try:
        image_urls = json.loads(IMAGE_URLS.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        image_urls = {}

    groups = [(name, r["submissions"]) for name, r in rounds.items()]
    groups.append((EXAMPLES_DIR, examples))
    rows = []
    for round_name, submissions in groups:
        for student, sub in submissions.items():
            manifest = sub["manifest"] or {}
            commit = sub["last_commit"] or {}
            changes = sub.get("changes_from_previous_round")
            shot = sub["screenshot"]
            intro = sub["intro"] or {}
            rows.append({
                "round": round_name,
                "round_label": ROUND_LABELS[round_name],
                "student": student,
                "name": intro.get("title") if intro.get("title") not in ("", None, TEMPLATE_TITLE) else manifest.get("name") or "",
                "description": manifest.get("description") or "",
                "one_liner": intro.get("one_liner", ""),
                "audience": intro.get("audience", ""),
                "features": intro.get("features", []),
                "changes_from_example": intro.get("changes", []),
                "how_to": intro.get("how_to", []),
                "next_ideas": intro.get("next", []),
                "learned": intro.get("learned", ""),
                "has_intro": bool(intro),
                "screenshots": [
                    {
                        "file": s["file"],
                        "image": image_urls.get(s["sha1"], ""),
                        "caption": intro.get("captions", {}).get(s["source"], ""),
                    }
                    for s in sub["screenshots"]
                ],
                "version": manifest.get("version") or "",
                "sites": ", ".join(manifest.get("content_script_sites", [])),
                "files": len(sub["files"]),
                "lines": sub["total_lines"],
                "image": image_urls.get(shot["sha1"], "") if shot else "",
                "committed_at": commit.get("time", ""),
                "issues": " / ".join(sub["issues"]),
                "warnings": " / ".join(sub["secret_warnings"]),
                "has_previous": changes is not None,
                "files_added": len(changes["added"]) if changes else 0,
                "files_changed": len(changes["changed"]) if changes else 0,
                "line_delta": sum(c["line_delta"] for c in changes["changed"]) if changes else 0,
            })
    return rows


GALLERY_CSS = """
:root{--bg:#f6f7fb;--card:#fff;--text:#1d2233;--muted:#626a80;--line:#e3e6ef;--point:#4c6fff;--warn:#d9480f}
@media (prefers-color-scheme:dark){:root{--bg:#14161d;--card:#1d2029;--text:#e8eaf2;--muted:#9aa1b5;--line:#2c303c;--point:#8aa2ff;--warn:#ff8a5c}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:Pretendard,-apple-system,"Malgun Gothic",sans-serif;line-height:1.55;word-break:keep-all}
header{padding:28px 16px 8px;max-width:1240px;margin:0 auto}h1{margin:0 0 4px;font-size:24px}header p{margin:0;color:var(--muted);font-size:14px}
nav{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}nav a{padding:6px 14px;border:1px solid var(--line);border-radius:999px;text-decoration:none;color:var(--text);font-size:14px;background:var(--card)}
section{max-width:1240px;margin:0 auto;padding:16px}h2{font-size:18px;margin:24px 0 12px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden;display:flex;flex-direction:column}
.shot{background:#eef0f6;aspect-ratio:4/3;display:grid;place-items:center;overflow:hidden}.shot img{width:100%;height:100%;object-fit:contain}
.shot span{color:var(--muted);font-size:13px}.thumbs{display:flex;gap:6px;padding:8px 14px 0}.thumbs img{width:64px;height:48px;object-fit:cover;border-radius:6px;border:1px solid var(--line);cursor:zoom-in}
.body{padding:12px 14px 16px;display:flex;flex-direction:column;gap:8px}.who{font-size:12px;color:var(--point);font-weight:700}
.name{font-size:17px;font-weight:800;margin:0}.one{margin:0;color:var(--muted);font-size:14px}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none}.chips li{font-size:12px;padding:3px 9px;border-radius:999px;background:var(--bg);border:1px solid var(--line)}
.label{font-size:12px;font-weight:700;color:var(--muted);margin-top:4px}.changes{margin:0;padding-left:18px;font-size:13px}
.warn{font-size:12px;color:var(--warn)}.meta{font-size:12px;color:var(--muted);margin-top:auto}
dialog{border:0;padding:0;background:transparent;max-width:92vw}dialog img{max-width:92vw;max-height:86vh;border-radius:10px}dialog::backdrop{background:rgba(0,0,0,.7)}
"""


def write_gallery(rows, generated_at):
    """rows.json 을 카드 갤러리 HTML 로 그린다. 이미지는 out/screenshots 를 상대 경로로 쓴다."""
    from html import escape as e

    order = list(ROUND_LABELS)
    sections = []
    for round_name in order:
        group = [r for r in rows if r["round"] == round_name]
        if not group:
            continue
        cards = []
        for r in group:
            shots = r["screenshots"]
            main = shots[0] if shots else None
            src = lambda s: e(s["image"] or s["file"])
            shot_html = (
                f'<img src="{src(main)}" alt="{e(main["caption"] or r["name"])}" loading="lazy">'
                if main else "<span>캡처 없음</span>"
            )
            thumbs = "".join(
                f'<img src="{src(s)}" alt="{e(s["caption"])}" title="{e(s["caption"])}" loading="lazy">'
                for s in shots
            ) if len(shots) > 1 else ""
            chips = "".join(f"<li>{e(f)}</li>" for f in r["features"])
            changes = "".join(f"<li>{e(c)}</li>" for c in r["changes_from_example"])
            problems = " / ".join(p for p in (r["issues"], r["warnings"]) if p)
            cards.append(
                '<article class="card">'
                f'<div class="shot">{shot_html}</div>'
                + (f'<div class="thumbs">{thumbs}</div>' if thumbs else "")
                + '<div class="body">'
                f'<div class="who">{e(r["student"])}</div>'
                f'<p class="name">{e(r["name"] or "(이름 없음)")}</p>'
                + (f'<p class="one">{e(r["one_liner"])}</p>' if r["one_liner"] else "")
                + (f'<ul class="chips">{chips}</ul>' if chips else "")
                + (f'<div class="label">예시에서 바꾼 점</div><ul class="changes">{changes}</ul>' if changes else "")
                + (f'<div class="warn">! {e(problems)}</div>' if problems else "")
                + f'<div class="meta">파일 {r["files"]}개 · {r["lines"]}줄 · {e(r["committed_at"][:16].replace("T", " "))}</div>'
                "</div></article>"
            )
        label = ROUND_LABELS[round_name]
        sections.append(
            f'<section id="{e(round_name)}"><h2>{e(label)} · {len(group)}개</h2>'
            f'<div class="grid">{"".join(cards)}</div></section>'
        )

    nav = "".join(
        f'<a href="#{e(n)}">{e(ROUND_LABELS[n])}</a>' for n in order if any(r["round"] == n for r in rows)
    )
    page = (
        '<!doctype html><html lang="ko"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        f"<title>제출 갤러리</title><style>{GALLERY_CSS}</style></head><body>"
        f'<header><h1>바이브코딩 제출 갤러리</h1><p>{e(generated_at)} 기준 · 카드의 작은 사진을 누르면 크게 보여요</p><nav>{nav}</nav></header>'
        f'{"".join(sections)}<dialog id="zoom"><img alt=""></dialog>'
        "<script>const d=document.getElementById('zoom');document.addEventListener('click',ev=>{"
        "const t=ev.target;if(t.matches('.thumbs img,.shot img')){d.querySelector('img').src=t.src;d.showModal();}"
        "else if(t===d||t.closest('dialog')){d.close();}});</script></body></html>"
    )
    (OUT / "gallery.html").write_text(page, encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-pull", action="store_true", help="git pull 을 건너뜀")
    args = parser.parse_args()

    if not args.no_pull:
        print(git("pull", "--ff-only") or "git pull 완료")

    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)

    rounds = {}
    prev_files = {}
    for round_name in ROUNDS:
        submissions, stray = collect_round(round_name, prev_files)
        rounds[round_name] = {
            "submitted": len(submissions),
            "stray_files": stray,
            "submissions": submissions,
        }
        prev_files = {s: sub["files"] for s, sub in submissions.items()}

    examples, _ = collect_round(EXAMPLES_DIR, {})

    students = sorted({s for r in rounds.values() for s in r["submissions"]})
    dashboard = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "commit": git("rev-parse", "--short", "HEAD"),
        "students": students,
        "rounds": rounds,
        "examples": examples,
    }
    out_file = OUT / "dashboard.json"
    out_file.write_text(json.dumps(dashboard, ensure_ascii=False, indent=2), encoding="utf-8")
    rows = to_rows(rounds, examples)
    (OUT / "rows.json").write_text(
        json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    write_gallery(rows, dashboard["generated_at"])

    print(f"학생 {len(students)}명")
    for round_name, r in rounds.items():
        print(f"  {round_name}: {r['submitted']}명 제출", end="")
        if r["stray_files"]:
            print(f"  (폴더 밖에 흩어진 파일 {len(r['stray_files'])}개)", end="")
        print()
        for student, sub in r["submissions"].items():
            for problem in sub["issues"] + sub["secret_warnings"]:
                print(f"    ! {student}: {problem}")
    print(f"저장: {out_file}")
    print(f"갤러리: {OUT / 'gallery.html'}")


if __name__ == "__main__":
    main()
