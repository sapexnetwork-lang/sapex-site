/* ==========================================================================
   hero-scan.js: hero background, "the scan" (replaces hero-bg.js)
   Idea: SaPEX NEXUS re-scans the market every 5 minutes. The hero shows that
   scan as one slanted lime sweep that crosses a dot-matrix world; every dot it
   passes lights up and fades, and a few dots "lock" with a small target
   bracket and a sample tag. Decorative only: tags come from a fixed list, no
   "LIVE" claim, no network calls except one read of world-dots.json. If that
   file is missing the same sweep runs over a plain dot lattice instead.

   Loaded with defer. Creates its own canvas and adds .has-herobg to the hero,
   which hides the old #signalCanvas (script.js still owns that element).
   Pauses when the tab is hidden or the hero is off screen; reduced motion
   shows one still frame.
   ========================================================================== */
(function () {
  'use strict';

  var hero = document.querySelector('.hero');
  if (!hero) return;
  var canvas = document.createElement('canvas');
  var ctx = canvas.getContext && canvas.getContext('2d');
  if (!ctx) return;
  canvas.className = 'hero__canvas hero__canvas--bg';
  canvas.setAttribute('aria-hidden', 'true');
  hero.insertBefore(canvas, hero.firstChild);
  hero.classList.add('has-herobg');

  var reduceMq = window.matchMedia('(prefers-reduced-motion: reduce)');
  var phoneMq = window.matchMedia('(max-width: 767px)');
  var hoverMq = window.matchMedia('(hover: hover) and (pointer: fine)');

  // Fixed sample tags. Decorative, not data.
  var TAGS = [['BUY', 'BTC'], ['SELL', 'ETH'], ['BUY', 'NVDA'], ['BUY', 'SOL'], ['SELL', 'TSLA'], ['BUY', 'AAPL'], ['SELL', 'XRP'], ['BUY', 'MSFT']];
  var SWEEP_MS = 9000, PAUSE_MS = 2600, CYCLE = SWEEP_MS + PAUSE_MS;
  var TRAIL = 260, SLANT = 0.16, FADE_MS = 1700, LOCK_MS = 3200;

  var cs = getComputedStyle(hero);
  function token(n, f) { var v = cs.getPropertyValue(n).trim(); return v || f; }
  function rgb(hex) { var h = hex.replace('#', ''); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  function rgba(hex, a) { var c = rgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  var LIME = token('--brand-lime', '#E4E932'), PURPLE = token('--brand-purple', '#371777');
  var VOID = token('--void', '#0C0715'), DOTC = token('--text-3', '#998DB0');
  var UP = token('--green', '#2DD4A0'), DOWN = token('--red', '#FF6B7A'), PANEL = token('--panel', '#180F2A');

  var data = null, W = 0, H = 0, dpr = 1, phone = false;
  var base = document.createElement('canvas'), bctx = base.getContext('2d');
  var dx = null, dy = null, dd = null, dn = 0, dotR = 1.2;     // dot x, y, dim (0..1), count, radius
  var locks = [];                                              // chosen lock dots
  var lockTagFont = '';
  var clock = 0, last = 0, raf = 0, running = false, heroVisible = true, ready = false;
  var px = -1e4, py = -1e4, prevHead = -1e9, lastCycle = -1;

  function rnd(seed) { var a = seed >>> 0; return function () { a += 0x6D2B79F5; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function smooth(e0, e1, x) { var t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }
  function ease(p) { return 1 - Math.pow(1 - p, 3); }

  // How much of the picture is "behind the words": 1 = free, 0.22 = behind the headline and copy
  function freedom(x, y) {
    if (phone) return 0.5;
    var mx = 1 - smooth(W * 0.5, W * 0.66, x);
    var my = smooth(H * 0.1, H * 0.3, y) * (1 - smooth(H * 0.75, H * 0.95, y));
    return 1 - 0.78 * mx * my;
  }

  function layout() {
    var r = hero.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    phone = phoneMq.matches; dpr = Math.min(window.devicePixelRatio || 1, phone ? 1.5 : 2);
    canvas.width = base.width = Math.round(W * dpr); canvas.height = base.height = Math.round(H * dpr);
    buildBase(); buildDots(); buildLocks();
    ctx.font = lockTagFont = '600 ' + (phone ? 12 : 11) + 'px "JetBrains Mono", ui-monospace, monospace';
  }

  function buildBase() {
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0); bctx.clearRect(0, 0, W, H);
    var gx = phone ? W * 0.5 : W * 0.28, gy = phone ? H * 0.22 : H * 0.45;
    var g = bctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(W, H) * 0.7);
    g.addColorStop(0, rgba(PURPLE, 0.38)); g.addColorStop(1, rgba(PURPLE, 0));
    bctx.fillStyle = g; bctx.fillRect(0, 0, W, H);
    var gs = phone ? 56 : 48;
    bctx.strokeStyle = 'rgba(255,255,255,0.03)'; bctx.lineWidth = 1; bctx.beginPath();
    for (var x = 0.5; x < W; x += gs) { bctx.moveTo(x, 0); bctx.lineTo(x, H); }
    for (var y = 0.5; y < H; y += gs) { bctx.moveTo(0, y); bctx.lineTo(W, y); }
    bctx.stroke();
    if (phone) { var v = bctx.createLinearGradient(0, 0, 0, H * 0.7); v.addColorStop(0, rgba(VOID, 0.55)); v.addColorStop(1, rgba(VOID, 0)); bctx.fillStyle = v; bctx.fillRect(0, 0, W, H * 0.7); }
  }

  // Build the dot list: the world map when world-dots.json loaded, otherwise a plain lattice.
  function buildDots() {
    var xs = [], ys = [], i, j;
    if (data) {
      var step = data.step, rows = data.rows, latSpan = rows.length * step;
      var mapH = H * (phone ? 0.4 : 0.74), mapW = mapH * (360 / latSpan);
      if (mapW < W) { mapW = W; mapH = W / (360 / latSpan); }
      var mapX = (W - mapW) / 2, mapY = phone ? H * 0.3 : (H - mapH) / 2;
      dotR = Math.max(0.9, step / 360 * mapW * (phone ? 0.2 : 0.15));
      for (i = 0; i < rows.length; i++) {
        var lat = data.lat0 - (i + 0.5) * step, y = mapY + (data.lat0 - lat) / latSpan * mapH;
        if (y < -4 || y > H + 4) continue;
        for (j = 0; j < rows[i].length; j++) {
          var c = rows[i][j];
          if (phone && ((i * 3 + c * 5) % 8) >= 3) continue;
          var x = mapX + ((-180 + (c + (i % 2 ? 0.5 : 0) + 0.5) * step) + 180) / 360 * mapW;
          if (x < -4 || x > W + 4) continue;
          xs.push(x); ys.push(y);
        }
      }
    } else {
      var sp = phone ? 30 : 26; dotR = 1.1;
      for (var yy = sp / 2; yy < H; yy += sp) for (var xx = sp / 2 + ((Math.round(yy / sp) % 2) ? sp / 2 : 0); xx < W; xx += sp) { xs.push(xx); ys.push(yy); }
    }
    dn = xs.length; dx = new Float32Array(dn); dy = new Float32Array(dn); dd = new Float32Array(dn);
    for (i = 0; i < dn; i++) { dx[i] = xs[i]; dy[i] = ys[i]; dd[i] = freedom(xs[i], ys[i]); }
    // static dot layer
    bctx.fillStyle = DOTC;
    for (i = 0; i < dn; i++) { bctx.globalAlpha = 0.46 * dd[i]; bctx.beginPath(); bctx.arc(dx[i], dy[i], dotR, 0, 6.2832); bctx.fill(); }
    bctx.globalAlpha = 1;
  }

  // Pick the dots that "lock": free of text, spread out, same every load.
  function buildLocks() {
    locks.length = 0;
    var R = rnd(20261101), want = phone ? 8 : 14, tries = 0, minD = phone ? 70 : 110;
    while (locks.length < want && tries++ < 4000 && dn) {
      var i = Math.floor(R() * dn), x = dx[i], y = dy[i];
      if (dd[i] < 0.9 || x < 40 || x > W - 40 || y < 60 || y > H - 60) continue;
      if (phone && y < H * 0.6) continue;
      var ok = true;
      for (var k = 0; k < locks.length; k++) { var ex = locks[k].x - x, ey = locks[k].y - y; if (ex * ex + ey * ey < minD * minD) { ok = false; break; } }
      if (ok) locks.push({ x: x, y: y, tag: locks.length % TAGS.length, t0: -1e9 });
    }
  }

  function headAt(y, sx) { return sx + (y - H / 2) * SLANT; }      // sweep position at height y

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.drawImage(base, 0, 0, W, H);

    var ph = clock % CYCLE, sweepX = -TRAIL + (W + TRAIL * 2) * Math.min(1, ph / SWEEP_MS);
    var sweeping = ph < SWEEP_MS, cyc = Math.floor(clock / CYCLE);
    if (cyc !== lastCycle) { lastCycle = cyc; prevHead = -1e9; }

    // lit dots: everything the sweep crossed in the last TRAIL px
    var i, ptr = hoverMq.matches && px > -1e3;
    ctx.fillStyle = LIME;
    for (i = 0; i < dn; i++) {
      var d = headAt(dy[i], sweepX) - dx[i], a = 0;
      if (d >= 0 && d < TRAIL) a = Math.pow(1 - d / TRAIL, 1.6);
      if (ptr) { var qx = px - dx[i], qy = py - dy[i], q2 = qx * qx + qy * qy; if (q2 < 14400) a = Math.max(a, (1 - q2 / 14400) * 0.7); }
      if (a < 0.02) continue;
      ctx.globalAlpha = Math.min(1, a * (0.35 + 0.65 * dd[i]) * 1.1);
      ctx.beginPath(); ctx.arc(dx[i], dy[i], dotR * (1.1 + a * 0.9), 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // the sweep itself: a soft wash behind the head and one thin slanted line
    if (sweeping || ph < SWEEP_MS + 300) {
      var fadeEnd = sweeping ? 1 : Math.max(0, 1 - (ph - SWEEP_MS) / 300);
      var cx = Math.max(-TRAIL, Math.min(W + TRAIL, sweepX)), sk = (H / 2) * SLANT;
      var calm = phone ? 0.5 : 1 - 0.55 * (1 - smooth(W * 0.45, W * 0.62, cx));       // quieter while it crosses the headline
      var gr = ctx.createLinearGradient(cx - TRAIL, 0, cx, 0);
      gr.addColorStop(0, rgba(LIME, 0)); gr.addColorStop(1, rgba(LIME, 0.075 * calm * fadeEnd));
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.moveTo(cx - TRAIL - sk, H); ctx.lineTo(cx - TRAIL + sk, 0); ctx.lineTo(cx + sk, 0); ctx.lineTo(cx - sk, H); ctx.closePath(); ctx.fill();
      var lg = ctx.createLinearGradient(0, 0, 0, H);
      lg.addColorStop(0, rgba(LIME, 0)); lg.addColorStop(0.5, rgba(LIME, 0.55 * calm * fadeEnd)); lg.addColorStop(1, rgba(LIME, 0));
      ctx.strokeStyle = lg; ctx.lineWidth = 1.25; ctx.beginPath(); ctx.moveTo(cx + sk, 0); ctx.lineTo(cx - sk, H); ctx.stroke();
    }

    // locks: start when the head passes a lock dot
    if (sweeping) {
      var active = 0, k;
      for (k = 0; k < locks.length; k++) if (clock - locks[k].t0 < LOCK_MS) active++;
      for (k = 0; k < locks.length && active < 3; k++) {
        var L = locks[k], hd = headAt(L.y, sweepX), hp = headAt(L.y, prevHead);
        if (prevHead > -1e8 && hp < L.x && hd >= L.x && clock - L.t0 > LOCK_MS) { L.t0 = clock; active++; }
      }
      prevHead = sweepX;
    }
    for (var m = 0; m < locks.length; m++) drawLock(locks[m]);
  }

  function drawLock(L) {
    var age = clock - L.t0;
    if (age < 0 || age > LOCK_MS) return;
    var tag = TAGS[L.tag], col = tag[0] === 'BUY' ? UP : DOWN;
    var fadeOut = age > LOCK_MS - 600 ? (LOCK_MS - age) / 600 : 1;
    var s = 5 + 15 * (1 - ease(Math.min(1, age / 380)));                      // bracket closes in from 20 to 5
    ctx.globalAlpha = Math.min(1, age / 120) * fadeOut;
    ctx.strokeStyle = LIME; ctx.lineWidth = 1.25; ctx.beginPath();
    var q = 5.5, bx = L.x, by = L.y;
    ctx.moveTo(bx - s, by - s + q); ctx.lineTo(bx - s, by - s); ctx.lineTo(bx - s + q, by - s);
    ctx.moveTo(bx + s - q, by - s); ctx.lineTo(bx + s, by - s); ctx.lineTo(bx + s, by - s + q);
    ctx.moveTo(bx + s, by + s - q); ctx.lineTo(bx + s, by + s); ctx.lineTo(bx + s - q, by + s);
    ctx.moveTo(bx - s + q, by + s); ctx.lineTo(bx - s, by + s); ctx.lineTo(bx - s, by + s - q);
    ctx.stroke();
    ctx.fillStyle = LIME; ctx.beginPath(); ctx.arc(bx, by, 2.2, 0, 6.2832); ctx.fill();
    if (age > 280) {
      var ta = Math.min(1, (age - 280) / 250) * fadeOut, txt = tag[0] + ' ' + tag[1];
      ctx.font = lockTagFont; var w = Math.ceil(ctx.measureText(txt).width) + 18, h = phone ? 24 : 20;
      var tx = Math.min(W - w - 8, bx + 16), ty = by - h - 10;
      if (ty < 8) ty = by + 14;
      ctx.globalAlpha = ta; ctx.fillStyle = PANEL; ctx.strokeStyle = col; ctx.lineWidth = 1;
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(tx, ty, w, h, 5); else ctx.rect(tx, ty, w, h); ctx.fill(); ctx.stroke();
      ctx.fillStyle = col; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillText(txt, tx + 9, ty + h / 2 + 0.5);
    }
    ctx.globalAlpha = 1;
  }

  function drawStill() {
    // frozen frame: sweep two thirds across with two locks already closed on the right
    clock = SWEEP_MS * 0.66; lastCycle = 0; prevHead = -1e9;
    var n = 0;
    for (var i = 0; i < locks.length; i++) locks[i].t0 = -1e9;
    var ph = clock, sx = -TRAIL + (W + TRAIL * 2) * ph / SWEEP_MS;
    for (var k = 0; k < locks.length && n < 2; k++) if (headAt(locks[k].y, sx) > locks[k].x + 40 && locks[k].x > W * 0.45) { locks[k].t0 = clock - 1500; n++; }
    draw();
    for (var j = 0; j < locks.length; j++) locks[j].t0 = -1e9;
    clock = 0; lastCycle = -1;
  }

  function frame(ts) {
    raf = requestAnimationFrame(frame);
    if (!last) { last = ts; return; }
    var dt = ts - last;
    if (phone && dt < 32) return;
    last = ts; if (dt > 50) dt = 50;
    clock += dt; draw();
  }

  function update() {
    var should = ready && !document.hidden && heroVisible && !reduceMq.matches;
    if (should && !running) { running = true; last = 0; raf = requestAnimationFrame(frame); }
    else if (!should && running) { running = false; cancelAnimationFrame(raf); }
    if (!should && ready && !running && reduceMq.matches) drawStill();
  }

  document.addEventListener('visibilitychange', update);
  if (reduceMq.addEventListener) reduceMq.addEventListener('change', update);
  if ('IntersectionObserver' in window) new IntersectionObserver(function (en) { heroVisible = en[0].isIntersecting; update(); }, { threshold: 0 }).observe(hero);
  hero.addEventListener('mousemove', function (e) { var r = hero.getBoundingClientRect(); px = e.clientX - r.left; py = e.clientY - r.top; }, { passive: true });
  hero.addEventListener('mouseleave', function () { px = py = -1e4; }, { passive: true });

  var rt = 0;
  function onResize() {
    clearTimeout(rt);
    rt = setTimeout(function () {
      var r = hero.getBoundingClientRect();
      if (Math.round(r.width) === W && Math.round(r.height) === H && phoneMq.matches === phone) return;
      layout(); if (!running) drawStill(); update();
    }, 150);
  }
  if ('ResizeObserver' in window) new ResizeObserver(onResize).observe(hero); else window.addEventListener('resize', onResize);

  function begin() {
    try {
      layout(); ready = true; clock = SWEEP_MS * 0.02;          // the first sweep starts almost at once
      drawStill(); clock = SWEEP_MS * 0.02; lastCycle = -1; update();
    } catch (err) {
      if (window.console) console.warn('hero-scan failed, falling back to the old canvas:', err);
      hero.classList.remove('has-herobg'); if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    }
  }

  fetch('world-dots.json').then(function (r) { if (!r.ok) throw new Error('no map'); return r.json(); })
    .then(function (j) { if (j && j.rows && j.rows.length && j.step) data = j; })
    .catch(function () { data = null; })
    .then(begin);
})();
