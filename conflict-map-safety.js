// conflict-map-safety.js
// Country safety level: a 0-100 "safe" percentage with a Good / Neutral / Bad band, drawn as a half-circle gauge.
// Shown in two places: a small box on the map when a country is clicked, and at the top of the Intel panel's Country tab.
//
// How the number is worked out (kept simple and shown to the reader):
//   * It looks at the last 30 days of events in war_events for that country: conflict, cyberattacks, piracy.
//   * Each kind is turned into a 0 to 1 "pressure" with a saturating curve (1 - e^(-count / scale)), so one very busy
//     country cannot make every other country look safe, and a few events cannot look catastrophic.
//   * danger points = 70 x conflict + 15 x cyber + 15 x piracy (+/- 5 for a rising or falling 7-day trend).
//   * safety % = 100 - danger points. Good 70 and above, Neutral 40 to 69, Bad under 40.
// It is an estimate built from news-reported events. It is not a travel advisory and coverage is uneven.
// Nothing is hard-coded per country. The numbers come from the same war_events table the map already uses.
window.SapexSafety = (function () {
  'use strict';

  var CFG = {
    scale: { conflict: 150, fatal: 200, cyber: 25, piracy: 8 },   // events (or deaths) at which a kind is about 63% "full"
    weight: { conflict: 70, cyber: 15, piracy: 15 },              // maximum danger points each kind can add
    trend: { up: 1.5, down: 0.6, pts: 5, minEvents: 10 },
    good: 70, bad: 40,
    days: 30, pageSize: 1000, maxPages: 20,
    cacheMs: 30 * 60 * 1000, cacheKey: 'sapex_safety_v1',
  };
  // The conflict feed deliberately leaves out ordinary policing and crime in these countries (see war_intel_bot.py).
  var CONFLICT_FEED_LIMITED = { USA: 'the United States', FRA: 'France', GBR: 'the United Kingdom' };

  var ctx = null, memo = null, popup = null;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) { return Number(n || 0).toLocaleString(); }
  function sat(n, scale) { return 1 - Math.exp(-(n || 0) / scale); }
  function isoDay(offsetDays) { return new Date(Date.now() - offsetDays * 86400000).toISOString().slice(0, 10); }

  /* ---------------- data: small, paged, cached ---------------- */
  function readCache() {
    try {
      var o = JSON.parse(localStorage.getItem(CFG.cacheKey) || 'null');
      if (o && Date.now() - o.t < CFG.cacheMs && o.v) return o.v;
    } catch (e) { /* storage blocked */ }
    return null;
  }
  function writeCache(v) { try { localStorage.setItem(CFG.cacheKey, JSON.stringify({ t: Date.now(), v: v })); } catch (e) { /* ignore */ } }

  async function fetchPage(from, since) {
    var res = await ctx.supa().from('war_events')
      .select('country_iso3,event_date,category,fatalities_est')
      .gte('event_date', since)
      .order('event_date', { ascending: false }).order('id', { ascending: true })
      .range(from, from + CFG.pageSize - 1);
    if (res.error) throw res.error;
    return res.data || [];
  }

  /** Counts per country for the last 30 days. Pages through the table (Supabase returns 1000 rows per request) in parallel batches of 4. */
  async function build() {
    var since = isoDay(CFG.days), since7 = isoDay(7), rows = [], page = 0, done = false;
    while (!done && page < CFG.maxPages) {
      var batch = [];
      for (var i = 0; i < 4 && page + i < CFG.maxPages; i++) batch.push(fetchPage((page + i) * CFG.pageSize, since));
      var got = await Promise.all(batch);
      got.forEach(function (g) { rows = rows.concat(g); if (g.length < CFG.pageSize) done = true; });
      page += batch.length;
    }
    var by = {};
    rows.forEach(function (r) {
      var k = String(r.country_iso3 || '').toUpperCase();
      if (!k) return;
      var a = by[k] || (by[k] = { c: 0, c7: 0, y: 0, y7: 0, p: 0, p7: 0, f: 0 });
      var recent = String(r.event_date || '') >= since7;
      if (r.category === 'cyber') { a.y++; if (recent) a.y7++; }
      else if (r.category === 'piracy') { a.p++; if (recent) a.p7++; }
      else { a.c++; if (recent) a.c7++; a.f += Number(r.fatalities_est) > 0 ? Number(r.fatalities_est) : 0; }
    });
    return by;
  }

  function load() {
    if (memo) return memo;
    var cached = readCache();
    memo = cached ? Promise.resolve(cached) : build().then(function (v) { writeCache(v); return v; });
    memo.catch(function () { memo = null; });   // let a later click try again after a failure
    return memo;
  }

  /* ---------------- scoring ---------------- */
  function compute(a) {
    a = a || { c: 0, c7: 0, y: 0, y7: 0, p: 0, p7: 0, f: 0 };
    var conflict = 1 - (1 - sat(a.c, CFG.scale.conflict)) * (1 - sat(a.f, CFG.scale.fatal));
    var ptsC = CFG.weight.conflict * conflict, ptsY = CFG.weight.cyber * sat(a.y, CFG.scale.cyber), ptsP = CFG.weight.piracy * sat(a.p, CFG.scale.piracy);
    var total = a.c + a.y + a.p, total7 = a.c7 + a.y7 + a.p7, ptsT = 0, trend = 'Steady';
    if (total >= CFG.trend.minEvents) {
      var ratio = (total7 / 7) / (total / CFG.days);
      if (ratio > CFG.trend.up) { trend = 'Rising'; ptsT = CFG.trend.pts; }
      else if (ratio < CFG.trend.down) { trend = 'Falling'; ptsT = -CFG.trend.pts; }
    }
    var danger = Math.max(0, Math.min(100, ptsC + ptsY + ptsP + ptsT));
    var safety = Math.round(100 - danger);
    var level = safety >= CFG.good ? 'good' : safety >= CFG.bad ? 'neutral' : 'bad';
    return {
      safety: safety, level: level, label: level === 'good' ? 'Good' : level === 'neutral' ? 'Neutral' : 'Bad',
      counts: a, total: total, trend: trend,
      pts: { conflict: Math.round(ptsC), cyber: Math.round(ptsY), piracy: Math.round(ptsP), trend: ptsT },
    };
  }

  /* ---------------- gauge (SVG half circle: Good left, Neutral top, Bad right; the needle turns with transform only) ---------------- */
  function pt(a, r) { var rad = a * Math.PI / 180; return [100 + r * Math.cos(rad), 100 - r * Math.sin(rad)]; }
  function seg(a1, a2, cls, on) {
    var p1 = pt(a1, 80), p2 = pt(a2, 80);
    return '<path class="sg-seg ' + cls + (on ? ' on' : '') + '" d="M' + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1) + ' A80 80 0 0 1 ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1) + '"/>';
  }
  function letter(a, t) { var p = pt(a, 58); return '<text class="sg-l" x="' + p[0].toFixed(1) + '" y="' + p[1].toFixed(1) + '" text-anchor="middle" dominant-baseline="middle">' + t + '</text>'; }
  function gaugeSvg(sc) {
    var deg = -(180 * sc.safety / 100);
    return '<svg class="sg-svg" viewBox="0 0 200 112" role="img" aria-label="Safety level ' + sc.safety + ' percent, ' + sc.label + '">' +
      seg(180, 122, 'g', sc.level === 'good') + seg(118, 62, 'n', sc.level === 'neutral') + seg(58, 0, 'b', sc.level === 'bad') +
      letter(151, 'G') + letter(90, 'N') + letter(29, 'B') +
      '<g class="sg-needle" data-deg="' + deg.toFixed(1) + '" style="transform:rotate(-90deg)"><line x1="100" y1="100" x2="166" y2="100"/><circle cx="100" cy="100" r="6"/></g>' +
      '</svg>';
  }
  /** Turns the needle from the middle to its place on the next frame, so the move is a transform transition. */
  function settle(root) {
    if (!root) return;
    requestAnimationFrame(function () {
      root.querySelectorAll('.sg-needle[data-deg]').forEach(function (n) { n.style.transform = 'rotate(' + n.getAttribute('data-deg') + 'deg)'; });
    });
  }

  /* ---------------- markup ---------------- */
  function why(sc, name, iso3) {
    var a = sc.counts, rows = [];
    function row(label, n, pts) { rows.push('<div class="sg-row"><span>' + label + '</span><b>' + fmt(n) + '</b><em>' + (pts > 0 ? '-' + pts : '0') + ' pts</em></div>'); }
    row('Conflict events', a.c, sc.pts.conflict);
    row('Cyberattacks', a.y, sc.pts.cyber);
    row('Piracy incidents', a.p, sc.pts.piracy);
    if (sc.pts.trend) rows.push('<div class="sg-row"><span>Trend: ' + sc.trend.toLowerCase() + ' in the last 7 days</span><b></b><em>' + (sc.pts.trend > 0 ? '-' + sc.pts.trend : '+' + Math.abs(sc.pts.trend)) + ' pts</em></div>');
    var note = sc.total === 0
      ? 'No incidents for ' + esc(name) + ' in our feed over the last 30 days. That is not a guarantee: news coverage varies by country.'
      : 'Counted from news-reported events in the last 30 days. Few reports can make a place look safer than it is.';
    var lim = CONFLICT_FEED_LIMITED[iso3] ? ' The conflict feed leaves out ordinary crime and policing in ' + CONFLICT_FEED_LIMITED[iso3] + '.' : '';
    return '<div class="sg-why">' + rows.join('') + '</div><p class="sg-note">' + note + lim + ' An estimate, not a travel advisory.</p>';
  }

  function panelHtml(sc, name, iso3) {
    return '<div class="panel-section-title">Safety level <small class="psmall">last 30 days</small></div>' +
      '<div class="sg sg-' + sc.level + '">' + gaugeSvg(sc) +
      '<div class="sg-read"><b>' + sc.safety + '%</b><span>safe &middot; ' + sc.label + '</span></div></div>' + why(sc, name, iso3);
  }
  function popupHtml(sc, name) {
    return '<div class="sg sg-' + sc.level + ' sg-mini"><div class="sg-name">' + esc(name) + '</div>' + gaugeSvg(sc) +
      '<div class="sg-read"><b>' + sc.safety + '%</b><span>safe &middot; ' + sc.label + '</span></div>' +
      '<div class="sg-foot">' + fmt(sc.counts.c) + ' conflict, ' + fmt(sc.counts.y) + ' cyber, ' + fmt(sc.counts.p) + ' piracy in 30 days. Estimate, not a travel advisory.</div></div>';
  }

  /* ---------------- public ---------------- */
  function init(c) { ctx = c; }

  /** Fills the Country tab block. isCurrent() says whether the same country is still selected when the data arrives. */
  async function fillPanel(id, iso3, name, isCurrent) {
    var box = document.getElementById(id);
    if (!box || !ctx) return;
    box.innerHTML = '<div class="panel-section-title">Safety level</div><div class="sk sk-s"></div>';
    try {
      var by = await load();
      if (isCurrent && !isCurrent()) return;
      box = document.getElementById(id);
      if (!box) return;
      box.innerHTML = panelHtml(compute(by[iso3]), name, iso3);
      settle(box);
    } catch (e) {
      console.warn('[safety] could not load', e);
      if (box && (!isCurrent || isCurrent())) box.innerHTML = '<div class="panel-section-title">Safety level</div><div class="empty-note">The safety level could not be worked out right now. Reload the map to try again.</div>';
    }
  }

  /** Small box on the map where a country was clicked. It closes when the map is clicked, like the news box. */
  async function showPopup(iso3, lngLat, name) {
    if (!ctx || !window.mapboxgl) return;
    var map = ctx.map();
    if (!map) return;
    if (popup) { popup.remove(); popup = null; }
    var by;
    try { by = await load(); } catch (e) { return; }
    var pop = new mapboxgl.Popup({ anchor: 'top', offset: 12, closeButton: false, closeOnClick: true, maxWidth: '260px', className: 'cm-safety-pop' })
      .setLngLat(lngLat).setHTML(popupHtml(compute(by[iso3]), name || iso3)).addTo(map);
    popup = pop;
    pop.on('close', function () { if (popup === pop) popup = null; });
    settle(pop.getElement());
  }

  return { init: init, fillPanel: fillPanel, showPopup: showPopup, compute: compute };
})();
