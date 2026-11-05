// conflict-map-panel.js (redesign stages 7 and 8)
// The intelligence panel: four tabs (Country, Geo Risk, Secret Intel, Redactions), a world view when no country is
// selected, skeleton / empty / error states, and deep links (?country=UA&tab=geo).
// Stage 7: Country tab. Stage 8: Geo Risk (geo_predictions), Secret Intel (covert_predictions) and Redactions
// (war_redactions plus closed listings from bounties.json), with live INSERT updates and a NEW tag.
//
// Loaded before conflict-map-app.js, which calls SapexPanel.init(...) with the data it already holds, so nothing
// here talks to the map or the database except through that object. No data is hard-coded: every number comes from
// war_country_stats, the loaded war_events range, war_verified_intel, war_zones, /bounties.json and event_forecasts.
window.SapexPanel = (function () {
  'use strict';

  var TABS = [
    { id: 'country', label: 'Country' },
    { id: 'geo', label: 'Geo Risk' },
    { id: 'secret', label: 'Secret Intel' },
    { id: 'redactions', label: 'Redactions' },
  ];

  var ctx = null;
  var S = { iso3: null, tab: 'country', token: 0, rendered: false, custom: false, retry: {} };
  var memo = {};   // small in-memory cache (bounties, forecasts) so tab switches cost nothing

  function el(id) { return document.getElementById(id); }
  function content() { return el('panel-content'); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function safeUrl(u) { return /^https?:\/\//i.test(u || '') ? u : ''; }
  function num(v) { var n = Number(v); return v == null || v === '' || !isFinite(n) ? null : n; }
  function fmt(n) { return n == null ? '—' : Number(n).toLocaleString(); }
  function statFor(iso3) { return (ctx.stats() || []).find(function (c) { return c.country_iso3 === iso3; }) || null; }
  function heatClass(score) { return score >= 66 ? 'heat-high' : score >= 33 ? 'heat-mid' : 'heat-low'; }

  /* ---------------- shell: tab bar, delegated clicks ---------------- */
  function init(c) {
    ctx = c;
    var body = content();
    if (!body || el('panel-tabs')) return;
    var bar = document.createElement('div');
    bar.id = 'panel-tabs';
    bar.className = 'ptabs';
    bar.setAttribute('role', 'tablist');
    bar.setAttribute('aria-label', 'Intelligence tabs');
    bar.innerHTML = TABS.map(function (t) {
      return '<button type="button" class="ptab" role="tab" data-tab="' + t.id + '" aria-selected="false">' + esc(t.label) + '</button>';
    }).join('');
    body.parentNode.insertBefore(bar, body);
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('.ptab');
      if (b) showTab(b.dataset.tab);
    });
    body.addEventListener('click', onBodyClick);
    syncTabs();
  }

  function onBodyClick(e) {
    var t;
    if ((t = e.target.closest('[data-retry]'))) { var f = S.retry[t.dataset.retry]; if (f) f(); return; }
    if ((t = e.target.closest('[data-country]'))) { showCountry(t.dataset.country, { fly: true }); return; }
    if ((t = e.target.closest('[data-share]'))) { share(t); return; }
    if ((t = e.target.closest('[data-open-bounty]'))) { var b = el('bounty-btn'); if (b && !b.classList.contains('on')) b.click(); else if (ctx.openBountyTab) ctx.openBountyTab(); return; }
    if ((t = e.target.closest('[data-ticket]'))) { toggleTicket(t); return; }
    if ((t = e.target.closest('[data-go]'))) { showTab(t.dataset.go); return; }
    if ((t = e.target.closest('[data-world]'))) { showWorld(); }
  }

  function syncTabs() {
    var bar = el('panel-tabs');
    if (!bar) return;
    bar.querySelectorAll('.ptab').forEach(function (b) {
      var on = !S.custom && b.dataset.tab === S.tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function syncUrl() {
    try {
      var u = new URL(location.href);
      if (S.iso3) { u.searchParams.set('country', S.iso3); u.searchParams.set('tab', S.tab); }
      else { u.searchParams.delete('country'); u.searchParams.delete('tab'); }
      history.replaceState(null, '', u.pathname + (u.search ? u.search : '') + u.hash);
    } catch (e) { /* non-fatal */ }
  }

  function share(btn) {
    var u = new URL(location.href);
    u.searchParams.set('country', S.iso3 || '');
    u.searchParams.set('tab', S.tab);
    var link = u.href, done = function () { btn.textContent = 'Link copied'; setTimeout(function () { btn.textContent = 'Share'; }, 2000); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, function () { window.prompt('Copy this link', link); });
    else window.prompt('Copy this link', link);
  }

  /* ---------------- public actions ---------------- */
  function showCountry(iso3, opts) {
    opts = opts || {};
    S.iso3 = String(iso3 || '').toUpperCase();
    S.tab = opts.tab && TABS.some(function (t) { return t.id === opts.tab; }) ? opts.tab : (S.custom ? 'country' : S.tab);
    S.custom = false;
    S.rendered = true;
    if (ctx.reveal) ctx.reveal();
    render();
    if (opts.fly && ctx.focusCountry) ctx.focusCountry(S.iso3);
  }
  function showWorld() { S.iso3 = null; S.custom = false; S.rendered = true; render(); }
  function showTab(tab) { if (!TABS.some(function (t) { return t.id === tab; })) return; S.tab = tab; S.custom = false; S.rendered = true; render(); }
  /** The old cluster / methodology panels write their own HTML into #panel-content: no tab is highlighted while they show. */
  function beginCustom() { S.custom = true; S.rendered = true; S.token++; syncTabs(); }
  /** First open with nothing chosen yet: show the world view. */
  function ensure() { if (!S.rendered && ctx) { S.rendered = true; render(); } }

  /** Reads ?country=XX&tab=... once the country data is loaded. XX can be the 3-letter code the data uses, or a 2-letter code. */
  function applyDeepLink() {
    if (!ctx) return;
    var p;
    try { p = new URLSearchParams(location.search); } catch (e) { return; }
    var raw = (p.get('country') || '').trim().toUpperCase();
    var tab = (p.get('tab') || '').trim().toLowerCase();
    if (!raw) { if (S.rendered && !S.iso3 && !S.custom) render(); return; }
    var iso3 = /^[A-Z]{3}$/.test(raw) ? raw : (/^[A-Z]{2}$/.test(raw) ? resolveIso2(raw) : '');
    if (!iso3) { S.rendered = true; S.iso3 = null; if (ctx.reveal) ctx.reveal(); content().innerHTML = errorCard('We could not find the country "' + raw + '" in this link.', 'world'); syncTabs(); return; }
    showCountry(iso3, { tab: tab, fly: true });
  }
  function resolveIso2(code) {
    try {
      var name = new Intl.DisplayNames(['en'], { type: 'region' }).of(code);
      var hit = (ctx.stats() || []).find(function (c) { return String(c.country_name || '').toLowerCase() === String(name).toLowerCase(); });
      if (hit) return hit.country_iso3;
    } catch (e) { /* fall through */ }
    return (ctx.iso2To3 && ctx.iso2To3(code)) || '';
  }

  /* ---------------- rendering ---------------- */
  function skeleton() { return '<div class="sk"></div><div class="sk sk-s"></div><div class="sk sk-s"></div>'; }
  function errorCard(msg, retryKey) {
    return '<div class="empty-note perr">' + esc(msg) + ' <button type="button" class="pbtn" ' + (retryKey === 'world' ? 'data-world="1"' : 'data-retry="' + esc(retryKey) + '"') + '>' + (retryKey === 'world' ? 'Show world view' : 'Retry') + '</button></div>';
  }

  function render() {
    S.token++;
    S.retry = {};
    syncTabs();
    syncUrl();
    var box = content();
    if (!box) return;
    if (S.tab === 'geo' || S.tab === 'secret') return renderTickets(box, S.token, S.tab);
    if (S.tab === 'redactions') return renderRedactions(box, S.token);
    if (!S.iso3) return renderWorld(box);
    renderCountry(box, S.token);
  }


  function renderWorld(box) {
    var stats = (ctx.stats() || []).filter(function (c) { return num(c.intensity_score) > 0; })
      .sort(function (a, b) { return num(b.intensity_score) - num(a.intensity_score); }).slice(0, 5);
    var html = '<div class="panel-eyebrow">World view</div><div class="panel-title">Most active countries</div>' +
      '<div class="panel-sub">Ranked by 30-day event intensity. Tap a country to open it.</div>';
    if (!stats.length) {
      html += '<div class="empty-note">Country data is not loaded yet, or no country has recent activity. Click a country on the map once the map has finished loading.</div>';
    } else {
      html += '<div class="plist">' + stats.map(function (c) {
        var sc = num(c.intensity_score) || 0;
        return '<button type="button" class="feed-item" data-country="' + esc(c.country_iso3) + '">' +
          '<span class="feed-top"><span class="feed-country">' + esc(c.country_name || c.country_iso3) + '</span><span class="feed-ago ' + heatClass(sc) + '">' + Math.round(sc) + '</span></span>' +
          '<span class="feed-type">' + fmt(num(c.events_30d)) + ' events in 30 days</span></button>';
      }).join('') + '</div>';
    }
    var my = S.token;
    box.innerHTML = html +
      '<div class="panel-section-title">Newest Geo Risk tickets</div><div class="psec" id="pw-geo"></div>' +
      '<div class="panel-section-title">Newest Secret Intel</div><div class="psec" id="pw-secret"></div>' +
      '<div class="panel-section-title">Newest redactions</div><div class="psec" id="pw-red"></div>';
    ensureLive();
    fill('pw-geo', my, function () { return loadTickets('geo'); }, function (rows) { return worldTickets(rows.slice(0, 5), 'geo'); }, 'No Geo Risk tickets yet.');
    fill('pw-secret', my, function () { return loadTickets('secret'); }, function (rows) { return worldTickets(rows.slice(0, 5), 'secret'); }, 'No Secret Intel yet.');
    fill('pw-red', my, loadRedactions, function (rows) { return worldRedactions(rows.slice(0, 3)); }, 'Nothing has been withheld, corrected or closed yet.');
  }

  function renderCountry(box, my) {
    var iso3 = S.iso3, stat = statFor(iso3);
    var name = stat ? stat.country_name : iso3;
    var e7 = stat ? num(stat.events_7d) : null, e30 = stat ? num(stat.events_30d) : null, e90 = stat ? num(stat.events_90d) : null;
    var score = stat ? (num(stat.intensity_score) || 0) : 0;
    var ratio = e30 > 0 ? ((e7 || 0) / 7) / (e30 / 30) : 1;
    var trend = ratio > 1.2 ? ['Rising', 'fa-arrow-trend-up', 'heat-high'] : ratio < 0.8 ? ['Falling', 'fa-arrow-trend-down', 'heat-low'] : ['Steady', 'fa-arrow-right', ''];
    var fat = stat ? num(stat.fatalities_est_30d) : null;

    box.innerHTML =
      '<div class="phead"><div><div class="panel-eyebrow">' + (stat ? (stat.active_conflict ? 'Active Conflict Zone' : 'Monitored') : 'No recent activity') + '</div>' +
      '<div class="panel-title">' + esc(name) + '</div>' +
      '<div class="panel-sub">' + esc(stat && stat.conflict_name ? stat.conflict_name : 'No curated conflict label set') + '</div></div>' +
      '<button type="button" class="pbtn" data-share="1">Share</button></div>' +

      '<div class="pint"><div class="pint-row"><span class="pint-n ' + heatClass(score) + '">' + (stat ? Math.round(score) : '—') + '</span><span class="pint-l">Intensity score<br><small>30-day events relative to the most active country</small></span></div>' +
      '<div class="pbar"><i class="' + heatClass(score) + '" style="width:' + Math.max(2, Math.min(100, score)) + '%"></i></div></div>' +

      '<div class="panel-grid pgrid3">' +
        '<div class="panel-stat"><div class="n">' + fmt(e7 == null && stat ? 0 : e7) + '</div><div class="l">Events / 7d</div></div>' +
        '<div class="panel-stat"><div class="n">' + fmt(e30 == null && stat ? 0 : e30) + '</div><div class="l">Events / 30d</div></div>' +
        '<div class="panel-stat"><div class="n">' + fmt(e90 == null && stat ? 0 : e90) + '</div><div class="l">Events / 90d</div></div>' +
      '</div>' +
      (stat ? '<div class="ptrend ' + trend[2] + '"><i class="fa-solid ' + trend[1] + '"></i> ' + trend[0] + ' <small>(last 7 days against the 30-day pace)</small></div>' : '') +

      '<div class="panel-section-title">Estimated fatalities (30 days)</div>' +
      '<div class="pfat"><span class="pfat-n">' + (fat != null ? '~' + fmt(fat) : '—') + '</span>' +
      '<span class="pfat-note">' + (fat != null ? 'Estimate built from ACLED reports. It is a third-party figure, not verified by SaPEX, and usually incomplete.' : 'No ACLED fatality feed for this country, so no estimate is shown.') + '</span></div>' +

      '<div class="panel-section-title">Top event types <small class="psmall">in the loaded ' + (ctx.days() ? ctx.days() + '-day' : 'full') + ' range</small></div><div class="psec" id="ps-types"></div>' +
      '<div class="panel-section-title">Verified Intel</div><div class="psec" id="ps-intel"></div>' +
      '<div class="panel-section-title">Active zones</div><div class="psec" id="ps-zones"></div>' +
      '<div class="panel-section-title">Related bounties</div><div class="psec" id="ps-bounty"></div>' +
      '<div class="panel-section-title">Forecasts mentioning this country</div><div class="psec" id="ps-fc"></div>';

    fill('ps-types', my, async function () { return topTypes(iso3); }, renderTypes, 'No events for this country in the loaded range.');
    fill('ps-intel', my, function () { return intelFor(iso3); }, renderIntel, 'No analyst-verified figures logged for this country yet. Wounded counts, property damage, vehicles destroyed and territory control are entered by the SaPEX intel team, each with a source.');
    fill('ps-zones', my, function () { return zonesFor(iso3, stat); }, renderZones, 'No analyst-curated territory zones are recorded for this country.');
    fill('ps-bounty', my, function () { return bountiesFor(name); }, renderBounties, 'No official reward listings for this country.');
    fill('ps-fc', my, function () { return forecastsFor(name, iso3); }, renderForecasts, 'No published event forecast mentions this country.');
  }

  /** Fill one section: skeleton, then data, then an empty sentence or an error with Retry. Stale answers (another country chosen) are dropped. */
  async function fill(id, my, loader, renderFn, emptyText) {
    var box = el(id);
    if (!box) return;
    box.innerHTML = skeleton();
    S.retry[id] = function () { fill(id, S.token, loader, renderFn, emptyText); };
    try {
      var data = await loader();
      if (my !== S.token) return;
      var html = renderFn(data);
      box.innerHTML = html || '<div class="empty-note">' + esc(emptyText) + '</div>';
    } catch (e) {
      if (my !== S.token) return;
      console.warn('[conflict-map panel] ' + id + ' failed:', e);
      box.innerHTML = errorCard('This section could not be loaded.', id);
    }
  }

  /* ---------------- data ---------------- */
  function topTypes(iso3) {
    var counts = {};
    (ctx.rows() || []).forEach(function (r) {
      if (String(r.country_iso3 || '').toUpperCase() !== iso3) return;
      var k = r.event_type ? String(r.event_type).replace(/_/g, ' ') : (r.source || 'Event');
      counts[k] = (counts[k] || 0) + 1;
    });
    return Object.keys(counts).map(function (k) { return [k, counts[k]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 5);
  }

  async function intelFor(iso3) {
    var snap = await ctx.snap('war_verified_intel');   // CDN snapshot first, same approach as the rest of the map
    if (snap) {
      return snap.items.filter(function (r) { return String(r.country_iso3 || '').toUpperCase() === iso3; })
        .sort(function (a, b) { return String(b.report_date).localeCompare(String(a.report_date)); }).slice(0, 20);
    }
    var res = await ctx.supa().from('war_verified_intel').select('*').eq('country_iso3', iso3).order('report_date', { ascending: false }).limit(20);
    if (res.error) throw res.error;
    return res.data || [];
  }

  async function zonesFor(iso3, stat) {
    var z = ctx.zones();
    if (!z) { await ctx.loadZones(); z = ctx.zones(); }
    if (!z) throw new Error('zones unavailable');
    return z.filter(function (r) {
      if (r.country_iso3) return String(r.country_iso3).toUpperCase() === iso3;
      if (r.country_name && stat) return String(r.country_name).toLowerCase() === String(stat.country_name).toLowerCase();
      return !!(stat && stat.conflict_name && r.conflict_name === stat.conflict_name);
    });
  }

  async function allBounties() {
    if (!memo.bounties) {
      var r = await fetch('/bounties.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var j = await r.json();
      memo.bounties = (j && j.profiles) || [];
    }
    return memo.bounties;
  }
  async function bountiesFor(name) {
    await allBounties();
    var n = String(name || '').toLowerCase();
    return memo.bounties.filter(function (p) { return p.case_status === 'wanted' && String(p.country || '').toLowerCase() === n; });
  }

  async function forecastsFor(name, iso3) {
    if (!memo.forecasts) {
      var snap = await ctx.snap('event_forecasts');
      if (snap) memo.forecasts = snap.items;
      else {
        var res = await ctx.supa().from('event_forecasts').select('*').limit(200);
        if (res.error) throw res.error;
        memo.forecasts = res.data || [];
      }
    }
    var re = new RegExp('\\b' + String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    return memo.forecasts.filter(function (f) {
      if (f.status && String(f.status).toLowerCase() !== 'published') return false;
      var hay = Object.keys(f).map(function (k) { return typeof f[k] === 'string' ? f[k] : ''; }).join(' ');
      return re.test(hay) || String(f.country_iso3 || '').toUpperCase() === iso3;
    }).slice(0, 5);
  }

  /* ---------------- section renderers (return '' for the empty state) ---------------- */
  function renderTypes(list) {
    if (!list.length) return '';
    var max = list[0][1];
    return list.map(function (t) {
      return '<div class="ptype"><span class="ptype-n">' + esc(t[0]) + '</span><span class="pbar sm"><i style="width:' + Math.max(4, Math.round(100 * t[1] / max)) + '%"></i></span><b>' + t[1] + '</b></div>';
    }).join('');
  }

  function renderIntel(list) {
    return list.map(function (i, idx) {
      var src = safeUrl(i.source_url);
      return '<div class="intel-item" style="animation-delay:' + idx * 0.04 + 's"><div class="type">' + esc(String(i.metric_type || '').replace(/_/g, ' ')) + '</div>' +
        '<div class="val">' + esc(i.value_numeric != null ? Number(i.value_numeric).toLocaleString() : (i.value_text || '—')) + '</div>' +
        '<div class="src">' + esc(i.source_name || 'Source') + ' · ' + esc(i.report_date || '') + (src ? ' · <a href="' + esc(src) + '" target="_blank" rel="noopener">source</a>' : '') + '</div></div>';
    }).join('');
  }

  function renderZones(list) {
    return list.map(function (z) {
      var src = safeUrl(z.source_url), st = String(z.status || '').replace(/[^a-z_]/g, '');
      return '<div class="intel-item pzone z-' + st + '"><div class="type">' + esc(st.replace(/_/g, ' ') || 'zone') + (z.controlling_actor ? ' · ' + esc(z.controlling_actor) : '') + '</div>' +
        '<div class="val">' + esc(z.zone_name || 'Zone') + '</div>' +
        '<div class="src">' + esc(z.conflict_name || '') + (z.last_verified ? ' · verified ' + esc(z.last_verified) : '') + (src ? ' · <a href="' + esc(src) + '" target="_blank" rel="noopener">' + esc(z.source_name || 'source') + '</a>' : ' · analyst-curated') + '</div></div>';
    }).join('');
  }

  function money(amount, cur) {
    if (amount == null || amount === '') return 'Reward not stated';
    try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur || 'USD', maximumFractionDigits: 0 }).format(Number(amount)); }
    catch (e) { return (cur || '') + ' ' + Number(amount).toLocaleString(); }
  }
  function renderBounties(list) {
    if (!list.length) return '';
    return '<div class="psub">' + list.length + ' official listing' + (list.length === 1 ? '' : 's') + ' (claims by the issuing authority, not findings of guilt)</div>' +
      list.slice(0, 3).map(function (p) {
        return '<div class="feed-item pstatic"><span class="feed-top"><span class="feed-country">' + esc(p.name) + '</span><span class="feed-ago">' + esc(money(p.reward_amount, p.reward_currency)) + '</span></span>' +
          '<span class="feed-type">' + esc(p.issuer_country ? 'Issued by ' + p.issuer_country : 'Official listing') + '</span></div>';
      }).join('') + '<button type="button" class="pbtn" data-open-bounty="1">Open the bounty list</button>';
  }

  function renderForecasts(list) {
    return list.map(function (f) {
      var title = f.title || f.event_name || f.name || f.question || f.topic || 'Event forecast';
      var head = f.headline_stat || f.headline || f.headline_value || '';
      var sum = String(f.summary || '').slice(0, 220);
      return '<div class="intel-item pfc"><div class="type">Forecast' + (f.updated_at ? ' · updated ' + esc(String(f.updated_at).slice(0, 10)) : '') + '</div>' +
        '<div class="val">' + esc(title) + '</div>' + (head ? '<div class="pfc-h">' + esc(head) + '</div>' : '') + (sum ? '<div class="src">' + esc(sum) + (String(f.summary).length > 220 ? '…' : '') + '</div>' : '') + '</div>';
    }).join('') + '<div class="psub">Forecasts are context for event risk, not trading signals.</div>';
  }

  /* ================= Geo Risk, Secret Intel, Redactions (stage 8) =================
     Tables read: geo_predictions (latest 20), covert_predictions (latest 15), war_redactions (latest 50),
     /bounties.json (closed listings). Snapshot first (/data/<table>.json), then Supabase, exactly like the terminal's snapOrQuery. */
  var G = { geo: null, secret: null, newAt: {}, ch: [], live: false, wasLive: false };
  var TBL = { geo: { name: 'geo_predictions', limit: 20 }, secret: { name: 'covert_predictions', limit: 15 } };
  var GEO_F = ['headline', 'summary', 'affected_industries', 'market_impact', 'category', 'region', 'country'];
  var SEC_F = ['title', 'summary', 'target', 'actors', 'evidence', 'purpose', 'category'];
  var CLOSED = { captured: 'Captured', deceased: 'Deceased', withdrawn: 'Reward withdrawn' };

  function sevClass(s) { var k = String(s || '').toLowerCase(); return k === 'critical' || k === 'high' || k === 'low' ? 'sev-' + k : 'sev-medium'; }
  function probClass(p) { return p >= 60 ? 'heat-high' : p >= 40 ? 'heat-mid' : 'heat-low'; }
  function byNewest(rows) { return rows.slice().sort(function (a, b) { return String(b.created_at || '').localeCompare(String(a.created_at || '')); }); }
  function ago(d) {
    var t = Date.parse(d); if (!isFinite(t)) return '';
    var m = Math.floor((Date.now() - t) / 60000);
    return m < 1 ? 'Just now' : m < 60 ? m + 'm ago' : m < 1440 ? Math.floor(m / 60) + 'h ago' : Math.floor(m / 1440) + 'd ago';
  }
  function rx(name) { return new RegExp('\\b' + String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i'); }
  function mentions(row, fields, iso3, name) {
    if (row.country_iso3 && String(row.country_iso3).toUpperCase() === iso3) return true;
    var re = rx(name);
    return fields.some(function (k) { return re.test(String(row[k] || '')); });
  }
  /** The tickets carry no country column, so the country is found by name in the ticket text (longest names first). */
  function countryForTicket(kind, t) {
    var text = (kind === 'geo' ? [t.headline, t.summary, t.region, t.country] : [t.title, t.summary, t.target]).join(' ');
    var list = (ctx.stats() || []).slice().sort(function (a, b) { return String(b.country_name || '').length - String(a.country_name || '').length; });
    for (var i = 0; i < list.length; i++) { if (list[i].country_name && rx(list[i].country_name).test(text)) return list[i]; }
    return null;
  }

  async function loadTickets(kind, force) {
    if (G[kind] && !force) return G[kind];
    var t = TBL[kind], snap = await ctx.snap(t.name), rows;
    if (snap) rows = snap.items;
    else {
      var res = await ctx.supa().from(t.name).select('*').order('created_at', { ascending: false }).limit(t.limit);
      if (res.error) throw res.error;
      rows = res.data || [];
    }
    G[kind] = byNewest(rows).slice(0, t.limit);
    return G[kind];
  }

  function isNew(kind, id) { var t = G.newAt[kind + ':' + id]; return !!t && Date.now() - t < 60000; }
  function ticketCard(kind, t) {
    var geo = kind === 'geo', prob = num(t.probability_percent), fresh = isNew(kind, t.id);
    var chip = geo ? (t.category || 'Geopolitical') : (t.prediction_type === 'open_war' ? 'Open war' : 'Covert op');
    var icon = geo ? 'fa-earth-americas' : (t.prediction_type === 'open_war' ? 'fa-bomb' : 'fa-user-secret');
    var sum = String(t.summary || '');
    return '<article class="tcard ' + (geo ? '' : 'tsecret ') + sevClass(t.severity) + (fresh ? ' fresh' : '') + '">' +
      '<button type="button" class="tcard-h" data-ticket="' + esc(t.id) + '" data-kind="' + kind + '" aria-expanded="false">' +
      '<span class="tcard-top"><span class="tchip"><i class="fa-solid ' + icon + '"></i> ' + esc(chip) + '</span>' +
      (fresh ? '<span class="newtag" data-newtag="' + esc(kind + ':' + t.id) + '">NEW</span>' : '') +
      '<span class="tsev">' + esc(t.severity || 'Medium') + '</span></span>' +
      '<span class="tcard-title">' + esc(geo ? t.headline : t.title) + '</span>' +
      '<span class="tcard-sum">' + esc(sum.slice(0, 140)) + (sum.length > 140 ? '…' : '') + '</span>' +
      (geo ? '' : '<span class="tchips"><span>Target: ' + esc(t.target || '—') + '</span><span>Actors: ' + esc(t.actors || '—') + '</span></span>') +
      '<span class="tcard-foot"><span class="tprob ' + (prob != null ? probClass(prob) : '') + '">' + (prob != null ? prob + '% likely' : 'Probability not stated') + '</span><span class="feed-ago">' + esc(ago(t.created_at)) + '</span></span>' +
      (prob != null ? '<span class="pbar sm"><i class="' + probClass(prob) + '" style="width:' + Math.max(2, Math.min(100, prob)) + '%"></i></span>' : '') +
      '</button><div class="tdetail" hidden></div></article>';
  }

  function dsec(label, text) { return '<div class="dsec"><h5>' + esc(label) + '</h5><p>' + esc(text || '—') + '</p></div>'; }
  function ticketDetail(kind, t) {
    var c = countryForTicket(kind, t), html;
    if (kind === 'geo') {
      html = dsec('Affected industries', t.affected_industries) + dsec('Market impact', t.market_impact) +
        dsec('3 months', t.impact_3_months) + dsec('6 months', t.impact_6_months) + dsec('12 months', t.impact_12_months) + dsec('Long term', t.impact_long_term);
    } else {
      html = dsec('Timeline', t.timeline) + dsec('Target', t.target) + dsec('Actors and agencies', t.actors) + dsec('Purpose and goal', t.purpose) +
        dsec('Evidence and signals', t.evidence) + dsec('Market impact if triggered', t.market_impact) +
        '<p class="psub">AI-generated speculation for information only. Not confirmed intelligence.</p>';
    }
    return html + '<div class="tact">' + (c ? '<button type="button" class="pbtn" data-country="' + esc(c.country_iso3) + '">Open ' + esc(c.country_name) + '</button>' : '') +
      '<a class="pbtn plink" href="app.html" target="_blank" rel="noopener">Open in app</a></div>';
  }
  function toggleTicket(btn) {
    var d = btn.closest('.tcard').querySelector('.tdetail'), open = btn.getAttribute('aria-expanded') === 'true';
    if (open) { d.hidden = true; btn.setAttribute('aria-expanded', 'false'); return; }
    var kind = btn.dataset.kind, t = (G[kind] || []).find(function (r) { return String(r.id) === String(btn.dataset.ticket); });
    if (!t) return;
    d.innerHTML = ticketDetail(kind, t);
    d.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    var c = countryForTicket(kind, t);   // selecting a ticket flies the camera to its country
    if (c && ctx.focusCountry) ctx.focusCountry(c.country_iso3);
  }

  function renderTickets(box, my, kind) {
    var geo = kind === 'geo', stat = S.iso3 ? statFor(S.iso3) : null, name = stat ? stat.country_name : S.iso3;
    box.innerHTML =
      '<div class="panel-eyebrow ' + (geo ? '' : 'intel') + '">' + (geo ? 'Geo Risk' : 'Secret Intel') + '</div>' +
      '<div class="panel-title">' + esc(S.iso3 ? name : 'Latest worldwide') + '</div>' +
      (geo ? '<div class="panel-sub">AI-generated risk tickets with their possible market impact. Context for event risk, not trading signals.</div>'
           : '<div class="tbanner"><i class="fa-solid fa-triangle-exclamation"></i> AI speculative intelligence. Not confirmed. For information only.</div>') +
      (S.iso3 ? '<div class="psub">Showing tickets that mention ' + esc(name) + '. <button type="button" class="pbtn" data-world="1">Show all</button></div>' : '') +
      '<div class="psec" id="pt-list"></div>';
    ensureLive();
    fill('pt-list', my, function () { return loadTickets(kind); }, function (rows) {
      var list = S.iso3 ? rows.filter(function (r) { return mentions(r, geo ? GEO_F : SEC_F, S.iso3, name); }) : rows;
      return list.map(function (t) { return ticketCard(kind, t); }).join('');
    }, S.iso3 ? 'No ' + (geo ? 'risk tickets' : 'intelligence') + ' mention ' + name + ' right now. Choose Show all to see the latest worldwide.' : 'Nothing here yet. The AI scans world news regularly, so check back shortly.');
  }

  function worldTickets(rows, kind) {
    return rows.map(function (t) {
      return '<button type="button" class="feed-item" data-go="' + kind + '"><span class="feed-top"><span class="feed-country">' + esc(kind === 'geo' ? t.headline : t.title) + '</span><span class="feed-ago">' + esc(ago(t.created_at)) + '</span></span>' +
        '<span class="feed-type"><span class="tsev ' + sevClass(t.severity) + '">' + esc(t.severity || 'Medium') + '</span>' + (kind === 'secret' ? ' · ' + (t.prediction_type === 'open_war' ? 'Open war' : 'Covert op') : '') + '</span></button>';
    }).join('');
  }

  /* ---- live: INSERT on both ticket tables, paused while the tab is hidden ---- */
  function ensureLive() { if (!G.live && ctx && !document.hidden) startLive(); }
  function startLive() {
    var c = ctx && ctx.supa();
    if (!c || !c.channel) return;
    G.live = true;
    [['geo', 'geo_predictions'], ['secret', 'covert_predictions']].forEach(function (p) {
      G.ch.push(c.channel('map-live-' + p[1]).on('postgres_changes', { event: 'INSERT', schema: 'public', table: p[1] }, function (payload) { onInsert(p[0], payload.new); }).subscribe());
    });
  }
  function stopLive() {
    var c = ctx && ctx.supa();
    G.ch.forEach(function (ch) { try { c.removeChannel(ch); } catch (e) { /* ignore */ } });
    G.ch = []; G.live = false;
  }
  function refreshTickets(kind) { if (!S.custom && (S.tab === kind || (S.tab === 'country' && !S.iso3))) render(); }
  function onInsert(kind, row) {
    if (!row || row.id == null || !G[kind] || G[kind].some(function (r) { return r.id === row.id; })) return;
    G[kind].unshift(row);
    G[kind] = G[kind].slice(0, TBL[kind].limit);
    var key = kind + ':' + row.id;
    G.newAt[key] = Date.now();
    setTimeout(function () { delete G.newAt[key]; document.querySelectorAll('[data-newtag="' + key + '"]').forEach(function (n) { n.remove(); }); }, 60000);   // the NEW tag lasts 60 seconds
    refreshTickets(kind);
  }
  document.addEventListener('visibilitychange', function () {
    if (!ctx) return;
    if (document.hidden) { if (G.live) { G.wasLive = true; stopLive(); } return; }
    if (!G.wasLive) return;
    G.wasLive = false;
    startLive();   // one fresh pull on return, then live again
    ['geo', 'secret'].forEach(function (k) { loadTickets(k, true).then(function () { refreshTickets(k); }, function () { /* keep the old list */ }); });
  });

  /* ---- Redactions: corrections and closed listings (kinds 2 and 3 of the brief) ---- */
  function missingTable(err) { return /42P01|PGRST205|does not exist|schema cache/i.test((err.code || '') + ' ' + (err.message || '')); }
  async function loadRedactions() {
    var rows = [], res = await ctx.supa().from('war_redactions').select('*').order('created_at', { ascending: false }).limit(50);
    if (res.error) { if (!missingTable(res.error)) throw res.error; }   // table not created yet: fall back to derived rows only
    else rows = res.data || [];
    var known = {};
    rows.forEach(function (r) { if (r.kind === 'closed_listing' && r.subject_type === 'bounty') known[String(r.subject_id)] = 1; });
    var bs = [];
    try { bs = await allBounties(); } catch (e) { /* bounties are optional here */ }
    bs.forEach(function (p) {
      if (!p.case_status || p.case_status === 'wanted' || known[String(p.id)]) return;
      rows.push({ kind: 'closed_listing', subject_type: 'bounty', subject_id: p.id, country: p.country || '', reason: CLOSED[p.case_status] || p.case_status,
        public_note: p.name || '', created_at: p.updated_at || p.closed_at || null, _named: true });
    });
    return byNewest(rows);
  }
  function redKind(k) { return k === 'correction' ? 'Correction' : k === 'closed_listing' ? 'Closed listing' : 'Withheld'; }
  function redRow(r) {
    return '<div class="rrow"><div class="rrow-top"><span class="rkind k-' + esc(r.kind) + '">' + esc(redKind(r.kind)) + '</span><span class="feed-ago">' + esc(r.created_at ? ago(r.created_at) : '') + '</span></div>' +
      '<div class="rrow-sub">' + esc(String(r.subject_type || 'item').replace(/_/g, ' ')) + ' ' + (r._named ? '' : '<span class="rbar" aria-hidden="true"></span> ') + (r.country ? '· ' + esc(r.country) : '') + '</div>' +
      '<div class="rrow-reason">Reason: ' + esc(r.reason || 'not stated') + '</div>' +
      (r.public_note ? '<div class="src">' + esc(r.public_note) + '</div>' : '') + '</div>';
  }
  function worldRedactions(rows) { return rows.map(function (r) { return '<button type="button" class="feed-item" data-go="redactions"><span class="feed-top"><span class="feed-country">' + esc(redKind(r.kind)) + ' · ' + esc(r.reason || '') + '</span><span class="feed-ago">' + esc(r.created_at ? ago(r.created_at) : '') + '</span></span></button>'; }).join(''); }
  function renderRedactions(box, my) {
    var stat = S.iso3 ? statFor(S.iso3) : null, name = stat ? stat.country_name : S.iso3;
    box.innerHTML =
      '<div class="panel-eyebrow">Redactions</div><div class="panel-title">' + esc(S.iso3 ? name : 'Withheld, corrected and closed') + '</div>' +
      '<div class="panel-sub">A public log of what was corrected or closed on the map, and why. Black bars cover details that are not published.</div>' +
      (S.iso3 ? '<div class="psub">Showing ' + esc(name) + '. <button type="button" class="pbtn" data-world="1">Show all</button></div>' : '') +
      '<div class="psec" id="pr-list"></div>';
    fill('pr-list', my, loadRedactions, function (rows) {
      var list = S.iso3 ? rows.filter(function (r) { var c = String(r.country || '').toLowerCase(); return c === String(S.iso3).toLowerCase() || c === String(name).toLowerCase(); }) : rows;
      return list.map(redRow).join('');
    }, S.iso3 ? 'Nothing has been corrected or closed for ' + name + ' yet.' : 'Nothing has been corrected or closed yet.');
  }

  return { init: init, showCountry: showCountry, showWorld: showWorld, showTab: showTab, beginCustom: beginCustom, ensure: ensure, applyDeepLink: applyDeepLink };
})();
