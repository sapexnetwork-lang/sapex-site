// conflict-map-app.js
// Requires: mapbox-gl.js, @supabase/supabase-js (CDN, loaded in the HTML),
// and conflict-map-animations.js (loaded just before this file).

let map;
let supa;
let currentRangeDays = 30;
let countryStatsCache = [];

const $ = (id) => document.getElementById(id);

/* ======================================================================
   Boot — fetch config from the serverless endpoint, THEN build the map.
   Nothing here is hardcoded; see api/map-config.js.
   ====================================================================== */
async function boot() {
  let config;
  try {
    const res = await fetch('/api/map-config');
    if (!res.ok) throw new Error('map-config endpoint returned ' + res.status);
    config = await res.json();
  } catch (err) {
    console.error('Failed to load map config:', err);
    $('loading-text').textContent = 'Could not load map configuration — check /api/map-config.';
    return;
  }

  mapboxgl.accessToken = config.mapboxToken;
  supa = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

  initMap();
  initControls();
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
    SapexAnim.showLoading($('loading'), 'Updating range...');
    await loadEvents(currentRangeDays);
    SapexAnim.hideLoading($('loading'));
  });
  // position the sliding highlight behind the default-active pill once laid out
  requestAnimationFrame(() => SapexAnim.slidePillIndicator(pillsContainer, pillsContainer.querySelector('.range-pill.active')));

  $('panel-close').addEventListener('click', () => {
    $('side-panel').classList.remove('open');
  });

  $('info-btn').addEventListener('click', showMethodologyPanel);
}

/* ======================================================================
   Data loading
   ====================================================================== */
async function loadAll() {
  SapexAnim.showLoading($('loading'), 'Loading country intelligence...');
  await Promise.all([loadCountryStats(), loadMapMeta()]);
  SapexAnim.showLoading($('loading'), 'Plotting conflict events...');
  await loadEvents(currentRangeDays);
  SapexAnim.hideLoading($('loading'));
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

async function loadEvents(days) {
  let query = supa.from('war_events')
    .select('id,source,event_type,event_date,country_iso3,country_name,location_name,actor1,actor2,fatalities_est,fatalities_confidence,latitude,longitude,source_url')
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

  // fade in on first paint (layers were created with a real opacity above,
  // so drop to 0 then animate up — same helper used for later refreshes)
  SapexAnim.fadeInLayer(map, 'event-points', 'circle-opacity', 0.8, 30);
  SapexAnim.fadeInLayer(map, 'clusters', 'circle-opacity', 0.75, 30);

  map.on('click', 'clusters', (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
    const clusterId = features[0].properties.cluster_id;
    map.getSource('events').getClusterExpansionZoom(clusterId, (err, zoom) => {
      if (err) return;
      map.easeTo({ center: features[0].geometry.coordinates, zoom });
    });
  });

  map.on('click', 'event-points', (e) => {
    const f = e.features[0];
    const p = f.properties;
    const fatalHtml = p.fatalities_est
      ? `<div class="popup-fatal">~${p.fatalities_est} fatalities (${p.fatalities_confidence})</div>` : '';
    const html = `
      <div class="popup-type">${p.source} · ${p.event_type || 'Event'}</div>
      <div class="popup-loc">${p.location_name || p.country_name}</div>
      <div class="popup-meta">${p.event_date} · ${[p.actor1, p.actor2].filter(Boolean).join(' vs ') || 'Actor unclear'}</div>
      ${fatalHtml}
      ${p.source_url ? `<div class="popup-src"><a href="${p.source_url}" target="_blank" rel="noopener">View source →</a></div>` : ''}
    `;
    new mapboxgl.Popup({ closeButton: true, maxWidth: '260px' })
      .setLngLat(f.geometry.coordinates).setHTML(html).addTo(map);
  });

  ['clusters', 'event-points'].forEach(layer => {
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

function showMethodologyPanel() {
  const panel = $('side-panel');
  $('panel-content').innerHTML = `
    <div class="panel-eyebrow">Methodology</div>
    <div class="panel-title" style="font-size:16px;">How to read this map</div>
    <p class="empty-note" style="margin-top:10px;">
      <strong>Cyan markers</strong> are conflict-related event reports pulled from GDELT's global news-monitoring feed every 3 hours — they show where activity is happening, not a verified death toll.<br><br>
      <strong>Red markers</strong> include a fatality estimate reported by ACLED, a conflict-monitoring NGO. These are third-party estimates, not official figures, and are often disputed by parties to a conflict.<br><br>
      <strong>Country shading</strong> reflects 30-day event intensity relative to the most active country, not a judgment about the legitimacy or scale of any conflict.<br><br>
      <strong>Wounded counts, property-damage values, vehicles destroyed, and territory-control status</strong> are not available from any free automated global source, so SaPEX does not fabricate them. Where shown, they come from the analyst-curated Verified Intel layer, each with a cited source.
    </p>
  `;
  panel.classList.add('open');
}

/* ======================================================================
   Go
   ====================================================================== */
boot();