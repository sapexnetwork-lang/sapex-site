// conflict-map-app.js
// Requires: mapbox-gl.js, @supabase/supabase-js (CDN, loaded in the HTML),
// and conflict-map-animations.js (loaded just before this file).

let map;
let supa;
let currentRangeDays = 30;
let countryStatsCache = [];
let zonesVisible = false;
let casualtyVisible = false;

const $ = (id) => document.getElementById(id);

/* ======================================================================
   Boot — fetch config from the serverless endpoint, THEN build the map.
   Nothing here is hardcoded; see api/map-config.js.
   ====================================================================== */
async function boot() {
  SapexAnim.showLoading($('loading'), 'Initializing Conflict Intelligence...', 15);
  let config;
  try {
    const res = await fetch('/api/map-config');
    if (!res.ok) throw new Error('map-config endpoint returned ' + res.status);
    config = await res.json();
  } catch (err) {
    console.error('Failed to load map config:', err);
    SapexAnim.showLoading($('loading'), 'Could not load map configuration — check /api/map-config.', 100);
    return;
  }

  mapboxgl.accessToken = config.mapboxToken;
  supa = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

  SapexAnim.setProgress($('loading'), 35);
  initMap();
  initControls();
  initMobileShell();   // phone bottom nav, sheet and layers drawer (under 900px; does nothing on desktop)
  initRails();         // desktop feed column, intel panel shell and bottom bar (900px and up)
  initScrubber();      // time scrubber: drag, play, replay (stage 13)
  initPanel();         // four-tab intelligence panel (conflict-map-panel.js)
  initTicker();        // moving top bar (conflict-map-ticker.js)
  if (window.SapexAccount) SapexAccount.init({ supa: () => supa });   // account button and plan (conflict-map-account.js)
  if (window.SapexBounty) SapexBounty.init(map);   // 🎯 Bounty Profiles layer (loads its data only when opened)

  // Maintenance badge — same admin toggle (site_settings.maintenance_mode) as app.html
  checkMaintenanceMode();
  setInterval(() => { if (!document.hidden) checkMaintenanceMode(); }, 120000);
}

let _sbMaint = { at: 0, active: false };
async function checkMaintenanceMode() {
  const badge = $('site-maintenance-badge');
  if (!badge) return;
  let active = false, message = '';
  try {   // /status.json: static file written by the emergency Ops Console (works when Supabase is down)
    const r = await fetch('/status.json', { cache: 'no-cache' });
    if (r.ok) {
      const j = await r.json();
      if (j && j.maintenance && j.maintenance.active) { active = true; message = j.maintenance.message || ''; }
    }
  } catch (e) { /* non-fatal */ }
  if (supa && Date.now() - _sbMaint.at > 300000) {   // admin-panel toggle in Supabase, every 5 min at most
    try {
      const { data, error } = await supa.from('site_settings').select('value').eq('key', 'maintenance_mode').maybeSingle();
      if (!error) _sbMaint.active = !!(data && data.value && data.value.is_active);
    } catch (e) { /* keep last known */ }
    _sbMaint.at = Date.now();
  }
  if (_sbMaint.active) active = true;
  badge.classList.toggle('show', active);
  badge.title = active ? message : '';
}

/* ======================================================================
   Map init — globe projection, dark theme tuned to match SaPEX colors,
   plus a slow fly-in from a wider zoom as the single load-time flourish.
   ====================================================================== */
function initMap() {
  map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    projection: 'globe',
    center: [20, 20],
    zoom: 0.3,        // start pulled back; we fly in to 1.6 once loaded
    pitch: 0,
    attributionControl: true,
  });

  map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right');

  // Globe atmosphere: a lime-purple rim light and star fog, all from the brand tokens. Weak devices get a lighter fog and no stars.
  map.on('style.load', () => {
    const lime = SapexAnim.brand('--brand-lime', '#E4E932');
    const purple = SapexAnim.brand('--brand-purple', '#371777');
    const base = SapexAnim.brand('--surface-0', '#0C0715');
    const raised = SapexAnim.brand('--surface-1', '#120A1F');
    const weak = !!(navigator.deviceMemory && navigator.deviceMemory < 4);
    map.setFog({
      'color': SapexAnim.mix(base, purple, 0.35),
      'high-color': SapexAnim.mix(purple, lime, 0.22),   // the rim: purple with a touch of lime
      'horizon-blend': weak ? 0.03 : 0.07,
      'space-color': base,
      'star-intensity': weak ? 0 : 0.35,
    });
    // Layer names vary by style version, and Mapbox logs an error (it does not throw) for a missing layer, so check first.
    if (map.getLayer('background')) map.setPaintProperty('background', 'background-color', base);
    if (map.getLayer('water')) map.setPaintProperty('water', 'fill-color', raised);
  });

  map.on('load', () => {
    map.flyTo({ center: [20, 20], zoom: 1.6, duration: 2600, essential: true });
    initLive();   // live layers (pulses, hotspots, trails, sweep), LIVE chip, refresh timer
    loadAll();
  });
}

/* ======================================================================
   Auto-rotate globe
   ====================================================================== */
let rotating = false;
const SECONDS_PER_REV = 180;
const RESUME_AFTER_MS = 12000;   // rotation stops on touch / drag / scroll and resumes this long after the last one

/** Starts (or stops) the slow rotation. It runs inside the shared animation loop, with a throttled jumpTo and no per-frame easeTo. */
function spinGlobe() {
  if (!rotating) { SapexAnim.loop.remove('spin'); return; }
  if (SapexAnim.reduced()) return;   // reduced motion: rotation stays off
  SapexAnim.loop.add('spin', spinStep, 33);
}
let _spinLast = 0;
function spinStep(now) {
  if (!rotating) { SapexAnim.loop.remove('spin'); return; }
  const dt = Math.min(100, now - _spinLast || 33);
  _spinLast = now;
  if (now - lastInteractAt < RESUME_AFTER_MS || map.isMoving() || map.getZoom() >= 5) return;
  const center = map.getCenter();
  center.lng -= (360 / SECONDS_PER_REV) * (dt / 1000);
  map.jumpTo({ center });
}

function initControls() {
  $('rotate-btn').addEventListener('click', (e) => {
    rotating = !rotating;
    e.currentTarget.classList.toggle('on', rotating);
    if (rotating) spinGlobe();
  });
  ['mousedown', 'touchstart', 'wheel'].forEach(evt => {
    map.on(evt, () => { lastInteractAt = performance.now(); });   // pauses rotation and the sweep
  });

  $('reset-btn').addEventListener('click', () => {
    map.easeTo({ center: [20, 20], zoom: 1.6, pitch: 0, bearing: 0, duration: 900 });
  });

  const pillsContainer = $('range-pills');
  pillsContainer.addEventListener('click', async (e) => {
    const btn = e.target.closest('.range-pill');
    if (!btn) return;
    document.querySelectorAll('.range-pill').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    SapexAnim.slidePillIndicator(pillsContainer, btn);
    currentRangeDays = parseInt(btn.dataset.days, 10);
    updateScrubShell();
    SapexAnim.showLoading($('loading'), 'Updating range...', 40);
    await loadEvents(currentRangeDays);
    SapexAnim.hideLoading($('loading'));
  });
  // position the sliding highlight behind the default-active pill once laid out
  requestAnimationFrame(() => SapexAnim.slidePillIndicator(pillsContainer, pillsContainer.querySelector('.range-pill.active')));

  $('panel-close').addEventListener('click', closeSidePanel);

  $('info-btn').addEventListener('click', showMethodologyPanel);

  // Territory control and casualty layers are opt-in — off until the
  // viewer explicitly asks for them, since they're analyst-curated
  // claims (not auto-verified like the event feed) and can be dense.
  $('zones-btn').addEventListener('click', (e) => {
    zonesVisible = !zonesVisible;
    e.currentTarget.classList.toggle('on', zonesVisible);
    setLayerGroupVisible(['war-zones-fill', 'war-zones-outline'], zonesVisible);
  });
  $('casualty-btn').addEventListener('click', (e) => {
    casualtyVisible = !casualtyVisible;
    e.currentTarget.classList.toggle('on', casualtyVisible);
    setLayerGroupVisible(['casualty-clusters', 'casualty-cluster-count', 'casualty-points', 'casualty-icons'], casualtyVisible);
  });
}

/** Show/hide a set of already-added map layers; silently skips any not yet created. */
function setLayerGroupVisible(layerIds, visible) {
  layerIds.forEach(id => {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
  });
}

/* ======================================================================
   Data loading
   ====================================================================== */
async function loadAll() {
  SapexAnim.showLoading($('loading'), 'Loading country intelligence...', 55);
  // allSettled: one failing source must not stop the others or leave the loader on screen forever.
  const results = await Promise.allSettled([loadCountryStats(), loadMapMeta(), loadWarZones(), loadCasualtyPoints()]);
  results.forEach(r => { if (r.status === 'rejected') console.warn('[conflict-map] a data loader failed:', r.reason); });
  renderStats();
  SapexAnim.showLoading($('loading'), 'Plotting conflict events...', 80);
  try {
    await loadEvents(currentRangeDays);
    if (!countryStatsCache.length) await deriveCountryStatsFromEvents();
  } catch (e) { console.error('[conflict-map] events failed to load:', e); }
  reorderMapLayers();
  SapexAnim.hideLoading($('loading'));
  if (window.SapexPanel) SapexPanel.applyDeepLink();   // ?country=XX&tab=... opens the same view
  visitInit();   // "since your last visit" chip (stage 13)
}

/**
 * Country color, territory zones, event markers and casualty markers are
 * each added by their own independent network call, so the browser can
 * finish them in a different order on every load. Without a fixed order,
 * country-fill (opaque) can land on top of war-zones-fill and visually
 * hide it even while it's "visible" — which is what made the Territory
 * Control / Casualty Reports toggles look like they weren't doing
 * anything. Call this once everything exists to pin the real order.
 */
function reorderMapLayers() {
  const bottomToTop = [
    'country-fill', 'country-outline',
    'war-zones-fill', 'war-zones-outline',
    'live-trails',
    'clusters', 'cluster-count', 'event-points', 'event-method-icons',
    'casualty-clusters', 'casualty-cluster-count', 'casualty-points', 'casualty-icons',
    'live-hot-glow', 'live-hot-core', 'live-pulse',
    'bounty-halo', 'bounty-points',
    'live-scan-glow', 'live-scan-line', 'live-hot-labels',
  ];
  bottomToTop.forEach(id => { if (map.getLayer(id)) map.moveLayer(id); });
}

// Static snapshots exported by the VPS data manager (served by Vercel's CDN, so they cost Supabase no egress).
// If a snapshot is not published yet, the original Supabase query below runs instead.
async function warSnap(name) {
  try {
    const r = await fetch('/data/' + name + '.json', { cache: 'no-cache' });
    if (!r.ok) return null;
    const j = await r.json();
    // An empty snapshot means "nothing published yet" (or a bad export). Treat it like a missing file so the
    // Supabase fallback runs instead of the map silently showing zeros.
    return j && Array.isArray(j.items) && j.items.length ? j : null;
  } catch (e) { return null; }
}
// war_events snapshots use short keys to stay small - expand them back to the column names the map uses.
const WAR_KEY_MAP = { i: 'id', s: 'source', t: 'event_type', d: 'event_date', c: 'country_iso3', n: 'country_name',
  l: 'location_name', a: 'actor1', b: 'actor2', f: 'fatalities_est', fc: 'fatalities_confidence', y: 'latitude',
  x: 'longitude', u: 'source_url', mc: 'method_category', mi: 'method_icon' };
function expandWarEvent(o) {
  const r = {};
  for (const k in o) r[WAR_KEY_MAP[k] || k] = o[k];
  return r;
}

/* ----------------------------------------------------------------------
   Stat cards + data freshness badge.
   The bot writes ONE war_map_meta row (active_conflict_countries,
   total_events_30d, total_fatalities_est_30d, last_bot_run). If that row is
   missing or still zero while country rows exist, the cards total the country
   rows instead of showing a false 0. Nothing here is hard-coded data.
   ---------------------------------------------------------------------- */
