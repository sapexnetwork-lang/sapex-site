// js/animations.js
// Small, dependency-free animation helpers shared by map-app.js.
// Exposed as window.SapexAnim so this can be included with a plain
// <script> tag — no bundler/module step required.

window.SapexAnim = (function () {

  /**
   * Animate a number counting up (or down) inside an element.
   * Leaves any non-numeric prefix/suffix in el's dataset alone — caller
   * passes a formatter so "~1,204" / "42 zones" etc. all work.
   */
  // One running count-up per element. A newer call cancels the older one and continues from the value
  // currently on screen, so a fast second update is never skipped (the old code returned early while an
  // animation was running and left stale numbers).
  const countFrames = new WeakMap();

  function animateCount(el, toValue, { duration = 700, formatter = (n) => Math.round(n).toLocaleString() } = {}) {
    if (!el) return;
    const target = Number(toValue);
    if (!Number.isFinite(target)) return;

    const running = countFrames.get(el);
    if (running) { cancelAnimationFrame(running); countFrames.delete(el); }

    // rawValue always holds the number currently shown (updated every frame while counting)
    const fromValue = parseFloat(el.dataset.rawValue || '0') || 0;
    // Nothing to animate, or the tab is hidden (requestAnimationFrame is paused there): set the final value now.
    if (fromValue === target || document.hidden) {
      el.textContent = formatter(target);
      el.dataset.rawValue = String(target);
      el.dataset.animating = '0';
      return;
    }

    el.dataset.animating = '1';
    const start = performance.now();
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    function tick(now) {
      const t = Math.min(1, Math.max(0, (now - start) / duration));
      const eased = easeOutCubic(t);
      const current = fromValue + (target - fromValue) * eased;
      el.textContent = formatter(current);
      el.dataset.rawValue = String(current);
      if (t < 1) {
        countFrames.set(el, requestAnimationFrame(tick));
      } else {
        countFrames.delete(el);
        el.dataset.animating = '0';
        el.dataset.rawValue = String(target);
        flash(el);
      }
    }
    countFrames.set(el, requestAnimationFrame(tick));
  }

  /** Brief scale/glow pulse — used whenever a stat value changes. */
  function flash(el) {
    el.classList.remove('stat-flash');
    // force reflow so the animation restarts if it's already applied
    void el.offsetWidth;
    el.classList.add('stat-flash');
  }

  /**
   * Fade a Mapbox GL layer's paint property from 0 to `target`.
   * Requires the layer to already have `<prop>-transition` set in its
   * paint definition (map-app.js does this for circle-opacity).
   */
  function fadeInLayer(map, layerId, property, target, delay = 0) {
    if (!map.getLayer(layerId)) return;
    map.setPaintProperty(layerId, property, 0);
    setTimeout(() => {
      if (map.getLayer(layerId)) map.setPaintProperty(layerId, property, target);
    }, delay);
  }

  /**
   * Slide the range-pills' active-highlight behind the clicked button.
   * Reads/writes CSS custom properties consumed by .range-pills::before.
   */
  function slidePillIndicator(container, activeBtn) {
    const containerRect = container.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();
    container.style.setProperty('--pill-x', (btnRect.left - containerRect.left) + 'px');
    container.style.setProperty('--pill-w', btnRect.width + 'px');
  }

  /** Set the loader progress bar width (0-100). */
  function setProgress(el, percent) {
    if (!el) return;
    const bar = el.querySelector('.loader-progress');
    if (bar) bar.style.width = percent + '%';
  }

  /** Fill the progress bar, then fade the loading overlay out. */
  function hideLoading(el) {
    if (!el) return;
    setProgress(el, 100);
    setTimeout(() => el.classList.add('hide'), 250);
  }

  function showLoading(el, text, percent) {
    if (!el) return;
    el.classList.remove('hide');
    if (text) {
      const p = el.querySelector('.loader-text');
      if (p) p.textContent = text;
    }
    if (typeof percent === 'number') setProgress(el, percent);
  }

  /* ------------------------------------------------------------------
     Live-map engine (stage 6): ONE shared requestAnimationFrame loop for every map animation,
     plus colour helpers that read the brand tokens at run time (Mapbox paint cannot use CSS variables).
     ------------------------------------------------------------------ */
  const reducedMq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  /** True when the visitor asked the system for reduced motion: pulses, trails, sweep and rotation stay off. */
  const reduced = () => !!(reducedMq && reducedMq.matches);
  function onReducedChange(fn) {
    if (!reducedMq) return;
    if (reducedMq.addEventListener) reducedMq.addEventListener('change', fn); else reducedMq.addListener(fn);
  }

  /** Named tasks share one rAF loop. A task runs at most once per `every` ms. The loop idles while the tab is hidden. */
  const loop = (function () {
    const tasks = new Map();
    let raf = 0;
    function frame(now) {
      raf = 0;
      if (document.hidden) return;
      tasks.forEach((t) => { if (now - t.last >= t.every) { t.last = now; t.fn(now); } });
      if (tasks.size) raf = requestAnimationFrame(frame);
    }
    function start() { if (!raf && tasks.size && !document.hidden) raf = requestAnimationFrame(frame); }
    document.addEventListener('visibilitychange', start);
    return {
      add(name, fn, every) { tasks.set(name, { fn, every: every || 0, last: 0 }); start(); },
      remove(name) { tasks.delete(name); },
      has(name) { return tasks.has(name); },
    };
  })();

  /** A brand token such as '--brand-lime' as a #rrggbb string, or the fallback when it is missing. */
  function brand(name, fallback) {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
    } catch (e) { return fallback; }
  }
  function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  /** Blend two #rrggbb colours: t = 0 gives a, t = 1 gives b. */
  function mix(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
  }
  function rgba(h, a) { return 'rgba(' + hexToRgb(h).join(',') + ',' + a + ')'; }
  /** Slow 0..1 breathing value for glows. */
  function breath(now, periodMs) { return 0.5 + 0.5 * Math.sin((now / periodMs) * 2 * Math.PI); }

  return { animateCount, flash, fadeInLayer, slidePillIndicator, hideLoading, showLoading, setProgress,
           loop, reduced, onReducedChange, brand, mix, rgba, breath };
})();