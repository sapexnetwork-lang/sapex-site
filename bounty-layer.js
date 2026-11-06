// bounty-layer.js — "Bounty Profiles" layer for the SaPEX NEXUS conflict map.
// Stage 12: the STATIC file /bounties.json is now the public list only: name, country, issuer, status, stars, crime category,
// reward, photo, verified sources and the pin. Charges, summary, other names and personal details live in the protected
// Supabase table bounty_details, which the server only returns to Basic, Pro, Premium or an unexpired Trial.
// The list costs zero Supabase requests; one row is requested only when a visitor opens a profile.
// Nothing is fetched until the visitor first opens the Bounties panel.
//
// Neutrality: every government's reward is shown the same way, as a CLAIM by the issuing authority with its
// sources. Pins are country-level only. Nothing here is a finding of guilt.
(function () {
  'use strict';

  var DATA_URL = '/bounties.json';
  var SRC = 'bounty-src', LAYER = 'bounty-points', LAYER_HALO = 'bounty-halo';
  var state = { map: null, loaded: false, loading: false, all: [], open: false, selectedId: null, q: '', issuer: '', status: 'wanted', detail: {}, unsub: null };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function safeUrl(u) { return /^https?:\/\//i.test(u || '') ? u : ''; }
  function safeImg(u) { return /^\/bounty\/img\/[A-Za-z0-9._\-]+$/.test(u || '') ? u : ''; }

  function money(amount, cur) {
    if (amount == null || amount === '') return 'Reward amount not stated';
    var n = Number(amount);
    try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur || 'USD', maximumFractionDigits: 0 }).format(n); }
    catch (e) { return (cur || '') + ' ' + n.toLocaleString(); }
  }
  function stars(level) {
    level = Math.max(1, Math.min(5, level | 0));
    return '<span class="bty-stars" title="Wanted level ' + level + '/5 (based on reward size)">' +
      '★'.repeat(level) + '<span class="off">' + '★'.repeat(5 - level) + '</span></span>';
  }
  var CASE_LABEL = { wanted: 'Wanted', captured: 'Captured', deceased: 'Deceased', withdrawn: 'Reward withdrawn' };

  /* ---------------- data ---------------- */
  function load() {
    if (state.loaded || state.loading) return Promise.resolve();
    state.loading = true;
    return fetch(DATA_URL, { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { state.all = (j && j.profiles) || []; state.loaded = true; })
      .catch(function () { state.all = []; state.loaded = true; })
      .then(function () { state.loading = false; fillIssuerFilter(); addMapLayer(); render(); });
  }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return state.all.filter(function (p) {
      if (state.status === 'wanted' && p.case_status !== 'wanted') return false;
      if (state.issuer && (p.issuer_country || '') !== state.issuer) return false;
      if (!q) return true;
      var hay = [p.name, p.country, p.issuer_country, p.issuer].join(' ').toLowerCase();   // lite fields only
      return hay.indexOf(q) !== -1;
    });
  }

  /* ---------------- map layer ---------------- */
  function featureCollection(list) {
    return {
      type: 'FeatureCollection',
      features: list.filter(function (p) { return typeof p.lat === 'number' && typeof p.lng === 'number'; }).map(function (p) {
        return { type: 'Feature', properties: { id: p.id, level: p.wanted_level || 1 }, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } };
      })
    };
  }

  function addMapLayer() {
    var map = state.map;
    if (!map) return;
    var fc = featureCollection(filtered());
    if (map.getSource(SRC)) { map.getSource(SRC).setData(fc); return; }
    map.addSource(SRC, { type: 'geojson', data: fc });
    map.addLayer({
      id: LAYER_HALO, type: 'circle', source: SRC,
      paint: { 'circle-radius': ['+', 9, ['*', 1.5, ['get', 'level']]], 'circle-color': '#a855f7', 'circle-opacity': 0.18, 'circle-blur': 0.6 }
    });
    map.addLayer({
      id: LAYER, type: 'circle', source: SRC,
      paint: {
        'circle-radius': ['+', 5, ['get', 'level']], 'circle-color': '#a855f7',
        'circle-stroke-width': 2, 'circle-stroke-color': '#f5f3ff', 'circle-opacity': 0.95
      }
    });
    map.on('click', LAYER, function (e) {
      if (e.originalEvent) e.originalEvent.__sapexBounty = true;
      var f = e.features && e.features[0];
      if (f) selectProfile(f.properties.id, false);
    });
    map.on('mouseenter', LAYER, function () { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', LAYER, function () { map.getCanvas().style.cursor = ''; });
    setLayerVisible(state.open);
  }

  function setLayerVisible(v) {
    var map = state.map;
    if (!map) return;
    [LAYER, LAYER_HALO].forEach(function (id) { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', v ? 'visible' : 'none'); });
  }

  /* ---------------- panel ---------------- */
  function fillIssuerFilter() {
    var sel = $('bounty-issuer');
    if (!sel) return;
    var seen = {};
    state.all.forEach(function (p) { if (p.issuer_country) seen[p.issuer_country] = (seen[p.issuer_country] || 0) + 1; });
    var names = Object.keys(seen).sort();
    sel.innerHTML = '<option value="">All issuing countries</option>' +
      names.map(function (n) { return '<option value="' + esc(n) + '">' + esc(n) + ' (' + seen[n] + ')</option>'; }).join('');
  }

  function ticketHtml(p) {
    var img = safeImg(p.image);
    return '<button class="bty-ticket" data-id="' + esc(p.id) + '">' +
      '<span class="bty-photo">' + (img ? '<img src="' + img + '" alt="" loading="lazy" onerror="this.remove()">' : '') + '<i class="fa-solid fa-user-secret"></i></span>' +
      '<span class="bty-tmain">' +
        '<span class="bty-name">' + esc(p.name) + '</span>' +
        '<span class="bty-sub">' + esc(p.country || 'Country unknown') + (p.issuer_country ? ' · issued by ' + esc(p.issuer_country) : '') + '</span>' +
        '<span class="bty-row"><span class="bty-price">' + esc(money(p.reward_amount, p.reward_currency)) + '</span>' + stars(p.wanted_level) + '</span>' +
        (p.crime_category ? '<span class="bty-tag">' + esc(p.crime_category) + '</span>' : '') +
        (p.case_status !== 'wanted' ? '<span class="bty-tag">' + esc(CASE_LABEL[p.case_status] || p.case_status) + '</span>' : '') +
        (p.disputed ? '<span class="bty-tag warn">Disputed listing</span>' : '') +
      '</span></button>';
  }

  function render() {
    var box = $('bounty-list');
    if (!box) return;
    var list = filtered();
    $('bounty-count').textContent = list.length + (list.length === 1 ? ' profile' : ' profiles');
    if (!state.loaded) { box.innerHTML = '<div class="bty-empty">Loading…</div>'; return; }
    if (!state.all.length) { box.innerHTML = '<div class="bty-empty">No bounty profiles have been published yet.</div>'; }
    else if (!list.length) { box.innerHTML = '<div class="bty-empty">No profile matches your search.</div>'; }
    else { box.innerHTML = list.map(ticketHtml).join(''); }
    if (state.map && state.map.getSource(SRC)) state.map.getSource(SRC).setData(featureCollection(list));
  }

  function row(label, value) {
    if (value == null || value === '') return '';
    return '<div class="bty-fact"><span>' + esc(label) + '</span><b>' + esc(value) + '</b></div>';
  }

  /* The part of the detail view that comes from the protected table (Basic and above). `d` is the bounty_details row. */
  function privateHtml(p, d) {
    var aka = Array.isArray(d.aliases) ? d.aliases : [];
    return (aka.length ? '<div class="bty-block"><h5>Also known as</h5><p>' + esc(aka.slice(0, 4).join(', ')) + '</p></div>' : '') +
      (d.crimes ? '<div class="bty-block"><h5>Accused of (per the issuing authority)</h5><p>' + esc(d.crimes) + '</p></div>' : '') +
      (d.summary ? '<div class="bty-block"><h5>Summary</h5><p>' + esc(d.summary) + '</p></div>' : '') +
      '<div class="bty-facts">' +
        row('Role', d.position) + row('Age', d.age) + row('Date of birth', d.dob) +
        row('Gender', d.gender) + row('Nationality', d.nationality) + row('Region (last reported)', d.last_known) + row('Description', d.physical) +
      '</div>';
  }

  /* Public part: reward, photo and verified sources are visible to everyone. */
  function publicHtml(p) {
    var usd = (p.reward_currency && p.reward_currency !== 'USD' && p.reward_usd_est) ? ' <small>(≈ ' + esc(money(p.reward_usd_est, 'USD')) + ')</small>' : '';
    return '<div class="bty-reward"><span>Reward offered</span><b>' + esc(money(p.reward_amount, p.reward_currency)) + usd + '</b></div>' +
      (p.reward_text ? '<div class="bty-quote">“' + esc(p.reward_text) + '”</div>' : '');
  }
  function sourcesHtml(p) {
    var srcs = Array.isArray(p.sources) ? p.sources : [];
    var src = srcs.filter(function (s) { return s && safeUrl(s.url); }).map(function (s) {
      return '<li><a href="' + esc(safeUrl(s.url)) + '" target="_blank" rel="noopener noreferrer nofollow">' + esc(s.title || s.domain) + '</a>' +
        '<span class="bty-dom">' + esc(s.domain) + (s.official ? ' · official' : ' · news') + '</span></li>';
    }).join('');
    return '<div class="bty-block"><h5>Sources (' + srcs.length + ' verified)</h5><ul class="bty-src">' + (src || '<li>None</li>') + '</ul></div>';
  }

  /* The detail view. The header, issuer, dispute note and disclaimer come from the public lite list and are always shown.
     mode: 'loading' | 'ok' | 'locked' | 'error'. Locked text is never in the page, only bars (see SapexAccount.locked). */
  function detailHtml(p, mode, d) {
    var img = safeImg(p.image);
    var body;
    if (mode === 'ok' && d) body = privateHtml(p, d);
    else if (mode === 'locked') {
      body = window.SapexAccount
        ? SapexAccount.locked('basic', { text: 'Charges, summary, other names and personal details are part of the Basic plan and above.' })
        : '<div class="bty-empty">Charges and personal details need a Basic plan or above.</div>';
    }
    else if (mode === 'none') body = '<div class="bty-empty">No extra details have been published for this profile yet.</div>';
    else if (mode === 'error') body = '<div class="bty-empty">Could not load the details. <button type="button" class="bty-back" id="bounty-retry">Try again</button></div>';
    else body = '<div class="bty-empty">Loading details…</div>';
    return '<button class="bty-back" id="bounty-back"><i class="fa-solid fa-arrow-left"></i> All profiles</button>' +
      '<div class="bty-hero"><span class="bty-photo big">' + (img ? '<img src="' + img + '" alt="" onerror="this.remove()">' : '') + '<i class="fa-solid fa-user-secret"></i></span>' +
      '<div><div class="bty-dname">' + esc(p.name) + '</div>' +
      '<div class="bty-sub">' + esc([p.country, p.crime_category].filter(Boolean).join(' · ')) + '</div>' + stars(p.wanted_level) + '</div></div>' +
      publicHtml(p) +
      '<div class="bty-block"><h5>Offered by</h5><p>' + esc([p.issuer, p.issuer_country && '(' + p.issuer_country + ')'].filter(Boolean).join(' ') || 'Not stated') + '</p></div>' +
      '<div class="bty-facts">' + row('Status', CASE_LABEL[p.case_status] || p.case_status) + '</div>' +
      (p.disputed ? '<div class="bty-dispute"><b>Disputed listing.</b> ' + esc(p.dispute_note || 'Described by some independent sources or governments as political or contested.') + '</div>' : '') +
      sourcesHtml(p) +
      body +
      '<div class="bty-disc">Rewards and allegations are claims made by the named issuing authority and reproduced from the sources above. They are not findings of guilt and are not independently verified by SaPEX. The pin shows the country only, never a precise or live location.' +
        (p.reviewed_at ? ' Reviewed ' + esc(String(p.reviewed_at).slice(0, 10)) + '.' : '') + '</div>';
  }

  /* Ask the server for the protected row with the visitor's own session. A guest or Free account gets nothing back
     (the row-level security policy returns zero rows), which is shown as the locked state. */
  function canTryDetail() {
    var A = window.SapexAccount;
    if (!A || !A.isReady()) return true;      // plan not known yet: let the server decide
    return A.requirePlan('basic');            // known Guest or Free: skip a request the server would refuse
  }

  function loadDetail(id) {
    var p = state.all.filter(function (x) { return x.id === id; })[0];
    var d = $('bounty-detail');
    if (!p || !d) return;
    function paint(mode, row) {
      if (state.selectedId !== id) return;    // the visitor moved on
      d.innerHTML = detailHtml(p, mode, row);
      var b = $('bounty-back'); if (b) b.addEventListener('click', backToList);
      var r = $('bounty-retry'); if (r) r.addEventListener('click', function () { loadDetail(id); });
    }
    if (state.detail[id]) { paint('ok', state.detail[id]); return; }
    var A = window.SapexAccount, client = A && A.client && A.client();
    if (!canTryDetail() || !client || !A.getUser()) { paint('locked'); return; }
    paint('loading');
    client.from('bounty_details').select('*').eq('id', id).maybeSingle().then(function (res) {
      if (res.error) {
        var code = String(res.error.code || res.status || '');
        paint(/^(401|403|42501|PGRST301)$/.test(code) ? 'locked' : 'error');
        return;
      }
      // No row: for a known Basic+ plan the profile simply has no extra details yet; otherwise the plan is not allowed.
      if (!res.data) { paint(window.SapexAccount && SapexAccount.isReady() && SapexAccount.requirePlan('basic') ? 'none' : 'locked'); return; }
      state.detail[id] = res.data;
      paint('ok', res.data);
    }, function () { paint('error'); });
  }

  function selectProfile(id, fromList) {
    var p = state.all.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    state.selectedId = id;
    if (!state.open) openPanel();
    $('bounty-list-view').style.display = 'none';
    var d = $('bounty-detail');
    d.style.display = 'block';
    d.scrollTop = 0;
    loadDetail(id);
    if (state.map && typeof p.lat === 'number') state.map.flyTo({ center: [p.lng, p.lat], zoom: Math.max(state.map.getZoom(), 3.2), duration: 900 });
  }

  function backToList() {
    state.selectedId = null;   // also cancels a detail request that is still in flight
    $('bounty-detail').style.display = 'none';
    $('bounty-list-view').style.display = '';   // '' keeps the stylesheet's flex layout; 'block' broke list scrolling
  }

  function openPanel() {
    state.open = true;
    var sp = $('side-panel'); if (sp) sp.classList.remove('open');
    $('bounty-panel').classList.add('open');
    $('app').classList.add('bounty-open');
    $('bounty-btn').classList.add('on');
    load().then(function () { setLayerVisible(true); });
    setLayerVisible(true);
  }

  function closePanel() {
    state.open = false;
    $('bounty-panel').classList.remove('open');
    $('app').classList.remove('bounty-open');
    $('bounty-btn').classList.remove('on');
    setLayerVisible(false);
  }

  function init(map) {
    state.map = map;
    if (window.SapexAccount) SapexAccount.onChange(function () {   // sign-in, sign-out or an upgrade: re-check the open profile
      state.detail = {};   // never keep a paid row in memory after the plan changed
      if (state.selectedId) loadDetail(state.selectedId);
    });
    var btn = $('bounty-btn');
    if (!btn) return;
    btn.addEventListener('click', function () { state.open ? closePanel() : openPanel(); });
    $('bounty-close').addEventListener('click', closePanel);
    var t;
    $('bounty-search').addEventListener('input', function (e) {
      clearTimeout(t); var v = e.target.value;
      t = setTimeout(function () { state.q = v; render(); }, 120);
    });
    $('bounty-issuer').addEventListener('change', function (e) { state.issuer = e.target.value; render(); });
    $('bounty-status').addEventListener('change', function (e) { state.status = e.target.value; render(); });
    $('bounty-list').addEventListener('click', function (e) {
      var t2 = e.target.closest('.bty-ticket');
      if (t2) selectProfile(t2.getAttribute('data-id'), true);
    });
  }

  window.SapexBounty = { init: init };
})();