let mapMetaCache = null;
let _syncAt = null;
let _freshTimer = null;

function toNum(v) {
  const n = Number(v);
  return v == null || v === '' || !Number.isFinite(n) ? null : n;
}
function isTrue(v) { return v === true || v === 1 || v === '1' || v === 'true' || v === 't'; }

async function loadMapMeta() {
  let data = null;
  const snap = await warSnap('war_map_meta');
  if (snap) {
    data = snap.items[0];
  } else {
    try {
      const res = await supa.from('war_map_meta').select('*').eq('id', 1).limit(1);
      if (res.error) console.warn('[conflict-map] war_map_meta query failed:', res.error.message || res.error);
      data = res.data && res.data[0] ? res.data[0] : null;
    } catch (e) { console.warn('[conflict-map] war_map_meta query failed:', e); }
  }
  if (data && !('active_conflict_countries' in data && 'total_events_30d' in data)) {
    console.warn('[conflict-map] war_map_meta row has unexpected fields. Found:', Object.keys(data).join(', '));
  }
  mapMetaCache = data;
}

/** Writes the four stat cards. Called once the meta row and the country rows have both been tried. */
function renderStats() {
  const meta = mapMetaCache || {};
  const rows = countryStatsCache || [];
  let active = toNum(meta.active_conflict_countries);
  let events = toNum(meta.total_events_30d);
  let fatal = toNum(meta.total_fatalities_est_30d);
  if (rows.length) {
    if (!events) events = rows.reduce((s, c) => s + (toNum(c.events_30d) || 0), 0);
    if (!active) active = rows.filter(c => isTrue(c.active_conflict)).length;
    if (fatal == null) {
      const withFatal = rows.filter(c => toNum(c.fatalities_est_30d) != null);
      if (withFatal.length) fatal = withFatal.reduce((s, c) => s + toNum(c.fatalities_est_30d), 0);
    }
  }
  SapexAnim.animateCount($('stat-active'), active || 0);
  SapexAnim.animateCount($('stat-events'), events || 0);

  const fatalEl = $('stat-fatalities');
  if (fatalEl) {
    if (fatal != null) {
      SapexAnim.animateCount(fatalEl, fatal, { formatter: (n) => '~' + Math.round(n).toLocaleString() });
    } else {
      fatalEl.textContent = 'No ACLED feed';
    }
  }

  _syncAt = lastSyncDate();
  renderFreshness();
  if (!_freshTimer) {
    _freshTimer = setInterval(() => { if (!document.hidden) renderFreshness(); }, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) renderFreshness(); });
  }
}

/** Last bot sync: war_map_meta.last_bot_run, else the newest updated_at the bot stamped on a country row. */
function lastSyncDate() {
  let t = mapMetaCache && mapMetaCache.last_bot_run ? Date.parse(mapMetaCache.last_bot_run) : NaN;
  if (!Number.isFinite(t)) {
    for (const c of countryStatsCache) {
      const u = Date.parse(c.updated_at);
      if (Number.isFinite(u) && (!Number.isFinite(t) || u > t)) t = u;
    }
  }
  return Number.isFinite(t) ? new Date(t) : null;
}

/**
 * Freshness badge on #stat-sync: "41 min ago". The bot runs every 3 hours, so the badge carries
 * data-fresh="fresh" (under 4 h), "stale" (4 to 12 h) or "old" (12 h and over) for the stylesheet to colour.
 */
function renderFreshness() {
  const el = $('stat-sync');
  if (!el || !_syncAt) return;
  const mins = Math.max(0, Math.round((Date.now() - _syncAt.getTime()) / 60000));
  const hours = mins / 60;
  el.textContent = mins < 1 ? 'just now'
    : mins < 60 ? mins + ' min ago'
    : hours < 48 ? Math.floor(hours) + ' h ago'
    : Math.floor(hours / 24) + ' d ago';
  el.dataset.fresh = hours >= 12 ? 'old' : hours >= 4 ? 'stale' : 'fresh';
  el.title = 'War data last synced ' + _syncAt.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** One clean row per country: upper-case ISO3 only (the map matches on iso_3166_1_alpha_3), newest row wins. */
function normalizeCountryStats(rows) {
  const byIso = new Map();
  (Array.isArray(rows) ? rows : []).forEach(r => {
    const iso = String((r && r.country_iso3) || '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(iso)) return;
    const prev = byIso.get(iso);
    if (!prev || (Date.parse(r.updated_at) || 0) >= (Date.parse(prev.updated_at) || 0)) byIso.set(iso, { ...r, country_iso3: iso });
  });
  return [...byIso.values()];
}

async function loadCountryStats() {
  const key = 'sapex_cache_' + CACHE_VERSION + '_war_country_stats';
  let data = _evCacheGet(key);
  if (!data) {
    const snap = await warSnap('war_country_stats');
    if (snap) {
      data = snap.items;
    } else {
      try {
        const res = await supa.from('war_country_stats').select('*');
        if (res.error) console.warn('[conflict-map] war_country_stats query failed:', res.error.message || res.error);
        else data = res.data;
      } catch (e) { console.warn('[conflict-map] war_country_stats query failed:', e); }
    }
    if (Array.isArray(data) && data.length) _evCacheSet(key, data);   // never cache an empty result
  }
  countryStatsCache = normalizeCountryStats(data);
  paintCountryChoropleth();
}

// Same default as the bot's ACTIVE_CONFLICT_EVENT_THRESHOLD (war_intel_bot.py). Only used by the fallback below.
const ACTIVE_ZONE_MIN_EVENTS_30D = 5;

/**
 * Fallback when war_country_stats is empty or unreadable: build the same rollup from the 90-day event rows
 * (same formula as the bot: 7/30/90-day counts, intensity = 100 x events_30d / busiest country).
 */
async function deriveCountryStatsFromEvents() {
  const rows = await getEventRows(90);
  if (!rows || !rows.length) return;
  const today = Date.parse(new Date().toISOString().slice(0, 10));
  const by = new Map();
  rows.forEach(r => {
    const iso = String(r.country_iso3 || '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(iso) || !r.event_date) return;
    const daysAgo = Math.floor((today - Date.parse(r.event_date)) / 86400000);
    if (!Number.isFinite(daysAgo)) return;
    let c = by.get(iso);
    if (!c) {
      c = { country_iso3: iso, country_name: r.country_name || iso, events_7d: 0, events_30d: 0, events_90d: 0,
            fatalities_est_30d: null, last_event_date: r.event_date, intensity_score: 0, active_conflict: false, conflict_name: null };
      by.set(iso, c);
    }
    c.events_90d++;
    if (daysAgo <= 30) {
      c.events_30d++;
      if (r.source === 'ACLED' && toNum(r.fatalities_est) != null) c.fatalities_est_30d = (c.fatalities_est_30d || 0) + toNum(r.fatalities_est);
    }
    if (daysAgo <= 7) c.events_7d++;
    if (r.event_date > c.last_event_date) c.last_event_date = r.event_date;
  });
  const list = [...by.values()];
  if (!list.length) return;
  const max = Math.max(...list.map(c => c.events_30d));
  list.forEach(c => {
    c.intensity_score = max > 0 ? Math.round(1000 * c.events_30d / max) / 10 : 0;
    c.active_conflict = c.events_30d >= ACTIVE_ZONE_MIN_EVENTS_30D;
  });
  countryStatsCache = list;
  paintCountryChoropleth();
  renderStats();
  updateLive();
  console.info('[conflict-map] war_country_stats was empty: country shading and stat cards are derived from the 90-day events.');
}

/* ======================================================================
   Territory control zones — analyst-curated (war_zones table), e.g.
   sourced from ISW's daily control-of-terrain assessment for Ukraine, or
   the equivalent named OSINT tracker for other conflicts. Never auto-
   generated — see README for how to add zones.
   ====================================================================== */
const ZONE_COLORS = {
  captured: '#ef4444',
  front_line: '#f59e0b',
  contested: '#eab308',
  liberated: '#22c55e',
};

async function loadWarZones() {
  const { data, error } = await supa.from('war_zones').select('*');
  if (error) { console.error(error); return; }
  paintWarZones(data || []);
}

let warZonesCache = null;   // the panel's Active zones section reads this, so zones are never fetched twice
function paintWarZones(zones) {
  warZonesCache = zones;
  const withGeometry = zones.filter(z => z.geojson);
  const geojson = {
    type: 'FeatureCollection',
    features: withGeometry.map(z => ({
      type: 'Feature',
      geometry: z.geojson,
      properties: { id: z.id, zone_name: z.zone_name, status: z.status, conflict_name: z.conflict_name, controlling_actor: z.controlling_actor, source_name: z.source_name, source_url: z.source_url, last_verified: z.last_verified },
    })),
  };

  const colorExpr = ['match', ['get', 'status']];
  Object.entries(ZONE_COLORS).forEach(([status, color]) => colorExpr.push(status, color));
  colorExpr.push('#94a3b8');

  if (map.getSource('war-zones')) {
    map.getSource('war-zones').setData(geojson);
    return;
  }

  map.addSource('war-zones', { type: 'geojson', data: geojson });

  map.addLayer({
    id: 'war-zones-fill',
    type: 'fill',
    source: 'war-zones',
    layout: { visibility: zonesVisible ? 'visible' : 'none' },
    paint: { 'fill-color': colorExpr, 'fill-opacity': 0.35 },
  });
  map.addLayer({
    id: 'war-zones-outline',
    type: 'line',
    source: 'war-zones',
    layout: { visibility: zonesVisible ? 'visible' : 'none' },
    paint: { 'line-color': colorExpr, 'line-width': 1.5, 'line-dasharray': [2, 1] },
  });

  map.on('click', 'war-zones-fill', (e) => {
    // Same reasoning as the country-fill handler above — an event or
    // casualty marker sitting on this zone should win the click.
    const markerLayers = ['clusters', 'event-points', 'event-method-icons', 'casualty-clusters', 'casualty-points', 'casualty-icons', 'bounty-points']
      .filter(id => map.getLayer(id));
    if (map.queryRenderedFeatures(e.point, { layers: markerLayers }).length > 0) return;
    const p = e.features[0].properties;
    new mapboxgl.Popup({ closeButton: true, maxWidth: '260px' })
      .setLngLat(e.lngLat)
      .setHTML(`
        <div class="popup-type">${(p.status || '').replace(/_/g, ' ')}${p.controlling_actor ? ' · ' + p.controlling_actor : ''}</div>
        <div class="popup-loc">${p.zone_name}</div>
        <div class="popup-meta">${p.conflict_name || ''}${p.last_verified ? ' · verified ' + p.last_verified : ''}</div>
        ${p.source_url ? `<div class="popup-src">${p.source_name || 'Source'}: <a href="${p.source_url}" target="_blank" rel="noopener">view →</a></div>` : `<div class="popup-src">Analyst-curated, no source link on file</div>`}
      `)
      .addTo(map);
  });
  map.on('mouseenter', 'war-zones-fill', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'war-zones-fill', () => { map.getCanvas().style.cursor = ''; });
}

/* ======================================================================
   Casualty point reports — analyst-curated (war_casualty_points table).
   Distinct from the ACLED fatality markers in the event feed: these are
   specific killed/wounded figures tied to one exact location, each with
   a named source, entered the same way war_verified_intel is. Never
   auto-generated. Off by default — toggled via the "☠️ Casualty Reports"
   control.
   ====================================================================== */
const CASUALTY_ICON = { killed: '💀', wounded: '🩹', missing: '❓' };
const CASUALTY_COLOR = { killed: '#ef4444', wounded: '#f59e0b', missing: '#94a3b8' };

async function loadCasualtyPoints() {
  const { data, error } = await supa.from('war_casualty_points').select('*');
  if (error) { console.error(error); return; }
  paintCasualtyPoints(data || []);
}

function paintCasualtyPoints(points) {
  const withCoords = points.filter(p => p.latitude != null && p.longitude != null);
  const geojson = {
    type: 'FeatureCollection',
    features: withCoords.map(p => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.longitude, p.latitude] },
      properties: { ...p, icon: CASUALTY_ICON[p.metric_type] || '❗' },
    })),
  };

  if (map.getSource('casualties')) {
    map.getSource('casualties').setData(geojson);
    return;
  }

  map.addSource('casualties', {
    type: 'geojson',
    data: geojson,
    cluster: true,
    clusterMaxZoom: 7,
    clusterRadius: 38,
  });

  const vis = casualtyVisible ? 'visible' : 'none';

  map.addLayer({
    id: 'casualty-clusters',
    type: 'circle',
    source: 'casualties',
    filter: ['has', 'point_count'],
    layout: { visibility: vis },
    paint: {
      'circle-color': '#7c3aed',
      'circle-radius': ['step', ['get', 'point_count'], 12, 10, 17, 30, 22],
      'circle-opacity': 0.8,
      'circle-stroke-width': 1.5,
      'circle-stroke-color': 'rgba(255,255,255,0.3)',
    },
  });
  map.addLayer({
    id: 'casualty-cluster-count',
    type: 'symbol',
    source: 'casualties',
    filter: ['has', 'point_count'],
    layout: { visibility: vis, 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 11, 'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'] },
    paint: { 'text-color': '#fff' },
  });
  map.addLayer({
    id: 'casualty-points',
    type: 'circle',
    source: 'casualties',
    filter: ['!', ['has', 'point_count']],
    layout: { visibility: vis },
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['coalesce', ['get', 'value_numeric'], 0], 0, 7, 10, 9, 100, 13, 1000, 18],
      'circle-color': ['match', ['get', 'metric_type'], 'killed', CASUALTY_COLOR.killed, 'wounded', CASUALTY_COLOR.wounded, CASUALTY_COLOR.missing],
      'circle-opacity': 0.85,
      'circle-stroke-width': 1.5,
      'circle-stroke-color': 'rgba(255,255,255,0.4)',
    },
  });
  map.addLayer({
    id: 'casualty-icons',
    type: 'symbol',
    source: 'casualties',
    filter: ['!', ['has', 'point_count']],
    layout: { visibility: vis, 'text-field': ['get', 'icon'], 'text-size': 12, 'text-allow-overlap': true },
  });

  map.on('click', 'casualty-clusters', (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: ['casualty-clusters'] });
    const clusterId = features[0].properties.cluster_id;
    map.getSource('casualties').getClusterExpansionZoom(clusterId, (err, zoom) => {
      if (err) return;
      map.easeTo({ center: features[0].geometry.coordinates, zoom });
    });
  });

  const showCasualtyPopup = (e) => {
    const p = e.features[0].properties;
    const label = (p.metric_type || '').charAt(0).toUpperCase() + (p.metric_type || '').slice(1);
    new mapboxgl.Popup({ closeButton: true, maxWidth: '260px' })
      .setLngLat(e.features[0].geometry.coordinates)
      .setHTML(`
        <div class="popup-type">${p.conflict_name || 'Casualty Report'}</div>
        <div class="popup-loc">${p.location_name}</div>
        <div class="popup-casualty-${p.metric_type === 'killed' ? 'killed' : 'wounded'}">${p.icon} ${label}: ${p.value_numeric != null ? Number(p.value_numeric).toLocaleString() : (p.value_text || 'unspecified')}</div>
        <div class="popup-meta">${p.as_of_date ? 'As of ' + p.as_of_date : ''}</div>
        ${p.notes ? `<div class="popup-meta">${p.notes}</div>` : ''}
        ${p.source_url ? `<div class="popup-src">${p.source_name || 'Source'}: <a href="${p.source_url}" target="_blank" rel="noopener">view →</a></div>` : `<div class="popup-src">Analyst-curated, no source link on file</div>`}
      `)
      .addTo(map);
  };

  map.on('click', 'casualty-points', showCasualtyPopup);
  map.on('click', 'casualty-icons', showCasualtyPopup);
  ['casualty-clusters', 'casualty-points', 'casualty-icons'].forEach(layer => {
    map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
  });
}

