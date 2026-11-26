/* SaPEX NEXUS - home-proof.js
   Fills the homepage "proof" strip from the same static files the Track Record page uses.
   No database calls. If a file cannot be loaded the strip keeps its dashes and the link still works. */
(function () {
  'use strict';
  var el = function (id) { return document.getElementById(id); };
  if (!el('proofReleased')) return;
  var fmt = function (n) { return Number(n).toLocaleString('en-US'); };
  var pct = function (n) { return (Math.round(n * 10) / 10).toFixed(1) + '%'; };
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function get(name) {
    return fetch('/data/' + name, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(name + ' ' + r.status);
      return r.json();
    });
  }

  get('track-monthly.json').then(function (f) {
    var rows = (f && f.months) || [];
    if (!rows.length) return;
    var t = rows.reduce(function (a, m) {
      a.released += m.released || 0; a.wins += m.wins || 0; a.losses += m.losses || 0; a.expired += m.expired || 0;
      return a;
    }, { released: 0, wins: 0, losses: 0, expired: 0 });
    var closed = t.wins + t.losses;
    if (!closed) return;
    el('proofReleased').textContent = fmt(t.released);
    el('proofClosed').textContent = fmt(closed);
    el('proofWins').textContent = fmt(t.wins);
    el('proofLosses').textContent = fmt(t.losses);
    el('proofRate').textContent = pct(t.wins * 100 / closed);
    if (t.expired > 0) {
      var strict = t.wins * 100 / (closed + t.expired);
      el('proofStrict').textContent = ' If the ' + fmt(t.expired) + ' expired signals were counted as losses, the rate would be ' + pct(strict) + '.';
    }
  }).catch(function () {});

  get('track-summary.json').then(function (s) {
    if (!s || !s.first_signal) return;
    var p = String(s.first_signal).split('-');
    if (p.length === 3) el('proofSince').textContent = 'Counting since ' + (+p[2]) + ' ' + MONTHS[+p[1] - 1] + ' ' + p[0] + '.';
  }).catch(function () {});
})();
