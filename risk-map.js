/* SaPEX homepage: mini dot-map for the risk panel (stage 9).
   Reads the same world-dots.json as hero-bg.js:
   {"v":1,"step":2.4,"lat0":84,"rows":[[col indexes],...]}
   row r sits at lat = lat0 - (r + 0.5) * step
   col c sits at lon = -180 + (c + (r % 2 ? 0.5 : 0) + 0.5) * step
   If the file is missing or malformed, nothing is drawn and the panel stays
   a plain text panel (the figure is only shown once .has-map is set).
   The highlighted points are decorative, not data. */
(function () {
  'use strict';
  var canvas = document.getElementById('riskMap');
  if (!canvas || !canvas.getContext) return;
  var panel = canvas.closest('.risk__panel');
  if (!panel) return;

  // Decorative highlight points [lat, lon]. Not events, not live.
  var MARKS = [[49, 31], [31, 35], [15, 45], [9, 38], [34, 70], [22, 96]];
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  fetch('world-dots.json', { cache: 'force-cache' })
    .then(function (r) { if (!r.ok) throw 0; return r.json(); })
    .then(function (d) {
      if (!d || !d.rows || !d.rows.length || !d.step) throw 0;
      start(d);
    })
    .catch(function () { /* no data yet: leave the panel without a map */ });

  function start(d) {
    var ctx = canvas.getContext('2d');
    var step = d.step, lat0 = d.lat0;
    var latMin = -58, latMax = 80; // crop Antarctica and the far north
    var dots = [];
    d.rows.forEach(function (cols, r) {
      var lat = lat0 - (r + 0.5) * step;
      if (lat > latMax || lat < latMin) return;
      cols.forEach(function (c) {
        dots.push([-180 + (c + (r % 2 ? 0.5 : 0) + 0.5) * step, lat]);
      });
    });
    var w = 0, h = 0, dpr = 1, t0 = performance.now(), raf = 0, visible = true;

    function size() {
      var rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, rect.width); h = Math.max(1, rect.height);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function px(lon, lat) {
      return [(lon + 180) / 360 * w, (latMax - lat) / (latMax - latMin) * h];
    }
    function draw(now) {
      ctx.clearRect(0, 0, w, h);
      var rad = Math.max(1, w / 360 * step * 0.34);
      ctx.fillStyle = 'rgba(200,189,219,0.42)';
      for (var i = 0; i < dots.length; i++) {
        var p = px(dots[i][0], dots[i][1]);
        ctx.fillRect(p[0] - rad, p[1] - rad, rad * 2, rad * 2);
      }
      var t = (now - t0) / 1000;
      for (var m = 0; m < MARKS.length; m++) {
        var q = px(MARKS[m][1], MARKS[m][0]);
        var k = reduce ? 0.5 : ((t / 2.4 + m * 0.37) % 1);
        ctx.beginPath(); ctx.arc(q[0], q[1], rad * 1.8, 0, 6.2832);
        ctx.fillStyle = '#E4E932'; ctx.fill();
        ctx.beginPath(); ctx.arc(q[0], q[1], rad * 1.8 + k * rad * 7, 0, 6.2832);
        ctx.strokeStyle = 'rgba(228,233,50,' + (0.5 * (1 - k)).toFixed(3) + ')';
        ctx.lineWidth = 1; ctx.stroke();
      }
    }
    function loop(now) {
      draw(now);
      raf = (visible && !reduce) ? requestAnimationFrame(loop) : 0;
    }

    panel.classList.add('has-map');
    size();
    draw(performance.now());
    if (!reduce) raf = requestAnimationFrame(loop);

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (e) {
        visible = e[0].isIntersecting;
        if (visible && !raf && !reduce) raf = requestAnimationFrame(loop);
      }).observe(canvas);
    }
    var rt;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () { size(); draw(performance.now()); }, 120);
    });
  }
})();