// EGRESS GUARD: the bot refreshes war_events every ~3 h, so a 30-min browser
// cache is invisible to users but stops every range-switch / reload from
// re-downloading ~1000 rows.
const EVENTS_CACHE_MS = 30 * 60 * 1000;
// The version is part of every cache key: change it on a deploy so old (or empty) cached data is never reused.
const CACHE_VERSION = 'v2';
function _evCacheGet(key) {
  try {
    const o = JSON.parse(localStorage.getItem(key) || 'null');
    if (o && Date.now() - o.t < EVENTS_CACHE_MS && !(Array.isArray(o.v) && o.v.length === 0)) return o.v;
  } catch (e) {}
  return null;
}
function _evCacheSet(key, v) {
  if (Array.isArray(v) && v.length === 0) return;   // an empty result must never be cached
  try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), v })); } catch (e) {}
}

/** Event rows for a range: cache, then the CDN snapshot, then Supabase. Returns null if every source failed. */
async function getEventRows(days) {
  const key = 'sapex_cache_' + CACHE_VERSION + '_war_events_' + days;
  const cached = _evCacheGet(key);
  if (cached) return cached;
  let data = null;
  const snap = await warSnap(days > 0 && days <= 7 ? 'war_events_7d' : days > 0 && days <= 30 ? 'war_events_30d' : 'war_events_90d');
  if (snap) {
    data = snap.items.map(expandWarEvent);      // "ALL" uses the 90-day file
  } else {
    let query = supa.from('war_events')
      .select('id,source,event_type,event_date,country_iso3,country_name,location_name,actor1,actor2,fatalities_est,fatalities_confidence,latitude,longitude,source_url,method_category,method_icon')
      .order('event_date', { ascending: false })
      .limit(4000);
    if (days > 0) {
      const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
      query = query.gte('event_date', cutoff);
    }
    const res = await query;
    if (res.error) { console.error(res.error); return null; }
    data = res.data || [];
  }
  if (Array.isArray(data) && data.length) _evCacheSet(key, data);
  return data;
}

async function loadEvents(days) {
  const data = await getEventRows(days);
  if (data === null) return;
  plottedRows = data || [];
  plottedRows.forEach(r => knownEventIds.add(r.id));   // everything loaded here counts as already seen: only later arrivals pulse
  scrubOnData();   // stage 13: rebuild the scrubber tables from these rows and return to the live view
  LIVE.lastPull = Date.now();
  renderFeed(data);
  updateLive();

  const geojson = eventsGeojson(data);

  if (map.getSource('events')) {
    // fade markers out, swap data, fade back in — avoids an abrupt jump-cut
    ['clusters', 'event-points'].forEach(id => { if (map.getLayer(id)) map.setPaintProperty(id, 'circle-opacity', 0); });
    setTimeout(() => {
      map.getSource('events').setData(geojson);
      SapexAnim.fadeInLayer(map, 'event-points', 'circle-opacity', 0.8, 60);
      SapexAnim.fadeInLayer(map, 'clusters', 'circle-opacity', 0.75, 60);
    }, 180);
  } else {
    addEventLayers(geojson);
  }
}

/* ======================================================================
   Event marker layers (clustered)
   ====================================================================== */
function addEventLayers(geojson) {
  map.addSource('events', {
    type: 'geojson',
    data: geojson,
    cluster: true,
    clusterMaxZoom: 6,
    clusterRadius: 42,
  });

  map.addLayer({
    id: 'clusters',
    type: 'circle',
    source: 'events',
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': ['step', ['get', 'point_count'], '#3b82f6', 25, '#f59e0b', 100, '#ef4444'],
      'circle-radius': ['step', ['get', 'point_count'], 14, 25, 20, 100, 28],
      'circle-opacity': 0.75,
      'circle-opacity-transition': { duration: 700 },
      'circle-stroke-width': 1.5,
      'circle-stroke-color': 'rgba(255,255,255,0.3)',
    },
  });

  map.addLayer({
    id: 'cluster-count',
    type: 'symbol',
    source: 'events',
    filter: ['has', 'point_count'],
    layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 11, 'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'] },
    paint: { 'text-color': '#0a0e1a' },
  });

  map.addLayer({
    id: 'event-points',
    type: 'circle',
    source: 'events',
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-radius': ['case',
        ['==', ['get', 'source'], 'ACLED'],
        ['interpolate', ['linear'], ['coalesce', ['get', 'fatalities_est'], 0], 0, 5, 5, 8, 20, 12, 100, 18, 500, 26],
        3.5,
      ],
      'circle-color': ['case', ['==', ['get', 'source'], 'ACLED'], '#ef4444', '#22d3ee'],
      'circle-opacity': 0.8,
      'circle-opacity-transition': { duration: 700 },
      'circle-stroke-width': 1,
      'circle-stroke-color': 'rgba(255,255,255,0.25)',
    },
  });

  // Method-of-attack icon (emoji glyph) — only shows once zoomed in enough
  // to be legible, and only for events GDELT actually classified (some
  // events have no base-code match, method_icon is null for those).
  map.addLayer({
    id: 'event-method-icons',
    type: 'symbol',
    source: 'events',
    filter: ['all', ['!', ['has', 'point_count']], ['has', 'method_icon']],
    minzoom: 3,
    layout: {
      'text-field': ['get', 'method_icon'],
      'text-size': 13,
      'text-allow-overlap': true,
      'text-offset': [0, -1.3],
    },
  });

  // fade in on first paint (layers were created with a real opacity above,
  // so drop to 0 then animate up — same helper used for later refreshes)
  SapexAnim.fadeInLayer(map, 'event-points', 'circle-opacity', 0.8, 30);
  SapexAnim.fadeInLayer(map, 'clusters', 'circle-opacity', 0.75, 30);

  map.on('click', 'clusters', (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
    const clusterId = features[0].properties.cluster_id;
    const pointCount = features[0].properties.point_count;
    map.getSource('events').getClusterLeaves(clusterId, pointCount, 0, (err, leaves) => {
      if (err) { console.error(err); return; }
      openEventsPanel(leaves.map(f => f.properties), pointCount);
    });
  });

  const showEventPopup = async (e) => {
    const f = e.features[0];
    const p = f.properties;
    const fatalHtml = p.fatalities_est
      ? `<div class="popup-fatal">~${p.fatalities_est} fatalities (${p.fatalities_confidence})</div>` : '';
    const methodHtml = p.method_category
      ? `<div class="popup-meta">${p.method_icon || ''} ${p.method_category.replace(/_/g, ' ')}</div>` : '';

    const popup = new mapboxgl.Popup({ closeButton: true, maxWidth: '280px' })
      .setLngLat(f.geometry.coordinates)
      .setHTML(`
        <div class="popup-type">${p.source} · ${p.event_type || 'Event'}</div>
        <div class="popup-loc">${p.location_name || p.country_name}</div>
        <div class="popup-meta">${p.event_date} · ${[p.actor1, p.actor2].filter(Boolean).join(' vs ') || 'Actor unclear'}</div>
        ${methodHtml}
        ${fatalHtml}
        <div id="enrich-slot-${p.id}" class="popup-enrich-slot"></div>
        ${p.source_url ? `<div class="popup-src"><a href="${p.source_url}" target="_blank" rel="noopener">View source →</a></div>` : ''}
      `)
      .addTo(map);

    // Fetch the AI-assisted "as reported by" summary, if this event has
    // been through enrich_events.py — loaded async so the popup itself
    // never waits on it.
    const { data: enrich } = await supa.from('war_event_enrichment')
      .select('summary,reported_casualties,reported_method,source_outlet')
      .eq('event_id', p.id).maybeSingle();

    const slot = document.getElementById(`enrich-slot-${p.id}`);
    if (slot && enrich) {
      slot.innerHTML = `
        <div class="popup-enrich">
          <div class="popup-enrich-label">As reported by ${enrich.source_outlet || 'source'} — not SaPEX-verified</div>
          ${enrich.summary ? `<div class="popup-enrich-line">${enrich.summary}</div>` : ''}
          ${enrich.reported_casualties && enrich.reported_casualties !== 'Not stated in article.' ? `<div class="popup-enrich-line">🩹 ${enrich.reported_casualties}</div>` : ''}
          ${enrich.reported_method && enrich.reported_method !== 'Not stated in article.' ? `<div class="popup-enrich-line">🎯 ${enrich.reported_method}</div>` : ''}
        </div>
      `;
    }
  };

  map.on('click', 'event-points', showEventPopup);
  map.on('click', 'event-method-icons', showEventPopup);

  ['clusters', 'event-points', 'event-method-icons'].forEach(layer => {
    map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
  });
}

