(function () {
  "use strict";

  var AI_ENDPOINT = "https://detailed-grasshopper-d9a0e9b307d-1420335919.ap-shanghai.app.tcloudbase.com/grade";
  var AI_CODE = "essay2026";
  var GREETING = "你好，我是考研政治知识点答疑助手。可以问我当前题目的知识点、易混概念或记忆方法。";
  var messages = [{ role: "assistant", content: GREETING }];
  var pending = false;
  var getContext = function () { return { label: "", promptText: "" }; };
  var api = null;

  function esc(v) {
    return String(v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function format(text) {
    return esc(text)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br>");
  }

  function $(sel) { return document.querySelector(sel); }

  function build() {
    if ($("#pc-chat-fab")) return;

    document.body.insertAdjacentHTML("beforeend", `
      <button id="pc-chat-fab" class="pc-chat-fab" type="button" aria-label="打开 AI 答疑" aria-expanded="false" title="问 AI">问<span class="pc-spark"></span></button>
      <section id="pc-chat-panel" class="pc-chat-panel" hidden aria-label="AI 答疑">
        <div class="pc-chat-head">
          <div class="pc-chat-avatar">AI</div>
          <div class="pc-chat-head-text">
            <b>政治知识点答疑</b>
            <span id="pc-chat-context" class="pc-chat-context">可以问我当前题目的知识点</span>
          </div>
          <div class="pc-chat-head-actions">
            <button class="pc-chat-icon" id="pc-chat-clear" type="button" title="清空对话">↺</button>
            <button class="pc-chat-icon" id="pc-chat-close" type="button" title="关闭">×</button>
          </div>
        </div>
        <div id="pc-chat-messages" class="pc-chat-messages"></div>
        <div class="pc-chat-quick">
          <button class="pc-chat-chip" type="button" data-prompt="解释这道题的知识点">解释这道题</button>
          <button class="pc-chat-chip" type="button" data-prompt="这个知识点怎么记">怎么记</button>
          <button class="pc-chat-chip" type="button" data-prompt="帮我区分这道题附近的易混点">区分易混点</button>
        </div>
        <div class="pc-chat-input-row">
          <textarea id="pc-chat-input" class="pc-chat-input" rows="1" placeholder="问一个知识点，Enter 发送"></textarea>
          <button id="pc-chat-send" class="pc-chat-send" type="button">发送</button>
        </div>
        <div class="pc-chat-note">AI 回答仅供参考，请以教材和原书表述为准</div>
      </section>
    `);

    $("#pc-chat-fab").addEventListener("click", function () {
      if ($("#pc-chat-panel").hidden) openChat(); else closeChat();
    });
    $("#pc-chat-close").addEventListener("click", closeChat);
    $("#pc-chat-clear").addEventListener("click", clearChat);
    $("#pc-chat-send").addEventListener("click", function () {
      sendChat($("#pc-chat-input").value);
    });
    $("#pc-chat-input").addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendChat(e.target.value);
      }
    });
    $("#pc-chat-input").addEventListener("input", function (e) {
      e.target.style.height = "auto";
      e.target.style.height = Math.min(e.target.scrollHeight, 100) + "px";
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-prompt]"), function (btn) {
      btn.addEventListener("click", function () { sendChat(btn.getAttribute("data-prompt")); });
    });
    $("#pc-chat-panel").addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeChat();
    });
  }

  function currentContext() {
    try { return getContext() || {}; } catch (e) { return {}; }
  }

  function refresh() {
    var el = $("#pc-chat-context");
    if (!el) return;
    var c = currentContext();
    el.textContent = c.label || "可以问我当前题目的知识点";
  }

  function render() {
    var box = $("#pc-chat-messages");
    if (!box) return;
    box.innerHTML = messages.map(function (m) {
      return m.role === "user"
        ? '<div class="pc-chat-msg user">' + esc(m.content) + "</div>"
        : '<div class="pc-chat-msg bot">' + format(m.content) + "</div>";
    }).join("") + (pending ? '<div class="pc-chat-typing" aria-label="正在思考"><i></i><i></i><i></i></div>' : "");
    box.scrollTop = box.scrollHeight;
  }

  function openChat() {
    $("#pc-chat-panel").hidden = false;
    document.body.classList.add("pc-chat-open");
    $("#pc-chat-fab").setAttribute("aria-expanded", "true");
    refresh();
    render();
    setTimeout(function () { if ($("#pc-chat-input")) $("#pc-chat-input").focus(); }, 80);
  }

  function closeChat() {
    $("#pc-chat-panel").hidden = true;
    document.body.classList.remove("pc-chat-open");
    $("#pc-chat-fab").setAttribute("aria-expanded", "false");
  }

  function clearChat() {
    if (pending) return;
    messages = [{ role: "assistant", content: GREETING }];
    render();
    $("#pc-chat-input").focus();
  }

  async function sendChat(text) {
    var content = String(text || "").replace(/\s+$/, "").trim();
    if (!content || pending) return;
    var c = currentContext();
    var history = messages.slice(-8).map(function (m) { return { role: m.role, content: m.content }; });
    messages.push({ role: "user", content: content });
    pending = true;
    render();
    var input = $("#pc-chat-input");
    input.value = "";
    input.style.height = "";
    $("#pc-chat-send").disabled = true;

    var contextText = c.promptText || "【考研政治知识点答疑】当前未进入具体题目。请直接回答学生的考研政治问题。";
    var question = "请忽略作文批改场景，作为考研政治辅导老师回答，不要提英语作文。学生问题：" + content;
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 60000);
    try {
      var res = await fetch(AI_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-access-code": AI_CODE },
        body: JSON.stringify({
          mode: "chat",
          question: question,
          context: {
            type: "big",
            promptText: contextText,
            essayText: "",
            grade: { score: "", band: "", issues: [], deductions: [] }
          },
          history: history
        }),
        signal: controller.signal
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(data.error || ("HTTP " + res.status));
      var answer = String(data.answer || "").trim();
      if (!answer) throw new Error("AI 没有返回内容");
      messages.push({ role: "assistant", content: answer });
    } catch (err) {
      var msg = err.name === "AbortError" ? "请求超时，请稍后再试" : (err.message || "网络错误");
      messages.push({ role: "assistant", content: "（AI 暂时不可用：" + msg + "）" });
    } finally {
      clearTimeout(timer);
      pending = false;
      $("#pc-chat-send").disabled = false;
      render();
    }
  }

  window.initPoliticsChat = function (opts) {
    if (opts && typeof opts.getContext === "function") getContext = opts.getContext;
    build();
    refresh();
    if (!api) api = { refresh: refresh, open: openChat, close: closeChat };
    return api;
  };
  window.refreshPoliticsChatContext = refresh;
})();
