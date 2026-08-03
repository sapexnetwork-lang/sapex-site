// === landing.js ===
// SaPEX_NEXUS Landing Page — interaction & animation layer
// Reuses the same Supabase project as the terminal app (script.js) so a
// session started here carries straight into the app.

(function () {
  'use strict';

  var REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // ✅ FIX #3: appending location.search here means every existing use of APP_URL
  // below (signInWithGoogle, the OAuth redirectTo, and the "already signed in" CTA
  // swap) automatically carries UTM/ad-campaign params through to the terminal.
  var APP_URL = 'app.html' + window.location.search; // <-- point this at wherever the terminal actually lives

  /* ============================================================
     1. SUPABASE / GOOGLE SIGN-IN (mirrors the terminal's config)
     ============================================================ */
  var SUPABASE_URL = 'https://qdigrvhwvnrjznqkjltn.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_vN8drh5iobJ2-mWmjk0joA_eRBQJVJa';
  var supabaseClient = null;

  function initSupabase() {
    try {
      supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      return supabaseClient;
    } catch (e) {
      console.warn('Supabase not available on landing page:', e);
      return null;
    }
  }

  async function signInWithGoogle() {
    var client = supabaseClient || initSupabase();
    if (!client) { window.location.href = APP_URL; return; }
    try {
      await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + '/' + APP_URL }
      });
    } catch (e) {
      console.error('Google sign-in failed:', e);
      window.location.href = APP_URL;
    }
  }

  function wireGoogleButtons() {
    ['navGoogleBtn', 'navGoogleBtnMobile', 'heroGoogleBtn', 'closingGoogleBtn'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('click', signInWithGoogle);
    });
  }

  // If the visitor already has a session, swap CTAs to go straight into the terminal.
  async function checkSessionAndAdapt() {
    var client = supabaseClient || initSupabase();
    if (!client) return;
    try {
      var res = await client.auth.getSession();
      var session = res && res.data && res.data.session;
      if (session) {
        document.querySelectorAll('#navCtaBtn').forEach(function (btn) {
          btn.textContent = 'Open Terminal';
          btn.href = APP_URL;
        });
      }
    } catch (e) { /* fail silent — default CTAs already work fine */ }
  }

  /* ============================================================
     2. NAV — scroll state + mobile menu
     ============================================================ */
  function initNav() {
    var nav = document.getElementById('siteNav');
    var burger = document.getElementById('navBurger');
    var mobile = document.getElementById('navMobile');

    var onScroll = function () {
      nav.classList.toggle('is-scrolled', window.scrollY > 24);
    };
    document.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    burger.addEventListener('click', function () {
      var open = mobile.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      document.body.style.overflow = open ? 'hidden' : '';
    });
    mobile.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        mobile.classList.remove('is-open');
        burger.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
      });
    });
  }

  /* ============================================================
     3. SCROLL PROGRESS RAIL — fills as you scroll, recolors per section
     ============================================================ */
  function initRail() {
    var fill = document.getElementById('railFill');
    if (!fill) return;
    var ticking = false;

    function update() {
      var h = document.documentElement;
      var scrollable = h.scrollHeight - h.clientHeight;
      var pct = scrollable > 0 ? (h.scrollTop / scrollable) * 100 : 0;
      fill.style.height = pct + '%';
      ticking = false;
    }
    document.addEventListener('scroll', function () {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    update();

    // Recolor the rail to match whichever section's accent is in view
    var sections = document.querySelectorAll('[data-accent]');
    var railEl = document.querySelector('.rail');
    var accentMap = { cyan: '--cyan', blue: '--blue', green: '--green', purple: '--purple', gold: '--gold' };
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var accent = entry.target.getAttribute('data-accent');
          var varName = accentMap[accent] || '--cyan';
          railEl.style.setProperty('--accent', 'var(' + varName + ')');
        }
      });
    }, { rootMargin: '-45% 0px -45% 0px' });
    sections.forEach(function (s) { obs.observe(s); });
  }

  /* ============================================================
     4. HERO — typed headline + signal-line canvas
     ============================================================ */
  function initTypedHeadline() {
    var el = document.getElementById('typedHeadline');
    if (!el) return;
    var phrases = [
      'Every signal that matters.',
      'Every risk, seen early.',
      'Every trade, backed by AI.',
      'Every market, one view.'
    ];
    if (REDUCED_MOTION) { el.textContent = phrases[0]; return; }

    var pIndex = 0, cIndex = phrases[0].length, deleting = false;
    var TYPE_DELAY = 42, DELETE_DELAY = 26, HOLD_DELAY = 2000, GAP_DELAY = 450;

    function tick() {
      var current = phrases[pIndex];
      if (!deleting) {
        cIndex++;
        el.textContent = current.slice(0, cIndex);
        if (cIndex >= current.length) {
          setTimeout(function () { deleting = true; tick(); }, HOLD_DELAY);
          return;
        }
        setTimeout(tick, TYPE_DELAY + Math.random() * 18);
      } else {
        cIndex--;
        el.textContent = current.slice(0, Math.max(cIndex, 0));
        if (cIndex <= 0) {
          deleting = false;
          pIndex = (pIndex + 1) % phrases.length;
          setTimeout(tick, GAP_DELAY);
          return;
        }
        setTimeout(tick, DELETE_DELAY);
      }
    }

    // start the loop from the fully-typed first phrase already in the DOM
    setTimeout(function () { deleting = true; tick(); }, HOLD_DELAY);
  }

  function initHeroCanvas() {
    var canvas = document.getElementById('signalCanvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w, h, t = 0;

    var layers = [
      { amp: 26, freq: 0.006, speed: 0.006, offset: 0.35, color: 'rgba(6,182,212,0.55)', width: 1.6 },
      { amp: 40, freq: 0.004, speed: 0.004, offset: 0.55, color: 'rgba(59,130,246,0.4)', width: 1.4 },
      { amp: 18, freq: 0.009, speed: 0.008, offset: 0.7, color: 'rgba(139,92,246,0.28)', width: 1.2 }
    ];

    function resize() {
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function drawLine(layer, phase) {
      ctx.beginPath();
      ctx.strokeStyle = layer.color;
      ctx.lineWidth = layer.width;
      var baseY = h * layer.offset;
      for (var x = 0; x <= w; x += 6) {
        var y = baseY
          + Math.sin(x * layer.freq + phase) * layer.amp
          + Math.sin(x * layer.freq * 2.3 + phase * 1.7) * (layer.amp * 0.3);
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    function frame() {
      ctx.clearRect(0, 0, w, h);
      layers.forEach(function (layer) { drawLine(layer, t * layer.speed * 40); });
      t += 1;
      if (!REDUCED_MOTION) requestAnimationFrame(frame);
    }

    window.addEventListener('resize', debounce(function () { resize(); if (REDUCED_MOTION) frame(); }, 200));
    resize();
    frame();
  }

  function debounce(fn, ms) {
    var timer;
    return function () { clearTimeout(timer); timer = setTimeout(fn, ms); };
  }

  /* ============================================================
     5. TICKER — populated once, duplicated for a seamless loop
     ============================================================ */
  function initTicker() {
    var track = document.getElementById('tickerTrack');
    if (!track) return;
    var items = [
      ['BTC/USDT', 'buy'], ['ETH/USDT', 'sell'], ['AAPL', 'buy'], ['SOL/USDT', 'buy'],
      ['TSLA', 'sell'], ['XRP/USDT', 'buy'], ['NVDA', 'buy'], ['MATIC/USDT', 'sell'],
      ['MSFT', 'buy'], ['DOGE/USDT', 'sell'], ['AMZN', 'buy'], ['LINK/USDT', 'buy']
    ];
    var html = items.map(function (it) {
      return '<div class="ticker__item"><b>' + it[0] + '</b><span class="ticker__tag ' + it[1] + '">' + it[1].toUpperCase() + '</span></div>';
    }).join('');
    track.innerHTML = html + html; // duplicate for the -50% translate loop
  }

  function initCoinRows() {
    var wrapA = document.getElementById('coinRowA'), trackA = document.getElementById('coinTrackA');
    var wrapB = document.getElementById('coinRowB'), trackB = document.getElementById('coinTrackB');
    if (!trackA || !trackB) return;

    var ROW_A = [
      ['BTC', 'Bitcoin', null, '#f7931a', '\u20BF'],
      ['ETH', 'Ethereum', null, '#627eea', '\u039E'],
      ['USDT', 'Tether', 'TRC20', '#26a17b', '\u20AE'],
      ['TON', 'Toncoin', null, '#0098ea', 'T'],
      ['BNB', 'BNB', 'BSC', '#f0b90b', 'B']
    ];
    var ROW_B = [
      ['LTC', 'Litecoin', null, '#345d9d', '\u0141'],
      ['TRX', 'Tron', null, '#ff060a', 'T'],
      ['USDC', 'USD Coin', 'SOL', '#2775ca', '$'],
      ['USDC', 'USD Coin', 'BASE', '#2775ca', '$']
    ];

    function render(list) {
      return list.map(function (c) {
        var tag = c[2] ? '<span class="coin__tag">' + c[2] + '</span>' : '';
        return '<div class="coin"><span class="coin__icon" style="background:' + c[3] + '">' + c[4] + '</span>' +
          '<span class="coin__meta"><b>' + c[0] + tag + '</b><small>' + c[1] + '</small></span></div>';
      }).join('');
    }

    // Repeats the row enough times so it always tiles past 2x the visible
    // width — on any screen size — so the loop never runs out of content
    // and leaves a gap on the right.
    function fillRow(wrap, track, list) {
      if (!wrap || !track) return;
      var single = render(list);
      track.innerHTML = single;
      var singleWidth = track.scrollWidth || 1;
      var wrapWidth = wrap.clientWidth || window.innerWidth;
      var repeats = Math.max(2, Math.ceil((wrapWidth * 2) / singleWidth) + 1);
      var html = '';
      for (var i = 0; i < repeats; i++) html += single;
      track.innerHTML = html;
      track.style.setProperty('--shift', '-' + (100 / repeats).toFixed(4) + '%');
    }

    function fillAll() {
      fillRow(wrapA, trackA, ROW_A);
      fillRow(wrapB, trackB, ROW_B);
    }

    fillAll();
    window.addEventListener('resize', debounce(fillAll, 200));
  }

  /* ============================================================
     6. SCROLL REVEALS
     ============================================================ */
  function initReveals() {
    var els = document.querySelectorAll('.reveal');
    if (!els.length) return;
    if (REDUCED_MOTION) { els.forEach(function (el) { el.classList.add('is-visible'); }); return; }
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
    els.forEach(function (el) { obs.observe(el); });
  }

  /* ============================================================
     7. COUNT-UP STATS
     ============================================================ */
  function initCounters() {
    var els = document.querySelectorAll('.stats__num');
    if (!els.length) return;
    function animate(el) {
      var target = parseInt(el.getAttribute('data-target'), 10) || 0;
      var suffix = el.getAttribute('data-suffix') || '';
      if (REDUCED_MOTION) { el.textContent = target + suffix; return; }
      var start = performance.now();
      var dur = 1400;
      function step(now) {
        var p = Math.min((now - start) / dur, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * eased) + suffix;
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { animate(entry.target); obs.unobserve(entry.target); }
      });
    }, { threshold: 0.5 });
    els.forEach(function (el) { obs.observe(el); });
  }

  /* ============================================================
     8. HOW IT WORKS — connecting line fills as steps enter view
     ============================================================ */
  function initHowLine() {
    var fill = document.getElementById('howLineFill');
    var steps = document.querySelectorAll('.how__step');
    if (!fill || !steps.length) return;
    var seen = new Set();
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) seen.add(entry.target.getAttribute('data-step'));
      });
      var pct = (seen.size / steps.length) * 100;
      fill.style.width = pct + '%';
    }, { threshold: 0.6 });
    steps.forEach(function (s) { obs.observe(s); });
  }

  /* ============================================================
     9. FAQ ACCORDION
     ============================================================ */
  function initFaq() {
    document.querySelectorAll('.faq__item').forEach(function (item) {
      var btn = item.querySelector('.faq__q');
      var answer = item.querySelector('.faq__a');
      btn.addEventListener('click', function () {
        var isOpen = item.classList.contains('is-open');
        document.querySelectorAll('.faq__item.is-open').forEach(function (other) {
          if (other !== item) {
            other.classList.remove('is-open');
            other.querySelector('.faq__q').setAttribute('aria-expanded', 'false');
            other.querySelector('.faq__a').style.maxHeight = null;
          }
        });
        item.classList.toggle('is-open', !isOpen);
        btn.setAttribute('aria-expanded', (!isOpen).toString());
        answer.style.maxHeight = !isOpen ? answer.scrollHeight + 'px' : null;
      });
    });
  }

  /* ============================================================
     10. MAGNETIC BUTTONS
     ============================================================ */
  function initMagnetic() {
    if (REDUCED_MOTION) return;
    document.querySelectorAll('.magnetic').forEach(function (btn) {
      btn.addEventListener('mousemove', function (e) {
        var r = btn.getBoundingClientRect();
        var x = (e.clientX - r.left - r.width / 2) * 0.25;
        var y = (e.clientY - r.top - r.height / 2) * 0.35;
        btn.style.transform = 'translate(' + x + 'px,' + y + 'px)';
      });
      btn.addEventListener('mouseleave', function () { btn.style.transform = ''; });
    });
  }

  /* ============================================================
     11. FEATURE MAP — accessible labels + click-through detail modal
     ============================================================ */
  var FEATURE_DETAILS = {
    signals: {
      icon: 'fa-bolt',
      title: 'AI Crypto & Stock Signals',
      intro: 'AI-generated BUY/SELL calls across 230+ crypto pairs and 77 major stocks, refreshed continuously.',
      how: 'SaPEX_001.Alpha Model scans price action, volume and momentum across every tracked instrument. Crypto pairs are re-scanned every 5 minutes and stocks every 15. Each signal ships with an entry price, a take-profit target, a stop-loss level, and a confidence score.',
      who: 'Active traders who want a second set of eyes across many markets at once — from swing traders checking in a few times a day to anyone glancing at the terminal between meetings.',
      get: [
        'Instrument, direction (BUY/SELL), entry, take-profit and stop-loss',
        'An AI confidence score for every signal',
        'Historical accuracy per instrument via the Terminal Accuracy Metric Matrix',
        '5-minute refresh for crypto, 15-minute for stocks'
      ],
      limits: 'Signals are probabilistic, not guaranteed outcomes, and this is not financial advice. Always size positions against your own risk tolerance. Fast-moving news can invalidate a signal before the next scan cycle.'
    },
    geo: {
      icon: 'fa-earth-americas',
      title: 'Geopolitical Risk AI',
      intro: 'Continuous scanning of global news for events that move markets before they\u2019re priced in.',
      how: 'The model reads global news feeds on an ongoing basis, watching for military conflict, sanctions, trade disputes and regime change, then scores the likely market impact of what it finds.',
      who: 'Traders and investors who want macro context before a headline moves their positions, not after the candle already moved.',
      get: [
        'Region-tagged risk alerts with a severity score',
        'Plain-language summaries of what\u2019s developing and why it matters',
        'Premium: the Secret Intel tab, with deeper predictive coverage'
      ],
      limits: 'Geopolitical events are inherently unpredictable. This surfaces probability-weighted risk, not certainty, and should inform — not replace — your own judgement.'
    },
    calendar: {
      icon: 'fa-calendar-days',
      title: 'AI Economic Calendar',
      intro: 'Upcoming macro events, pre-sorted by how much they\u2019re likely to move the market.',
      how: 'Aggregates scheduled releases — rate decisions, employment data, inflation prints and more — and ranks them by predicted market impact so the ones that matter most are never buried in the list.',
      who: 'Anyone trading around scheduled news events who wants to know which release actually deserves attention today.',
      get: [
        'Event name, date and time',
        'Forecast vs. prior figures',
        'An AI-ranked impact score for each event'
      ],
      limits: 'Impact rankings are model estimates. Actual market reaction can differ from the forecast, especially in thin, low-liquidity conditions.'
    },
    market: {
      icon: 'fa-chart-pie',
      title: 'Global Market Size',
      intro: 'A live bubble map of where capital is concentrated across crypto and equities.',
      how: 'Capitalisation across tracked markets is rendered as a bubble chart, sized by relative weight, so shifts in where money is concentrated are visible at a glance rather than buried in a table.',
      who: 'Traders who want a fast visual read on capital flow before drilling into individual instruments.',
      get: [
        'Relative market-cap sizing across crypto and equities',
        'Category and sector grouping',
        'Movement trends over time'
      ],
      limits: 'This is a snapshot view, not a trading signal on its own — most useful alongside the Signals module, not in isolation.'
    },
    news: {
      icon: 'fa-newspaper',
      title: 'News Sentiment AI',
      intro: 'Breaking headlines scored for sentiment the moment they land.',
      how: 'Incoming market news is scored positive, negative or neutral as it arrives, and tagged to the specific instruments it affects.',
      who: 'Traders who want to gauge market mood quickly without reading every article as it breaks.',
      get: [
        'Headline, source and timestamp',
        'A sentiment score per story',
        'Instrument tagging, so you see news relevant to what you\u2019re actually watching'
      ],
      limits: 'Sentiment scoring can misread sarcasm, satire, or fast-developing stories. Treat it as a filter that narrows your reading, not a final read on a story\u2019s meaning.'
    },
    portfolio: {
      icon: 'fa-briefcase',
      title: 'Portfolio Tracker',
      intro: 'Every open position, in one dashboard, with live performance.',
      how: 'Positions you add are tracked against live prices, giving you running P&L and performance broken down by instrument in a single view.',
      who: 'Anyone holding more than one or two positions who\u2019s tired of tracking them across separate apps or spreadsheets.',
      get: [
        'Live profit and loss per position',
        'Position history',
        'Performance breakdown by instrument'
      ],
      limits: 'This is a manual tracking tool, not a live broker or exchange integration — positions are entered by you and won\u2019t auto-sync unless you keep them updated.'
    },
    watchlist: {
      icon: 'fa-star',
      title: 'Watchlist',
      intro: 'Price alerts on exactly the pairs and stocks you\u2019re waiting on.',
      how: 'Save any instrument to your watchlist and set a target price. You\u2019re notified when that threshold is crossed, so you can wait for a level instead of reacting to every tick.',
      who: 'Traders waiting for a specific entry point rather than watching a screen all day.',
      get: [
        'Custom price alerts per instrument',
        'At-a-glance price and change for everything you\u2019ve saved',
        'One list across both crypto and stocks'
      ],
      limits: 'Alerts run on the same refresh cadence as signals (5–15 minutes), so this is built for swing-style levels, not sub-minute scalping.'
    },
    calculator: {
      icon: 'fa-scale-balanced',
      title: 'Position Calculator',
      intro: 'Consistent position sizing based on your real account and a risk percentage you choose.',
      how: 'Enter your account balance, a risk percentage from a cautious 0.5% up to a bold 3%, and your stop-loss distance. The calculator returns the position size and the exact amount at risk in currency.',
      who: 'Anyone who wants consistent, repeatable position sizing instead of guessing lot size by feel.',
      get: [
        'Suggested position size for the trade',
        'Risk amount in your account currency',
        'A two-step calculation you can run before every entry'
      ],
      limits: 'The output is only as accurate as the account balance and stop-loss you enter. It\u2019s a sizing aid, not a guarantee against loss.'
    }
  };

  function initMap() {
    var modal = document.getElementById('featureModal');
    if (!modal) return;
    var panel = modal.querySelector('.modal__panel');
    var lastFocused = null;

    document.querySelectorAll('.map__node[data-tip]').forEach(function (node) {
      node.setAttribute('aria-label', node.getAttribute('data-tip'));
      var key = node.getAttribute('data-feature');
      if (!key || !FEATURE_DETAILS[key]) return;
      node.addEventListener('click', function () { openModal(key, node); });
    });

    function openModal(key, triggerEl) {
      var d = FEATURE_DETAILS[key];
      if (!d) return;
      lastFocused = triggerEl || document.activeElement;

      document.getElementById('modalIcon').innerHTML = '<i class="fa-solid ' + d.icon + '"></i>';
      document.getElementById('modalTitle').textContent = d.title;
      document.getElementById('modalIntro').textContent = d.intro;
      document.getElementById('modalHow').textContent = d.how;
      document.getElementById('modalWho').textContent = d.who;
      document.getElementById('modalLimits').textContent = d.limits;
      document.getElementById('modalGet').innerHTML = d.get.map(function (item) {
        return '<li>' + item + '</li>';
      }).join('');

      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');
      panel.focus();
      document.addEventListener('keydown', onKeydown);
    }

    function closeModal() {
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('modal-open');
      document.removeEventListener('keydown', onKeydown);
      if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
    }

    function onKeydown(e) {
      if (e.key === 'Escape') { closeModal(); return; }
      if (e.key === 'Tab') {
        var focusables = panel.querySelectorAll('button, a[href]');
        if (!focusables.length) return;
        var first = focusables[0], last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }

    modal.querySelectorAll('[data-modal-close]').forEach(function (el) {
      el.addEventListener('click', closeModal);
    });
  }

  /* ============================================================ INIT ============================================================ */
  document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('year').textContent = new Date().getFullYear();
    initSupabase();
    // ✅ FIX #2: the landing page previously made zero Supabase calls — this is
    // what makes it start reporting into page_views/sessions/live_sessions.
    if (supabaseClient) {
      trackPageView(supabaseClient);
      // ✅ FIX #4: paint any active ad slots into their [data-ad-slot] containers
      renderAdSlots(supabaseClient);
    }
    // ✅ FIX #3: rewrite the static "app.html" links to carry the query string
    forwardQueryStringToApp();
    wireGoogleButtons();
    checkSessionAndAdapt();
    initNav();
    initRail();
    initTypedHeadline();
    initHeroCanvas();
    initTicker();
    initCoinRows();
    initReveals();
    initCounters();
    initHowLine();
    initFaq();
    initMagnetic();
    initMap();
    initCookieConsent();
  });
})();