/* ======================================================================
   Country choropleth (Mapbox boundaries tileset)
   ====================================================================== */
function intensityColor(score) {
  if (score >= 66) return '#ef4444';
  if (score >= 33) return '#f59e0b';
  if (score > 0) return '#22c55e';
  return 'rgba(148,163,184,0.06)';
}

function paintCountryChoropleth() {
  // One entry per ISO3 only: Mapbox rejects a match expression with duplicate labels or no branches,
  // which would drop the whole fill layer without a visible error.
  const seen = new Set();
  const pairs = [];
  countryStatsCache.forEach(c => {
    if (!c.country_iso3 || seen.has(c.country_iso3)) return;
    seen.add(c.country_iso3);
    pairs.push(c.country_iso3, intensityColor(toNum(c.intensity_score) || 0));
  });
  const matchExpr = pairs.length
    ? ['match', ['get', 'iso_3166_1_alpha_3'], ...pairs, 'rgba(0,0,0,0)']   // last value = default (no data)
    : 'rgba(0,0,0,0)';

  // Layer already exists (second paint, e.g. after the fallback): just recolour it. Re-adding it would also
  // register the click handlers below a second time.
  if (map.getLayer('country-fill')) { map.setPaintProperty('country-fill', 'fill-color', matchExpr); return; }

  if (!map.getSource('country-boundaries')) {
    map.addSource('country-boundaries', { type: 'vector', url: 'mapbox://mapbox.country-boundaries-v1' });
  }
  if (map.getLayer('country-fill')) map.removeLayer('country-fill');
  if (map.getLayer('country-outline')) map.removeLayer('country-outline');

  const beforeLayer = map.getLayer('event-points') ? 'event-points' : undefined;

  map.addLayer({
    id: 'country-fill',
    type: 'fill',
    source: 'country-boundaries',
    'source-layer': 'country_boundaries',
    paint: { 'fill-color': matchExpr, 'fill-opacity': 0, 'fill-opacity-transition': { duration: 900 } },
  }, beforeLayer);
  requestAnimationFrame(() => { if (map.getLayer('country-fill')) map.setPaintProperty('country-fill', 'fill-opacity', 0.55); });

  map.addLayer({
    id: 'country-outline',
    type: 'line',
    source: 'country-boundaries',
    'source-layer': 'country_boundaries',
    paint: { 'line-color': 'rgba(148,163,184,0.25)', 'line-width': 0.6 },
  }, beforeLayer);

  map.on('click', 'country-fill', (e) => {
    // A marker/zone sitting on top of the country color already has its
    // own click handler — if this click also hit one of those, let that
    // handler own it instead of opening the generic country panel too.
    const markerLayers = ['clusters', 'event-points', 'event-method-icons', 'war-zones-fill', 'casualty-clusters', 'casualty-points', 'casualty-icons', 'bounty-points']
      .filter(id => map.getLayer(id));
    if (map.queryRenderedFeatures(e.point, { layers: markerLayers }).length > 0) return;
    const iso3 = e.features[0].properties.iso_3166_1_alpha_3;
    openCountryPanel(iso3);
  });
  map.on('mouseenter', 'country-fill', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'country-fill', () => { map.getCanvas().style.cursor = ''; });
}

/* ======================================================================
   Side panel — country detail + Verified Intel
   ====================================================================== */
async function openCountryPanel(iso3) {
  if (window.SapexPanel) { SapexPanel.showCountry(iso3); return; }   // stage 7: the tabbed panel renders it. The code below is only a fallback if that script failed to load.
  const stat = countryStatsCache.find(c => c.country_iso3 === iso3);
  const panel = $('side-panel');
  const content = $('panel-content');

  content.innerHTML = `
    <div class="panel-eyebrow">${stat ? (stat.active_conflict ? 'Active Conflict Zone' : 'Monitored') : 'No recent activity'}</div>
    <div class="panel-title">${stat ? stat.country_name : iso3}</div>
    <div class="panel-sub">${stat && stat.conflict_name ? stat.conflict_name : 'No curated conflict label set'}</div>
    <div class="panel-grid">
      <div class="panel-stat"><div class="n">${stat ? stat.events_30d : 0}</div><div class="l">Events / 30d</div></div>
      <div class="panel-stat"><div class="n">${stat && stat.fatalities_est_30d != null ? '~' + stat.fatalities_est_30d : '—'}</div><div class="l">Est. Fatalities</div></div>
      <div class="panel-stat"><div class="n">${stat ? stat.events_7d : 0}</div><div class="l">Events / 7d</div></div>
      <div class="panel-stat"><div class="n">${stat && stat.last_event_date ? stat.last_event_date : '—'}</div><div class="l">Last Event</div></div>
    </div>
    <div class="panel-section-title">Verified Intel</div>
    <div id="intel-list"><div class="empty-note">Loading…</div></div>
  `;
  revealPanel();

  const { data: intel } = await supa.from('war_verified_intel')
    .select('*').eq('country_iso3', iso3).order('report_date', { ascending: false }).limit(20);

  const intelList = $('intel-list');
  if (!intel || intel.length === 0) {
    intelList.innerHTML = `<div class="empty-note">No analyst-verified figures logged yet for this country. Wounded counts, property damage, vehicles destroyed, and territory control are entered manually by the SaPEX intel team via <code>war_verified_intel</code> — this keeps every number sourced instead of guessed.</div>`;
    return;
  }
  intelList.innerHTML = intel.map((i, idx) => `
    <div class="intel-item" style="animation-delay:${idx * 0.05}s">
      <div class="type">${i.metric_type.replace(/_/g, ' ')}</div>
      <div class="val">${i.value_numeric != null ? i.value_numeric.toLocaleString() : (i.value_text || '—')}</div>
      <div class="src">${i.source_name} · ${i.report_date}${i.source_url ? ` · <a href="${i.source_url}" target="_blank" rel="noopener">source</a>` : ''}</div>
    </div>
  `).join('');
}

/** Opens the side panel with the individual events inside a clicked cluster. */
function openEventsPanel(events, totalCount) {
  if (window.SapexPanel) SapexPanel.beginCustom();
  const panel = $('side-panel');
  const content = $('panel-content');
  const shown = events.slice(0, 60); // cap render so one huge cluster can't freeze the panel

  content.innerHTML = `
    <div class="panel-eyebrow">Event Cluster</div>
    <div class="panel-title">${totalCount.toLocaleString()} ${totalCount === 1 ? 'Event' : 'Events'}</div>
    <div class="panel-sub">${shown.length < totalCount ? `Showing the first ${shown.length} — zoom in to split this cluster further` : 'All events in this cluster'}</div>
    <div class="panel-section-title">Events</div>
    <div>
      ${shown.map((p, idx) => `
        <div class="event-row" style="animation-delay:${Math.min(idx, 20) * 0.02}s">
          <div class="et">${p.method_icon ? p.method_icon + ' ' : ''}${p.source || 'Event'}${p.event_type ? ' · ' + p.event_type.replace(/_/g, ' ') : ''}</div>
          <div class="em">${p.location_name || p.country_name || 'Unknown location'} — ${p.event_date || ''}${p.fatalities_est ? ` · ~${p.fatalities_est} fatalities` : ''}</div>
          ${p.source_url ? `<a href="${p.source_url}" target="_blank" rel="noopener">View source →</a>` : ''}
        </div>
      `).join('')}
    </div>
  `;
  revealPanel();
}

function showMethodologyPanel() {
  if (window.SapexPanel) SapexPanel.beginCustom();
  const panel = $('side-panel');
  $('panel-content').innerHTML = `
    <div class="panel-eyebrow">Methodology</div>
    <div class="panel-title" style="font-size:16px;">How to read this map</div>
    <p class="empty-note" style="margin-top:10px;">
      <strong>Cyan markers</strong> are conflict-related event reports pulled from GDELT's global news-monitoring feed every 3 hours — they show where activity is happening, not a verified death toll.<br><br>
      <strong>Red markers</strong> include a fatality estimate reported by ACLED, a conflict-monitoring NGO. These are third-party estimates, not official figures, and are often disputed by parties to a conflict.<br><br>
      <strong>Marker icons</strong> (⚔️ 🔫 💥 ✈️ 🏳️ etc.) show the method GDELT's own classification assigned to that event — small arms, artillery, airstrike, occupation, and so on. This is a category tag, not a weapons-identification claim.<br><br>
      <strong>"As reported by [outlet]" text in a popup</strong> is an AI-generated (Gemini) summary of the ONE news article already linked to that event — it reflects what that outlet reported, not something SaPEX has independently verified. If it's not there, that event hasn't been through enrichment yet (only a capped daily batch of widely-covered events are).<br><br>
      <strong>Territory-control shading</strong> (dashed outlines, "🗺️ Territory Control" toggle — off by default) comes from the analyst-curated zone layer — e.g. sourced from ISW's daily control-of-terrain assessment — never auto-generated from social media or unverified claims. It covers whichever conflicts the SaPEX intel team has entered zones for, not only Ukraine.<br><br>
      <strong>Casualty Reports</strong> ("☠️ Casualty Reports" toggle — off by default) are killed/wounded figures tied to one exact location, each analyst-entered with a named source and a date. These are separate from the automatic ACLED fatality markers in the event feed above, and only cover locations the intel team has specifically sourced and logged.<br><br>
      <strong>Country shading</strong> reflects 30-day event intensity relative to the most active country, not a judgment about the legitimacy or scale of any conflict.<br><br>
      <strong>Wounded counts, property-damage values, and vehicles destroyed</strong> are not available from any free automated global source, so SaPEX does not fabricate them. Where shown, they come from the analyst-curated Verified Intel or Casualty Reports layers, each with a cited source.
    </p>
  `;
  revealPanel();
}

/* ======================================================================
   Phone shell (stage 4). Under 900px: a bottom nav (Layers, Feed, Intel, Bounty), ONE pop-up sheet
   (closed by default; snap points minimized bar / half / full) and a layers drawer. The same side-panel,
   bounty-panel and legend nodes are moved into the sheet / drawer, so every id and handler keeps working.
   900px and up: nothing here runs and the desktop layout is untouched.
   ====================================================================== */
const mqPhone = window.matchMedia('(max-width: 899px)');
const shell = { state: 'closed', tab: 'feed', revealedAt: 0, drag: null };
const SHEET_TITLES = { feed: 'Live feed', intel: 'Intel', bounty: 'Bounty profiles' };
const isPhone = () => mqPhone.matches;

/** Shows the country / cluster / methodology panel: the desktop side panel, or the sheet's Intel tab on a phone. */
/** Hands the panel what it needs from this file. It never reaches into the map or the database on its own. */
function initPanel() {
  if (!window.SapexPanel) return;
  SapexPanel.init({
    supa: () => supa,
    stats: () => countryStatsCache,
    rows: () => plottedRows,
    days: () => currentRangeDays,
    snap: warSnap,
    zones: () => warZonesCache,
    loadZones: loadWarZones,
    reveal: revealPanel,
    focusCountry,
    iso2To3,
    openBountyTab: () => { if (isPhone()) openSheet('bounty'); },
  });
}

function initTicker() {
  if (!window.SapexTicker) return;
  SapexTicker.init({
    supa: () => supa,
    snap: warSnap,
    expand: expandWarEvent,
    rows: () => plottedRows,
    stats: () => countryStatsCache,
    flyToEvent,
    pulse: firePulses,
    reveal: revealPanel,
    focusCountry,
  });
}

