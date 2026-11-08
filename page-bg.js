/* ==========================================================================
   page-bg.js: quiet hero background for the small pages (redesign stage 13)
   The same dot-matrix world as the homepage, but still and faint, with one slow
   lime ring that opens at a single hub every 9 seconds. Decorative only: no
   labels, no "live" claim, one read of world-dots.json.
   Looks for .pagehero. Pauses off screen or in a hidden tab; reduced motion
   shows one still frame; if the map cannot load, nothing is drawn.
   ========================================================================== */
(function () {
  'use strict';
  var hero = document.querySelector('.pagehero');
  if (!hero) return;
  var canvas = document.createElement('canvas');
  var ctx = canvas.getContext && canvas.getContext('2d');
  if (!ctx) return;

  var reduceMq = window.matchMedia('(prefers-reduced-motion: reduce)');
  var phoneMq = window.matchMedia('(max-width: 767px)');
  var cs = getComputedStyle(hero);
  function token(n, f) { var v = cs.getPropertyValue(n).trim(); return v || f; }
  var LIME = token('--brand-lime', '#E4E932'), DOTC = token('--text-3', '#998DB0');
  function rgba(hex, a) {
    var h = hex.replace('#', ''); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return 'rgba(' + parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) + ',' + parseInt(h.slice(4, 6), 16) + ',' + a + ')';
  }

  var PERIOD = 9000, RING_MS = 3600;
  var HUB = { lon: 8.7, lat: 50.1 };            // Frankfurt: one fixed hub, the same on every page
  var data = null, W = 0, H = 0, dpr = 1, hx = 0, hy = 0;
  var layer = document.createElement('canvas'), lctx = layer.getContext('2d');
  var clock = 0, last = 0, raf = 0, running = false, visible = true, ready = false;

  function layout() {
    var r = hero.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = layer.width = Math.round(W * dpr); canvas.height = layer.height = Math.round(H * dpr);
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0); lctx.clearRect(0, 0, W, H);
    var step = data.step, rows = data.rows, latSpan = rows.length * step, phone = phoneMq.matches;
    var mapH = H * (phone ? 0.6 : 0.8), mapW = mapH * (360 / latSpan);
    if (mapW < W) { mapW = W; mapH = W / (360 / latSpan); }
    var mapX = (W - mapW) / 2, mapY = (H - mapH) / 2;
    var radius = Math.max(0.8, step / 360 * mapW * 0.14);
    lctx.fillStyle = DOTC; lctx.globalAlpha = 0.2;
    for (var i = 0; i < rows.length; i++) {
      var y = mapY + (i + 0.5) / rows.length * mapH;
      if (y < -4 || y > H + 4) continue;
      for (var j = 0; j < rows[i].length; j++) {
        if (phone && ((i * 3 + rows[i][j] * 5) % 8) >= 3) continue;
        var x = mapX + (rows[i][j] + (i % 2 ? 0.5 : 0) + 0.5) * step / 360 * mapW;
        if (x < -4 || x > W + 4) continue;
        lctx.beginPath(); lctx.arc(x, y, radius, 0, 6.2832); lctx.fill();
      }
    }
    lctx.globalAlpha = 1;
    hx = mapX + (HUB.lon + 180) / 360 * mapW; hy = mapY + (data.lat0 - HUB.lat) / latSpan * mapH;
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.drawImage(layer, 0, 0, W, H);
    var age = clock % PERIOD;
    if (age < RING_MS) {
      var p = age / RING_MS, e = 1 - Math.pow(1 - p, 3);
      ctx.globalAlpha = Math.pow(1 - p, 1.5) * 0.55; ctx.strokeStyle = LIME; ctx.lineWidth = 1.25;
      ctx.beginPath(); ctx.arc(hx, hy, 8 + 46 * e, 0, 6.2832); ctx.stroke();
    }
    ctx.globalAlpha = 0.5; ctx.fillStyle = LIME; ctx.beginPath(); ctx.arc(hx, hy, 2.2, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = 1;
  }

  function frame(ts) {
    raf = requestAnimationFrame(frame);
    if (!last) { last = ts; return; }
    var dt = ts - last; if (dt < 33) return;   // about 30 fps is plenty for one slow ring
    last = ts; if (dt > 100) dt = 100; clock += dt; draw();
  }
  function update() {
    var should = ready && !document.hidden && visible && !reduceMq.matches;
    if (should && !running) { running = true; last = 0; raf = requestAnimationFrame(frame); }
    else if (!should && running) { running = false; cancelAnimationFrame(raf); }
    if (!should && ready && !running) { clock = RING_MS * 0.45; draw(); }
  }

  document.addEventListener('visibilitychange', update);
  if (reduceMq.addEventListener) reduceMq.addEventListener('change', update);
  if ('IntersectionObserver' in window) new IntersectionObserver(function (en) { visible = en[0].isIntersecting; update(); }, { threshold: 0 }).observe(hero);
  var rt = 0;
  function onResize() {
    clearTimeout(rt);
    rt = setTimeout(function () {
      var r = hero.getBoundingClientRect();
      if (Math.round(r.width) === W && Math.round(r.height) === H) return;
      layout(); if (!running) draw();
    }, 150);
  }
  if ('ResizeObserver' in window) new ResizeObserver(onResize).observe(hero); else window.addEventListener('resize', onResize);

  fetch('world-dots.json').then(function (r) { if (!r.ok) throw new Error('no map'); return r.json(); })
    .then(function (j) {
      if (!j || !j.rows || !j.rows.length || !j.step) return;
      data = j;
      var pos = getComputedStyle(hero).position;
      if (pos === 'static') hero.style.position = 'relative';
      hero.style.isolation = 'isolate';                       // keep the canvas behind the hero's own content
      canvas.setAttribute('aria-hidden', 'true');
      canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none;';
      hero.insertBefore(canvas, hero.firstChild);
      layout(); ready = true; update();
    })
    .catch(function () { /* no map: leave the hero as it is */ });
})();
