/* blog-cinema.js (v1): row arrows for blog.html. No data, no network. Safe to load without the page markup. */
(function () {
  'use strict';
  document.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('[data-bcx-scroll]') : null;
    if (!btn) return;
    var row = btn.closest('.bcx-row');
    var sc = row && row.querySelector('.bcx-row__sc');
    if (!sc) return;
    var dir = parseInt(btn.getAttribute('data-bcx-scroll'), 10) || 1;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    sc.scrollBy({ left: dir * Math.round(sc.clientWidth * 0.85), behavior: reduce ? 'auto' : 'smooth' });
  });
})();