/* ============================================================
   COOKIE CONSENT
   ============================================================ */
var COOKIE_KEY = 'sapex_cookie_consent'; // 'accepted' | 'declined'

function initCookieConsent() {
  var banner = document.getElementById('cookieBanner');
  if (!banner || localStorage.getItem(COOKIE_KEY)) return;

  requestAnimationFrame(function () { banner.classList.add('is-visible'); });

  document.getElementById('cookieAccept').addEventListener('click', function () {
    localStorage.setItem(COOKIE_KEY, 'accepted');
    banner.classList.remove('is-visible');
  });
  document.getElementById('cookieDecline').addEventListener('click', function () {
    localStorage.setItem(COOKIE_KEY, 'declined');
    banner.classList.remove('is-visible');
  });
}

// ============================================================
  // ✅ FIX #2: VISITOR ANALYTICS TRACKING
  // Ported as-is from app.js (the terminal) so the landing page writes to the
  // same page_views / sessions / live_sessions tables. Without this, every
  // visitor who never clicks through to the terminal was invisible to the
  // admin panel's traffic numbers.
  // ============================================================

  function parseUserAgentDetails() {
    var ua = navigator.userAgent || '';
    var browser = 'Unknown', os = 'Unknown', deviceType = 'desktop';

    if (/Edg\//.test(ua)) browser = 'Edge';
    else if (/OPR\//.test(ua) || /Opera/.test(ua)) browser = 'Opera';
    else if (/Brave\//.test(ua)) browser = 'Brave';
    else if (/Firefox\//.test(ua)) browser = 'Firefox';
    else if (/CriOS\//.test(ua)) browser = 'Chrome (iOS)';
    else if (/Chrome\//.test(ua)) browser = 'Chrome';
    else if (/Safari\//.test(ua) && /Version\//.test(ua)) browser = 'Safari';
    else if (/MSIE|Trident/.test(ua)) browser = 'Internet Explorer';

    if (/Windows NT/.test(ua)) os = 'Windows';
    else if (/Mac OS X/.test(ua) && !/iPhone|iPad|iPod/.test(ua)) os = 'macOS';
    else if (/Android/.test(ua)) os = 'Android';
    else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
    else if (/CrOS/.test(ua)) os = 'ChromeOS';
    else if (/Linux/.test(ua)) os = 'Linux';

    if (/iPad/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) deviceType = 'tablet';
    else if (/Mobi|iPhone|Android.*Mobile/.test(ua)) deviceType = 'mobile';

    return {
      browser: browser, os: os, deviceType: deviceType,
      screenResolution: (window.screen && window.screen.width && window.screen.height)
        ? (window.screen.width + 'x' + window.screen.height) : null
    };
  }

  async function resolveVisitorGeo() {
    try {
      var cached = sessionStorage.getItem('sapex_geo_cache');
      if (cached) return JSON.parse(cached);
    } catch (e) { /* sessionStorage unavailable — skip cache */ }

    var withTimeout = function (promise, ms) {
      return Promise.race([
        promise,
        new Promise(function (_, reject) { setTimeout(function () { reject(new Error('geo timeout')); }, ms); })
      ]);
    };

    var geo = null;

    try {
      var res = await withTimeout(fetch('https://ipapi.co/json/'), 4000);
      if (res.ok) {
        var d = await res.json();
        if (!d.error) {
          geo = { country_code: d.country_code || null, country_name: d.country_name || null, region: d.region || null, city: d.city || null };
        }
      }
    } catch (e) { /* primary geo provider unavailable — try fallback below */ }

    if (!geo) {
      try {
        var res2 = await withTimeout(fetch('https://ipwho.is/'), 4000);
        if (res2.ok) {
          var d2 = await res2.json();
          if (d2.success !== false) {
            geo = { country_code: d2.country_code || null, country_name: d2.country || null, region: d2.region || null, city: d2.city || null };
          }
        }
      } catch (e) { /* both geo providers unavailable this session — proceed without geo data */ }
    }

    if (!geo) geo = { country_code: null, country_name: null, region: null, city: null };

    try { sessionStorage.setItem('sapex_geo_cache', JSON.stringify(geo)); } catch (e) { /* non-fatal */ }
    return geo;
  }

  function captureUtmParams() {
    var params = new URLSearchParams(window.location.search);
    var fresh = {
      utm_source: params.get('utm_source'),
      utm_medium: params.get('utm_medium'),
      utm_campaign: params.get('utm_campaign'),
      utm_term: params.get('utm_term'),
      utm_content: params.get('utm_content')
    };
    if (Object.values(fresh).some(function (v) { return v; })) {
      try { sessionStorage.setItem('sapex_utm', JSON.stringify(fresh)); } catch (e) { /* non-fatal */ }
      return fresh;
    }
    try {
      var stored = sessionStorage.getItem('sapex_utm');
      if (stored) return JSON.parse(stored);
    } catch (e) { /* non-fatal */ }
    return { utm_source: null, utm_medium: null, utm_campaign: null, utm_term: null, utm_content: null };
  }

  async function trackEvent(client, eventType, eventLabel, extra) {
    extra = extra || {};
    try {
      var visitorId = localStorage.getItem('sapex_visitor_id');
      var sessionId = sessionStorage.getItem('sapex_session_id');
      await client.from('page_events').insert({
        visitor_id: visitorId,
        session_id: sessionId,
        event_type: eventType,
        event_label: eventLabel || null,
        page: window.location.pathname,
        details: extra
      });
    } catch (e) { console.warn('Event tracking failed (non-fatal):', e); }
  }

  function initAutoEventTracking(client) {
    if (window.__sapexAutoEventsBound) return;
    window.__sapexAutoEventsBound = true;

    var downloadExtensions = /\.(pdf|csv|xlsx?|docx?|zip|rar|pptx?)$/i;

    document.addEventListener('click', function (e) {
      var link = e.target.closest('a[href]');
      if (!link) return;
      var url;
      try { url = new URL(link.href, window.location.href); } catch (err) { return; }

      if (url.hostname && url.hostname !== window.location.hostname) {
        trackEvent(client, 'outbound_click', url.hostname, { href: url.href });
      } else if (downloadExtensions.test(url.pathname)) {
        trackEvent(client, 'file_download', url.pathname.split('/').pop(), { href: url.href });
      }
    }, true);

    document.addEventListener('play', function (e) {
      if (e.target && e.target.tagName === 'VIDEO') {
        var label = e.target.currentSrc || e.target.src || e.target.id || 'video';
        trackEvent(client, 'video_play', label);
      }
    }, true);
  }

  function initErrorTracking(client) {
    if (window.__sapexErrorTrackingBound) return;
    window.__sapexErrorTrackingBound = true;

    var errorsLoggedThisSession = 0;
    var MAX_ERRORS_PER_SESSION = 10;

    var logError = function (payload) {
      if (errorsLoggedThisSession >= MAX_ERRORS_PER_SESSION) return;
      errorsLoggedThisSession++;
      client.from('client_errors').insert({
        visitor_id: localStorage.getItem('sapex_visitor_id'),
        page: window.location.pathname,
        message: (payload.message || '').slice(0, 500),
        source: payload.source || null,
        lineno: payload.lineno || null,
        colno: payload.colno || null,
        stack: (payload.stack || '').slice(0, 2000),
        user_agent: navigator.userAgent
      }).then(function () {}).catch(function () {});
    };

    window.addEventListener('error', function (e) {
      logError({ message: e.message, source: e.filename, lineno: e.lineno, colno: e.colno, stack: e.error && e.error.stack });
    });

    window.addEventListener('unhandledrejection', function (e) {
      var reason = e.reason;
      logError({ message: (reason && reason.message) || String(reason), stack: reason && reason.stack });
    });
  }

  function capturePageLoadTime(client, pageViewId) {
    var finish = function () {
      try {
        var nav = performance.getEntriesByType('navigation')[0];
        var loadTimeMs = nav ? Math.round(nav.loadEventEnd - nav.startTime) : null;
        if (loadTimeMs && pageViewId) {
          client.from('page_views').update({ load_time_ms: loadTimeMs }).eq('id', pageViewId).then(function () {}).catch(function () {});
        }
      } catch (e) { /* Navigation Timing API unavailable — skip, non-fatal */ }
    };
    if (document.readyState === 'complete') {
      setTimeout(finish, 0);
    } else {
      window.addEventListener('load', function () { setTimeout(finish, 0); });
    }
  }

  function generateUUID() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  async function trackPageView(client) {
    try {
      var visitorId = localStorage.getItem('sapex_visitor_id');
      if (!visitorId) {
        visitorId = generateUUID();
        localStorage.setItem('sapex_visitor_id', visitorId);
      }

      var sessionId = sessionStorage.getItem('sapex_session_id');
      var sessionStartedAt = sessionStorage.getItem('sapex_session_started_at');
      if (!sessionId) {
        sessionId = generateUUID();
        sessionStartedAt = new Date().toISOString();
        sessionStorage.setItem('sapex_session_id', sessionId);
        sessionStorage.setItem('sapex_session_started_at', sessionStartedAt);
      }

      var utm = captureUtmParams();
      var ua = parseUserAgentDetails();
      var geo = await resolveVisitorGeo();

      var pvResult = await client.from('page_views').insert({
        page: window.location.pathname,
        referrer: document.referrer || null,
        visitor_id: visitorId,
        session_id: sessionId,
        utm_source: utm.utm_source,
        utm_medium: utm.utm_medium,
        utm_campaign: utm.utm_campaign,
        utm_term: utm.utm_term,
        utm_content: utm.utm_content,
        country_code: geo.country_code,
        country_name: geo.country_name,
        region: geo.region,
        city: geo.city,
        device_type: ua.deviceType,
        browser: ua.browser,
        os: ua.os,
        screen_resolution: ua.screenResolution
      }).select('id').single();
      var inserted = pvResult.data, pvError = pvResult.error;
      if (pvError) console.error('❌ [tracking] page_views insert failed:', pvError.message);

      capturePageLoadTime(client, inserted && inserted.id);

      var sessResult = await client.from('sessions').upsert({
        session_id: sessionId,
        visitor_id: visitorId,
        started_at: sessionStartedAt,
        ended_at: new Date().toISOString(),
        entry_page: window.location.pathname,
        country_code: geo.country_code,
        country_name: geo.country_name,
        city: geo.city,
        device_type: ua.deviceType,
        browser: ua.browser,
        os: ua.os
      }, { onConflict: 'session_id', ignoreDuplicates: false });
      if (sessResult.error) console.error('❌ [tracking] sessions upsert failed:', sessResult.error.message);

      var heartbeat = {
        visitor_id: visitorId,
        session_id: sessionId,
        last_seen: new Date().toISOString(),
        first_seen: sessionStartedAt,
        current_page: window.location.pathname,
        country_code: geo.country_code,
        country_name: geo.country_name,
        city: geo.city,
        device_type: ua.deviceType,
        browser: ua.browser,
        os: ua.os
      };
      var liveResult = await client.from('live_sessions').upsert(heartbeat, { onConflict: 'visitor_id' });
      if (liveResult.error) console.error('❌ [tracking] live_sessions upsert failed:', liveResult.error.message);

      setInterval(async function () {
        try {
          var now = new Date().toISOString();
          await client.from('live_sessions').upsert({
            visitor_id: visitorId,
            session_id: sessionId,
            last_seen: now,
            first_seen: sessionStartedAt,
            current_page: window.location.pathname
          }, { onConflict: 'visitor_id' });
          await client.from('sessions').upsert({
            session_id: sessionId,
            visitor_id: visitorId,
            started_at: sessionStartedAt,
            ended_at: now
          }, { onConflict: 'session_id', ignoreDuplicates: false });
        } catch (e) { /* non-fatal */ }
      }, 60000);

      initAutoEventTracking(client);
      initErrorTracking(client);

    } catch (e) {
      console.warn('Analytics tracking failed (non-fatal):', e);
    }
  }

  function forwardQueryStringToApp() {
    if (!window.location.search) return;
    document.querySelectorAll('a[href="app.html"]').forEach(function (a) {
      a.href = 'app.html' + window.location.search;
    });
  }

  // ✅ FIX #4: identical copy of the function added to app.js — reads active
  // ad_slots rows and paints each into its matching [data-ad-slot] container.
  function renderAdSlots(client) {
    if (!client) return;
    client.from('ad_slots').select('*').eq('is_active', true).then(function (result) {
      var data = result.data, error = result.error;
      if (error || !data) return;
      data.forEach(function (ad) {
        var container = document.querySelector('[data-ad-slot="' + ad.slot_key + '"]');
        if (!container) return;
        container.innerHTML = '';
        if (ad.html_override && ad.html_override.trim()) {
          container.innerHTML = ad.html_override;
          return;
        }
        if (!ad.image_url) return;
        var link = document.createElement('a');
        link.href = ad.link_url || '#';
        link.target = '_blank';
        link.rel = 'noopener sponsored';
        link.className = 'sapex-ad-slot-link';
        var img = document.createElement('img');
        img.src = ad.image_url;
        img.alt = ad.name || 'Advertisement';
        img.className = 'sapex-ad-slot-img';
        img.loading = 'lazy';
        link.appendChild(img);
        container.appendChild(link);
      });
    }).catch(function (e) { console.warn('Ad slot render failed (non-fatal):', e); });
  }
