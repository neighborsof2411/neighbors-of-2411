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

  /* ---------- Long sections: open without JS, collapsed on phones ---------- */
  if (window.matchMedia && window.matchMedia('(max-width: 767px)').matches) {
    $all('details.collapse-mobile[open]').forEach(function (d) { d.open = false; });
  }

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

  /* ---------- Phone action bar ---------- */
  var bar = $('#action-bar');
  var meetingsEl = $('#meetings-json');
  var store = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
                set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  var path = location.pathname.replace(/\/+$/, '/') || '/';
  if (path === '/thanks/' || path === '/already-signed/') store.set('signed', '1');

  if (bar && meetingsEl && window.matchMedia) {
    var list = [];
    try { list = JSON.parse(meetingsEl.textContent) || []; } catch (e) {}
    var next = list.filter(function (m) { return daysUntil(m.date) >= 0; })[0];
    var when = $('[data-ab-when]', bar);
    var cta = $('[data-ab-cta]', bar);
    var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (next) {
      var d = new Date(next.date + 'T00:00:00');
      when.textContent = DAYS[d.getDay()] + ' ' + MONTHS[d.getMonth()] + ' ' + d.getDate() + ' · ' + next.time + ' · ' + next.body;
    } else {
      when.textContent = 'See the City calendar';
    }
    // Context button, and the part of the page that makes it redundant.
    var watch = $('#petition');
    if (path === '/testify/') {
      cta.textContent = 'Write My Comment';
      cta.href = '#comment-builder';
      watch = $('#comment-builder');
    } else if (store.get('signed') === '1' && next) {
      var dd = new Date(next.date + 'T00:00:00');
      cta.textContent = 'Add ' + MONTHS[dd.getMonth()] + ' ' + dd.getDate() + ' to calendar';
      cta.href = '/meetings/' + next.id + '.ics';
      cta.setAttribute('download', next.id + '.ics');
      watch = null;
    }
    var phone = window.matchMedia('(max-width: 767px)');
    var inView = false, typing = false;
    function update() {
      var show = phone.matches && !inView && !typing;
      bar.hidden = !show;
      doc.body.classList.toggle('has-action-bar', phone.matches);
    }
    if (watch && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting; update();
      }, { rootMargin: '0px 0px -64px 0px' }).observe(watch);
    }
    // Hide while the on-screen keyboard is up.
    doc.addEventListener('focusin', function (e) { if (e.target.matches('input, textarea, select')) { typing = true; update(); } });
    doc.addEventListener('focusout', function () { typing = false; setTimeout(update, 50); });
    if (window.visualViewport) {
      visualViewport.addEventListener('resize', function () {
        typing = visualViewport.height < window.innerHeight * 0.75 || (doc.activeElement && doc.activeElement.matches('input, textarea, select'));
        update();
      });
    }
    if (phone.addEventListener) phone.addEventListener('change', update);
    update();
  }
})();
