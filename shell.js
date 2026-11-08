/* ==========================================================================
   SaPEX NEXUS - app shell behaviour (stage 3)
   Owns the shell only: plan card, data status control, clock format,
   header search results, menu accessibility and the footer accordion.
   app.js keeps all data, auth and navigation logic; it calls the small
   SapexShell API below. This file never talks to the database.
   ========================================================================== */
(function () {
  'use strict';

  var DASH = '—';
  var STALE_MS = 20 * 60 * 1000;           // same 20-minute rule the bot status already uses
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var PLAN_NAMES = { free: 'Free plan', trial: 'Free trial', basic: 'Basic plan', pro: 'Pro plan', premium: 'Premium plan' };

  var S = { plan: 'free', loggedIn: false, email: '', expiry: null, cancelAtEnd: false,
            snapshot: null, heartbeat: null, engineOnline: null, refreshed: null, online: true };
  var clockMode = 'utc';
  try { if (localStorage.getItem('sx-clock') === 'local') clockMode = 'local'; } catch (e) { /* storage blocked */ }

  function $(id) { return document.getElementById(id); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function toTime(v) { if (v === null || v === undefined || v === '') return null; var t = new Date(v).getTime(); return isNaN(t) ? null : t; }
  function shortDate(v) { var t = toTime(v); if (t === null) return null; var d = new Date(t); return MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear(); }
  function ago(t) { return window.SapexFormat ? window.SapexFormat.formatTime(t) : DASH; }

  /* ---- Clock ------------------------------------------------------------ */
  function clockText(now) {
    now = now || new Date();
    if (clockMode === 'local') return pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds()) + ' local';
    return pad(now.getUTCHours()) + ':' + pad(now.getUTCMinutes()) + ':' + pad(now.getUTCSeconds()) + ' UTC';
  }
  function paintClock() { var el = $('live-clock'); if (el) el.textContent = clockText(); }

  /* ---- Plan card -------------------------------------------------------- */
  function renderPlan() {
    var name = $('sx-plan-name'), text = $('sx-plan-text'), email = $('sx-plan-email'), badge = $('pro-badge'), btn = $('btn-upgrade-sidebar');
    document.body.dataset.plan = S.loggedIn ? S.plan : 'signedout';
    if (!name) return;
    var expiry = shortDate(S.expiry);
    if (!S.loggedIn) {
      name.textContent = 'Welcome'; text.textContent = 'Sign in to see your plan.';
      if (btn) btn.textContent = 'See plans';
    } else if (S.plan === 'free') {
      name.textContent = PLAN_NAMES.free; text.textContent = 'Upgrade to unlock all signals and intelligence.';
      if (btn) btn.textContent = 'Upgrade';
    } else if (S.plan === 'trial') {
      name.textContent = PLAN_NAMES.trial; text.textContent = expiry ? 'Full access until ' + expiry + '.' : 'Full access during your trial.';
    } else {
      name.textContent = PLAN_NAMES[S.plan] || (S.plan.charAt(0).toUpperCase() + S.plan.slice(1) + ' plan');
      text.textContent = expiry ? (S.cancelAtEnd ? 'Ends ' + expiry + '.' : 'Active until ' + expiry + '.') : 'Active.';
    }
    if (email) { email.hidden = !(S.loggedIn && S.email); email.textContent = S.email || ''; }
    if (badge) {
      var paid = S.loggedIn && S.plan !== 'free';
      badge.style.display = paid ? '' : 'none';
      badge.textContent = S.plan === 'trial' ? 'Trial' : S.plan.charAt(0).toUpperCase() + S.plan.slice(1);
      badge.className = 'sx-chip ' + (S.plan === 'premium' || S.plan === 'trial' ? 'sx-chip--premium' : 'sx-chip--outline');
    }
  }

  /* ---- Data status ------------------------------------------------------ */
  function renderStatus() {
    var dot = $('sx-status-dot'), label = $('sx-status-label'), data = $('sx-status-data'), engine = $('sx-status-engine');
    if (!dot || !label) return;
    var t = toTime(S.snapshot); if (t === null) t = toTime(S.heartbeat); if (t === null) t = toTime(S.refreshed);
    var tone, text, dataText;
    if (!S.online) { tone = 'down'; text = 'Offline'; dataText = DASH; }
    else if (t === null) { tone = ''; text = 'Status unknown'; dataText = DASH; }
    else if (Date.now() - t <= STALE_MS) { tone = 'up'; text = 'Updated ' + ago(t); dataText = ago(t); }
    else { tone = 'amber'; text = 'Delayed, updated ' + ago(t); dataText = ago(t); }
    dot.className = 'sx-dot' + (tone ? ' is-' + tone : '');
    label.textContent = text;
    if (data) data.textContent = dataText;
    if (engine) engine.textContent = S.engineOnline === null ? DASH : (S.engineOnline ? 'Online' : 'Offline');
  }

  /* ---- Menus: open state, ARIA, outside click, Escape ------------------- */
  var MENUS = [
    { btn: 'sx-status-btn', menu: 'sx-status-menu', own: true },
    { btn: 'notification-btn', menu: 'notification-menu' },
    { btn: 'user-dropdown-toggle', menu: 'dropdown-menu' }
  ];
  function setExpanded(m, open) { var b = $(m.btn); if (b) b.setAttribute('aria-expanded', open ? 'true' : 'false'); }
  function closeMenu(m) { var el = $(m.menu); if (!el) return; el.classList.remove('show', 'is-open'); setExpanded(m, false); }
  function initMenus() {
    MENUS.forEach(function (m) {
      var btn = $(m.btn), el = $(m.menu); if (!btn || !el) return;
      if (m.own) {                                   // status popover is toggled here, not by app.js
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var open = !el.classList.contains('is-open');
          MENUS.forEach(closeMenu);
          if (open) { el.classList.add('is-open'); setExpanded(m, true); renderStatus(); }
        });
      } else {                                       // app.js toggles ".show"; mirror it into aria-expanded
        new MutationObserver(function () { setExpanded(m, el.classList.contains('show')); })
          .observe(el, { attributes: true, attributeFilter: ['class'] });
        btn.addEventListener('click', function () {
          MENUS.forEach(function (o) { if (o !== m) closeMenu(o); });
        }, true);
      }
    });
    document.addEventListener('click', function (e) {
      var st = $('sx-status-menu'), sb = $('sx-status-btn');
      if (st && !st.contains(e.target) && sb && !sb.contains(e.target)) closeMenu(MENUS[0]);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      MENUS.forEach(function (m) {
        var el = $(m.menu);
        if (el && (el.classList.contains('show') || el.classList.contains('is-open'))) { closeMenu(m); var b = $(m.btn); if (b) b.focus(); }
      });
      var sb = $('sidebar'); if (sb) sb.classList.remove('open');
      hideResults();
    });
  }

  /* ---- Header search: page jump (asset filtering stays in app.js) ------- */
  var PAGES = [
    { page: 'dashboard', label: 'Dashboard', alias: 'home overview' },
    { page: 'trading', label: 'Live Signals', alias: 'trading trades signals radar' },
    { page: 'portfolio', label: 'Investment Picks', alias: 'portfolio investments invest' },
    { page: 'watchlist', label: 'Watchlist', alias: 'favourites favorites saved' },
    { page: 'news', label: 'News', alias: 'headlines feed' },
    { page: 'digital', label: 'Digital Assets', alias: 'crypto coins tokens' },
    { page: 'marketsize', label: 'Market Map', alias: 'market size sectors' },
    { page: 'georisk', label: 'Geopolitical Risk', alias: 'geo risk intel war' },
    { page: 'profile', label: 'Profile', alias: 'account me' },
    { page: 'settings', label: 'Settings', alias: 'preferences options' }
  ];
  var active = -1, shown = [];
  function hideResults() {
    var box = $('search-results'), input = $('header-search');
    if (box) { box.hidden = true; box.innerHTML = ''; }
    if (input) input.setAttribute('aria-expanded', 'false');
    active = -1; shown = [];
  }
  function paintResults() {
    var box = $('search-results'); if (!box) return;
    box.innerHTML = '';
    shown.forEach(function (p, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'sx-search__result'; b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', i === active ? 'true' : 'false');
      b.textContent = 'Go to ' + p.label;
      b.addEventListener('mousedown', function (e) { e.preventDefault(); go(p); });
      box.appendChild(b);
    });
  }
  function go(p) {
    hideResults();
    var input = $('header-search');
    if (input) { input.value = ''; input.dispatchEvent(new Event('input')); }   // lets app.js clear any asset filter
    if (typeof window.navigateTo === 'function') window.navigateTo(p.page);
  }
  function initSearch() {
    var input = $('header-search'), box = $('search-results'); if (!input || !box) return;
    input.addEventListener('input', function () {
      var q = input.value.toLowerCase().trim();
      if (!q) { hideResults(); return; }
      shown = PAGES.filter(function (p) { return (p.label + ' ' + p.alias).toLowerCase().indexOf(q) !== -1; }).slice(0, 5);
      active = shown.length ? 0 : -1;
      box.hidden = false; input.setAttribute('aria-expanded', 'true');
      if (shown.length) paintResults(); else box.innerHTML = '<div class="sx-search__empty">No matching page. Assets on the dashboard are filtered as you type.</div>';
    });
    input.addEventListener('keydown', function (e) {
      if (box.hidden || !shown.length) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % shown.length; paintResults(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + shown.length) % shown.length; paintResults(); }
      else if (e.key === 'Enter' && active > -1) { e.preventDefault(); go(shown[active]); }
    });
    input.addEventListener('blur', function () { setTimeout(hideResults, 120); });
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); input.focus(); input.select(); }
    });
  }

  /* ---- Footer accordion (mobile only) ----------------------------------- */
  function initFooter() {
    var mq = window.matchMedia('(max-width: 599px)');
    var toggles = document.querySelectorAll('.sx-footer__toggle');
    function sync() { toggles.forEach(function (t) { if (mq.matches) t.setAttribute('aria-expanded', t.parentNode.parentNode.classList.contains('is-open') ? 'true' : 'false'); else t.removeAttribute('aria-expanded'); }); }
    toggles.forEach(function (t) {
      t.addEventListener('click', function () {
        if (!mq.matches) return;
        t.parentNode.parentNode.classList.toggle('is-open'); sync();
      });
    });
    if (mq.addEventListener) mq.addEventListener('change', sync); else if (mq.addListener) mq.addListener(sync);
    sync();
  }

  /* ---- Table labels: copies each header into data-label on every cell, so the
     phone CSS can turn rows into cards. Desktop tables are unchanged. ---------- */
  function initTableLabels() {
    document.querySelectorAll('.table-wrapper table').forEach(function (t) {
      var heads = [].map.call(t.querySelectorAll('thead th'), function (h) { return h.textContent.trim(); });
      function apply() {
        t.querySelectorAll('tbody tr').forEach(function (tr) {
          var cells = tr.children;
          if (cells.length !== heads.length) return;           // empty-state and detail rows span the table
          for (var i = 0; i < cells.length; i++) if (heads[i] && !cells[i].hasAttribute('data-label')) cells[i].setAttribute('data-label', heads[i]);
        });
      }
      apply();
      [].forEach.call(t.tBodies, function (tb) { new MutationObserver(apply).observe(tb, { childList: true }); });
    });
  }

  /* ---- Market strip marquee ---------------------------------------------------
     The strip is filled by app.js (items with class sx-strip__item). When the items are wider than the
     strip, copy them once and let CSS slide the row left in a loop. app.js keeps owning the data: every
     time it rewrites an item the copies are rebuilt from the originals. Phones and reduced motion keep
     the plain strip. Nothing here reads or writes data. ------------------------------------------- */
  function initStripMarquee() {
    var strip = document.querySelector('.sx-strip');
    var inner = strip && strip.querySelector('.sx-strip__inner');
    if (!inner || !window.MutationObserver) return;
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    var phone = window.matchMedia('(max-width: 599px)');
    var timer = null;
    var obs = new MutationObserver(function () { clearTimeout(timer); timer = setTimeout(sync, 150); });
    function watch() { obs.observe(inner, { childList: true, subtree: true, characterData: true }); }
    function sync() {
      obs.disconnect();
      [].forEach.call(inner.querySelectorAll('.sx-strip__clone'), function (n) { n.remove(); });
      inner.classList.remove('is-marquee');
      inner.style.removeProperty('--sx-marquee-s');
      var items = inner.querySelectorAll('.sx-strip__item');
      if (!reduce.matches && !phone.matches && items.length >= 3 && (inner.scrollWidth > inner.clientWidth + 4 || inner.scrollWidth > strip.clientWidth)) {
        var base = inner.scrollWidth;
        [].forEach.call(items, function (it) {
          var c = it.cloneNode(true);
          c.classList.add('sx-strip__clone');
          c.setAttribute('aria-hidden', 'true');
          c.removeAttribute('id');
          [].forEach.call(c.querySelectorAll('[id]'), function (x) { x.removeAttribute('id'); });
          inner.appendChild(c);
        });
        inner.classList.add('is-marquee');
        inner.style.setProperty('--sx-marquee-s', Math.max(25, Math.round(base / 45)) + 's');   // about 45 px per second
      }
      watch();
    }
    if (reduce.addEventListener) reduce.addEventListener('change', sync);
    if (phone.addEventListener) phone.addEventListener('change', sync);
    window.addEventListener('resize', function () { clearTimeout(timer); timer = setTimeout(sync, 250); });
    watch(); sync();
  }

  /* ---- More sheet (phone) ------------------------------------------------ */
  function initMore() {
    var btn = $('mobile-nav-toggle'), sheet = $('sx-more-sheet'), scrim = $('sx-more-scrim'), close = $('sx-more-close');
    if (!btn || !sheet || !scrim) return;
    function isOpen() { return !sheet.hidden; }
    function open() {
      sheet.hidden = false; scrim.hidden = false; btn.setAttribute('aria-expanded', 'true');
      document.body.classList.add('sx-more-open'); if (close) close.focus();
    }
    function shut(restore) {
      if (!isOpen()) return;
      sheet.hidden = true; scrim.hidden = true; btn.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('sx-more-open'); if (restore) btn.focus();
    }
    btn.addEventListener('click', function () { if (isOpen()) shut(true); else open(); });
    scrim.addEventListener('click', function () { shut(true); });
    if (close) close.addEventListener('click', function () { shut(true); });
    sheet.addEventListener('click', function (e) { if (e.target.closest('a, [data-open-pricing]')) shut(false); });
    document.addEventListener('keydown', function (e) {
      if (!isOpen()) return;
      if (e.key === 'Escape') { shut(true); return; }
      if (e.key === 'Tab') {
        var f = sheet.querySelectorAll('a[href], button:not([disabled])');
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    var mq = window.matchMedia('(min-width: 600px)');
    function onMq() { if (mq.matches) shut(false); }
    if (mq.addEventListener) mq.addEventListener('change', onMq);
    SapexShell_closeMore = function () { shut(false); };
  }
  var SapexShell_closeMore = function () {};

  /* ---- Public API (called by app.js) ------------------------------------ */
  window.SapexShell = {
    clockText: clockText,
    update: function (st) {
      if (!st) return;
      S.plan = st.subscriptionPlan || 'free'; S.loggedIn = !!st.isLoggedIn;
      S.expiry = st.subscriptionExpiry || null; S.cancelAtEnd = !!st.cancelAtPeriodEnd;
      S.snapshot = st.snapshotUpdatedAt || null;
      S.email = S.loggedIn && st.userProfile && st.userProfile.email ? st.userProfile.email : '';
      renderPlan(); renderStatus();
    },
    setEmail: function (e) { S.email = e || ''; renderPlan(); },
    setHeartbeat: function (ts, online) { S.heartbeat = ts || null; S.engineOnline = online === undefined ? null : online; renderStatus(); },
    setConnection: function (ok) { S.online = !!ok; renderStatus(); },
    markRefresh: function () { S.refreshed = Date.now(); renderStatus(); },
    closeMore: function () { SapexShell_closeMore(); }
  };

  function init() {
    var clock = $('live-clock');
    if (clock) clock.addEventListener('click', function () {
      clockMode = clockMode === 'utc' ? 'local' : 'utc';
      try { localStorage.setItem('sx-clock', clockMode); } catch (e) { /* ignore */ }
      paintClock();
    });
    paintClock(); renderPlan(); renderStatus();
    initMenus(); initSearch(); initFooter(); initMore(); initTableLabels(); initStripMarquee();
    setInterval(renderStatus, 30000);              // keeps "3m ago" honest; no network use
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
