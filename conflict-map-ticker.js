// conflict-map-ticker.js (redesign stage 9)
// The moving bar above the top bar: Prediction Arena predictions, newest war events, published event forecasts and
// the newest Geo Risk tickets, interleaved so no type shows more than twice in a row (24 items at most).
//
// Sources (snapshot /data/<table>.json first, then Supabase, like the terminal's snapOrQuery):
//   prediction_tickets          id, question, category, status ('open' | 'resolved'), actual_outcome, created_at
//   prediction_ticket_updates   ticket_id, created_at   (approved rows only: they move a ticket up the bar)
//   war_events_7d snapshot      newest events (falls back to the rows the map already holds)
//   event_forecasts             id, event_name, country, event_type, published_at   (status = 'published')
//   geo_predictions             id, headline, created_at   (title only; no probability, no AI call)
// Status wording is the app's own (prediction_arena.js): OPEN, or RESOLVED: <OUTCOME>. The AI call is a Premium
// feature of the arena, so it is never read here. Nothing on this bar is a recommendation to trade.
//
// Loaded before conflict-map-app.js, which calls SapexTicker.init({...}). If every source fails the bar empties
// itself: the slot is :empty, so CSS hands its height back to the map.
window.SapexTicker = (function () {
  'use strict';

  var SPEED = 40, MAX = 24, POLL = 300000, STALE = 86400000, ROTATE = 6000, HOLD = 3000;
  var ARENA = 'prediction_arena.html';
  var LABEL = { pred: 'PREDICTION', event: 'NEW', fc: 'FORECAST', geo: 'GEO RISK' };

  var ctx = null, box = null, items = [], sig = '', pollId = null, rotId = null, rotI = 0, holdId = null, resizeId = null;
  var wasHidden = false, busy = false, tries = 0;
  var rm = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  function reduced() { return !!(window.SapexAnim && SapexAnim.reduced ? SapexAnim.reduced() : rm && rm.matches); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function num(v) { var n = Number(v); return v == null || v === '' || !isFinite(n) ? null : n; }
  function clip(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function stamp(d) { var t = Date.parse(d); return isFinite(t) ? t : 0; }
  function ago(t) {
    if (!t) return '';
    var ms = Date.now() - t;
    if (ms < 3600000) return Math.max(1, Math.floor(ms / 60000)) + 'm ago';
    if (ms < 86400000) return Math.floor(ms / 3600000) + 'h ago';
    return Math.floor(ms / 86400000) + 'd ago';
  }

  /* ---------------- data ---------------- */
  async function rowsOf(table, cols, orderCol, limit, filter) {
    var snap = ctx.snap ? await ctx.snap(table) : null;
    if (snap && snap.items) return filter ? snap.items.filter(filter) : snap.items;
    var supa = ctx.supa && ctx.supa();
    if (!supa) throw new Error('no client');
    var q = supa.from(table).select(cols);
    if (table === 'event_forecasts') q = q.eq('status', 'published');
    var res = await q.order(orderCol, { ascending: false }).limit(limit);
    if (res.error) throw res.error;
    return res.data || [];
  }
  function safe(fn) { return fn().catch(function () { return []; }); }   // a failed source is skipped, never shown

  function statusWord(t) { return t.status === 'open' ? 'OPEN' : 'RESOLVED: ' + String(t.actual_outcome || 'N/A').toUpperCase(); }

  async function loadPreds() {
    var rows = await rowsOf('prediction_tickets', 'id,question,category,status,actual_outcome,created_at', 'created_at', 30);
    var upd = {};
    try {
      var supa = ctx.supa && ctx.supa();
      if (supa) {
        var r = await supa.from('prediction_ticket_updates').select('ticket_id,created_at').eq('status', 'approved').order('created_at', { ascending: false }).limit(30);
        (r.data || []).forEach(function (u) { if (!upd[u.ticket_id]) upd[u.ticket_id] = stamp(u.created_at); });
      }
    } catch (e) { /* updates only reorder the bar */ }
    return rows.filter(function (t) { return t && t.question; }).map(function (t) {
      return { type: 'pred', id: t.id, ts: Math.max(stamp(t.created_at), upd[t.id] || 0), text: clip(t.question, 90), meta: statusWord(t), row: t };
    }).sort(function (a, b) { return b.ts - a.ts; }).slice(0, 10);
  }

  async function loadEvents() {
    var snap = ctx.snap ? await ctx.snap('war_events_7d') : null;
    var rows = snap && snap.items ? snap.items.map(ctx.expand || function (x) { return x; }) : (ctx.rows ? ctx.rows() : []);
    return rows.filter(function (r) { return r && r.event_date && num(r.latitude) != null && num(r.longitude) != null; })
      .sort(function (a, b) { return String(b.event_date).localeCompare(String(a.event_date)); }).slice(0, 10)
      .map(function (r) {
        var ts = stamp(r.event_date), d = Math.floor((Date.now() - ts) / 86400000);
        return { type: 'event', id: r.id, ts: ts, text: (r.country_name || r.location_name || 'Unknown') + ' · ' + String(r.event_type || r.source || 'event').replace(/_/g, ' '), meta: d < 1 ? 'today' : ago(ts), row: r };
      });
  }

  async function loadForecasts() {
    var rows = await rowsOf('event_forecasts', 'id,event_name,country,event_type,published_at', 'published_at', 8, function (f) { return !f.status || f.status === 'published'; });
    return rows.filter(function (f) { return f && f.event_name; })
      .sort(function (a, b) { return stamp(b.published_at) - stamp(a.published_at); }).slice(0, 8)
      .map(function (f) { return { type: 'fc', id: f.id, ts: stamp(f.published_at), text: clip(f.event_name, 80), meta: f.country || '', row: f }; });
  }

  async function loadGeo() {
    var rows = await rowsOf('geo_predictions', 'id,headline,created_at', 'created_at', 3);
    return rows.filter(function (g) { return g && g.headline; })
      .sort(function (a, b) { return stamp(b.created_at) - stamp(a.created_at); }).slice(0, 3)
      .map(function (g) { return { type: 'geo', id: g.id, ts: stamp(g.created_at), text: clip(g.headline, 90), meta: ago(stamp(g.created_at)), row: g }; });
  }

  /** Newest first inside each type; never more than two of one type in a row; at most MAX items. */
  function interleave(groups) {
    var out = [], left = groups.filter(function (g) { return g.length; }).map(function (g) { return g.slice(); });
    while (out.length < MAX && left.length) {
      var a = out[out.length - 1], b = out[out.length - 2];
      var ok = left.filter(function (g) { return !(a && b && a.type === b.type && g[0].type === a.type); });
      var pool = ok.length ? ok : left;
      pool.sort(function (x, y) { return y.length - x.length || y[0].ts - x[0].ts; });
      out.push(pool[0].shift());
      left = left.filter(function (g) { return g.length; });
    }
    return out;
  }

  async function load() {
    if (busy) return;
    busy = true;
    try {
      var all = await Promise.all([safe(loadPreds), safe(loadEvents), safe(loadForecasts), safe(loadGeo)]);
      var next = interleave(all);
      // The map may still be loading its events when the bar first starts: look again a few times before giving up.
      if (!all[1].length && tries < 5) { tries++; setTimeout(load, 4000); }
      var s = next.map(function (i) { return i.type + i.id + i.meta + i.text; }).join('|');
      if (s === sig && box.firstChild) return;   // nothing new: leave the marquee running where it is
      sig = s; items = next;
      mount();
    } finally { busy = false; }
  }

  /* ---------------- render ---------------- */
  function itemHtml(it, i) {
    var stale = it.ts && Date.now() - it.ts > STALE;
    var label = it.type === 'event' && stale ? 'EVENT' : LABEL[it.type];
    return '<button type="button" class="tk-item tk-' + it.type + (stale ? ' stale' : '') + '" data-i="' + i + '">' +
      '<span class="tk-chip">' + label + '</span><span class="tk-text">' + esc(it.text) + '</span>' +
      (it.meta ? '<span class="tk-meta">' + esc(it.meta) + '</span>' : '') + '</button>';
  }

  function stopRotate() { if (rotId) { clearInterval(rotId); rotId = null; } }

  function mount() {
    stopRotate();
    if (!items.length) { box.innerHTML = ''; return; }   // empty slot: CSS gives the height back to the map
    if (reduced()) {
      rotI = 0;
      showStatic();
      if (items.length > 1) rotId = setInterval(function () { if (!document.hidden) { rotI = (rotI + 1) % items.length; showStatic(); } }, ROTATE);
      return;
    }
    var one = items.map(itemHtml).join('');
    box.innerHTML = '<div class="tk-track"><div class="tk-set">' + one + '</div></div>';
    var track = box.firstChild, w = track.firstChild.getBoundingClientRect().width || 1;
    var copies = Math.max(1, Math.ceil(box.clientWidth / w));   // one half must be at least as wide as the bar
    var half = one;
    for (var c = 1; c < copies; c++) half += '<span class="tk-dup" aria-hidden="true">' + one + '</span>';
    track.innerHTML = '<div class="tk-set">' + half + '</div><div class="tk-set" aria-hidden="true">' + half + '</div>';
    track.querySelectorAll('.tk-dup button, .tk-set + .tk-set button').forEach(function (b) { b.tabIndex = -1; });
    track.style.setProperty('--tk-dur', Math.max(10, (w * copies) / SPEED).toFixed(1) + 's');   // about 40 px per second
  }
  function showStatic() { box.innerHTML = '<div class="tk-static">' + itemHtml(items[rotI], rotI) + '</div>'; }

  /* ---------------- clicks ---------------- */
  function iso3For(name) {
    var n = String(name || '').toLowerCase();
    if (!n) return '';
    var hit = (ctx.stats ? ctx.stats() : []).find(function (c) { return String(c.country_name || '').toLowerCase() === n; });
    return hit ? hit.country_iso3 : '';
  }
  function openArena(id) { window.open(ARENA + (id != null ? '?ticket=' + encodeURIComponent(id) : ''), '_blank', 'noopener'); }

  function openPrediction(it) {
    var t = it.row, panel = document.getElementById('panel-content');
    if (!window.SapexPanel || !panel) { openArena(t.id); return; }
    SapexPanel.beginCustom();
    panel.innerHTML =
      '<div class="panel-eyebrow">Prediction Arena</div>' +
      '<div class="panel-title">' + esc(t.question) + '</div>' +
      '<div class="psub"><b>' + esc(statusWord(t)) + '</b>' + (t.category ? ' · ' + esc(t.category) : '') + '</div>' +
      '<div class="tact"><a class="pbtn plink" href="' + ARENA + '?ticket=' + encodeURIComponent(t.id) + '" target="_blank" rel="noopener">Open in Prediction Arena</a></div>' +
      '<div class="psub">Community predictions for information only. Not financial advice.</div>';
    if (ctx.reveal) ctx.reveal();
    var iso = t.country_iso3 || iso3For(t.country);   // tickets carry no country today; if one is added the camera follows it
    if (iso && ctx.focusCountry) ctx.focusCountry(String(iso).toUpperCase());
  }

  function onClick(e) {
    var b = e.target.closest('.tk-item');
    if (!b) return;
    var it = items[Number(b.dataset.i)];
    if (!it) return;
    if (it.type === 'pred') return openPrediction(it);
    if (it.type === 'event') { if (ctx.flyToEvent) ctx.flyToEvent(it.row); if (ctx.pulse) ctx.pulse([it.row]); return; }
    if (it.type === 'fc') {
      var iso = iso3For(it.row.country);
      if (iso && window.SapexPanel) { SapexPanel.showCountry(iso, { tab: 'country', fly: true }); return; }
      return openArena(null);   // forecasts live in the Prediction Arena page when no map country matches
    }
    if (it.type === 'geo' && window.SapexPanel) { if (ctx.reveal) ctx.reveal(); SapexPanel.showTab('geo'); }
  }

  /* ---------------- pause rules and refresh ---------------- */
  function hold(on) { box.classList.toggle('tk-hold', on); }
  function init(c) {
    ctx = c;
    box = document.getElementById('ticker');
    if (!box || box.dataset.ready) return;
    box.dataset.ready = '1';
    box.addEventListener('click', onClick);
    box.addEventListener('touchstart', function () { clearTimeout(holdId); hold(true); }, { passive: true });
    var release = function () { clearTimeout(holdId); holdId = setTimeout(function () { hold(false); }, HOLD); };
    box.addEventListener('touchend', release, { passive: true });
    box.addEventListener('touchcancel', release, { passive: true });
    document.addEventListener('visibilitychange', function () {
      box.classList.toggle('tk-off', document.hidden);
      if (document.hidden) { wasHidden = true; return; }
      if (wasHidden) { wasHidden = false; load(); }
    });
    window.addEventListener('resize', function () { clearTimeout(resizeId); resizeId = setTimeout(function () { if (items.length) mount(); }, 300); });
    var again = function () { if (items.length) mount(); };
    if (window.SapexAnim && SapexAnim.onReducedChange) SapexAnim.onReducedChange(again);
    else if (rm && rm.addEventListener) rm.addEventListener('change', again);
    load();
    pollId = setInterval(function () { if (!document.hidden) load(); }, POLL);
  }

  return { init: init, refresh: load };
})();
