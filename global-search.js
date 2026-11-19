(function () {
  "use strict";
  var overlay, input, results, loaded = false, loading = false, timer = null;
  var DATA = { h: [], x: [], z: [] };

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function norm(s) { return String(s || "").replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, ""); }
  function grams(q) {
    q = norm(q);
    if (q.length < 2) return q ? [q] : [];
    var a = [];
    for (var i = 0; i < q.length - 1; i++) a.push(q.slice(i, i + 2));
    if (q.length <= 8) a.push(q);
    return Array.from(new Set(a));
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
  function loadScript(src) {
    return new Promise(function (resolve) {
      if (document.querySelector('script[src="' + src + '"]')) return resolve();
      var s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = resolve;
      document.head.appendChild(s);
    });
  }
  function ensureData() {
    if (loaded || loading) return Promise.resolve();
    loading = true;
    results.innerHTML = '<div class="gs-empty">正在加载题库索引…</div>';
    return Promise.all([
      loadScript("handbook-data.js"),
      loadScript("xiao1000-index.js"),
      loadScript("zhenti-data.js")
    ]).then(function () {
      DATA.h = window.HANDBOOK_INDEX || [];
      DATA.x = window.XIAO1000_INDEX || [];
      DATA.z = window.ZHENTI_INDEX || [];
      loaded = true;
      loading = false;
      runSearch();
    });
  }

  function ensureUI() {
    if (overlay) return;
    var btn = document.createElement("button");
    btn.id = "gs-open";
    btn.type = "button";
    btn.textContent = "🔍 搜索";
    btn.title = "全局搜索（Ctrl+K）";
    btn.style.cssText = "position:fixed;left:18px;bottom:18px;z-index:58;border:1px solid var(--line,#ded4c3);background:rgba(255,253,248,.96);color:var(--ink-soft,#465058);border-radius:999px;padding:8px 13px;font-size:11px;cursor:pointer;box-shadow:0 8px 20px -12px rgba(32,38,43,.4);font-family:var(--sans,sans-serif);";
    btn.addEventListener("click", open);
    document.body.appendChild(btn);

    overlay = document.createElement("div");
    overlay.id = "gs-overlay";
    overlay.style.cssText = "position:fixed;inset:0;z-index:130;background:rgba(24,28,30,.45);display:none;align-items:flex-start;justify-content:center;padding:min(12vh,110px) 14px 20px;";
    overlay.innerHTML = '<div style="width:min(760px,100%);background:var(--card,#fffdf8);border:1px solid var(--line,#ded4c3);border-radius:16px;box-shadow:0 30px 90px -30px rgba(0,0,0,.55);overflow:hidden;"><div style="display:flex;gap:8px;padding:12px;border-bottom:1px solid var(--line,#ded4c3);"><input id="gs-input" placeholder="搜知识点 / 1000题 / 真题…（Ctrl+K）" style="flex:1;border:0;outline:0;background:transparent;font-size:15px;color:var(--ink,#20262b);padding:6px 4px;"><button id="gs-close" type="button" style="border:0;background:transparent;color:var(--muted,#81796b);font-size:20px;cursor:pointer;">×</button></div><div id="gs-results" style="max-height:min(62vh,560px);overflow:auto;padding:10px 14px 16px;"></div><div style="padding:8px 14px;color:var(--muted,#81796b);font-size:10px;border-top:1px solid #eee6d9;">Enter 打开第一条 · Esc 关闭 · 点击结果当前页跳转</div></div>';
    document.body.appendChild(overlay);
    input = overlay.querySelector("#gs-input");
    results = overlay.querySelector("#gs-results");
    overlay.querySelector("#gs-close").addEventListener("click", close);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
    input.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(runSearch, 120); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close();
      if (e.key === "Enter") { var a = results.querySelector("a[data-result]"); if (a) { e.preventDefault(); a.click(); } }
    });
    results.addEventListener("click", onClick);
    document.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === "k") { e.preventDefault(); if (overlay.style.display === "flex") close(); else open(); }
    });
  }

  function open() {
    ensureUI();
    overlay.style.display = "flex";
    input.value = "";
    results.innerHTML = "";
    setTimeout(function () { input.focus(); }, 40);
    ensureData();
  }
  function close() { if (overlay) overlay.style.display = "none"; }

  function runSearch() {
    if (!loaded) return;
    var q = norm(input.value);
    if (!q) { results.innerHTML = '<div class="gs-empty">输入关键词，同时搜索背诵手册、肖1000和近10年真题。</div>'; return; }
    var gs = grams(q);
    var hs = DATA.h.map(function (p) { return [score(p.text + " " + (p.heading || ""), q, gs), p]; }).filter(function (x) { return x[0] > 0; }).sort(function (a, b) { return b[0] - a[0]; }).slice(0, 5);
    var xs = DATA.x.map(function (p) { return [score(p.stem + " " + (p.chapter || ""), q, gs), p]; }).filter(function (x) { return x[0] > 0; }).sort(function (a, b) { return b[0] - a[0]; }).slice(0, 5);
    var zs = DATA.z.map(function (p) { return [score(p.stem, q, gs), p]; }).filter(function (x) { return x[0] > 0; }).sort(function (a, b) { return b[0] - a[0]; }).slice(0, 5);
    var html = "";
    if (hs.length) html += '<div class="gs-group"><div class="gs-label">背诵手册</div>' + hs.map(function (x) { var p = x[1]; return '<a class="gs-item" data-result data-kind="h" data-id="' + esc(p.id) + '" href="#" ><b>' + esc(p.volume) + " · PDF 第 " + p.pdfPage + " 页</b><span>" + esc((p.heading || "").slice(0, 60)) + "</span></a>"; }).join("") + "</div>";
    if (xs.length) html += '<div class="gs-group"><div class="gs-label">肖1000题</div>' + xs.map(function (x) { var p = x[1]; return '<a class="gs-item" data-result data-kind="x" data-sec="' + esc(p.section) + '" data-id="' + esc(p.id) + '" href="#"><b>' + esc(p.sectionTitle) + " · 第 " + p.id.split("-").pop() + " 题</b><span>" + esc(p.stem.slice(0, 90)) + "…</span></a>"; }).join("") + "</div>";
    if (zs.length) html += '<div class="gs-group"><div class="gs-label">近10年真题</div>' + zs.map(function (x) { var p = x[1]; return '<a class="gs-item" data-result data-kind="z" data-sec="' + esc(p.section) + '" data-id="' + esc(p.id) + '" href="#"><b>' + esc(p.sectionTitle) + " · 第 " + p.id.split("-").pop() + " 题</b><span>" + esc(p.stem.slice(0, 90)) + "…</span></a>"; }).join("") + "</div>";
    results.innerHTML = html || '<div class="gs-empty">没有找到，换一个关键词试试。</div>';
    if (!document.getElementById("gs-style")) {
      var st = document.createElement("style");
      st.id = "gs-style";
      st.textContent = ".gs-group{margin-bottom:10px}.gs-label{font-size:10px;color:#2f6b56;letter-spacing:.06em;margin:8px 0 4px}.gs-item{display:block;padding:8px 9px;border:1px solid #e5ded0;border-radius:9px;margin-bottom:5px;text-decoration:none;color:inherit;background:#fffefb}.gs-item:hover{border-color:#2f6b56}.gs-item b{display:block;color:#2f6b56;font-size:11.5px}.gs-item span{display:block;color:#465058;font-size:11.5px;line-height:1.65;margin-top:2px}.gs-empty{color:#81796b;font-size:12px;padding:18px 4px;line-height:1.8}";
      document.head.appendChild(st);
    }
  }

  function pdfModal(p) {
    close();
    var old = document.querySelector(".gs-pdf-modal"); if (old) old.remove();
    var box = document.createElement("div");
    box.className = "gs-pdf-modal";
    box.style.cssText = "position:fixed;inset:0;z-index:140;background:rgba(20,24,26,.72);display:flex;align-items:center;justify-content:center;padding:18px;";
    var src = (p.volKey === "up" ? "handbook-up.pdf" : "handbook-down.pdf") + "#page=" + p.pdfPage + "&toolbar=0";
    box.innerHTML = '<button type="button" style="position:fixed;top:14px;right:18px;border:0;background:#fff;border-radius:50%;width:38px;height:38px;font-size:22px;cursor:pointer;">×</button><iframe src="' + src + '" title="背诵手册页面" style="width:min(920px,96vw);height:92vh;border:0;border-radius:10px;background:#fff;"></iframe>';
    document.body.appendChild(box);
    box.querySelector("button").addEventListener("click", function () { box.remove(); });
    box.addEventListener("click", function (e) { if (e.target === box) box.remove(); });
  }

  function onClick(e) {
    var a = e.target.closest("[data-result]");
    if (!a) return;
    e.preventDefault();
    var kind = a.getAttribute("data-kind"), id = a.getAttribute("data-id"), sec = a.getAttribute("data-sec");
    if (kind === "h") {
      var p = DATA.h.find(function (x) { return x.id === id; });
      if (p) pdfModal(p);
      return;
    }
    var base = location.href.split("?")[0].split("#")[0];
    var back = encodeURIComponent(location.href);
    if (kind === "x") location.href = "xiao1000.html?section=" + encodeURIComponent(sec) + "&q=" + encodeURIComponent(id) + "&back=" + back;
    if (kind === "z") location.href = "zhenti.html?section=" + encodeURIComponent(sec) + "&q=" + encodeURIComponent(id) + "&back=" + back;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ensureUI);
  else ensureUI();
})();
