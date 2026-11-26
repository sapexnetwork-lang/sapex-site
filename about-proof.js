/* SaPEX NEXUS - about-proof.js
   Fills the win-rate figure on about.html from the public Track Record data. Static files only. */
(function () {
  'use strict';
  var score = document.getElementById('aboutRate');
  if (!score) return;
  fetch('/data/track-monthly.json', { cache: 'no-cache' }).then(function (r) {
    if (!r.ok) throw new Error('monthly ' + r.status);
    return r.json();
  }).then(function (f) {
    var rows = (f && f.months) || [];
    var w = 0, l = 0, x = 0;
    rows.forEach(function (m) { w += m.wins || 0; l += m.losses || 0; x += m.expired || 0; });
    if (!(w + l)) return;
    score.textContent = (Math.round(w * 1000 / (w + l)) / 10).toFixed(1) + '%';
    var n = document.getElementById('aboutStrict');
    if (n && x > 0) n.textContent = 'That is wins out of ' + (w + l).toLocaleString('en-US') + ' closed signals. Counting the ' + x.toLocaleString('en-US') + ' expired signals as losses, it is ' + (Math.round(w * 1000 / (w + l + x)) / 10).toFixed(1) + '%.';
  }).catch(function () {});
})();
