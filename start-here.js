/* SaPEX NEXUS - start-here.js
   Fills the "real recent signals" sample on start-here.html from the public Track Record files.
   Read-only: no sign-in, no database calls. If a file cannot be loaded the page shows a plain message. */
(function () {
  'use strict';
  var body = document.getElementById('shRows');
  if (!body) return;
  var stat = document.getElementById('shStat');
  var fmt = function (n) { return Number(n).toLocaleString('en-US'); };
  var pct = function (n) { return (Math.round(n * 10) / 10).toFixed(1) + '%'; };
  var px = function (v) { return v === null || v === undefined ? '-' : Number(v).toLocaleString('en-US', { maximumSignificantDigits: 7 }); };
  var esc = function (s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  function get(name) {
    return fetch('/data/' + name, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(name + ' ' + r.status);
      return r.json();
    });
  }

  get('track-recent.json').then(function (f) {
    var rows = ((f && f.signals) || []).slice().sort(function (a, b) { return String(b.released || '').localeCompare(String(a.released || '')); }).slice(0, 10);
    if (!rows.length) { body.innerHTML = '<tr><td colspan="8" class="empty">No closed signals to show yet.</td></tr>'; return; }
    body.innerHTML = rows.map(function (x) {
      var cls = x.result === 'Win' ? 'is-win' : x.result === 'Loss' ? 'is-loss' : 'is-exp';
      var lab = x.result === 'Win' ? 'Success' : x.result === 'Loss' ? 'Failed' : 'Expired';
      return '<tr><td>' + esc(String(x.released || '').slice(0, 16)) + '</td><td>' + esc(x.asset) + '</td><td>' + esc(x.action) +
        '</td><td class="n">' + px(x.entry) + '</td><td class="n">' + px(x.tp) + '</td><td class="n">' + px(x.sl) +
        '</td><td class="n">' + (x.result === 'Expired' ? '-' : px(x.closed)) + '</td><td class="' + cls + '">' + lab + '</td></tr>';
    }).join('');
  }).catch(function () {
    body.innerHTML = '<tr><td colspan="8" class="empty">The sample could not be loaded just now. The full history is on the <a href="track-record.html">Track Record</a> page.</td></tr>';
  });

  if (!stat) return;
  get('track-monthly.json').then(function (f) {
    var rows = (f && f.months) || [];
    var t = rows.reduce(function (a, m) { a.w += m.wins || 0; a.l += m.losses || 0; a.e += m.expired || 0; return a; }, { w: 0, l: 0, e: 0 });
    var closed = t.w + t.l;
    if (!closed) return;
    var s = '<b>' + fmt(closed) + '</b> signals have closed with a result: <b>' + fmt(t.w) + '</b> successes and <b>' + fmt(t.l) + '</b> failures (<b>' + pct(t.w * 100 / closed) + '</b> success).';
    if (t.e > 0) s += ' A further ' + fmt(t.e) + ' expired without hitting either level; counting those as losses, the rate is <b>' + pct(t.w * 100 / (closed + t.e)) + '</b>.';
    stat.innerHTML = s;
  }).catch(function () {});
})();