/** Fits the camera to the plotted events of one country (no coordinates are hard-coded). */
function focusCountry(iso3) {
  const pts = plottedRows.filter(r => String(r.country_iso3 || '').toUpperCase() === iso3 && toNum(r.longitude) != null && toNum(r.latitude) != null);
  if (!pts.length || !map) return;
  const b = new mapboxgl.LngLatBounds();
  pts.forEach(r => b.extend([Number(r.longitude), Number(r.latitude)]));
  map.fitBounds(b, { padding: isPhone() ? 40 : 80, maxZoom: 5, duration: 1400, essential: true });
}

/** 2-letter to 3-letter country code from the boundaries tileset (only works for tiles already loaded). */
function iso2To3(code) {
  try {
    const f = map.querySourceFeatures('country-boundaries', { sourceLayer: 'country_boundaries', filter: ['==', ['get', 'iso_3166_1'], code] });
    return f.length ? f[0].properties.iso_3166_1_alpha_3 : '';
  } catch (e) { return ''; }
}

function revealPanel() {
  if (window.SapexPanel) SapexPanel.ensure();
  $('side-panel').classList.add('open');
  if (isPhone()) openSheet('intel');
  else if (rails.right !== 'open') setRail('right', 'open');
}

/** Closes the intel panel: minimizes the sheet on phones, hides the right column on desktop. */
function closeSidePanel() {
  if (isPhone()) setSheetState('min');
  else setRail('right', 'closed');
}

function setSheetState(s) {
  const sheet = $('sheet');
  shell.state = s;
  sheet.dataset.state = s;
  sheet.setAttribute('aria-hidden', s === 'closed' ? 'true' : 'false');
  sheet.classList.remove('dragging');
  sheet.style.transform = '';
  syncNav();
}

/** Opens the sheet on a tab. Closed or minimized goes to half; half or full keeps its size. */
function openSheet(tab) {
  const sheet = $('sheet');
  shell.tab = tab;
  shell.revealedAt = Date.now();
  sheet.dataset.tab = tab;
  $('sheet-title').textContent = SHEET_TITLES[tab] || '';
  closeDrawer();
  if (tab === 'intel' && window.SapexPanel) SapexPanel.ensure();
  setSheetState(shell.state === 'half' || shell.state === 'full' ? shell.state : 'half');
  const bb = $('bounty-btn');
  if (tab === 'bounty' && bb && !bb.classList.contains('on')) bb.click();   // bounty-layer.js opens its own panel and map layer
}

function openDrawer() {
  if (shell.state === 'half' || shell.state === 'full') setSheetState('min');
  const d = $('layers-drawer');
  d.classList.add('open');
  d.setAttribute('aria-hidden', 'false');
  syncNav();
}
function closeDrawer() {
  const d = $('layers-drawer');
  if (!d.classList.contains('open')) return;
  d.classList.remove('open');
  d.setAttribute('aria-hidden', 'true');
  syncNav();
}

function syncNav() {
  const open = shell.state === 'half' || shell.state === 'full';
  document.querySelectorAll('#bottom-nav button[data-nav]').forEach(b => {
    const k = b.dataset.nav;
    const on = k === 'layers' ? $('layers-drawer').classList.contains('open') : (open && shell.tab === k);
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

/** The drawer toggles mirror the real (hidden on phones) buttons, which keep all the map logic. */
function syncToggles() {
  document.querySelectorAll('[data-proxy]').forEach(t => {   // drawer toggles and bottom-bar chips
    const src = $(t.dataset.proxy);
    const on = !!(src && src.classList.contains('on'));
    t.classList.toggle('on', on);
    if (t.hasAttribute('aria-pressed')) t.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

/** Moves the panels and legend into the sheet / drawer on phones, and back to their desktop places above 900px. */
function placePhoneParts() {
  const sheet = $('sheet'), drawer = $('layers-drawer');
  const side = $('side-panel'), bounty = $('bounty-panel'), legend = $('legend');
  if (isPhone()) {
    sheet.querySelector('[data-pane="intel"]').appendChild(side);
    sheet.querySelector('[data-pane="bounty"]').appendChild(bounty);
    $('drawer-legend').appendChild(legend);
  } else {
    const app = $('app');
    app.insertBefore(legend, $('scrubber'));
    app.insertBefore(bounty, drawer);
    app.insertBefore(side, drawer);
    closeDrawer();
    setSheetState('closed');
    applyRails();
  }
  requestAnimationFrame(() => { if (map) map.resize(); });
}

function initMobileShell() {
  const sheet = $('sheet'), drawer = $('layers-drawer'), nav = $('bottom-nav'), grip = $('sheet-grip');
  if (!sheet || !drawer || !nav || !grip) return;

  nav.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-nav]');
    if (!b) return;
    const k = b.dataset.nav;
    if (k === 'layers') { drawer.classList.contains('open') ? closeDrawer() : openDrawer(); return; }
    if (k === shell.tab && (shell.state === 'half' || shell.state === 'full')) { setSheetState('min'); return; }   // tapping the active tab minimizes
    openSheet(k);
  });

  $('drawer-close').addEventListener('click', closeDrawer);
  $('sheet-min').addEventListener('click', () => setSheetState(shell.state === 'min' ? 'half' : 'min'));
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!isPhone()) { if (rails.right !== 'closed') closeSidePanel(); return; }   // desktop: Esc closes the intel panel
    if (drawer.classList.contains('open')) closeDrawer();
    else if (shell.state === 'half' || shell.state === 'full') setSheetState('min');
  });

  // Layers drawer toggles click the real buttons; a MutationObserver keeps the toggle look in step
  drawer.addEventListener('click', (e) => {
    const t = e.target.closest('.layer-toggle[data-proxy]');
    const src = t && $(t.dataset.proxy);
    if (src) src.click();
  });
  const mo = new MutationObserver(() => {
    syncToggles();
    if (!isPhone()) return;
    const on = $('bounty-btn').classList.contains('on');   // bounty-layer.js opens/closes its panel through this button
    if (on && !(shell.tab === 'bounty' && (shell.state === 'half' || shell.state === 'full'))) openSheet('bounty');
    if (!on && shell.tab === 'bounty' && (shell.state === 'half' || shell.state === 'full')) setSheetState('min');
  });
  PROXY_IDS.forEach(id => { const el = $(id); if (el) mo.observe(el, { attributes: true, attributeFilter: ['class'] }); });
  syncToggles();

  // Drag the grip: follows the finger, then snaps to the nearest of minimized / half / full
  const positions = () => {
    const H = sheet.offsetHeight, avail = H / 0.92;
    return { full: 0, half: H - avail * 0.5, min: H - 48 };
  };
  grip.addEventListener('pointerdown', (e) => {
    if (!isPhone() || shell.state === 'closed' || e.target.closest('button')) return;
    const pos = positions();
    shell.drag = { y0: e.clientY, last: e.clientY, dir: 0, ty0: pos[shell.state], ty: pos[shell.state], pos, moved: false };
    try { grip.setPointerCapture(e.pointerId); } catch (err) {}
    sheet.classList.add('dragging');
  });
  grip.addEventListener('pointermove', (e) => {
    const d = shell.drag;
    if (!d) return;
    const dy = e.clientY - d.y0;
    if (Math.abs(dy) > 6) d.moved = true;
    d.dir = e.clientY - d.last || d.dir;
    d.last = e.clientY;
    d.ty = Math.min(d.pos.min, Math.max(0, d.ty0 + dy));
    if (d.moved) sheet.style.transform = 'translateY(' + d.ty + 'px)';
  });
  const endDrag = () => {
    const d = shell.drag;
    if (!d) return;
    shell.drag = null;
    if (!d.moved) { setSheetState(shell.state === 'min' ? 'half' : 'min'); return; }   // a tap on the bar
    const projected = d.ty + d.dir * 8;   // a flick carries a little further
    let best = 'min', bestDist = Infinity;
    ['full', 'half', 'min'].forEach(k => { const dist = Math.abs(d.pos[k] - projected); if (dist < bestDist) { best = k; bestDist = dist; } });
    setSheetState(best);
  };
  grip.addEventListener('pointerup', endDrag);
  grip.addEventListener('pointercancel', endDrag);

  // A tap on the map minimizes the sheet and closes the drawer. A panel that this same tap opens wins.
  map.on('click', () => {
    if (!isPhone()) return;
    const at = Date.now();
    setTimeout(() => {
      if (shell.revealedAt >= at - 5) return;
      closeDrawer();
      if (shell.state === 'half' || shell.state === 'full') setSheetState('min');
    }, 0);
  });

  const onChange = () => { placePhoneParts(); syncNav(); };
  if (mqPhone.addEventListener) mqPhone.addEventListener('change', onChange); else mqPhone.addListener(onChange);
  placePhoneParts();
  syncNav();
}
const PROXY_IDS = ['zones-btn', 'bounty-btn', 'casualty-btn', 'rotate-btn'];

/* ======================================================================
   Desktop columns (stage 5), 900px and up. Left: live feed (280px). Right: intel panel shell (380px).
   Each is closed, minimized (48px bar) or open; the choice is remembered for the session. The map,
   stats, legend and bottom bar step aside via CSS, and the map is resized every time.
   ====================================================================== */
const rails = { left: 'closed', right: 'closed' };
const RAIL_STATES = ['closed', 'min', 'open'];

function applyRails() {
  const app = $('app');
  app.dataset.left = rails.left;
  app.dataset.right = rails.right;
  const sp = $('side-panel');
  sp.classList.toggle('open', rails.right !== 'closed');
  sp.classList.toggle('min', rails.right === 'min');
  $('feed').setAttribute('aria-hidden', rails.left === 'closed' ? 'true' : 'false');
  if (rails.right !== 'closed' && window.SapexPanel) SapexPanel.ensure();
  $('feed-min').setAttribute('aria-label', rails.left === 'min' ? 'Expand feed' : 'Minimize feed');
  $('panel-min').setAttribute('aria-label', rails.right === 'min' ? 'Expand panel' : 'Minimize panel');
}

function setRail(side, state) {
  if (!RAIL_STATES.includes(state)) return;
  rails[side] = state;
  if (side === 'right' && state !== 'closed' && !isPhone()) {   // Intel column and Bounties panel are one at a time on desktop
    const bb = $('bounty-btn');
    if (bb && bb.classList.contains('on')) bb.click();
  }
  try { sessionStorage.setItem('sapex_cm_rail_' + side, state); } catch (e) {}
  applyRails();
  requestAnimationFrame(() => { if (map) map.resize(); });   // the map area just changed size
}

function initRails() {
  const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
  try {
    ['left', 'right'].forEach(s => { const v = sessionStorage.getItem('sapex_cm_rail_' + s); if (RAIL_STATES.includes(v)) rails[s] = v; });
  } catch (e) {}
  on('feed-tab', () => setRail('left', 'open'));
  on('feed-min', () => setRail('left', rails.left === 'min' ? 'open' : 'min'));
  on('feed-close', () => setRail('left', 'closed'));
  on('intel-tab', () => setRail('right', 'open'));
  on('panel-min', () => setRail('right', rails.right === 'min' ? 'open' : 'min'));
  // Opening Bounties hands the right column back to the map (no empty reserved space)
  document.addEventListener('sapex:bounty-open', () => { if (!isPhone() && rails.right !== 'closed') setRail('right', 'closed'); });

  // Bottom bar chips click the real (hidden) buttons; the observer in initMobileShell keeps their look in step
  const bar = $('scrubber');
  if (bar) bar.addEventListener('click', (e) => {
    const c = e.target.closest('[data-proxy]');
    const src = c && $(c.dataset.proxy);
    if (src) src.click();
  });
  const keyChip = $('key-chip'), legend = $('legend');
  if (keyChip && legend) {
    keyChip.addEventListener('click', () => $('legend-btn').click());
    new MutationObserver(() => {
      const o = legend.classList.contains('open');
      keyChip.classList.toggle('on', o);
      keyChip.setAttribute('aria-pressed', o ? 'true' : 'false');
    }).observe(legend, { attributes: true, attributeFilter: ['class'] });
  }
  if (!isPhone()) applyRails();
  updateScrubShell();
}

