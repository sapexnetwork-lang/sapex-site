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
  function animateCount(el, toValue, { duration = 700, formatter = (n) => Math.round(n).toLocaleString() } = {}) {
    if (el.dataset.animating === '1') return;
    const fromValue = parseFloat(el.dataset.rawValue || '0') || 0;
    if (fromValue === toValue) { el.textContent = formatter(toValue); return; }

    el.dataset.animating = '1';
    const start = performance.now();
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = easeOutCubic(t);
      const current = fromValue + (toValue - fromValue) * eased;
      el.textContent = formatter(current);
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        el.dataset.animating = '0';
        el.dataset.rawValue = String(toValue);
        flash(el);
      }
    }
    requestAnimationFrame(tick);
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

  /** Fade the loading overlay out, then hide it after the transition ends. */
  function hideLoading(el) {
    el.classList.add('hide');
  }
  function showLoading(el, text) {
    el.classList.remove('hide');
    if (text) el.querySelector('p').textContent = text;
  }

  return { animateCount, flash, fadeInLayer, slidePillIndicator, hideLoading, showLoading };
})();