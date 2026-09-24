/* Neighbors of 2411 -- small site script (no dependencies).
   Loaded deferred from extend_footer.html via Hugo Pipes. Every feature
   here is an enhancement: the page works without it. */
(function () {
  'use strict';
  var doc = document;
  function $(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function $all(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }

  /* ---------- Phone drawer ---------- */
  var drawer = $('#nav-drawer');
  var menuBtn = $('.menu-button');
  if (drawer && menuBtn && typeof drawer.showModal === 'function') {
    menuBtn.hidden = false;
    menuBtn.addEventListener('click', function () {
      drawer.showModal();
      menuBtn.setAttribute('aria-expanded', 'true');
    });
    drawer.addEventListener('close', function () {
      menuBtn.setAttribute('aria-expanded', 'false');
      menuBtn.focus();
    });
    drawer.addEventListener('click', function (e) {
      if (e.target === drawer) { drawer.close(); return; }          // backdrop tap
      if (e.target.closest('a')) drawer.close();                     // link tap
    });
    var closeBtn = $('.nav-drawer-close', drawer);
    if (closeBtn) closeBtn.addEventListener('click', function () { drawer.close(); });
    var themeBtn = $('.nav-drawer-theme', drawer);
    var toggle = $('#theme-toggle');
    if (themeBtn && toggle) themeBtn.addEventListener('click', function () { toggle.click(); });
  } else if (menuBtn) {
    menuBtn.hidden = true;
    doc.documentElement.classList.remove('js');                     // fall back to the plain menu
  }
})();
