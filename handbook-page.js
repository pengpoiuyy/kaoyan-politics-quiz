(function () {
  "use strict";
  var pending = {};
  function loadChunk(src) {
    if (pending[src]) return pending[src];
    pending[src] = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error("页面图片加载失败")); };
      document.head.appendChild(s);
    });
    return pending[src];
  }
  window.loadHandbookPage = function (p) {
    var key = p.volKey + "-" + p.pdfPage;
    if (window.HB_PAGES && window.HB_PAGES[key]) return Promise.resolve(window.HB_PAGES[key]);
    var idx = Math.ceil(Number(p.pdfPage) / 10);
    var src = "shouce_pages/chunks/" + p.volKey + "-" + String(idx).padStart(3, "0") + ".js";
    return loadChunk(src).then(function () {
      if (window.HB_PAGES && window.HB_PAGES[key]) return window.HB_PAGES[key];
      throw new Error("没有找到第 " + p.pdfPage + " 页图片");
    });
  };
})();
