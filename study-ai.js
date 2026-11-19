(function () {
  "use strict";

  var AI_ENDPOINT = "https://detailed-grasshopper-d9a0e9b307d-1420335919.ap-shanghai.app.tcloudbase.com/grade";
  var AI_CODE = "essay2026";
  var CACHE_KEY = "kaoyan-study-ai-cache-v1";
  var NOTES_KEY = "kaoyan-study-notes-v1";
  var notes = {};
  var panel, body, title, status, cache = {};
  var current = null;

  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}") || {}; } catch (e) { cache = {}; }
  try { notes = JSON.parse(localStorage.getItem(NOTES_KEY) || "{}") || {}; } catch (e) { notes = {}; }

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function norm(s) { return String(s || "").replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, ""); }
  function grams(q) {
    q = norm(q);
    if (q.length < 2) return q ? [q] : [];
    var out = [];
    for (var i = 0; i < q.length - 1; i++) out.push(q.slice(i, i + 2));
    if (q.length <= 8) out.push(q);
    return Array.from(new Set(out));
  }
  function score(text, q, gs) {
    var t = norm(text), n = 0;
    if (q && t.indexOf(q) >= 0) n += q.length * 8;
    for (var i = 0; i < gs.length; i++) {
      var x = gs[i], p = 0, c = 0;
      while ((p = t.indexOf(x, p)) >= 0) { c++; p += x.length; }
      n += Math.min(c, 5) * x.length;
    }
    return n;
  }
  function snippet(text, q) {
    var t = String(text || "").replace(/\s+/g, "");
    var i = t.indexOf(norm(q));
    if (i < 0) return t.slice(0, 170);
    return (i > 36 ? "…" : "") + t.slice(Math.max(0, i - 36), i + 150) + "…";
  }
  function topHandbook(q) {
    var data = window.HANDBOOK_INDEX || [];
    var text = q.stem + " " + Object.values(q.options || {}).join(" ") + " " + (q.chapter || "");
    var base = norm(text), gs = grams(text), out = [];
    for (var i = 0; i < data.length; i++) {
      var s = score(base + " " + data[i].text, base, gs);
      if (s > 0) out.push([s, data[i]]);
    }
    out.sort(function (a, b) { return b[0] - a[0]; });
    return out.slice(0, 3).map(function (x) { return x[1]; });
  }
  function topRelated(q) {
    var data = window.XIAO1000_INDEX || [];
    var text = q.stem + " " + Object.values(q.options || {}).join(" ");
    var base = norm(text), gs = grams(text), out = [];
    for (var i = 0; i < data.length; i++) {
      var s = score(data[i].stem + " " + (data[i].chapter || ""), base, gs);
      if (s > 0) out.push([s, data[i]]);
    }
    out.sort(function (a, b) { return b[0] - a[0]; });
    return out.slice(0, 6).map(function (x) { return x[1]; });
  }

  function ensurePanel() {
    if (panel) return;
    panel = document.createElement("section");
    panel.id = "study-ai-panel";
    panel.className = "study-ai-panel";
    panel.hidden = true;
    panel.innerHTML = '<div class="sa-head"><div><div class="sa-kicker">AI 解析 · 背诵手册 · 1000题</div><h3 id="sa-title">本题解析</h3></div><button class="sa-close" type="button" aria-label="关闭">×</button></div><div class="sa-body" id="sa-body"></div>';
    document.body.appendChild(panel);
    title = panel.querySelector("#sa-title");
    body = panel.querySelector("#sa-body");
    var style = document.createElement("style");
    style.textContent = `
      .study-ai-panel{position:fixed;right:20px;bottom:20px;z-index:90;width:min(460px,calc(100vw - 24px));max-height:min(78vh,760px);background:var(--card,#fffdf8);border:1px solid var(--line,#ded4c3);border-radius:18px;box-shadow:0 30px 80px -28px rgba(32,38,43,.6);display:flex;flex-direction:column;overflow:hidden;font-family:var(--sans,"PingFang SC",sans-serif);color:var(--ink,#20262b)}
      .study-ai-panel[hidden]{display:none!important}
      .sa-head{display:flex;justify-content:space-between;gap:10px;padding:13px 15px;background:linear-gradient(135deg,#f2f7f3,#fffdf8);border-bottom:1px solid var(--line,#ded4c3)}
      .sa-kicker{font-size:9.5px;color:var(--muted,#81796b);letter-spacing:.08em}
      .sa-head h3{margin:2px 0 0;font-family:var(--serif,serif);font-size:16px;font-weight:500}
      .sa-close{border:0;background:transparent;color:var(--muted,#81796b);font-size:22px;cursor:pointer;line-height:1}
      .sa-body{overflow:auto;padding:13px 14px 18px;background:#faf6ec;font-size:12.5px;line-height:1.85}
      .sa-block{background:#fffefb;border:1px solid var(--line,#ded4c3);border-radius:12px;padding:10px 12px;margin-bottom:10px}
      .sa-block h4{margin:0 0 6px;font-size:11px;color:var(--jade,#2f6b56);letter-spacing:.05em}
      .sa-q{font-size:13px;line-height:1.8;color:var(--ink-soft,#465058)}
      .sa-answer{margin-top:6px;font-size:12px;color:var(--ink,#20262b)}
      .sa-answer b{color:var(--jade,#2f6b56)}
      .sa-ai{white-space:pre-wrap;color:var(--ink-soft,#465058)}
      .sa-loading{color:var(--muted,#81796b)}
      .sa-item{display:block;padding:7px 0;border-top:1px dashed #e7dfd1;text-decoration:none;color:inherit}
      .sa-item:first-of-type{border-top:0}
      .sa-item b{display:block;font-size:12px;color:var(--jade,#2f6b56);font-weight:600}
      .sa-item span{display:block;color:var(--muted,#81796b);font-size:10.5px;line-height:1.6;margin-top:2px}
      .sa-item em{display:block;font-style:normal;color:var(--ink-soft,#465058);font-size:11.5px;line-height:1.7;margin-top:2px}
      .sa-note{width:100%;min-height:58px;border:1px solid var(--line,#ded4c3);border-radius:8px;padding:7px 8px;font:inherit;font-size:11.5px;line-height:1.7;resize:vertical;background:#fffefb;color:var(--ink,#20262b)}
      .sa-note-actions{display:flex;gap:7px;align-items:center;margin-top:5px;flex-wrap:wrap}
      .sa-note-btn{border:1px solid var(--line,#ded4c3);background:#fffefb;border-radius:8px;padding:5px 9px;font-size:10.5px;color:var(--jade,#2f6b56);cursor:pointer;text-decoration:none}
      .sa-foot{color:var(--muted,#81796b);font-size:10px;text-align:center;margin-top:4px}
      .sa-retry{border:1px solid var(--line,#ded4c3);background:#fffefb;border-radius:8px;padding:6px 10px;font-size:11px;color:var(--jade,#2f6b56);cursor:pointer;margin-top:6px}
      .sa-page-modal{position:fixed;inset:0;z-index:120;background:rgba(20,24,26,.72);display:flex;align-items:center;justify-content:center;padding:18px;}
      .sa-page-modal iframe{max-width:min(920px,96vw);max-height:92vh;width:90vw;height:92vh;border:0;border-radius:10px;background:#fff;box-shadow:0 24px 70px rgba(0,0,0,.5);}
      .sa-page-modal button{position:fixed;top:14px;right:18px;border:0;background:rgba(255,255,255,.92);border-radius:50%;width:38px;height:38px;font-size:22px;cursor:pointer;}
      @media(max-width:600px){.study-ai-panel{right:10px;left:10px;bottom:10px;width:auto;max-height:82vh}}
    `;
    document.head.appendChild(style);
    panel.querySelector(".sa-close").addEventListener("click", function () { panel.hidden = true; });
    panel.addEventListener("click", function (e) {
      var a = e.target.closest("[data-handbook]");
      if (a) {
        e.preventDefault();
        var p = (window.HANDBOOK_INDEX || []).find(function (x) { return x.id === a.getAttribute("data-handbook"); });
        if (p) showPageImage(p);
      }
    });
  }

  function showPageImage(p) {
    var old = document.querySelector(".sa-page-modal");
    if (old) old.remove();
    var box = document.createElement("div");
    box.className = "sa-page-modal";
    var src = (p.volKey === "up" ? "handbook-up.pdf" : "handbook-down.pdf") + "#page=" + p.pdfPage + "&toolbar=0";
    box.innerHTML = '<button type="button" aria-label="关闭">×</button><iframe title="背诵手册页面" src="' + esc(src) + '" style="width:min(920px,96vw);height:92vh;border:0;border-radius:10px;background:#fff;box-shadow:0 24px 70px rgba(0,0,0,.5);"></iframe>';
    document.body.appendChild(box);
    box.querySelector("button").addEventListener("click", function () { box.remove(); });
    box.addEventListener("click", function (e) { if (e.target === box) box.remove(); });
  }

  function answerText(q) {
    if (!q.answer) return "（答案待补）";
    return String(q.answer).split("").join("");
  }

  function renderLocal(q, hand, rel) {
    ensurePanel();
    current = q;
    title.textContent = "本题解析";
    var html = '<div class="sa-block"><h4>题目</h4><div class="sa-q">' + esc(q.stem) + '</div><div class="sa-answer">正确答案：<b>' + esc(answerText(q)) + "</b></div></div>";
    html += '<div class="sa-block"><h4>AI 解析</h4><div id="sa-ai" class="sa-ai"><span class="sa-loading">正在结合背诵手册和1000题分析…</span></div></div>';
    if (hand.length) {
      html += '<div class="sa-block"><h4>背诵手册定位</h4>' + hand.map(function (p) {
        return '<a class="sa-item" href="shouce.html?page=' + encodeURIComponent(p.id) + '" data-handbook="' + esc(p.id) + '"><b>' + esc(p.volume) + " · PDF 第 " + p.pdfPage + " 页</b><span>" + esc(p.heading || "") + "</span><em>" + esc(snippet(p.text, q.stem.slice(0, 12))) + "</em></a>";
      }).join("") + "</div>";
    }
    if (rel.length) {
      html += '<div class="sa-block"><h4>肖1000相关练习</h4>' + rel.map(function (r) {
        return '<a class="sa-item" href="xiao1000.html?section=' + encodeURIComponent(r.section) + "&q=" + encodeURIComponent(r.id) + "&back=" + encodeURIComponent(location.href) + '"><b>' + esc(r.sectionTitle) + " · 第 " + r.id.split("-").pop() + " 题</b><span>" + esc(r.stem.slice(0, 80)) + "…</span></a>";
      }).join("") + "</div>";
    }
    html += '<div class="sa-block"><h4>我的笔记</h4><div id="sa-note-view" style="font-size:11.5px;color:#465058;white-space:pre-wrap;line-height:1.7"></div><textarea id="sa-note-input" class="sa-note" placeholder="记下错因、记忆口诀，或把 AI 解析压缩成自己的话…"></textarea><div class="sa-note-actions"><button type="button" class="sa-note-btn" id="sa-note-save">保存笔记</button><button type="button" class="sa-note-btn" id="sa-note-edit">写笔记 / 编辑</button><a class="sa-note-btn" href="notes.html" target="_self">查看全部笔记</a></div></div>';
    html += '<div class="sa-foot">AI 回答仅供参考，页码为 PDF 页；知识点以原书为准。</div>';
    body.innerHTML = html;
    panel.hidden = false;
    bindNote(q);
  }

  function bindNote(q) {
    var view = document.getElementById("sa-note-view");
    var input = document.getElementById("sa-note-input");
    var save = document.getElementById("sa-note-save");
    var edit = document.getElementById("sa-note-edit");
    if (!view || !input || !save || !edit) return;
    var rec = notes[q.id];
    var refresh = function () {
      view.textContent = rec && rec.note ? rec.note : "还没有笔记。";
      input.value = rec && rec.note ? rec.note : "";
      input.hidden = true;
      save.hidden = true;
      edit.textContent = rec && rec.note ? "编辑笔记" : "写笔记";
    };
    refresh();
    edit.addEventListener("click", function () {
      input.hidden = false;
      save.hidden = false;
      edit.textContent = "收起";
      input.focus();
    });
    save.addEventListener("click", function () {
      var txt = input.value.trim();
      if (!txt) return;
      var aiEl = document.getElementById("sa-ai");
      notes[q.id] = {
        qid: q.id,
        module: String(q.id || "").charAt(0) === "b" ? "肖八" : "近10年真题",
        stem: q.stem,
        answer: q.answer || "",
        ai: aiEl ? aiEl.textContent : "",
        note: txt,
        at: Date.now()
      };
      try { localStorage.setItem(NOTES_KEY, JSON.stringify(notes)); } catch (e) {}
      rec = notes[q.id];
      refresh();
    });
  }

  function aiPrompt(q, hand, rel) {
    var hb = hand.slice(0, 2).map(function (p) {
      return "【" + p.volume + " PDF第" + p.pdfPage + "页】" + String(p.text || "").slice(0, 220);
    }).join("\n");
    var xq = rel.slice(0, 3).map(function (r) {
      return "（" + r.sectionTitle + " 第" + r.id.split("-").pop() + "题）" + String(r.stem || "").slice(0, 90);
    }).join("\n");
    var prompt = "请忽略作文批改场景，作为考研政治老师分析这道选择题。不要编造页码，引用背诵手册时只用给出的页码。\n\n【题目】" + String(q.stem || "").slice(0, 520) +
      "\n【选项】" + Object.keys(q.options || {}).map(function (k) { return k + ". " + String(q.options[k] || "").slice(0, 50); }).join("；") +
      "\n【正确答案】" + answerText(q) +
      "\n【背诵手册片段】\n" + (hb || "无") +
      "\n【肖1000相关题】\n" + (xq || "无") +
      "\n\n请按格式输出：1.本题考点 2.为什么选 3.干扰项/易错点 4.相关知识点在手册哪里、怎么记 5.巩固建议。400字以内。";
    return prompt.slice(0, 1450);
  }

  function callAI(q, hand, rel) {
    var key = q.id || norm(q.stem).slice(0, 40);
    if (cache[key] && cache[key].answer) {
      var el0 = document.getElementById("sa-ai");
      if (el0) el0.textContent = cache[key].answer;
      return;
    }
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 60000);
    fetch(AI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-access-code": AI_CODE },
      body: JSON.stringify({
        mode: "chat",
        question: aiPrompt(q, hand, rel),
        context: { type: "big", promptText: "考研政治选择题解析", essayText: "", grade: { score: "", band: "", issues: [], deductions: [] } },
        history: []
      }),
      signal: controller.signal
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) throw new Error(d.error || ("HTTP " + r.status)); return d; }); })
      .then(function (d) {
        var text = String(d.answer || "").trim();
        if (!text) throw new Error("AI 没有返回内容");
        cache[key] = { answer: text, at: Date.now() };
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) {}
        var el = document.getElementById("sa-ai");
        if (el && current === q) el.textContent = text;
      })
      .catch(function (err) {
        var el = document.getElementById("sa-ai");
        if (el && current === q) {
          el.innerHTML = '<span style="color:#8d3b2f">AI 暂时不可用：' + esc(err.name === "AbortError" ? "请求超时" : (err.message || "网络错误")) + '</span><br><button class="sa-retry" type="button" id="sa-retry">重试</button>';
          var btn = document.getElementById("sa-retry");
          if (btn) btn.addEventListener("click", function () { cache[key] = null; renderAndRun(q, hand, rel); });
        }
      })
      .finally(function () { clearTimeout(timer); });
  }

  function renderAndRun(q, hand, rel) {
    renderLocal(q, hand, rel);
    callAI(q, hand, rel);
  }

  window.showStudyAI = function (q, opts) {
    if (!q) return;
    var hand = topHandbook(q), rel = topRelated(q);
    renderAndRun(q, hand, rel);
  };
})();