/** Scrubber shell: only the start label follows the range pill. Replay arrives in stage 13. */
function updateScrubShell() {
  const el = $('scrub-from');
  if (el) el.textContent = (currentRangeDays || 90) + ' days ago';
}

/* ----------------------------------------------------------------------
   Live feed: the newest events from the loaded range (same rows the map plots). Used by the desktop
   left column and the phone Feed tab. Clicking an item flies the camera to the event.
   ---------------------------------------------------------------------- */
function feedAgo(dateStr) {
  const t = Date.parse(dateStr);
  if (!Number.isFinite(t)) return '';
  const d = Math.floor((Date.now() - t) / 86400000);
  return d < 1 ? 'today' : d + ' d ago';
}

function renderFeed(rows) {
  const items = (Array.isArray(rows) ? rows : [])
    .filter(r => toNum(r.latitude) != null && toNum(r.longitude) != null && r.event_date)
    .slice()
    .sort((a, b) => String(b.event_date).localeCompare(String(a.event_date)))
    .slice(0, 40);
  document.querySelectorAll('.feed-list').forEach(list => {
    list.textContent = '';
    items.forEach(r => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'feed-item';
      const top = document.createElement('span');
      top.className = 'feed-top';
      const c = document.createElement('span');
      c.className = 'feed-country';
      c.textContent = r.country_name || r.location_name || 'Unknown location';
      const ago = document.createElement('span');
      ago.className = 'feed-ago';
      ago.textContent = feedAgo(r.event_date);
      top.append(c, ago);
      const ty = document.createElement('span');
      ty.className = 'feed-type';
      ty.textContent = (r.event_type ? String(r.event_type).replace(/_/g, ' ') : (r.source || 'Event'));
      if (r.fatalities_est) {
        const f = document.createElement('span');
        f.className = 'feed-fatal';
        f.textContent = ' · ~' + r.fatalities_est + ' fatalities';
        ty.append(f);
      }
      b.append(top, ty);
      b.addEventListener('click', () => flyToEvent(r));
      list.appendChild(b);
    });
  });
}

function flyToEvent(r) {
  const lng = toNum(r.longitude), lat = toNum(r.latitude);
  if (lng == null || lat == null || !map) return;
  if (isPhone()) setSheetState('min');   // get the sheet out of the way so the point is visible
  map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 5), duration: 1800, essential: true });
}

/* ======================================================================
   Live-map layer (stage 6). Everything is a Mapbox layer driven by ONE shared animation loop
   (SapexAnim.loop): no DOM markers, no per-marker timers.
     - pulse rings   a lime ring expands from each NEW event for 2.4 s (at most 30 at once)
     - hotspots      the top 5 countries by intensity (war_country_stats) breathe, with a floating label
     - trails        a faint fading line from each last-24h event toward its country's recent-activity centre
     - sweep         a thin lime meridian crosses the globe after a fresh pull, only while idle
   Reduced motion turns pulses, trails, sweep and rotation off. Colours come from the brand tokens.
   ====================================================================== */
const PULSE_MS = 2400, PULSE_MAX = 30, SCAN_MS = 3200, SCAN_GAP_MS = 180000, POLL_MS = 300000;
const LIVE = { pulses: [], scan: null, scanPending: false, lastScanAt: -1e9, lastPull: 0, lastFx: 0, hot: [] };
const knownEventIds = new Set();
let plottedRows = [];
let lastInteractAt = -1e9;
let _liveColors = null;
const liveColors = () => _liveColors || (_liveColors = {
  lime: SapexAnim.brand('--brand-lime', '#E4E932'),
  purple: SapexAnim.brand('--brand-purple', '#371777'),
  ink: SapexAnim.brand('--surface-0', '#0C0715'),
  white: SapexAnim.brand('--brand-white', '#FFFFFF'),
});
const emptyFC = () => ({ type: 'FeatureCollection', features: [] });
const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const wrapLng = (x) => ((x + 540) % 360) - 180;

function eventsGeojson(data) {
  return {
    type: 'FeatureCollection',
    features: (data || []).filter(r => r.latitude && r.longitude).map(r => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r.longitude, r.latitude] },
      properties: r,
    })),
  };
}

function ensureLiveLayers() {
  if (map.getSource('live-fx')) return;
  const c = liveColors();
  map.addSource('live-trails', { type: 'geojson', data: emptyFC(), lineMetrics: true });
  map.addSource('live-fx', { type: 'geojson', data: emptyFC() });     // changes every frame: glow + pulses (35 points at most)
  map.addSource('live-hot', { type: 'geojson', data: emptyFC() });    // static: hotspot labels, so symbols are not re-placed every frame
  map.addSource('live-scan', { type: 'geojson', data: emptyFC() });

  map.addLayer({ id: 'live-trails', type: 'line', source: 'live-trails', layout: { 'line-cap': 'round' },
    paint: { 'line-width': 1.2, 'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, SapexAnim.rgba(c.lime, 0.5), 1, SapexAnim.rgba(c.lime, 0)] } });
  map.addLayer({ id: 'live-hot-glow', type: 'circle', source: 'live-fx', filter: ['==', ['get', 'kind'], 'glow'],
    paint: { 'circle-radius': ['+', 14, ['*', 14, ['get', 'b']]], 'circle-color': c.lime, 'circle-opacity': ['+', 0.08, ['*', 0.16, ['get', 'b']]], 'circle-blur': 1, 'circle-pitch-alignment': 'viewport' } });
  map.addLayer({ id: 'live-hot-core', type: 'circle', source: 'live-fx', filter: ['==', ['get', 'kind'], 'glow'],
    paint: { 'circle-radius': 3.5, 'circle-color': c.purple, 'circle-stroke-color': c.lime, 'circle-stroke-width': 1.5, 'circle-pitch-alignment': 'viewport' } });
  map.addLayer({ id: 'live-pulse', type: 'circle', source: 'live-fx', filter: ['==', ['get', 'kind'], 'pulse'],
    paint: { 'circle-radius': ['interpolate', ['linear'], ['get', 'p'], 0, 4, 1, 44], 'circle-color': c.lime, 'circle-opacity': 0,
      'circle-stroke-color': c.lime, 'circle-stroke-width': ['interpolate', ['linear'], ['get', 'p'], 0, 2.5, 1, 0.6],
      'circle-stroke-opacity': ['-', 1, ['get', 'p']], 'circle-pitch-alignment': 'viewport' } });
  map.addLayer({ id: 'live-scan-glow', type: 'line', source: 'live-scan',
    paint: { 'line-color': c.lime, 'line-width': 10, 'line-blur': 6, 'line-opacity': ['*', 0.35, ['get', 'a']] } });
  map.addLayer({ id: 'live-scan-line', type: 'line', source: 'live-scan',
    paint: { 'line-color': c.lime, 'line-width': 1.5, 'line-opacity': ['*', 0.8, ['get', 'a']] } });
  map.addLayer({ id: 'live-hot-labels', type: 'symbol', source: 'live-hot', minzoom: 2,   // hidden below zoom 2
    layout: { 'text-field': ['get', 'label'], 'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'], 'text-size': 12,
      'text-anchor': 'bottom', 'text-offset': [0, -1.4], 'text-line-height': 1.25, 'text-allow-overlap': true, 'text-ignore-placement': true },
    paint: { 'text-color': c.white, 'text-halo-color': c.ink, 'text-halo-width': 1.8 } });
}

/** Rebuilds the hotspots (top 5 countries from war_country_stats) and the 24-hour trails. Called after data loads, not every frame. */
function updateLive() {
  if (!map || !map.getSource('live-hot')) return;

  // Hotspots: ranked by intensity_score from the country stats; each sits at the median position of that country's plotted events.
  const stats = countryStatsCache
    .filter(s => toNum(s.intensity_score) > 0 && toNum(s.events_30d) > 0)
    .sort((a, b) => toNum(b.intensity_score) - toNum(a.intensity_score))
    .slice(0, 5);
  const byIso = new Map();
  plottedRows.forEach(r => {
    const iso = String(r.country_iso3 || '').toUpperCase();
    const lng = toNum(r.longitude), lat = toNum(r.latitude);
    if (!iso || lng == null || lat == null) return;
    if (!byIso.has(iso)) byIso.set(iso, []);
    byIso.get(iso).push([lng, lat]);
  });
  LIVE.hot = [];
  const labels = [];
  stats.forEach(s => {
    const pts = byIso.get(s.country_iso3);
    if (!pts || !pts.length) return;
    const c = [median(pts.map(p => p[0])), median(pts.map(p => p[1]))];
    const r30 = (toNum(s.events_30d) || 0) / 30, r7 = (toNum(s.events_7d) || 0) / 7;
    const ratio = r30 > 0 ? r7 / r30 : 1;
    const arrow = ratio > 1.2 ? '↑' : ratio < 0.8 ? '↓' : '→';   // momentum: last 7 days vs the 30-day pace
    LIVE.hot.push(c);
    labels.push({ type: 'Feature', geometry: { type: 'Point', coordinates: c },
      properties: { label: (s.country_name || s.country_iso3) + '\n' + Number(s.events_30d).toLocaleString() + ' events ' + arrow } });
  });
  map.getSource('live-hot').setData({ type: 'FeatureCollection', features: labels });

  // Trails: events dated today or yesterday (the data carries dates, not times), each a faint line toward the centre of that country's recent events.
  const since = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const groups = new Map();
  plottedRows.forEach(r => {
    const lng = toNum(r.longitude), lat = toNum(r.latitude);
    if (!r.event_date || String(r.event_date).slice(0, 10) < since || lng == null || lat == null) return;
    const k = r.country_iso3 || r.country_name || 'x';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push([lng, lat]);
  });
  const lines = [];
  groups.forEach(pts => {
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    pts.slice(0, 25).forEach(p => {
      if (Math.abs(p[0] - cx) + Math.abs(p[1] - cy) < 0.1 || lines.length >= 200) return;
      lines.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [p, [cx, cy]] }, properties: {} });
    });
  });
  map.getSource('live-trails').setData({ type: 'FeatureCollection', features: lines });

  if (SapexAnim.reduced()) paintStaticFx();
}

/** Starts a pulse at each new event, strongest first, never more than 30 rings at once. */
function firePulses(rows) {
  if (SapexAnim.reduced() || !rows.length) return;
  const room = PULSE_MAX - LIVE.pulses.length;
  if (room <= 0) return;
  const now = performance.now();
  rows.filter(r => toNum(r.longitude) != null && toNum(r.latitude) != null)
    .sort((a, b) => (toNum(b.fatalities_est) || 0) - (toNum(a.fatalities_est) || 0))
    .slice(0, room)
    .forEach(r => LIVE.pulses.push({ c: [Number(r.longitude), Number(r.latitude)], t0: now }));
}

/** One frame of the shared loop: breathing glow + pulse rings in one tiny source, then the sweep. */
function fxTick(now) {
  const src = map.getSource('live-fx');
  if (!src) return;
  scanStep(now);
  const busy = LIVE.pulses.length || LIVE.scan;
  if (!busy && now - LIVE.lastFx < 90) return;   // breathing alone is slow: about 11 updates a second is plenty
  LIVE.lastFx = now;
  const b = SapexAnim.breath(now, 4000);
  const feats = LIVE.hot.map(c => ({ type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties: { kind: 'glow', b } }));
  LIVE.pulses = LIVE.pulses.filter(p => now - p.t0 < PULSE_MS);
  LIVE.pulses.forEach(p => feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: p.c }, properties: { kind: 'pulse', p: (now - p.t0) / PULSE_MS } }));
  src.setData({ type: 'FeatureCollection', features: feats });
}

