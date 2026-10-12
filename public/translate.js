/* 한영 병기 번역·정리 + PDF 출력 페이지 (#translate) */
(function () {
  const MAX_CHARS = 6000;
  const DOCS_KEY = "trilingo-docs-v1";
  const PREFS_KEY = "trilingo-translate-prefs-v1";
  const MAX_DOCS = 10;

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const SAMPLE = `5학년 4반 가정통신문

안녕하세요, 학부모님. 다음 주 금요일(10월 17일)에 국립중앙박물관으로 현장체험학습을 갑니다.
학생들은 오전 8시 40분까지 교실에 도착해야 하며, 오후 3시에 학교로 돌아옵니다.

준비물: 도시락, 물, 편한 운동화, 필기도구
참가비는 없으며, 버스 비용은 학교에서 부담합니다.

참가 동의서는 10월 14일(화)까지 담임교사에게 제출해 주세요.
궁금한 점이 있으면 학교(02-123-4567)로 연락 주시기 바랍니다.`;

  // ---------- 저장 ----------
  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }
  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }
  const loadDocs = () => loadJSON(DOCS_KEY, []);
  function saveDoc(entry) {
    const docs = loadDocs().filter((d) => d.id !== entry.id);
    docs.unshift(entry);
    saveJSON(DOCS_KEY, docs.slice(0, MAX_DOCS));
  }
  function deleteDoc(id) {
    saveJSON(DOCS_KEY, loadDocs().filter((d) => d.id !== id));
  }

  function todayDots() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}. ${pad(d.getMonth() + 1)}. ${pad(d.getDate())}.`;
  }

  // ---------- 문서 렌더링 ----------
  // data-path 는 편집 내용을 원래 객체에 되돌려 쓰는 주소다. 예: "sections.0.pairs.2.en"
  function cell(text, path, cls) {
    return `<span class="${cls}" contenteditable="true" spellcheck="false" data-path="${path}">${esc(text)}</span>`;
  }

  function renderDocHtml(doc, layout, date) {
    const head = `
      <header class="doc-head">
        <h1 class="doc-title">${cell(doc.title_ko, "title_ko", "ko")}</h1>
        <div class="doc-title-en">${cell(doc.title_en, "title_en", "en")}</div>
        <div class="doc-date">${cell(date, "date", "")}</div>
      </header>`;

    const sections = doc.sections
      .map((s, si) => {
        const heading =
          s.heading_ko || s.heading_en
            ? `<h2 class="doc-h2">${cell(s.heading_ko, `sections.${si}.heading_ko`, "ko")}<span class="sep"> · </span>${cell(s.heading_en, `sections.${si}.heading_en`, "en")}</h2>`
            : "";
        if (layout === "table") {
          const rows = s.pairs
            .map(
              (p, pi) => `<tr>
                <td>${cell(p.ko, `sections.${si}.pairs.${pi}.ko`, "ko")}</td>
                <td>${cell(p.en, `sections.${si}.pairs.${pi}.en`, "en")}</td>
              </tr>`
            )
            .join("");
          return `<section class="doc-sec">${heading}
            <table class="bi-table"><colgroup><col style="width:50%"><col style="width:50%"></colgroup>
              <thead><tr><th>한국어</th><th>English</th></tr></thead><tbody>${rows}</tbody></table></section>`;
        }
        const pairs = s.pairs
          .map(
            (p, pi) => `<div class="pair">
              <p>${cell(p.ko, `sections.${si}.pairs.${pi}.ko`, "ko")}</p>
              <p>${cell(p.en, `sections.${si}.pairs.${pi}.en`, "en")}</p>
            </div>`
          )
          .join("");
        return `<section class="doc-sec">${heading}${pairs}</section>`;
      })
      .join("");

    const vocab = doc.vocab.length
      ? `<section class="doc-sec doc-vocab">
          <h2 class="doc-h2"><span class="ko">핵심 어휘</span><span class="sep"> · </span><span class="en">Key Words</span></h2>
          <table class="bi-table vocab-table">
            <colgroup><col style="width:24%"><col style="width:30%"><col></colgroup>
            <thead><tr><th>한국어</th><th>English</th><th>설명</th></tr></thead>
            <tbody>${doc.vocab
              .map(
                (v, vi) => `<tr>
                  <td>${cell(v.ko, `vocab.${vi}.ko`, "ko")}</td>
                  <td>${cell(v.en, `vocab.${vi}.en`, "en")}</td>
                  <td>${cell(v.note, `vocab.${vi}.note`, "note")}</td>
                </tr>`
              )
              .join("")}</tbody>
          </table>
        </section>`
      : "";

    return `<article class="doc-sheet ${layout === "table" ? "layout-table" : "layout-stack"}" id="doc-sheet">${head}${sections}${vocab}</article>`;
  }

  function setByPath(obj, path, value) {
    const keys = path.split(".");
    let cur = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      cur = cur?.[keys[i]];
      if (cur == null) return;
    }
    cur[keys[keys.length - 1]] = value;
  }

  function docToText(doc, date) {
    const lines = [doc.title_ko, doc.title_en, date, ""];
    for (const s of doc.sections) {
      if (s.heading_ko || s.heading_en) lines.push(`[${s.heading_ko} / ${s.heading_en}]`);
      for (const p of s.pairs) lines.push(p.ko, p.en, "");
    }
    if (doc.vocab.length) {
      lines.push("[핵심 어휘 / Key Words]");
      for (const v of doc.vocab) lines.push(`${v.ko} - ${v.en}${v.note ? ` (${v.note})` : ""}`);
    }
    return lines.join("\n").trim();
  }

  // 윈도우 메모장의 한글 txt 는 EUC-KR(CP949)인 경우가 많아 UTF-8 이 아니면 EUC-KR 로 다시 읽는다.
  async function readTextFile(file) {
    const buf = await file.arrayBuffer();
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(buf);
    } catch {
      return new TextDecoder("euc-kr").decode(buf);
    }
  }

  function errorMessage(code, data) {
    return (
      {
        no_api_key: "OpenAI API 키가 설정되지 않았어요. Vercel 환경변수에 OPENAI_API_KEY 를 넣고 다시 배포하세요.",
        bad_api_key: "OpenAI API 키가 잘못됐어요. 키를 다시 확인하세요.",
        no_credit: "OpenAI 잔액이 없어요. platform.openai.com 에서 충전하세요.",
        rate_limited: "요청이 너무 잦아요. 잠시 후 다시 시도하세요.",
        too_long: `원문이 너무 길어요. ${MAX_CHARS.toLocaleString()}자 이하로 나눠서 넣어 주세요.`,
        empty_text: "원문을 입력하세요.",
        output_truncated: "결과가 너무 길어 잘렸어요. 원문을 두 부분으로 나눠 주세요.",
        bad_model_output: "AI 결과 형식이 이상해요. 한 번 더 시도해 주세요.",
        upstream_unreachable: "OpenAI 서버에 연결하지 못했어요.",
        upstream_error: "OpenAI 오류: " + (data?.detail || ""),
      }[code] || `오류가 발생했어요 (${code || "알 수 없음"}).`
    );
  }

  // ---------- 페이지 ----------
  function render($app) {
    const prefs = { tone: "auto", layout: "stack", vocab: true, ...loadJSON(PREFS_KEY, {}) };
    let current = null; // { id, createdAt, date, source, tone, vocab, doc, model }
    let saveTimer = null;

    $app.innerHTML = `
      <div class="no-print">
        <div class="row"><a class="btn ghost small" href="#home">← 홈</a><h1 class="grow" style="margin:0 10px">📄 한영 병기 문서</h1></div>
        <p class="sub">한국어(또는 영어) 글을 붙여 넣으면 AI가 번역하고 한영 병기로 정리합니다. 결과는 고친 뒤 PDF로 저장할 수 있어요.</p>
        <div id="tr-notice"></div>
        <section class="card">
          <label for="tr-src">원문</label>
          <textarea id="tr-src" class="tr-src" rows="9" maxlength="${MAX_CHARS}" placeholder="가정통신문, 수업 안내, 알림장 등을 붙여 넣거나 TXT 파일을 끌어다 놓으세요."></textarea>
          <div class="row" style="margin-top:6px">
            <button class="btn ghost small" id="tr-sample">예시 넣기</button>
            <button class="btn ghost small" id="tr-file-btn">📂 TXT 파일 불러오기</button>
            <input type="file" id="tr-file" accept=".txt,text/plain" hidden />
            <span class="help right" id="tr-count">0 / ${MAX_CHARS.toLocaleString()}자</span>
          </div>
          <div class="tr-opts">
            <div>
              <label for="tr-tone">문체</label>
              <select id="tr-tone">
                <option value="auto">원문 그대로</option>
                <option value="formal">학부모 안내 (격식체)</option>
                <option value="plain">학생용 (쉬운 말)</option>
              </select>
            </div>
            <div>
              <label>배치</label>
              <div class="seg" id="tr-layout">
                <button class="btn small" data-layout="stack">줄 병기</button>
                <button class="btn small" data-layout="table">2단 표</button>
              </div>
            </div>
            <div>
              <label class="check"><input type="checkbox" id="tr-vocab" /> 핵심 어휘 표 넣기</label>
            </div>
          </div>
          <button class="btn primary block" id="tr-go" style="margin-top:12px">번역·정리하기</button>
          <p class="help" id="tr-status"></p>
        </section>
      </div>

      <div id="tr-result" hidden>
        <div class="row no-print tr-actions">
          <button class="btn primary" id="tr-pdf">PDF로 저장</button>
          <button class="btn" id="tr-copy">텍스트 복사</button>
          <span class="help grow">문장을 눌러 바로 고칠 수 있어요. 고친 내용은 자동 저장됩니다.</span>
        </div>
        <div id="tr-doc"></div>
        <p class="help no-print" id="tr-pdf-hint">PDF로 저장: 인쇄 창에서 <b>대상 → PDF로 저장</b>을 고르세요. 휴대폰은 <b>공유 → 인쇄 → PDF</b> 순서입니다. 번역은 AI가 만든 것이니 보내기 전에 꼭 확인하세요.</p>
      </div>

      <section class="card no-print" id="tr-history-card">
        <h2 style="margin-top:0">최근 문서</h2>
        <div id="tr-history"></div>
        <p class="help">최근 ${MAX_DOCS}개가 이 브라우저에만 저장됩니다.</p>
      </section>`;

    const $src = document.getElementById("tr-src");
    const $count = document.getElementById("tr-count");
    const $tone = document.getElementById("tr-tone");
    const $vocab = document.getElementById("tr-vocab");
    const $go = document.getElementById("tr-go");
    const $status = document.getElementById("tr-status");
    const $result = document.getElementById("tr-result");
    const $doc = document.getElementById("tr-doc");
    const $notice = document.getElementById("tr-notice");

    $tone.value = prefs.tone;
    $vocab.checked = !!prefs.vocab;

    function savePrefs() {
      saveJSON(PREFS_KEY, prefs);
    }
    function paintLayoutButtons() {
      document.querySelectorAll("#tr-layout [data-layout]").forEach((b) => b.classList.toggle("primary", b.dataset.layout === prefs.layout));
    }
    function updateCount() {
      $count.textContent = `${$src.value.length.toLocaleString()} / ${MAX_CHARS.toLocaleString()}자`;
    }

    function paintDoc() {
      if (!current) {
        $result.hidden = true;
        return;
      }
      $result.hidden = false;
      $doc.innerHTML = renderDocHtml(current.doc, prefs.layout, current.date);
      $doc.querySelectorAll("[data-path]").forEach((el) => {
        el.addEventListener("input", () => {
          const path = el.dataset.path;
          const value = el.innerText.replace(/\n+$/, "");
          if (path === "date") current.date = value;
          else setByPath(current.doc, path, value);
          clearTimeout(saveTimer);
          saveTimer = setTimeout(() => {
            saveDoc(current);
            paintHistory();
          }, 600);
        });
        // 붙여넣기는 서식 없이 글자만
        el.addEventListener("paste", (e) => {
          e.preventDefault();
          const t = (e.clipboardData || window.clipboardData).getData("text/plain");
          document.execCommand("insertText", false, t);
        });
      });
    }

    function paintHistory() {
      const docs = loadDocs();
      const $h = document.getElementById("tr-history");
      if (!docs.length) {
        $h.innerHTML = `<p class="help">아직 없어요.</p>`;
        return;
      }
      $h.innerHTML = docs
        .map(
          (d) => `<div class="row tr-hist-row">
            <button class="btn ghost small grow" style="text-align:left" data-open="${esc(d.id)}">${esc(d.doc.title_ko || "(제목 없음)")} <span class="help">· ${esc(d.date)}</span></button>
            <button class="btn ghost small" data-del="${esc(d.id)}" title="삭제">🗑</button>
          </div>`
        )
        .join("");
      $h.querySelectorAll("[data-open]").forEach(
        (b) =>
          (b.onclick = () => {
            const d = loadDocs().find((x) => x.id === b.dataset.open);
            if (!d) return;
            current = d;
            $src.value = d.source || "";
            updateCount();
            paintDoc();
            $result.scrollIntoView({ behavior: "smooth", block: "start" });
          })
      );
      $h.querySelectorAll("[data-del]").forEach(
        (b) =>
          (b.onclick = () => {
            if (!confirm("이 문서를 지울까요?")) return;
            deleteDoc(b.dataset.del);
            if (current && current.id === b.dataset.del) {
              current = null;
              paintDoc();
            }
            paintHistory();
          })
      );
    }

    async function translate() {
      const text = $src.value.trim();
      if (!text) {
        $status.textContent = errorMessage("empty_text");
        $src.focus();
        return;
      }
      $go.disabled = true;
      $notice.innerHTML = "";
      $status.textContent = "번역·정리 중… 긴 글은 30초 이상 걸릴 수 있어요.";
      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, tone: prefs.tone, vocab: prefs.vocab }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = errorMessage(data.error, data);
          if (data.error === "no_api_key" || data.error === "bad_api_key" || data.error === "no_credit") {
            $notice.innerHTML = `<div class="notice">🔑 ${esc(msg)}</div>`;
            $status.textContent = "";
          } else {
            $status.textContent = msg;
          }
          return;
        }
        current = {
          id: String(Date.now()),
          createdAt: Date.now(),
          date: todayDots(),
          source: text,
          tone: prefs.tone,
          vocab: prefs.vocab,
          doc: data.doc,
          model: data.model,
        };
        saveDoc(current);
        $status.textContent = "";
        paintDoc();
        paintHistory();
        $result.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (e) {
        $status.textContent = "네트워크 오류: " + e.message;
      } finally {
        $go.disabled = false;
      }
    }

    function printPdf() {
      if (!current) return;
      const prevTitle = document.title;
      // 대부분의 브라우저는 문서 제목을 PDF 파일 이름으로 쓴다.
      document.title = `${(current.doc.title_ko || "문서").replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim()}_한영`;
      document.body.classList.add("print-doc");
      const restore = () => {
        document.title = prevTitle;
        document.body.classList.remove("print-doc");
        window.removeEventListener("afterprint", restore);
      };
      window.addEventListener("afterprint", restore);
      window.print();
      // afterprint 를 지원하지 않는 브라우저 대비
      setTimeout(restore, 1500);
    }

    async function copyText() {
      if (!current) return;
      const text = docToText(current.doc, current.date);
      try {
        await navigator.clipboard.writeText(text);
        alert("복사했어요. 메신저나 알림장에 붙여 넣으세요.");
      } catch {
        prompt("아래 내용을 복사하세요.", text);
      }
    }

    async function loadFile(file) {
      if (!file) return;
      if (!/\.txt$/i.test(file.name) && file.type !== "text/plain") {
        $status.textContent = "TXT 파일만 불러올 수 있어요.";
        return;
      }
      try {
        let text = (await readTextFile(file)).replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
        let msg = `"${file.name}" 파일을 불러왔어요.`;
        if (text.length > MAX_CHARS) {
          text = text.slice(0, MAX_CHARS);
          msg += ` ${MAX_CHARS.toLocaleString()}자가 넘어 앞부분만 넣었어요. 나머지는 나눠서 번역하세요.`;
        }
        $src.value = text;
        updateCount();
        $status.textContent = msg;
      } catch (e) {
        $status.textContent = "파일을 읽지 못했어요: " + e.message;
      }
    }

    const $file = document.getElementById("tr-file");
    document.getElementById("tr-file-btn").onclick = () => $file.click();
    $file.onchange = () => {
      loadFile($file.files[0]);
      $file.value = ""; // 같은 파일을 다시 골라도 반영되도록
    };
    $src.addEventListener("dragover", (e) => e.preventDefault());
    $src.addEventListener("drop", (e) => {
      const f = e.dataTransfer?.files?.[0];
      if (!f) return;
      e.preventDefault();
      loadFile(f);
    });

    $src.addEventListener("input", updateCount);
    document.getElementById("tr-sample").onclick = () => {
      $src.value = SAMPLE;
      updateCount();
    };
    $tone.onchange = () => {
      prefs.tone = $tone.value;
      savePrefs();
    };
    $vocab.onchange = () => {
      prefs.vocab = $vocab.checked;
      savePrefs();
    };
    document.querySelectorAll("#tr-layout [data-layout]").forEach(
      (b) =>
        (b.onclick = () => {
          prefs.layout = b.dataset.layout;
          savePrefs();
          paintLayoutButtons();
          paintDoc();
        })
    );
    $go.onclick = translate;
    document.getElementById("tr-pdf").onclick = printPdf;
    document.getElementById("tr-copy").onclick = copyText;

    paintLayoutButtons();
    updateCount();
    paintHistory();
  }

  window.TranslatePage = { render, _renderDocHtml: renderDocHtml, _docToText: docToText };
})();
