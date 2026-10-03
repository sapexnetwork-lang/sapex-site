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

  // Maintenance badge — same admin toggle (site_settings.maintenance_mode) as app.html
  checkMaintenanceMode();
  setInterval(checkMaintenanceMode, 30000);
}

async function checkMaintenanceMode() {
  const badge = $('site-maintenance-badge');
  if (!supa || !badge) return;
  try {
    const { data } = await supa.from('site_settings').select('value').eq('key', 'maintenance_mode').maybeSingle();
    badge.classList.toggle('show', !!data?.value?.is_active);
  } catch (e) { /* non-fatal */ }
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

  map.on('style.load', () => {
    map.setFog({
      'color': 'rgb(15, 20, 35)',
      'high-color': 'rgb(20, 30, 60)',
      'horizon-blend': 0.04,
      'space-color': 'rgb(5, 7, 14)',
      'star-intensity': 0.25,
    });
    try {
      map.setPaintProperty('background', 'background-color', '#0a0e1a');
      map.setPaintProperty('water', 'fill-color', '#0d1526');
    } catch (e) { /* layer names can vary by style version — non-fatal */ }
  });

  map.on('load', () => {
    map.flyTo({ center: [20, 20], zoom: 1.6, duration: 2600, essential: true });
    loadAll();
  });
}

/* ======================================================================
   Auto-rotate globe
   ====================================================================== */
let rotating = false;
let userInteracting = false;
const SECONDS_PER_REV = 180;

function spinGlobe() {
  if (!rotating || userInteracting) return;
  const zoom = map.getZoom();
  if (zoom < 5) {
    const center = map.getCenter();
    center.lng -= 360 / SECONDS_PER_REV / 30; // ~30fps step
    map.easeTo({ center, duration: 33, easing: (n) => n });
  }
  requestAnimationFrame(spinGlobe);
}

function initControls() {
  $('rotate-btn').addEventListener('click', (e) => {
    rotating = !rotating;
    e.currentTarget.classList.toggle('on', rotating);
    if (rotating) spinGlobe();
  });
  ['mousedown', 'touchstart', 'wheel'].forEach(evt => {
    map.on(evt, () => { userInteracting = true; });
  });
  map.on('moveend', () => { userInteracting = false; });

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
    SapexAnim.showLoading($('loading'), 'Updating range...', 40);
    await loadEvents(currentRangeDays);
    SapexAnim.hideLoading($('loading'));
  });
  // position the sliding highlight behind the default-active pill once laid out
  requestAnimationFrame(() => SapexAnim.slidePillIndicator(pillsContainer, pillsContainer.querySelector('.range-pill.active')));

  $('panel-close').addEventListener('click', () => {
    $('side-panel').classList.remove('open');
  });

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
  await Promise.all([loadCountryStats(), loadMapMeta(), loadWarZones(), loadCasualtyPoints()]);
  SapexAnim.showLoading($('loading'), 'Plotting conflict events...', 80);
  await loadEvents(currentRangeDays);
  reorderMapLayers();
  SapexAnim.hideLoading($('loading'));
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
    'clusters', 'cluster-count', 'event-points', 'event-method-icons',
    'casualty-clusters', 'casualty-cluster-count', 'casualty-points', 'casualty-icons',
  ];
  bottomToTop.forEach(id => { if (map.getLayer(id)) map.moveLayer(id); });
}

async function loadMapMeta() {
  const { data, error } = await supa.from('war_map_meta').select('*').eq('id', 1).single();
  if (error || !data) return;

  SapexAnim.animateCount($('stat-active'), data.active_conflict_countries ?? 0);
  SapexAnim.animateCount($('stat-events'), data.total_events_30d ?? 0);

  const fatalEl = $('stat-fatalities');
  if (data.total_fatalities_est_30d != null) {
    SapexAnim.animateCount(fatalEl, data.total_fatalities_est_30d, { formatter: (n) => '~' + Math.round(n).toLocaleString() });
  } else {
    fatalEl.textContent = 'No ACLED feed';
  }

  if (data.last_bot_run) {
    const d = new Date(data.last_bot_run);
    $('stat-sync').textContent = d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
}

async function loadCountryStats() {
  const { data, error } = await supa.from('war_country_stats').select('*');
  if (error) { console.error(error); return; }
  countryStatsCache = data || [];
  paintCountryChoropleth();
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

function paintWarZones(zones) {
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
    const markerLayers = ['clusters', 'event-points', 'event-method-icons', 'casualty-clusters', 'casualty-points', 'casualty-icons']
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

async function loadEvents(days) {
  let query = supa.from('war_events')
    .select('id,source,event_type,event_date,country_iso3,country_name,location_name,actor1,actor2,fatalities_est,fatalities_confidence,latitude,longitude,source_url,method_category,method_icon')
    .order('event_date', { ascending: false })
    .limit(4000);
  if (days > 0) {
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    query = query.gte('event_date', cutoff);
  }
  const { data, error } = await query;
  if (error) { console.error(error); return; }

  const geojson = {
    type: 'FeatureCollection',
    features: (data || []).filter(r => r.latitude && r.longitude).map(r => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r.longitude, r.latitude] },
      properties: r,
    })),
  };

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
  const matchExpr = ['match', ['get', 'iso_3166_1_alpha_3']];
  countryStatsCache.forEach(c => {
    matchExpr.push(c.country_iso3, intensityColor(c.intensity_score || 0));
  });
  matchExpr.push('rgba(0,0,0,0)'); // default (no data)

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
    const markerLayers = ['clusters', 'event-points', 'event-method-icons', 'war-zones-fill', 'casualty-clusters', 'casualty-points', 'casualty-icons']
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
  panel.classList.add('open');

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
  panel.classList.add('open');
}

function showMethodologyPanel() {
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
  panel.classList.add('open');
}

/* ======================================================================
   Go
   ====================================================================== */
boot();