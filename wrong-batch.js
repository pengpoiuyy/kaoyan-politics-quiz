(function () {
  "use strict";
  var AI_ENDPOINT = "https://detailed-grasshopper-d9a0e9b307d-1420335919.ap-shanghai.app.tcloudbase.com/grade";
  var AI_CODE = "essay2026";
  var CACHE_KEY = "kaoyan-batch-ai-v1";
  var cache = {};
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}") || {}; } catch (e) { cache = {}; }

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function sections() { return window.__QUIZ_SECTIONS || []; }
  function currentSection() {
    try { return window.__getQuizState ? window.__getQuizState().section : ""; } catch (e) { return ""; }
  }
  function parseNums(text) {
    var out = [];
    var s = String(text || "").replace(/[，、；;]/g, ",");
    s.split(/[\s,]+/).forEach(function (part) {
      var m = part.match(/^(\d{1,2})\s*[-~—至]\s*(\d{1,2})$/);
      if (m) {
        var a = +m[1], b = +m[2];
        for (var i = Math.min(a, b); i <= Math.max(a, b); i++) out.push(i);
      } else {
        var n = part.match(/^第?(\d{1,2})题?$/);
        if (n) out.push(+n[1]);
      }
    });
    return Array.from(new Set(out.filter(function (n) { return n >= 1 && n <= 33; }))).sort(function (a, b) { return a - b; });
  }
  function ensure() {
    if (document.getElementById("wb-open")) return;
    var actions = document.querySelector(".actions");
    var btn = document.createElement("button");
    btn.id = "wb-open";
    btn.type = "button";
    btn.className = "ghost-btn";
    btn.textContent = "错题号解析";
    btn.addEventListener("click", open);
    if (actions) actions.insertBefore(btn, actions.firstChild); else { btn.style.cssText = "position:fixed;left:18px;bottom:20px;z-index:59"; document.body.appendChild(btn); }

    var panel = document.createElement("section");
    panel.id = "wb-panel";
    panel.hidden = true;
    panel.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:135;width:min(520px,calc(100vw - 24px));max-height:min(82vh,760px);background:var(--card,#fffdf8);border:1px solid var(--line,#ded4c3);border-radius:18px;box-shadow:0 30px 90px -30px rgba(0,0,0,.55);display:flex;flex-direction:column;overflow:hidden;font-family:var(--sans,sans-serif);";
    panel.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:flex-start;padding:13px 15px;background:linear-gradient(135deg,#f2f7f3,#fffdf8);border-bottom:1px solid var(--line,#ded4c3);"><div><div style="font-size:9.5px;color:#81796b;letter-spacing:.08em">批量错题 · AI 解析</div><h3 style="margin:2px 0 0;font-family:var(--serif,serif);font-size:16px;font-weight:500;color:#20262b">输入这张卷子的错题号</h3></div><button id="wb-close" type="button" style="border:0;background:transparent;font-size:22px;color:#81796b;cursor:pointer;">×</button></div><div style="padding:12px 14px;border-bottom:1px solid #e7dfd1;background:#fffefb;"><select id="wb-section" style="width:100%;border:1px solid #ded4c3;border-radius:9px;padding:8px;background:#fffefb;color:#20262b;font-size:12px;margin-bottom:8px"></select><input id="wb-input" placeholder="如：3,7,12-15（只填这张卷的题号）" style="width:100%;border:1px solid #ded4c3;border-radius:9px;padding:9px 10px;font-size:13px;outline:none;background:#fffefb;color:#20262b;box-sizing:border-box;"><div style="display:flex;gap:8px;margin-top:8px;align-items:center"><button id="wb-start" type="button" style="border:0;border-radius:9px;background:#2f6b56;color:#fff;padding:8px 14px;font-size:12px;cursor:pointer;">开始解析</button><span id="wb-count" style="font-size:10.5px;color:#81796b"></span></div></div><div id="wb-results" style="overflow:auto;background:#faf6ec;padding:10px 12px 16px;"></div>';
    document.body.appendChild(panel);
    document.getElementById("wb-close").addEventListener("click", function () { panel.hidden = true; });
    document.getElementById("wb-start").addEventListener("click", start);
    document.getElementById("wb-input").addEventListener("keydown", function (e) { if (e.key === "Enter") start(); });

    // fill select
    var sel = document.getElementById("wb-section");
    var cur = currentSection();
    sel.innerHTML = sections().map(function (s) {
      return '<option value="' + esc(s.id) + '">' + esc(s.title) + "（" + s.questions.length + "题）</option>";
    }).join("");
    if (cur && sections().some(function (s) { return s.id === cur; })) sel.value = cur;
  }
  function open() {
    ensure();
    var panel = document.getElementById("wb-panel");
    panel.hidden = false;
    var sel = document.getElementById("wb-section"), cur = currentSection();
    if (cur) sel.value = cur;
    document.getElementById("wb-input").focus();
  }
  function findQ(secId, num) {
    var s = sections().find(function (x) { return x.id === secId; });
    return s ? s.questions.find(function (q) { return Number(q.num) === num; }) : null;
  }
  function promptFor(q) {
    var opts = ["A", "B", "C", "D"].map(function (l) { return l + ". " + String(q.options[l] || "").slice(0, 55); }).join("；");
    return ("请忽略作文批改场景，作为考研政治老师分析这道选择题。题目：" + String(q.stem || "").slice(0, 600) +
      " 选项：" + opts + " 正确答案：" + (q.answer || "") +
      "。请输出：1.本题考点 2.为什么选 3.干扰项/易错点 4.一句记忆提示。250字以内。").slice(0, 1450);
  }
  function ask(q, key) {
    if (cache[key] && cache[key].text) return Promise.resolve(cache[key].text);
    return fetch(AI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-access-code": AI_CODE },
      body: JSON.stringify({
        mode: "chat",
        question: promptFor(q),
        context: { type: "big", promptText: "考研政治选择题错题解析", essayText: "", grade: { score: "", band: "", issues: [], deductions: [] } },
        history: []
      })
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) throw new Error(d.error || ("HTTP " + r.status)); return d; }); })
      .then(function (d) {
        var text = String(d.answer || "").trim();
        if (!text) throw new Error("AI 没有返回内容");
        cache[key] = { text: text, at: Date.now() };
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) {}
        return text;
      });
  }
  async function start() {
    var secId = document.getElementById("wb-section").value;
    var nums = parseNums(document.getElementById("wb-input").value);
    var box = document.getElementById("wb-results");
    var count = document.getElementById("wb-count");
    if (!nums.length) { alert("请输入错题号，例如 3,7,12-15"); return; }
    var qs = nums.map(function (n) { return findQ(secId, n); }).filter(Boolean);
    if (!qs.length) { alert("这张卷子里没有找到这些题号"); return; }
    count.textContent = "共 " + qs.length + " 题，正在逐题解析…";
    box.innerHTML = qs.map(function (q) {
      return '<article class="wb-item" data-id="' + esc(q.id) + '" style="background:#fffefb;border:1px solid #e5ded0;border-radius:12px;padding:10px 12px;margin-bottom:9px;"><div style="display:flex;gap:7px;align-items:center;color:#81796b;font-size:10px"><span style="background:#e4efe8;color:#2f6b56;border-radius:999px;padding:2px 7px">第 ' + q.num + ' 题</span><span>' + esc(q.type === "multiple" ? "多选" : "单选") + '</span><button class="wb-full" type="button" data-qid="' + esc(q.id) + '" style="margin-left:auto;border:1px solid #ded4c3;background:transparent;border-radius:7px;padding:3px 7px;font-size:9.5px;color:#2f6b56;cursor:pointer">完整解析</button></div><p style="font-size:11.5px;line-height:1.7;color:#465058;margin:6px 0">' + esc(String(q.stem || "").slice(0, 110)) + "…</p><div style=\"font-size:10.5px;color:#2f6b56;margin-bottom:4px\">正确答案：" + esc(q.answer || "") + '</div><div class="wb-ai" style="font-size:11.5px;line-height:1.8;color:#465058;white-space:pre-wrap">排队中…</div></article>';
    }).join("");
    box.querySelectorAll(".wb-full").forEach(function (b) {
      b.addEventListener("click", function () {
        var q = qs.find(function (x) { return x.id === b.dataset.qid; });
        if (q && window.showStudyAI) window.showStudyAI(q);
      });
    });
    for (var i = 0; i < qs.length; i++) {
      var q = qs[i], el = box.querySelector('[data-id="' + q.id + '"] .wb-ai');
      if (el) el.textContent = "解析中…";
      try {
        var text = await ask(q, q.id);
        if (el) el.textContent = text;
      } catch (e) {
        if (el) el.textContent = "AI 暂时不可用：" + (e.message || "网络错误");
      }
      count.textContent = "已完成 " + (i + 1) + " / " + qs.length;
    }
    count.textContent = "解析完成 · 共 " + qs.length + " 题";
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ensure);
  else ensure();
})();
