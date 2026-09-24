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

  /* ---------- Meeting cards (data/meetings.yaml) ---------- */
  var DAY = 864e5;
  var today = new Date(); today.setHours(0, 0, 0, 0);
  function daysUntil(ymd) { return Math.round((new Date(ymd + 'T00:00:00') - today) / DAY); }
  function whenWord(days) { return days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : 'In ' + days + ' days'; }
  var isApple = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);

  $all('.meetings').forEach(function (box) {
    var cards = $all('.meeting-card', box);
    var live = cards.filter(function (c) {
      var d = daysUntil(c.getAttribute('data-date'));
      if (d < 0) { c.hidden = true; return false; }
      var chip = $('[data-days]', c);
      if (chip) chip.textContent = whenWord(d);
      return true;
    });
    // If the build's "next" card has passed, promote the first live one.
    var first = live[0];
    var more = $('.meetings-more', box);
    if (first && !first.classList.contains('meeting-card--next')) {
      first.classList.add('meeting-card--next');
      box.insertBefore(first, more || box.firstChild);
    }
    var count = $('[data-meeting-count]', box);
    if (count) count.textContent = String(live.length);
    if (more && live.length < 2) more.hidden = true;
  });
  if (isApple) $all('a.meeting-dir[data-apple]').forEach(function (a) { a.href = a.getAttribute('data-apple'); });

  /* ---------- Open a collapsed section when a link targets it ---------- */
  function openForHash() {
    var id = decodeURIComponent(location.hash.slice(1));
    if (!id) return;
    var el = doc.getElementById(id);
    if (!el) return;
    var d = el.tagName === 'DETAILS' ? el : el.closest('details');
    while (d) { d.open = true; d = d.parentElement && d.parentElement.closest('details'); }
    el.scrollIntoView();
  }
  window.addEventListener('hashchange', openForHash);
  doc.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href*="#"]');
    if (!a || a.pathname !== location.pathname) return;
    setTimeout(openForHash, 0);
  });
  openForHash();
})();
