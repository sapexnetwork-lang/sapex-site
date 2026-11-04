/* ==========================================================================
   SaPEX NEXUS - track-record.js
   Reads the static files the bot publishes (/data/track-*.json) and draws:
     1. the monthly chart (released / success / failed, optional expired)
     2. every batch of 100 closed signals
     3. a browsable history of closed signals
   No libraries, no database calls. If a file is missing the page shows a friendly message.
   ========================================================================== */
(function () {
  'use strict';

  var BASE = (document.documentElement.getAttribute('data-tr-base') || '/data/');
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var NS = 'http://www.w3.org/2000/svg';

  var S = { summary: null, monthly: [], batches: null, recent: null, archIndex: null, arch: {}, shownBatches: 4, archRows: [], archShown: 0 };
  var $ = function (id) { return document.getElementById(id); };
  var fmt = function (n) { return (n === null || n === undefined) ? '-' : Number(n).toLocaleString('en-US'); };
  var pctTxt = function (n) { return (n === null || n === undefined) ? '-' : (Math.round(n * 10) / 10) + '%'; };
  var esc = function (s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  function getJSON(name) {
    return fetch(BASE + name, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(name + ' ' + r.status);
      return r.json();
    });
  }
  function ymd(s) { var p = String(s).split('-'); return { y: +p[0], m: +p[1], d: +p[2] }; }
  function dShort(s) { var o = ymd(s); return o.d + ' ' + MONTHS[o.m - 1]; }
  function dLong(s) { var o = ymd(s); return o.d + ' ' + MONTHS[o.m - 1] + ' ' + o.y; }
  function mLabel(k) { var p = k.split('-'); return MONTHS[+p[1] - 1] + ' ' + p[0]; }
  function px(v) { return v === null || v === undefined ? '-' : Number(v).toLocaleString('en-US', { maximumSignificantDigits: 7 }); }

  /* ------------------------------------------------------------------ header + KPIs */
  function ago(iso) {
    var s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 90) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    return Math.round(s / 86400) + ' days ago';
  }
  function countUp(el, to, suffix, decimals) {
    suffix = suffix || ''; decimals = decimals || 0;
    var render = function (v) { el.textContent = (decimals ? v.toFixed(decimals) : Math.round(v).toLocaleString('en-US')) + suffix; };
    if (reduce || to === null || isNaN(to)) { el.textContent = to === null || isNaN(to) ? '-' : (decimals ? to.toFixed(decimals) : fmt(to)) + suffix; return; }
    var from = parseFloat(el.getAttribute('data-v') || '0') || 0, t0 = performance.now(), dur = 700;
    el.setAttribute('data-v', to);
    (function tick(now) {
      var t = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - t, 3);
      render(from + (to - from) * e);
      if (t < 1) requestAnimationFrame(tick);
    })(t0);
  }
  function renderHeader() {
    var s = S.summary;
    var upd = $('trUpdated');
    if (upd && s && s.generated_at) {
      var stale = (Date.now() - new Date(s.generated_at).getTime()) > 6 * 3600 * 1000;
      upd.textContent = 'Updated ' + ago(s.generated_at);
      upd.title = new Date(s.generated_at).toUTCString();
      upd.parentNode.classList.toggle('is-stale', stale);
    }
    var since = $('trSince');
    if (since && s && s.first_signal) since.textContent = 'Counting since ' + dLong(s.first_signal);
    document.querySelectorAll('[data-rule]').forEach(function (el) {
      var k = el.getAttribute('data-rule');
      if (s && s.rules && s.rules[k] !== undefined) el.textContent = s.rules[k];
    });
    var note = s && s.ordering && s.ordering.note;
    var n1 = $('trOrderNote'), n2 = $('trOrderLimit');
    if (n1) { n1.hidden = !note; n1.textContent = note || ''; }
    if (n2) { n2.hidden = !note; n2.textContent = note || ''; }
  }
  function renderKpis(rows) {
    var t = rows.reduce(function (a, m) { a.released += m.released; a.wins += m.wins; a.losses += m.losses; a.expired += m.expired; return a; }, { released: 0, wins: 0, losses: 0, expired: 0 });
    var closed = t.wins + t.losses, rate = closed ? t.wins * 100 / closed : null;
    var map = { released: t.released, wins: t.wins, losses: t.losses, expired: t.expired };
    document.querySelectorAll('#trKpis [data-k]').forEach(function (el) {
      var k = el.getAttribute('data-k');
      if (k === 'rate') countUp(el, rate, '%', 1); else countUp(el, map[k]);
    });
    var strict = $('trStrict'), all = t.wins + t.losses + t.expired;
    if (strict) {
      if (t.expired > 0 && all) {
        strict.hidden = false;
        strict.innerHTML = '<b>Stricter view:</b> if the ' + fmt(t.expired) + ' expired signals were counted as losses, the win rate for this range would be <b>' + pctTxt(t.wins * 100 / all) + '</b> instead of <b>' + pctTxt(rate) + '</b>.';
      } else strict.hidden = true;
    }
  }

  /* ------------------------------------------------------------------ chart */
  var F = { year: 'all', from: '', to: '' };
  function monthsInRange() {
    return S.monthly.filter(function (m) {
      if (F.year !== 'all' && m.month.slice(0, 4) !== F.year) return false;
      if (F.from && m.month < F.from) return false;
      if (F.to && m.month > F.to) return false;
      return true;
    });
  }
  function fillSelects() {
    var ys = {}; S.monthly.forEach(function (m) { ys[m.month.slice(0, 4)] = 1; });
    var yel = $('trYear'); yel.innerHTML = '<option value="all">All years</option>' + Object.keys(ys).sort().reverse().map(function (y) { return '<option value="' + y + '">' + y + '</option>'; }).join('');
    var opts = S.monthly.map(function (m) { return '<option value="' + m.month + '">' + mLabel(m.month) + '</option>'; }).join('');
    $('trFrom').innerHTML = opts; $('trTo').innerHTML = opts;
    syncSelects();
  }
  function syncSelects() {
    var list = S.monthly.filter(function (m) { return F.year === 'all' || m.month.slice(0, 4) === F.year; });
    var first = list.length ? list[0].month : '', last = list.length ? list[list.length - 1].month : '';
    if (!F.from || F.from < first) F.from = first;
    if (!F.to || F.to > last) F.to = last;
    $('trYear').value = F.year; $('trFrom').value = F.from; $('trTo').value = F.to;
  }
  function niceScale(v) {
    if (v <= 4) return { max: 4, step: 1 };
    var raw = v / 5, mag = Math.pow(10, Math.floor(Math.log10(raw))), step = mag * 10;
    [1, 2, 2.5, 5, 10].some(function (c) { if (c * mag >= raw) { step = c * mag; return true; } return false; });
    return { max: step * Math.ceil(v / step), step: step };
  }
  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function drawChart() {
    var host = $('trChart'), rows = monthsInRange();
    renderKpis(rows);
    if (!rows.length) { host.innerHTML = '<p class="tr-empty">' + (S.monthly.length ? 'No signals in this date range.' : 'No closed signals yet. The first results will appear here soon.') + '</p>'; return; }
    var showExp = $('trShowExp').checked, keys = ['released', 'wins', 'losses'].concat(showExp ? ['expired'] : []);
    var cls = { released: 'rel', wins: 'win', losses: 'loss', expired: 'exp' };
    var narrow = host.clientWidth < 560;
    var YW = 46, H = narrow ? 300 : 360, ml = 6, mr = 10, mt = 18, mb = 40;
    var avail = host.clientWidth - YW;
    var barW = narrow ? 13 : 17, gap = 4, gpad = narrow ? 14 : 16;
    var need = function () { return rows.length * (keys.length * barW + (keys.length - 1) * gap + gpad * 2) + ml + mr; };
    if (!narrow && need() > avail) { barW = 13; gpad = 9; }       // squeeze before scrolling
    var W = Math.max(avail, need());
    var gwEff = (W - ml - mr) / rows.length;
    var sc = niceScale(Math.max.apply(null, rows.map(function (m) { return Math.max.apply(null, keys.map(function (k) { return m[k]; })); }))), max = sc.max;
    var y = function (v) { return mt + (H - mt - mb) * (1 - v / max); };
    var ticks = Math.round(max / sc.step);
    var ysvg = el('svg', { width: YW, height: H, 'class': 'tr-yaxis', 'aria-hidden': 'true', style: 'width:' + YW + 'px;height:' + H + 'px;' });
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, style: 'width:' + W + 'px;height:' + H + 'px;', role: 'img', 'aria-label': 'Bar chart of signals released, successful and failed for each month' });
    for (var i = 0; i <= ticks; i++) {
      var v = sc.step * i, yy = y(v);
      el('line', { x1: 0, x2: W - mr, y1: yy, y2: yy, 'class': 'tr-gridline' }, svg);
      var t = el('text', { x: YW - 8, y: yy + 4, 'class': 'tr-axis tr-axis--y' }, ysvg); t.textContent = Math.round(v).toLocaleString('en-US');
    }
    var showVals = (barW >= 16 && gwEff >= keys.length * 22);
    rows.forEach(function (m, idx) {
      var gx = ml + idx * gwEff, inner = keys.length * barW + (keys.length - 1) * gap, x0 = gx + (gwEff - inner) / 2;
      var g = el('g', { 'class': 'tr-grp', tabindex: 0, role: 'img', 'aria-label': mLabel(m.month) + ': ' + m.released + ' released, ' + m.wins + ' success, ' + m.losses + ' failed, ' + m.expired + ' expired' }, svg);
      el('rect', { x: gx, y: mt, width: gwEff, height: H - mt - mb, 'class': 'tr-hit' }, g);
      keys.forEach(function (k, ki) {
        var h = Math.max(0, (H - mt - mb) * m[k] / max), bx = x0 + ki * (barW + gap);
        var r = el('rect', { x: bx, y: y(m[k]), width: barW, height: h, rx: 3, 'class': 'tr-bar tr-bar--' + cls[k], style: '--i:' + Math.min(idx, 24) }, g);
        if (reduce) r.style.animation = 'none';
        if (showVals && m[k] > 0) { var tv = el('text', { x: bx + barW / 2, y: y(m[k]) - 5, 'class': 'tr-val' }, g); tv.textContent = m[k]; }
      });
      var lab = el('text', { x: gx + gwEff / 2, y: H - mb + 18, 'class': 'tr-axis tr-axis--x' }, svg);
      var p = m.month.split('-'); lab.textContent = MONTHS[+p[1] - 1] + (rows.length <= 14 || p[1] === '01' || idx === 0 ? " '" + p[0].slice(2) : '');
      g.addEventListener('pointerenter', function (e) { showTip(m, g, e); });
      g.addEventListener('pointermove', function (e) { showTip(m, g, e); });
      g.addEventListener('pointerleave', hideTip);
      g.addEventListener('focus', function () { showTip(m, g); });
      g.addEventListener('blur', hideTip);
    });
    host.innerHTML = ''; host.appendChild(ysvg); host.appendChild(svg);
    host.scrollLeft = host.scrollWidth;
  }
  function showTip(m, g, e) {
    var tip = $('trTip'), wrap = $('trChartWrap'), wr = wrap.getBoundingClientRect(), gr = g.getBoundingClientRect();
    tip.innerHTML = '<b>' + mLabel(m.month) + '</b>' +
      '<div><span>Released</span><span class="r">' + fmt(m.released) + '</span></div>' +
      '<div><span>Success</span><span class="w">' + fmt(m.wins) + '</span></div>' +
      '<div><span>Failed</span><span class="l">' + fmt(m.losses) + '</span></div>' +
      '<div><span>Expired</span><span>' + fmt(m.expired) + '</span></div>' +
      (m.active ? '<div><span>Still open</span><span>' + fmt(m.active) + '</span></div>' : '') +
      '<div><span>Win rate</span><span>' + pctTxt(m.win_pct) + '</span></div>';
    tip.hidden = false;
    var tw = tip.offsetWidth, th = tip.offsetHeight;
    var x = (e && e.clientX !== undefined ? e.clientX : gr.left + gr.width / 2) - wr.left + 14;
    if (x + tw > wr.width) x = x - tw - 28;
    x = Math.max(4, Math.min(x, wr.width - tw - 4));
    var yv = Math.max(4, Math.min(gr.top - wr.top + 20, wr.height - th - 4));
    tip.style.left = x + 'px'; tip.style.top = yv + 'px';
  }
  function hideTip() { $('trTip').hidden = true; }

  /* ------------------------------------------------------------------ batches */
  function gauge(win, live) {
    var r = 33, c = 2 * Math.PI * r, off = c * (1 - (win || 0) / 100);
    return '<svg class="tr-gauge" viewBox="0 0 82 82" aria-hidden="true"><circle class="t" cx="41" cy="41" r="' + r + '"' + (live ? ' stroke-dasharray="3 5"' : '') + '/>' +
      '<circle class="v" cx="41" cy="41" r="' + r + '" stroke-dasharray="' + c.toFixed(2) + '" stroke-dashoffset="' + (reduce ? off.toFixed(2) : c.toFixed(2)) + '" data-off="' + off.toFixed(2) + '"/>' +
      '<text x="41" y="42">' + Math.round(win || 0) + '%</text></svg>';
  }
  function rangeText(b) {
    var a = ymd(b.released_from), z = ymd(b.released_to);
    if (a.y === z.y) return { main: dShort(b.released_from) + ' - ' + dShort(b.released_to), year: String(z.y) };
    return { main: dShort(b.released_from) + ' ' + a.y + ' - ' + dShort(b.released_to) + ' ' + z.y, year: '' };
  }
  function trend(cur, prev) {
    if (prev === null || prev === undefined || cur === null || cur === undefined) return '';
    var d = Math.round((cur - prev) * 10) / 10;
    if (d === 0) return '<span class="tr-trend"><i class="fa-solid fa-minus"></i> same as the previous batch</span>';
    return '<span class="tr-trend ' + (d > 0 ? 'up' : 'down') + '"><i class="fa-solid fa-arrow-trend-' + (d > 0 ? 'up' : 'down') + '"></i> ' + (d > 0 ? '+' : '') + d + ' pts vs previous batch</span>';
  }
  function rowHTML(b, prev, live, i) {
    var rg = rangeText(b), size = S.batches.batch_size || 100;
    var label = 'Batch ' + b.n + ' &middot; signals ' + fmt(b.first_seq) + ' to ' + fmt(b.last_seq);
    if (live) label = '<span class="tr-tag">LIVE</span> Batch ' + b.n + ' in progress';
    return '<div class="tr-brow' + (live ? ' tr-brow--live' : '') + '" style="--i:' + i + '">' +
      '<div class="tr-cell"><span class="tr-cell__l">' + label + (b.fp ? ' <span class="tr-tag tr-tag--fp" title="Fingerprint of this batch. It changes if any signal in it or before it changes.">fp ' + esc(b.fp) + '</span>' : '') + '</span>' +
        '<div class="tr-range">' + esc(rg.main) + (rg.year ? ' <span style="color:var(--text-3);font-weight:500">' + rg.year + '</span>' : '') + '<small>' + (live ? fmt(b.size) + ' of ' + size + ' closed so far' : 'released between these dates') + '</small></div>' +
        (live ? '<div class="tr-progress" role="progressbar" aria-valuemin="0" aria-valuemax="' + size + '" aria-valuenow="' + b.size + '"><span style="--p:' + (b.size * 100 / size) + '%"></span></div>' : '') + '</div>' +
      '<div class="tr-cell tr-cell--win"><span class="tr-cell__l"><i class="fa-solid fa-circle-check"></i> Success</span><span class="tr-big">' + pctTxt(b.win_pct) + '</span><small>' + fmt(b.wins) + ' wins</small></div>' +
      '<div class="tr-cell tr-cell--loss"><span class="tr-cell__l"><i class="fa-solid fa-circle-xmark"></i> Failed</span><span class="tr-big">' + pctTxt(b.loss_pct) + '</span><small>' + fmt(b.losses) + ' losses</small></div>' +
      '<div class="tr-cell tr-cell--gauge">' + gauge(b.win_pct, live) + '<div>' + (live ? '' : trend(b.win_pct, prev ? prev.win_pct : null)) + '</div></div>' +
      '</div>';
  }
  function drawBatches() {
    var host = $('trBatches'), d = S.batches, list = (d && d.batches) || [], live = d && d.in_progress;
    if (!d || (!list.length && !live)) { host.innerHTML = '<p class="tr-empty">The first batch of 100 closed signals is still filling up. It will appear here as soon as results come in.</p>'; $('trMore').hidden = true; return; }
    var html = '', i = 0;
    if (live && live.size > 0) html += rowHTML(live, list[0] || null, true, i++);
    list.slice(0, S.shownBatches).forEach(function (b, k) { html += rowHTML(b, list[k + 1] || null, false, i++); });
    host.innerHTML = html;
    var left = list.length - S.shownBatches;
    var more = $('trMore'); more.hidden = left <= 0;
    if (left > 0) more.innerHTML = '<i class="fa-solid fa-angles-down"></i> Click here to see more <span style="opacity:.6">(' + left + ' older)</span>';
    if (!reduce) requestAnimationFrame(function () { requestAnimationFrame(function () {
      host.querySelectorAll('.tr-gauge .v').forEach(function (c) { c.style.strokeDashoffset = c.getAttribute('data-off'); });
    }); });
  }

  /* ------------------------------------------------------------------ history */
  var COLS = ['ref', 'released', 'asset', 'market', 'action', 'entry', 'tp', 'sl', 'closed', 'result'];
  function toObjs(file) { return file.rows.map(function (r) { var o = {}; file.cols.forEach(function (c, i) { o[c] = r[i]; }); return o; }); }
  function fillArchiveSelect() {
    var sel = $('trArchMonth'), idx = (S.archIndex && S.archIndex.months) || [];
    var opts = '<option value="latest">Latest 40 closed signals</option>' + idx.map(function (m) { return '<option value="' + m.month + '">' + mLabel(m.month) + ' &middot; ' + m.rows + ' signals</option>'; }).join('');
    sel.innerHTML = opts;
  }
  function loadArchive() {
    var v = $('trArchMonth').value, info = $('trArchInfo'), body = $('trArchBody');
    body.innerHTML = '<tr><td colspan="8" class="empty">Loading...</td></tr>';
    var p;
    if (v === 'latest') p = Promise.resolve(S.recent && S.recent.signals ? S.recent.signals.map(function (s) { return { released: s.released, asset: s.asset, action: s.action, entry: s.entry, tp: s.tp, sl: s.sl, closed: s.closed, result: s.result }; }) : []);
    else if (S.arch[v]) p = Promise.resolve(S.arch[v]);
    else p = getJSON('track-archive-' + v + '.json').then(function (f) { S.arch[v] = toObjs(f); return S.arch[v]; });
    p.then(function (rows) { S.archRows = rows; applyArchiveFilter(); })
     .catch(function () { body.innerHTML = '<tr><td colspan="8" class="empty">This month could not be loaded right now. Please try again in a moment.</td></tr>'; info.textContent = ''; });
  }
  function applyArchiveFilter() {
    var r = $('trArchResult').value, a = $('trArchAsset').value.trim().toLowerCase();
    S.archFiltered = S.archRows.filter(function (x) { return (r === 'all' || x.result === r) && (!a || String(x.asset || '').toLowerCase().indexOf(a) !== -1); });
    S.archShown = 0; $('trArchBody').innerHTML = ''; showMoreRows();
  }
  function showMoreRows() {
    var body = $('trArchBody'), rows = S.archFiltered, next = rows.slice(S.archShown, S.archShown + 25);
    if (!rows.length) body.innerHTML = '<tr><td colspan="8" class="empty">No signals match these filters.</td></tr>';
    body.insertAdjacentHTML('beforeend', next.map(function (x) {
      var cls = x.result === 'Win' ? 'is-win' : x.result === 'Loss' ? 'is-loss' : 'is-exp', lab = x.result === 'Win' ? 'Success' : x.result === 'Loss' ? 'Failed' : 'Expired';
      return '<tr><td>' + esc(String(x.released || '').slice(0, 16)) + '</td><td>' + esc(x.asset) + '</td><td>' + esc(x.action) + '</td><td class="n">' + px(x.entry) + '</td><td class="n">' + px(x.tp) + '</td><td class="n">' + px(x.sl) + '</td><td class="n">' + (x.result === 'Expired' ? '-' : px(x.closed)) + '</td><td class="' + cls + '">' + lab + '</td></tr>';
    }).join(''));
    S.archShown += next.length;
    $('trArchMore').hidden = S.archShown >= rows.length;
    $('trArchInfo').textContent = rows.length ? 'Showing ' + S.archShown + ' of ' + fmt(rows.length) + ' signals' : '';
  }

  /* ------------------------------------------------------------------ boot */
  function renderAll() {
    renderHeader();
    S.monthly = (S.monthlyFile && S.monthlyFile.months) || [];
    fillSelects(); drawChart(); drawBatches();
  }
  function loadAll(first) {
    return Promise.all([
      getJSON('track-summary.json'), getJSON('track-monthly.json').catch(function () { return { months: [] }; }),
      getJSON('track-batches.json').catch(function () { return null; }),
      getJSON('track-recent.json').catch(function () { return { signals: [] }; }),
      getJSON('track-archive-index.json').catch(function () { return { months: [] }; })
    ]).then(function (r) {
      if (!first && S.summary && S.summary.generated_at === r[0].generated_at) { renderHeader(); return; }
      S.summary = r[0]; S.monthlyFile = r[1]; S.batches = r[2]; S.recent = r[3]; S.archIndex = r[4]; S.arch = {};
      renderAll(); fillArchiveSelect(); loadArchive();
    });
  }
  function bind() {
    $('trYear').addEventListener('change', function () { F.year = this.value; F.from = ''; F.to = ''; syncSelects(); drawChart(); });
    $('trFrom').addEventListener('change', function () { F.from = this.value; if (F.to && F.to < F.from) F.to = F.from; syncSelects(); drawChart(); });
    $('trTo').addEventListener('change', function () { F.to = this.value; if (F.from && F.from > F.to) F.from = F.to; syncSelects(); drawChart(); });
    $('trReset').addEventListener('click', function () { F = { year: 'all', from: '', to: '' }; syncSelects(); drawChart(); });
    $('trShowExp').addEventListener('change', drawChart);
    $('trMore').addEventListener('click', function () { S.shownBatches += 10; drawBatches(); });
    $('trArchMonth').addEventListener('change', loadArchive);
    $('trArchResult').addEventListener('change', applyArchiveFilter);
    var t; $('trArchAsset').addEventListener('input', function () { clearTimeout(t); t = setTimeout(applyArchiveFilter, 180); });
    $('trArchMore').addEventListener('click', showMoreRows);
    var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { if (S.monthly.length) drawChart(); }, 150); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden && S.summary) loadAll(false).catch(function () {}); });
    setInterval(function () { if (!document.hidden) loadAll(false).catch(function () {}); }, 10 * 60 * 1000);
    setInterval(function () { if (S.summary) renderHeader(); }, 60 * 1000);
  }
  function fail() {
    var m = $('trChartMsg') || $('trChart');
    $('trChart').innerHTML = '<p class="tr-empty">The live numbers could not be loaded just now. The summary below was written when the page was last published.</p>';
    var u = $('trUpdated'); if (u) u.textContent = 'Live data unavailable';
    $('trBatches').innerHTML = '<p class="tr-empty">Batches could not be loaded right now.</p>';
    $('trArchBody').innerHTML = '<tr><td colspan="8" class="empty">History could not be loaded right now.</td></tr>';
    void m;
  }
  function init() { if (!$('trChart')) return; bind(); loadAll(true).catch(fail); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