/** Reduced motion: the glow is drawn once, mid-breath, and never changes. */
function paintStaticFx() {
  const src = map && map.getSource('live-fx');
  if (src) src.setData({ type: 'FeatureCollection', features: LIVE.hot.map(c => ({ type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties: { kind: 'glow', b: 0.5 } })) });
}

/** The sweep: a thin meridian crosses the visible globe in 3.2 s. Starts only when a fresh pull asked for it AND the map is idle. */
function scanStep(now) {
  const src = map.getSource('live-scan');
  if (!src) return;
  if (!LIVE.scan) {
    if (!LIVE.scanPending || SapexAnim.reduced()) return;
    if (now - lastInteractAt < 5000 || map.isMoving() || now - LIVE.lastScanAt < SCAN_GAP_MS) return;
    LIVE.scanPending = false;
    LIVE.lastScanAt = now;
    LIVE.scan = { t0: now, lng: map.getCenter().lng };
  }
  const t = (now - LIVE.scan.t0) / SCAN_MS;
  if (t >= 1) { LIVE.scan = null; src.setData(emptyFC()); return; }
  const lng = wrapLng(LIVE.scan.lng - 95 + 190 * t);
  const coords = [];
  for (let lat = -80; lat <= 80; lat += 10) coords.push([lng, lat]);
  src.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: { a: Math.sin(Math.PI * t) } }] });
}

/**
 * Cheap refresh every 5 minutes (only while the tab is visible), then one pull when the tab returns.
 * Snapshot file if it exists; otherwise ask Supabase for just the ids of the last two days and fetch full rows only for ids not seen yet.
 * The events source is touched only when something is new.
 */
async function pullLive() {
  if (document.hidden || !map || !map.getSource('events')) return;
  let fresh = [];
  try {
    const days = currentRangeDays;
    const snap = await warSnap(days > 0 && days <= 7 ? 'war_events_7d' : days > 0 && days <= 30 ? 'war_events_30d' : 'war_events_90d');
    if (snap) {
      const rows = snap.items.map(expandWarEvent);
      fresh = rows.filter(r => !knownEventIds.has(r.id));
      if (fresh.length) plottedRows = rows;
    } else if (supa) {
      const since = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const idRes = await supa.from('war_events').select('id').gte('event_date', since).order('event_date', { ascending: false }).limit(500);
      if (idRes.error) throw idRes.error;
      const newIds = (idRes.data || []).map(r => r.id).filter(id => !knownEventIds.has(id)).slice(0, 60);
      if (newIds.length) {
        const res = await supa.from('war_events')
          .select('id,source,event_type,event_date,country_iso3,country_name,location_name,actor1,actor2,fatalities_est,fatalities_confidence,latitude,longitude,source_url,method_category,method_icon')
          .in('id', newIds);
        if (res.error) throw res.error;
        fresh = res.data || [];
        plottedRows = fresh.concat(plottedRows);
      }
    } else return;
  } catch (e) { console.warn('[conflict-map] live refresh failed:', e); return; }
  LIVE.lastPull = Date.now();
  if (fresh.length) {
    fresh.forEach(r => knownEventIds.add(r.id));
    if (scrubOnPull()) {   // stage 13: true when the live view is showing; a scrubbed day or a replay is left alone
      renderFeed(plottedRows);
      updateLive();
      firePulses(fresh);
    }
  }
  LIVE.scanPending = true;   // a fresh pull earns a sweep (at most one every 3 minutes, and only when idle)
}

function chipTick() {
  const word = $('live-word'), secs = $('live-secs'), chip = $('live-chip');
  if (!secs || !chip) return;
  if (!LIVE.lastPull) { word.textContent = 'LIVE'; secs.textContent = ''; return; }
  const s = Math.max(0, Math.floor((Date.now() - LIVE.lastPull) / 1000));
  word.textContent = 'LIVE · ';
  secs.textContent = s < 60 ? s + 's' : Math.floor(s / 60) + ' min';
  chip.dataset.stale = s > 900 ? '1' : '0';   // amber after 15 minutes without a pull
}

function applyMotionPrefs() {
  const r = SapexAnim.reduced();
  if (map.getLayer('live-trails')) map.setLayoutProperty('live-trails', 'visibility', r ? 'none' : 'visible');
  if (r) {
    LIVE.pulses = []; LIVE.scan = null; LIVE.scanPending = false;
    SapexAnim.loop.remove('fx');
    SapexAnim.loop.remove('spin');
    if (map.getSource('live-scan')) map.getSource('live-scan').setData(emptyFC());
    paintStaticFx();
  } else {
    SapexAnim.loop.add('fx', fxTick, 33);
    if (rotating) spinGlobe();
  }
}

function initLive() {
  ensureLiveLayers();
  const right = document.querySelector('.topbar-right');
  if (right && !$('live-chip')) {
    const chip = document.createElement('span');
    chip.id = 'live-chip';
    chip.className = 'live-chip';
    chip.title = 'Time since the last data pull';
    chip.innerHTML = '<span class="live-dot"></span><span class="live-word" id="live-word">LIVE</span><span id="live-secs"></span>';
    right.insertBefore(chip, right.firstChild);
  }
  SapexAnim.loop.add('chip', chipTick, 1000);
  applyMotionPrefs();
  SapexAnim.onReducedChange(applyMotionPrefs);
  setInterval(() => { if (!document.hidden) pullLive(); }, POLL_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - LIVE.lastPull > 60000) pullLive(); });
}

/* ======================================================================
   Go
   ====================================================================== */
boot();

/* ======================================================================
   Stage 13: time scrubber and "since your last visit".
   Everything here works on rows that are ALREADY loaded (plottedRows). Dragging, playing and replaying never fetch.
     - map points   cumulative: every event dated on or before the chosen day (the last position equals the live map)
     - country shading and the stat cards   the 30 days that end on the chosen day, counted from the loaded rows
       (the same 30-day idea as the official numbers). At the last position the official figures come back.
   The scrubber is a draggable slider (pointer + keyboard), updated at most once per animation frame.
   ====================================================================== */
const SCRUB = {
  rows: [], feats: [], endAt: [], featEnd: [], agg: [], start: 0, days: 1,
  idx: 1, live: true, shown: 'live', applied: -1, replay: false,
  playing: false, speed: 1, raf: 0, rafApply: 0, feedT: 0, el: null, _st: null, _stIdx: -1,
};
const SCRUB_DAY_MS = 600;                 // 1x = one day every 0.6 s
const SCRUB_FX_LAYERS = ['live-trails', 'live-hot-glow', 'live-hot-core', 'live-hot-labels', 'live-pulse'];

function dayOf(s) { const t = Date.parse(String(s || '').slice(0, 10)); return Number.isFinite(t) ? Math.floor(t / 86400000) : null; }
function fmtDay(d) { return new Date(d * 86400000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }); }

/** Sorts the rows by day once and builds the per-day tables, so moving the slider is only slicing and small sums. */
function scrubBuild(list, replay) {
  const rows = [];
  (list || []).forEach(r => { const d = dayOf(r.event_date); if (d != null) rows.push({ r, d }); });
  rows.sort((a, b) => a.d - b.d);
  const today = Math.floor(Date.now() / 86400000);
  let start;
  if (replay) start = rows.length ? rows[0].d : today - 1;
  else if (currentRangeDays > 0) start = today - currentRangeDays;
  else start = rows.length ? Math.max(rows[0].d, today - 90) : today - 90;
  const days = Math.max(1, today - start);
  const endAt = new Array(days + 1), featEnd = new Array(days + 1), agg = new Array(days + 1).fill(null), feats = [];
  let p = 0;
  for (let i = 0; i <= days; i++) {
    while (p < rows.length && (i === days || rows[p].d - start <= i)) {
      const { r, d } = rows[p++];
      if (r.latitude && r.longitude) feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [r.longitude, r.latitude] }, properties: r });
      const k = Math.min(days, Math.max(0, d - start));
      const a = agg[k] || (agg[k] = { c: new Map(), n: 0, fat: 0, fk: false });
      const iso = String(r.country_iso3 || '').trim().toUpperCase();
      if (/^[A-Z]{3}$/.test(iso)) a.c.set(iso, (a.c.get(iso) || 0) + 1);
      a.n++;
      if (r.source === 'ACLED' && toNum(r.fatalities_est) != null) { a.fat += toNum(r.fatalities_est); a.fk = true; }
    }
    endAt[i] = p; featEnd[i] = feats.length;
  }
  Object.assign(SCRUB, { rows, feats, endAt, featEnd, agg, start, days, applied: -1, _st: null, _stIdx: -1 });
}

/** The 30 days that end on day index i: event count, countries with 5+ events, ACLED fatalities and per-country counts. */
function scrubStats(i) {
  if (SCRUB._stIdx === i && SCRUB._st) return SCRUB._st;
  const tot = new Map(); let n = 0, fat = 0, fk = false;
  for (let j = Math.max(0, i - 29); j <= i; j++) {
    const a = SCRUB.agg[j];
    if (!a) continue;
    n += a.n;
    if (a.fk) { fat += a.fat; fk = true; }
    a.c.forEach((v, iso) => tot.set(iso, (tot.get(iso) || 0) + v));
  }
  let max = 0, active = 0;
  tot.forEach(v => { if (v > max) max = v; if (v >= ACTIVE_ZONE_MIN_EVENTS_30D) active++; });
  SCRUB._st = { n, fat: fk ? fat : null, active, tot, max }; SCRUB._stIdx = i;
  return SCRUB._st;
}

function scrubPaintChoropleth(st) {
  if (!map || !map.getLayer('country-fill')) return;
  const pairs = [];
  st.tot.forEach((v, iso) => pairs.push(iso, intensityColor(st.max > 0 ? 100 * v / st.max : 0)));
  map.setPaintProperty('country-fill', 'fill-color', pairs.length ? ['match', ['get', 'iso_3166_1_alpha_3'], ...pairs, 'rgba(0,0,0,0)'] : 'rgba(0,0,0,0)');
}

function scrubWriteStats(st) {
  const a = $('stat-active'), e = $('stat-events'), f = $('stat-fatalities');
  if (a) a.textContent = st.active.toLocaleString();
  if (e) e.textContent = st.n.toLocaleString();
  if (f) f.textContent = st.fat != null ? '~' + Math.round(st.fat).toLocaleString() : 'No ACLED feed';
}

/** Pulses, trails and hotspot labels describe "now", so they are hidden while looking at another day. */
function scrubFx(hide) {
  if (!map) return;
  setLayerGroupVisible(SCRUB_FX_LAYERS, !hide);
  if (!hide && SapexAnim.reduced()) setLayerGroupVisible(['live-trails'], false);
}

/** Back to the real live view: official country shading and stat cards, every plotted event. */
function scrubLiveLook() {
  SCRUB.shown = 'live';
  const src = map && map.getSource('events');
  if (src) src.setData(eventsGeojson(plottedRows));
  if (map && map.getLayer('country-fill')) paintCountryChoropleth();
  renderStats();
  renderFeed(plottedRows);
  scrubFx(false);
  updateLive();
}

function scrubApply() {
  const src = map && map.getSource('events');
  if (!src) return;
  if (SCRUB.live) { if (SCRUB.shown !== 'live') scrubLiveLook(); return; }
  const i = SCRUB.idx;
  if (SCRUB.shown === 'scrub' && SCRUB.applied === i) return;
  SCRUB.shown = 'scrub'; SCRUB.applied = i;
  src.setData({ type: 'FeatureCollection', features: SCRUB.feats.slice(0, SCRUB.featEnd[i]) });
  const st = scrubStats(i);
  scrubPaintChoropleth(st);
  scrubWriteStats(st);
  scrubFx(true);
  clearTimeout(SCRUB.feedT);   // the feed is rebuilt at most about 8 times a second while dragging
  SCRUB.feedT = setTimeout(() => { if (SCRUB.shown === 'scrub') renderFeed(SCRUB.rows.slice(0, SCRUB.endAt[SCRUB.idx]).map(o => o.r)); }, 120);
}

