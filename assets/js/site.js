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

  /* ---------- Section pages: collapse H2 sections after the first two on
     phones (content stays open without JS) ---------- */
  var phoneMQ = window.matchMedia && window.matchMedia('(max-width: 767px)');
  var content = $('.post-content[data-collapse]');
  var toggles = [];
  function setSection(btn, open) {
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    doc.getElementById(btn.getAttribute('aria-controls')).hidden = !open;
  }
  if (content && phoneMQ && phoneMQ.matches) {
    var h2s = $all(':scope > h2', content);
    var from = content.getAttribute('data-collapse-from');
    var start = 2;
    if (from) h2s.forEach(function (h, i) { if (h.id === from) start = i; });
    if (h2s.length >= 4) {
      h2s.slice(start).forEach(function (h2, i) {
        var body = doc.createElement('div');
        body.className = 'section-body';
        body.id = (h2.id || 'section-' + i) + '--body';
        var n = h2.nextSibling;
        // Stop at the next heading, the share block, or a closing rule that
        // has no heading after it (the page's sign-off stays visible).
        while (n && !(n.nodeType === 1 && (n.tagName === 'H2' || n.classList.contains('share-block') ||
               (n.tagName === 'HR' && !$all(':scope > h2', content).some(function (h) { return n.compareDocumentPosition(h) & 4; }))))) {
          var nx = n.nextSibling; body.appendChild(n); n = nx;
        }
        h2.parentNode.insertBefore(body, h2.nextSibling);
        var btn = doc.createElement('button');
        btn.type = 'button';
        btn.className = 'section-toggle';
        btn.setAttribute('aria-controls', body.id);
        var anchor = $('a.anchor', h2);
        Array.prototype.slice.call(h2.childNodes).forEach(function (c) { if (c !== anchor) btn.appendChild(c); });
        h2.insertBefore(btn, anchor || null);
        setSection(btn, false);
        btn.addEventListener('click', function () { setSection(btn, btn.getAttribute('aria-expanded') !== 'true'); });
        toggles.push(btn);
      });
      var expandAll = $('[data-expand-all]');
      if (expandAll) {
        expandAll.hidden = false;
        expandAll.addEventListener('click', function () {
          toggles.forEach(function (b) { setSection(b, true); });
          var jm = $('#jump-menu'); if (jm) jm.open = false;
        });
      }
    }
  }

  /* ---------- Open a collapsed section when a link targets it ---------- */
  function openForHash() {
    var id = decodeURIComponent(location.hash.slice(1));
    if (!id) return;
    var el = doc.getElementById(id);
    if (!el) return;
    var d = el.tagName === 'DETAILS' ? el : el.closest('details');
    while (d) { if (d.id !== 'jump-menu') d.open = true; d = d.parentElement && d.parentElement.closest('details'); }
    var sec = el.closest('.section-body');
    var own = el.querySelector && el.querySelector(':scope > .section-toggle');
    if (own) setSection(own, true);
    if (sec) { var t = $('[aria-controls="' + sec.id + '"]'); if (t) setSection(t, true); }
    var jm = $('#jump-menu'); if (jm) jm.open = false;
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

  /* ---------- Share blocks ---------- */
  $all('.share-block').forEach(function (block) {
    var status = $('.share-status', block);
    function say(msg) {
      status.textContent = msg;
      clearTimeout(say._t);
      say._t = setTimeout(function () { status.textContent = ''; }, 4000);
    }
    var nativeBtn = $('[data-share-native]', block);
    if (nativeBtn && navigator.share) {
      nativeBtn.hidden = false;
      nativeBtn.addEventListener('click', function () {
        navigator.share({ title: doc.title, text: nativeBtn.getAttribute('data-text'), url: nativeBtn.getAttribute('data-url') }).catch(function () {});
      });
    }
    if (navigator.clipboard) {
      $all('[data-share-copy]', block).forEach(function (btn) {
        btn.hidden = false;
        btn.addEventListener('click', function () {
          navigator.clipboard.writeText(btn.getAttribute('data-share-copy')).then(function () {
            say(btn.getAttribute('data-share-done'));
          });
        });
      });
    }
  });

  /* ---------- FAQ filter (faq-filter shortcode) ---------- */
  var ff = $('.faq-filter');
  if (ff) {
    ff.hidden = false;
    var input = $('input', ff);
    var countEl = $('.faq-filter-count', ff);
    var items = $all('.faq-item');
    var groups = $all('h3').filter(function (h) {
      var n = h.nextElementSibling; return n && n.classList.contains('faq-item');
    });
    input.addEventListener('input', function () {
      var q = input.value.trim().toLowerCase();
      var shown = 0;
      items.forEach(function (it) {
        var hit = !q || it.textContent.toLowerCase().indexOf(q) !== -1;
        it.hidden = !hit;
        if (hit) shown++;
      });
      groups.forEach(function (h) {
        var n = h.nextElementSibling, any = false;
        while (n && n.classList.contains('faq-item')) { if (!n.hidden) any = true; n = n.nextElementSibling; }
        h.hidden = !any;
      });
      countEl.textContent = q ? shown + ' of ' + items.length + ' questions match' : '';
    });
  }
})();
