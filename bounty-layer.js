// bounty-layer.js — "Bounty Profiles" layer for the SaPEX NEXUS conflict map.
// Reads the STATIC file /bounties.json (written by bounty_bot.py after you approve profiles in the admin),
// so visitors cost zero Supabase requests. Nothing is fetched until the visitor first opens the Bounties panel.
//
// Neutrality: every government's reward is shown the same way, as a CLAIM by the issuing authority with its
// sources. Pins are country-level only. Nothing here is a finding of guilt.
(function () {
  'use strict';

  var DATA_URL = '/bounties.json';
  var SRC = 'bounty-src', LAYER = 'bounty-points', LAYER_HALO = 'bounty-halo';
  var state = { map: null, loaded: false, loading: false, all: [], open: false, selectedId: null, q: '', issuer: '', status: 'wanted' };

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
      var hay = [p.name, (p.aliases || []).join(' '), p.country, p.issuer_country, p.position, p.crimes, p.issuer].join(' ').toLowerCase();
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

  function detailHtml(p) {
    var img = safeImg(p.image);
    var usd = (p.reward_currency && p.reward_currency !== 'USD' && p.reward_usd_est) ? ' <small>(≈ ' + esc(money(p.reward_usd_est, 'USD')) + ')</small>' : '';
    var src = (p.sources || []).filter(function (s) { return safeUrl(s.url); }).map(function (s) {
      return '<li><a href="' + esc(safeUrl(s.url)) + '" target="_blank" rel="noopener noreferrer nofollow">' + esc(s.title || s.domain) + '</a>' +
        '<span class="bty-dom">' + esc(s.domain) + (s.official ? ' · official' : ' · news') + '</span></li>';
    }).join('');
    return '<button class="bty-back" id="bounty-back"><i class="fa-solid fa-arrow-left"></i> All profiles</button>' +
      '<div class="bty-hero"><span class="bty-photo big">' + (img ? '<img src="' + img + '" alt="" onerror="this.remove()">' : '') + '<i class="fa-solid fa-user-secret"></i></span>' +
      '<div><div class="bty-dname">' + esc(p.name) + '</div>' +
      ((p.aliases && p.aliases.length) ? '<div class="bty-sub">aka ' + esc(p.aliases.slice(0, 4).join(', ')) + '</div>' : '') +
      '<div class="bty-sub">' + esc([p.position, p.country].filter(Boolean).join(' · ')) + '</div>' + stars(p.wanted_level) + '</div></div>' +
      '<div class="bty-reward"><span>Reward offered</span><b>' + esc(money(p.reward_amount, p.reward_currency)) + usd + '</b></div>' +
      (p.reward_text ? '<div class="bty-quote">“' + esc(p.reward_text) + '”</div>' : '') +
      '<div class="bty-block"><h5>Offered by</h5><p>' + esc([p.issuer, p.issuer_country && '(' + p.issuer_country + ')'].filter(Boolean).join(' ') || 'Not stated') + '</p></div>' +
      (p.crimes ? '<div class="bty-block"><h5>Accused of (per the issuing authority)</h5><p>' + esc(p.crimes) + '</p></div>' : '') +
      (p.summary ? '<div class="bty-block"><h5>Summary</h5><p>' + esc(p.summary) + '</p></div>' : '') +
      (p.disputed ? '<div class="bty-dispute"><b>Disputed listing.</b> ' + esc(p.dispute_note || 'Described by some independent sources or governments as political or contested.') + '</div>' : '') +
      '<div class="bty-facts">' +
        row('Status', CASE_LABEL[p.case_status] || p.case_status) + row('Age', p.age) + row('Date of birth', p.dob) +
        row('Gender', p.gender) + row('Nationality', p.nationality) + row('Region (last reported)', p.last_known) + row('Description', p.physical) +
      '</div>' +
      '<div class="bty-block"><h5>Sources (' + (p.sources || []).length + ' verified)</h5><ul class="bty-src">' + (src || '<li>None</li>') + '</ul></div>' +
      '<div class="bty-disc">Rewards and allegations are claims made by the named issuing authority and reproduced from the sources above. They are not findings of guilt and are not independently verified by SaPEX. The pin shows the country only, never a precise or live location.' +
        (p.reviewed_at ? ' Reviewed ' + esc(String(p.reviewed_at).slice(0, 10)) + '.' : '') + '</div>';
  }

  function selectProfile(id, fromList) {
    var p = state.all.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    state.selectedId = id;
    if (!state.open) openPanel();
    $('bounty-list-view').style.display = 'none';
    var d = $('bounty-detail');
    d.style.display = 'block';
    d.innerHTML = detailHtml(p);
    d.scrollTop = 0;
    $('bounty-back').addEventListener('click', backToList);
    if (state.map && typeof p.lat === 'number') state.map.flyTo({ center: [p.lng, p.lat], zoom: Math.max(state.map.getZoom(), 3.2), duration: 900 });
  }

  function backToList() {
    state.selectedId = null;
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