function scrubSet(idx) {
  SCRUB.idx = Math.max(0, Math.min(SCRUB.days, Math.round(idx)));
  SCRUB.live = !SCRUB.replay && SCRUB.idx === SCRUB.days;
  scrubUi();
  if (!SCRUB.rafApply) SCRUB.rafApply = requestAnimationFrame(() => { SCRUB.rafApply = 0; scrubApply(); });
}

function scrubUi() {
  const e = SCRUB.el;
  if (!e) return;
  const p = SCRUB.days ? SCRUB.idx / SCRUB.days : 1;
  e.thumb.style.transform = 'translate(' + (p * e.track.clientWidth) + 'px,-50%)';
  e.fill.style.transform = 'scaleX(' + p + ')';
  const at = SCRUB.start + SCRUB.idx;
  e.track.setAttribute('aria-valuemax', String(SCRUB.days));
  e.track.setAttribute('aria-valuenow', String(SCRUB.idx));
  e.track.setAttribute('aria-valuetext', SCRUB.live ? 'Now' : fmtDay(at));
  e.from.textContent = SCRUB.replay || !(currentRangeDays > 0) ? fmtDay(SCRUB.start) : currentRangeDays + ' days ago';
  e.at.textContent = SCRUB.live ? '' : fmtDay(at);
  e.now.textContent = SCRUB.replay ? 'Exit replay' : (SCRUB.live ? 'Now' : 'Back to now');
  e.now.classList.toggle('on', SCRUB.replay || !SCRUB.live);
  const reduced = SapexAnim.reduced();
  e.play.disabled = reduced;
  e.play.title = reduced ? 'Replay animation is off because your device asks for reduced motion. Drag the slider instead.' : (SCRUB.playing ? 'Pause' : 'Play');
  e.play.setAttribute('aria-label', SCRUB.playing ? 'Pause replay' : 'Play replay');
  e.play.firstElementChild.className = 'fa-solid ' + (SCRUB.playing ? 'fa-pause' : 'fa-play');
  e.speed.textContent = SCRUB.speed + 'x';
}

function scrubPlay(on) {
  if (on && SapexAnim.reduced()) on = false;
  cancelAnimationFrame(SCRUB.raf);
  SCRUB.playing = !!on;
  if (on) {
    if (SCRUB.idx >= SCRUB.days) scrubSet(0);
    let last = performance.now(), acc = 0;
    const step = (t) => {
      if (!SCRUB.playing) return;
      acc += Math.min(250, t - last); last = t;   // a hidden tab must not fast-forward the replay
      const per = SCRUB_DAY_MS / SCRUB.speed;
      while (acc >= per && SCRUB.playing) {
        acc -= per;
        if (SCRUB.idx >= SCRUB.days) { SCRUB.playing = false; break; }
        scrubSet(SCRUB.idx + 1);
        if (SCRUB.idx >= SCRUB.days) SCRUB.playing = false;
      }
      if (SCRUB.playing) SCRUB.raf = requestAnimationFrame(step); else scrubUi();
    };
    SCRUB.raf = requestAnimationFrame(step);
  }
  scrubUi();
}

/** Called by loadEvents after a (re)load: rebuild from the new rows and return to the live view. */
function scrubOnData() {
  const wasScrubbed = SCRUB.shown === 'scrub';
  scrubPlay(false);
  SCRUB.replay = false;
  scrubBuild(plottedRows, false);
  SCRUB.idx = SCRUB.days; SCRUB.live = true;
  if (wasScrubbed) {   // loadEvents redraws the points and the feed itself
    SCRUB.shown = 'live';
    if (map && map.getLayer('country-fill')) paintCountryChoropleth();
    renderStats(); scrubFx(false);
  }
  scrubUi(); visitRender();
}

/** Called by pullLive when new rows arrived. Returns true when the live view is showing (the caller then pulses and refreshes the feed). */
function scrubOnPull() {
  if (SCRUB.replay) return false;                    // a replay is a frozen set of events
  const keep = SCRUB.idx, wasLive = SCRUB.live;
  scrubBuild(plottedRows, false);
  if (wasLive) {
    SCRUB.idx = SCRUB.days; SCRUB.live = true;
    const src = map.getSource('events');
    if (src) src.setData(eventsGeojson(plottedRows));
    scrubUi();
    return true;
  }
  SCRUB.idx = Math.min(keep, SCRUB.days); SCRUB.live = false;
  scrubApply(); scrubUi();
  return false;
}

function scrubExitReplay() {
  scrubPlay(false);
  SCRUB.replay = false;
  scrubBuild(plottedRows, false);
  SCRUB.idx = SCRUB.days; SCRUB.live = true;
  scrubApply(); scrubUi(); visitRender();
}

function initScrubber() {
  const track = $('scrub-track');
  if (!track || SCRUB.el) return;
  SCRUB.el = { track, thumb: $('scrub-thumb'), fill: $('scrub-fill'), play: $('scrub-play'), speed: $('scrub-speed'), from: $('scrub-from'), at: $('scrub-at'), now: $('scrub-now') };
  const fromPointer = (ev) => {
    const b = track.getBoundingClientRect();
    scrubSet(Math.min(1, Math.max(0, (ev.clientX - b.left) / b.width)) * SCRUB.days);
  };
  let dragging = false;
  track.addEventListener('pointerdown', (ev) => {
    if (ev.button > 0) return;
    scrubPlay(false); dragging = true;
    try { track.setPointerCapture(ev.pointerId); } catch (e) {}
    fromPointer(ev);
  });
  track.addEventListener('pointermove', (ev) => { if (dragging) fromPointer(ev); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(n => track.addEventListener(n, () => { dragging = false; }));
  track.addEventListener('keydown', (ev) => {
    const k = ev.key;
    let to;
    if (k === 'ArrowLeft' || k === 'ArrowDown') to = SCRUB.idx - 1;
    else if (k === 'ArrowRight' || k === 'ArrowUp') to = SCRUB.idx + 1;
    else if (k === 'PageDown') to = SCRUB.idx - 7;
    else if (k === 'PageUp') to = SCRUB.idx + 7;
    else if (k === 'Home') to = 0;
    else if (k === 'End') to = SCRUB.days;
    else return;
    ev.preventDefault(); scrubPlay(false); scrubSet(to);
  });
  SCRUB.el.play.addEventListener('click', () => scrubPlay(!SCRUB.playing));
  SCRUB.el.speed.addEventListener('click', () => { SCRUB.speed = SCRUB.speed === 1 ? 2 : SCRUB.speed === 2 ? 4 : 1; scrubUi(); });
  SCRUB.el.now.addEventListener('click', () => {
    if (SCRUB.replay) { scrubExitReplay(); return; }
    scrubPlay(false); scrubSet(SCRUB.days);
  });
  window.addEventListener('resize', () => { requestAnimationFrame(scrubUi); });
  if (SapexAnim.onReducedChange) SapexAnim.onReducedChange(() => { if (SapexAnim.reduced()) scrubPlay(false); scrubUi(); });
  scrubBuild(plottedRows, false);
  SCRUB.idx = SCRUB.days;
  scrubUi();
}

/* ----------------------------------------------------------------------
   "Since your last visit"
   last_seen lives in this browser only (localStorage, every call in try/catch). It holds the time of the previous visit and the
   ids of the events dated in the 3 days before it, so a new event is one dated on or after that window whose id was not seen then.
   It is written when the tab is hidden or closed, and only if the page was open for 15 seconds or more.
   The count uses the 90-day event rows (the same snapshot the map already caches), so it does not depend on the range pill.
   Not stored on the profile: the account stage has no settings store to hold it (see the report).
   ---------------------------------------------------------------------- */
const VISIT_KEY = 'sapex_cm_last_seen_v1';
const VISIT = { base: null, rows: null, fresh: [], since: Date.now(), visMs: 0, hooked: false };

function visitLabel(t) {
  const d = new Date(t), now = new Date();
  const days = Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  if (days <= 0) return 'earlier today';
  if (days === 1) return 'yesterday';
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function visitSave() {
  if (VISIT.visMs < 15000) return;
  try {
    const floor = Math.floor(Date.now() / 86400000) - 3, seen = new Set(), ids = [];
    [VISIT.rows || [], plottedRows].forEach(list => list.forEach(r => {
      const d = dayOf(r.event_date);
      if (d != null && d >= floor && !seen.has(r.id) && ids.length < 3000) { seen.add(r.id); ids.push(r.id); }
    }));
    localStorage.setItem(VISIT_KEY, JSON.stringify({ t: Date.now(), ids }));
  } catch (e) { /* storage blocked: the chip just does not appear next time */ }
}

function visitRender() {
  const b = VISIT.base, n = VISIT.fresh.length;
  document.querySelectorAll('.feed-list').forEach(list => {
    let slot = list.previousElementSibling;
    if (!slot || !slot.classList.contains('visit-slot')) {
      slot = document.createElement('div');
      slot.className = 'visit-slot';
      list.parentNode.insertBefore(slot, list);
    }
    slot.textContent = '';
    if (!b) return;   // first visit on this browser: nothing to compare with yet
    const txt = document.createElement('span');
    txt.className = 'visit-text';
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'visit-btn';
    if (SCRUB.replay) {
      txt.textContent = 'Replaying ' + n.toLocaleString() + ' new event' + (n === 1 ? '' : 's');
      btn.textContent = 'Exit replay'; btn.dataset.visit = 'exit';
      slot.append(txt, btn);
    } else if (n > 0) {
      const strong = document.createElement('b');
      strong.textContent = n.toLocaleString();
      txt.append(strong, ' new event' + (n === 1 ? '' : 's') + ' since ' + visitLabel(b.t));
      btn.textContent = 'Replay what changed'; btn.dataset.visit = 'replay';
      slot.append(txt, btn);
    } else {
      txt.textContent = 'No new events since ' + visitLabel(b.t);
      slot.append(txt);
    }
  });
  document.querySelectorAll('#feed-tab').forEach(el => { if (b && n > 0) el.dataset.new = n > 99 ? '99+' : String(n); else delete el.dataset.new; });
}

function visitReplay() {
  if (!VISIT.fresh.length || !map || !map.getSource('events')) return;
  scrubPlay(false);
  SCRUB.replay = true;
  scrubBuild(VISIT.fresh, true);
  SCRUB.shown = 'live';   // forces the map to switch to the filtered view
  if (isPhone()) setSheetState('min');   // the sheet would cover the replay
  if (SapexAnim.reduced()) { scrubSet(SCRUB.days); }   // no animation: show everything that changed at once
  else { if (SCRUB.speed < 2) SCRUB.speed = 2; scrubSet(0); scrubPlay(true); }
  visitRender();
}

async function visitInit() {
  try {
    try { const o = JSON.parse(localStorage.getItem(VISIT_KEY) || 'null'); VISIT.base = o && Number.isFinite(o.t) ? o : null; } catch (e) { VISIT.base = null; }
    if (!VISIT.hooked) {
      VISIT.hooked = true;
      const hide = () => { if (VISIT.since) { VISIT.visMs += Date.now() - VISIT.since; VISIT.since = 0; } visitSave(); };
      document.addEventListener('visibilitychange', () => { if (document.hidden) hide(); else VISIT.since = Date.now(); });
      window.addEventListener('pagehide', hide);
      document.addEventListener('click', (e) => {
        const b = e.target.closest('[data-visit]');
        if (!b) return;
        if (b.dataset.visit === 'replay') visitReplay(); else scrubExitReplay();
      });
    }
    const rows = await getEventRows(90);
    VISIT.rows = Array.isArray(rows) ? rows : [];
    if (VISIT.base) {
      const seen = new Set(VISIT.base.ids || []), floor = dayOf(new Date(VISIT.base.t).toISOString()) - 3;
      VISIT.fresh = VISIT.rows.filter(r => { const d = dayOf(r.event_date); return d != null && d >= floor && !seen.has(r.id); });
    }
    visitRender();
  } catch (e) { console.warn('[conflict-map] last-visit chip skipped:', e); }
}
