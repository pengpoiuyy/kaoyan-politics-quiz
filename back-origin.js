(function () {
  var back = new URLSearchParams(location.search).get("back");
  if (!back) return;
  var a = document.createElement("a");
  a.href = back;
  a.textContent = "← 返回原题";
  a.style.cssText = "position:fixed;left:16px;bottom:18px;z-index:55;background:#2f6b56;color:#fff;border-radius:999px;padding:9px 14px;font-size:12px;text-decoration:none;box-shadow:0 10px 24px -10px rgba(47,107,86,.6);font-family:var(--sans,sans-serif);";
  document.body.appendChild(a);
})();
