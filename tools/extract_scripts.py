#!/usr/bin/env python3
"""westwingwiki.com 에피소드 대본 추출 (개인 소장용, 출력은 scripts/ — git 제외).
사용: python3 tools/extract_scripts.py [출력폴더=scripts]
- 시즌 1~7 목록 → 에피소드 페이지 → 'Script:' 이후 본문만 .txt 저장, manifest.json 생성
- 형식 A: <pre> 블록(화자 포함) / 형식 B: <p>+<br> 자막형(화자 없음)
"""
import html, json, re, subprocess, sys, time
from pathlib import Path

BASE = "https://westwingwiki.com/the-wiki/scripts/season-%d/"
DELAY = 0.3

def get(url):
    r = subprocess.run(["curl", "-sS", "-L", "--retry", "3", url], capture_output=True)
    if r.returncode:
        raise RuntimeError(f"curl 실패: {url}")
    return r.stdout.decode("utf8", "replace")

def clean(s):
    s = re.sub(r"<br\s*/?>", "\n", s)
    s = re.sub(r"</p>\s*<p[^>]*>", "\n\n", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = html.unescape(s).replace("\xa0", " ")
    return re.sub(r"\n{3,}", "\n\n", s).strip()

def parse(page):
    title = html.unescape(re.search(r"<title>(.*?)</title>", page, re.S).group(1)).replace(" - West Wing Wiki", "").strip()
    m = re.search(r'<div class="entry-content[^>]*>(.*?)(?=<footer|class="post-tags|<div class="entry-share|<div id="comments)', page, re.S)
    body = m.group(1) if m else ""
    i = body.find("Script:")
    if i < 0:
        return title, None, ""
    after = body[i:]
    pre = re.findall(r"<pre[^>]*>(.*?)</pre>", after, re.S)
    if pre:
        return title, "A", "\n\n".join(clean(p) for p in pre)
    after = after[after.find("</p>") + 4:] if "</p>" in after else after
    text = clean(after)
    return title, ("B" if len(text) > 5000 else None), text

def main():
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "scripts")
    out.mkdir(parents=True, exist_ok=True)
    manifest, skipped = [], []
    for s in range(1, 8):
        links = sorted(set(re.findall(r'href="(https://westwingwiki\.com/20\d\d/\d\d/season-%d-[^"]*)"' % s, get(BASE % s))))
        for u in links:
            m = re.search(r"season-%d-episode-(\d+)" % s, u)
            ep = int(m.group(1)) if m else 0
            title, fmt, text = parse(get(u))
            time.sleep(DELAY)
            if not fmt:
                skipped.append({"season": s, "episode": ep, "url": u, "title": title}); continue
            name = re.sub(r'[\\/:*?"<>|]', "", title).replace("Season %d – Episode %d – " % (s, ep), "").strip()
            fn = f"S{s:02d}E{ep:02d}_{re.sub(r'\s+', '_', name)}.txt"
            (out / fn).write_text(text + "\n", encoding="utf8")
            manifest.append({"season": s, "episode": ep, "title": title, "format": fmt, "chars": len(text), "file": fn, "url": u})
            print(f"{fn}  [{fmt}] {len(text)}")
    (out / "manifest.json").write_text(json.dumps({"extracted": manifest, "skipped": skipped}, ensure_ascii=False, indent=1), encoding="utf8")
    print(f"\n완료: {len(manifest)}편 저장, {len(skipped)}편 건너뜀 → {out}/")

if __name__ == "__main__":
    main()
