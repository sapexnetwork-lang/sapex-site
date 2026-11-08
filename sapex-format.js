/* ==========================================================================
   SaPEX NEXUS - formatting helpers (stage 2)
   One set of pure functions for prices, percents, large numbers, times,
   statuses and risk-to-reward. No dependency on app.js. Exposed as
   window.SapexFormat in the browser and via module.exports in Node (tests).
   Unknown or invalid input always gives a dash, never a zero.
   ========================================================================== */
(function (root) {
  'use strict';

  var DASH = '—';          // em dash
  var MINUS = '−';         // true minus sign
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function toNum(v) {
    if (v === null || v === undefined || v === '') return NaN;
    var n = typeof v === 'number' ? v : Number(v);
    return isFinite(n) ? n : NaN;
  }

  function group(n, decimals) {
    return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  /* Decimals by size: >=1000 -> 2; 1..999 -> 2 to 4 (trailing zeros beyond 2 trimmed);
     <1 -> 4 significant digits; sub-cent coins up to 8 decimals. */
  function priceDecimals(abs) {
    if (abs >= 1000) return 2;
    if (abs >= 1) return 4;                     // trimmed to a minimum of 2 below
    if (abs === 0) return 2;
    var lead = -Math.floor(Math.log10(abs));    // leading zeros after the point + 1
    return Math.min(8, Math.max(4, lead + 3));
  }

  function formatPriceDecimals(abs, d) {
    var s = group(abs, d);
    if (abs >= 1 && abs < 1000 && d > 2) {
      s = s.replace(/(\.\d{2})(\d*?)0+$/, '$1$2');   // keep at least 2 decimals
    }
    return s;
  }

  /* formatPrice(64123.456) -> "$64,123.46"; formatPrice(0.00001234) -> "$0.00001234" */
  function formatPrice(value, opts) {
    var n = toNum(value);
    if (isNaN(n)) return DASH;
    opts = opts || {};
    var sym = opts.currency === false ? '' : '$';
    var sign = n < 0 ? MINUS : '';
    var abs = Math.abs(n);
    if (abs > 0 && abs < 0.00000001) return sym + '<0.00000001';
    var d = opts.decimals != null ? opts.decimals : priceDecimals(abs);
    return sign + sym + (opts.decimals != null ? group(abs, d) : formatPriceDecimals(abs, d));
  }

  /* Entry, target and stop must never look identical: add decimals (max 8) until they differ. */
  function formatPriceSet(values, opts) {
    var nums = values.map(toNum);
    var valid = nums.filter(function (n) { return !isNaN(n); });
    var distinct = new Set(valid).size;
    var base = valid.length ? Math.max.apply(null, valid.map(function (n) { return priceDecimals(Math.abs(n)); })) : 2;
    var d = base;
    while (d < 8) {
      var shown = new Set(valid.map(function (n) { return n.toFixed(d); }));
      if (shown.size === distinct) break;
      d++;
    }
    return nums.map(function (n) {
      if (isNaN(n)) return DASH;
      var set = Object.assign({}, opts || {}, { decimals: Math.max(d, 2) });
      return formatPrice(n, set);
    });
  }

  /* formatPercent(3.2) -> "+3.20%"; formatPercent(-2.15, {decimals: 2}) -> "−2.15%" */
  function formatPercent(value, opts) {
    var n = toNum(value);
    if (isNaN(n)) return DASH;
    opts = opts || {};
    var d = opts.decimals != null ? opts.decimals : (Math.abs(n) >= 10 ? 1 : 2);
    var rounded = Number(n.toFixed(d));
    var sign = rounded > 0 ? '+' : rounded < 0 ? MINUS : '';
    if (opts.signed === false) sign = rounded < 0 ? MINUS : '';
    return sign + Math.abs(rounded).toFixed(d) + '%';
  }

  function direction(value) {
    var n = toNum(value);
    if (isNaN(n) || Number(n.toFixed(2)) === 0) return 'flat';
    return n > 0 ? 'up' : 'down';
  }

  var ARROWS = {
    up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    down: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
    flat: '<path d="M5 12h14"/>'
  };

  /* Price change with arrow icon plus sign, so colour is never the only signal. */
  function deltaHtml(value, opts) {
    var dir = direction(value);
    if (isNaN(toNum(value))) return '<span class="sx-delta">' + DASH + '</span>';
    return '<span class="sx-delta is-' + dir + '"><svg class="sx-icon" viewBox="0 0 24 24" aria-hidden="true">' +
      ARROWS[dir] + '</svg>' + formatPercent(value, opts) + '</span>';
  }

  /* formatCompact(41500) -> "41.5K"; pair with formatExact() for the hover title. */
  function formatCompact(value, opts) {
    var n = toNum(value);
    if (isNaN(n)) return DASH;
    var abs = Math.abs(n);
    var units = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
    var sign = n < 0 ? MINUS : '';
    for (var i = 0; i < units.length; i++) {
      if (abs >= units[i][0]) {
        var v = abs / units[i][0];
        var s = (v >= 100 ? v.toFixed(0) : v.toFixed(1)).replace(/\.0$/, '');
        return sign + ((opts && opts.currency) ? '$' : '') + s + units[i][1];
      }
    }
    return sign + ((opts && opts.currency) ? '$' : '') + group(abs, Number.isInteger(abs) ? 0 : 2);
  }

  function formatExact(value, opts) {
    var n = toNum(value);
    if (isNaN(n)) return DASH;
    var s = group(Math.abs(n), Number.isInteger(n) ? 0 : 2);
    return (n < 0 ? MINUS : '') + ((opts && opts.currency) ? '$' : '') + s;
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  /* Under 24 hours: relative ("12m ago"). Older: date and time with the zone ("Oct 25, 14:05 UTC"). */
  function formatTime(value, now) {
    var t = value instanceof Date ? value : new Date(value);
    if (value === null || value === undefined || value === '' || isNaN(t.getTime())) return DASH;
    var ref = now ? (now instanceof Date ? now.getTime() : Number(now)) : Date.now();
    var diff = ref - t.getTime();
    if (diff < 0 && diff > -60000) return 'just now';
    if (diff >= 0 && diff < 24 * 3600 * 1000) {
      var m = Math.floor(diff / 60000);
      if (m < 1) return 'just now';
      if (m < 60) return m + 'm ago';
      return Math.floor(m / 60) + 'h ago';
    }
    return formatDateTime(t);
  }

  function formatDateTime(value) {
    var t = value instanceof Date ? value : new Date(value);
    if (isNaN(t.getTime())) return DASH;
    return MONTHS[t.getUTCMonth()] + ' ' + t.getUTCDate() + ', ' + pad(t.getUTCHours()) + ':' + pad(t.getUTCMinutes()) + ' UTC';
  }

  function formatClockUTC(value) {
    var t = value ? (value instanceof Date ? value : new Date(value)) : new Date();
    if (isNaN(t.getTime())) return DASH;
    return pad(t.getUTCHours()) + ':' + pad(t.getUTCMinutes()) + ' UTC';
  }

  /* Raw database text -> capitalised word plus a tone that maps to .sx-pill--{tone}.
     The alias list is a best guess: confirm against the real status values when the
     signal table is migrated (stage 5). Unknown values are tidied, never hidden. */
  var STATUS_MAP = {
    active: ['Active', 'active'], open: ['Active', 'active'], live: ['Active', 'active'], pending: ['Active', 'active'],
    hit_target: ['Hit target', 'hit'], target_hit: ['Hit target', 'hit'], tp_hit: ['Hit target', 'hit'],
    hit: ['Hit target', 'hit'], won: ['Hit target', 'hit'], win: ['Hit target', 'hit'], success: ['Hit target', 'hit'],
    stopped: ['Stopped', 'stopped'], stop_hit: ['Stopped', 'stopped'], sl_hit: ['Stopped', 'stopped'],
    stopped_out: ['Stopped', 'stopped'], lost: ['Stopped', 'stopped'], loss: ['Stopped', 'stopped'],
    expired: ['Expired', 'expired'], closed: ['Expired', 'expired'], cancelled: ['Expired', 'expired'], canceled: ['Expired', 'expired']
  };

  function formatStatus(raw) {
    if (raw === null || raw === undefined || String(raw).trim() === '') return { label: DASH, tone: 'expired' };
    var key = String(raw).trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (STATUS_MAP[key]) return { label: STATUS_MAP[key][0], tone: STATUS_MAP[key][1] };
    var words = key.replace(/_/g, ' ');
    return { label: words.charAt(0).toUpperCase() + words.slice(1), tone: 'expired' };
  }

  function statusHtml(raw) {
    var s = formatStatus(raw);
    return '<span class="sx-chip sx-pill sx-pill--' + s.tone + '">' + s.label + '</span>';
  }

  /* Distance from entry as a signed percent. */
  function distancePercent(entry, level) {
    var e = toNum(entry), l = toNum(level);
    if (isNaN(e) || isNaN(l) || e === 0) return NaN;
    return ((l - e) / e) * 100;
  }

  /* Risk-to-reward as "1 : 1.5" (reward per 1 unit of risk). */
  function formatRiskReward(entry, target, stop) {
    var e = toNum(entry), t = toNum(target), s = toNum(stop);
    if (isNaN(e) || isNaN(t) || isNaN(s)) return DASH;
    var risk = Math.abs(e - s), reward = Math.abs(t - e);
    if (risk === 0) return DASH;
    return '1 : ' + (reward / risk).toFixed(1);
  }

  var api = {
    DASH: DASH,
    formatPrice: formatPrice,
    formatPriceSet: formatPriceSet,
    formatPercent: formatPercent,
    direction: direction,
    deltaHtml: deltaHtml,
    formatCompact: formatCompact,
    formatExact: formatExact,
    formatTime: formatTime,
    formatDateTime: formatDateTime,
    formatClockUTC: formatClockUTC,
    formatStatus: formatStatus,
    statusHtml: statusHtml,
    distancePercent: distancePercent,
    formatRiskReward: formatRiskReward
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SapexFormat = api;
})(typeof window !== 'undefined' ? window : globalThis);
