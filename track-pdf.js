/*
 * track-pdf.js
 * "Download PDF" for the public Track Record page (track-record.html).
 *
 * Who can download: Basic, Pro and Premium plans. The free trial is NOT included.
 * Plan check = same rule as blog-paywall.js: profiles.plan_tier in Supabase, and an
 * expired plan reads back as free. Anyone else gets a small popover (sign in / upgrade).
 *
 * The PDF is built in the browser from the same static files the page already shows
 * (/data/track-summary.json, track-monthly.json, track-batches.json) using jsPDF text
 * and tables, so it is small and the numbers always match the page. It does not list
 * individual signals (there are tens of thousands); the page's history table does that.
 *
 * Note: this gate runs in the browser, like the blog's PDF gate. The numbers themselves
 * are public static files, so the gate protects the convenience of a ready-made report,
 * not secret data.
 */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://qdigrvhwvnrjznqkjltn.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_vN8drh5iobJ2-mWmjk0joA_eRBQJVJa';
  var PDF_TIERS = ['basic', 'pro', 'premium']; // trial intentionally excluded
  var JSPDF_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  var LOGO_URL = '/Assets/sapex-icon.png';
  var DISCLAIMER = 'Past results do not predict future results. A win rate counts how often a target or a stop was reached, not profit or loss. Nothing in this report is financial advice.';
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  var btn = document.getElementById('trPdfBtn');
  if (!btn) return;

  var sb = null;
  function client() {
    if (!sb && typeof window.supabase !== 'undefined') sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return sb;
  }

  function getPlan() {
    var c = client();
    if (!c) return Promise.resolve({ loggedIn: false, plan: 'free' });
    return c.auth.getUser().then(function (r) {
      var user = r && r.data && r.data.user;
      if (!user) return { loggedIn: false, plan: 'free' };
      return c.from('profiles').select('plan_tier, subscription_expiry').eq('id', user.id).single().then(function (p) {
        var prof = p && p.data;
        if (p.error || !prof || !prof.plan_tier || prof.plan_tier === 'free') return { loggedIn: true, plan: 'free' };
        var expired = new Date() > new Date(prof.subscription_expiry);
        return { loggedIn: true, plan: expired ? 'free' : prof.plan_tier };
      });
    }).catch(function () { return { loggedIn: false, plan: 'free' }; });
  }

  function signIn() {
    var c = client();
    if (c) c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.href } });
  }

  function closePop() { var p = document.getElementById('trPdfPop'); if (p) p.remove(); }
  function showPop(state) {
    closePop();
    var pop = document.createElement('div');
    pop.id = 'trPdfPop';
    pop.className = 'tr-pdfpop';
    pop.setAttribute('role', 'status');
    var text, cta;
    if (!state.loggedIn) {
      text = 'The PDF report is for Basic, Pro and Premium members. Sign in to continue.';
      cta = '<button type="button" class="tr-pdfpop__btn" id="trPdfSignIn">Sign in</button>';
    } else if (state.plan === 'trial') {
      text = 'The PDF report is for paid plans (Basic, Pro and Premium). It is not included in the free trial.';
      cta = '<a class="tr-pdfpop__btn" href="app.html#pricing">See plans</a>';
    } else {
      text = 'The PDF report is for Basic, Pro and Premium members.';
      cta = '<a class="tr-pdfpop__btn" href="app.html#pricing">See plans</a>';
    }
    pop.innerHTML = '<p>' + text + '</p>' + cta;
    btn.insertAdjacentElement('afterend', pop);
    var si = document.getElementById('trPdfSignIn');
    if (si) si.addEventListener('click', signIn);
    setTimeout(function () {
      document.addEventListener('click', function off(e) {
        if (!pop.contains(e.target) && e.target !== btn && !btn.contains(e.target)) { closePop(); document.removeEventListener('click', off); }
      });
    }, 0);
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.jspdf && window.jspdf.jsPDF) return resolve();
      var s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = function () { reject(new Error('jsPDF failed to load')); };
      document.head.appendChild(s);
    });
  }
  function getJSON(name) {
    return fetch('/data/' + name, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(name + ' ' + r.status);
      return r.json();
    });
  }
  function loadLogo() {
    return fetch(LOGO_URL).then(function (r) { return r.blob(); }).then(function (b) {
      return new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = function () { res(null); }; fr.readAsDataURL(b); });
    }).catch(function () { return null; });
  }

  var fmt = function (n) { return Number(n || 0).toLocaleString('en-US'); };
  var pct = function (n) { return n === null || n === undefined || isNaN(n) ? '-' : (Math.round(n * 10) / 10).toFixed(1) + '%'; };
  function mLabel(k) { var p = String(k).split('-'); return MONTHS[+p[1] - 1] + ' ' + p[0]; }
  function dLong(s) { var p = String(s).split('-'); return (+p[2]) + ' ' + MONTHS[+p[1] - 1] + ' ' + p[0]; }
  function rangeTxt(b) {
    if (!b.released_from) return '-';
    return dLong(b.released_from) + ' to ' + dLong(b.released_to);
  }

  function build(jsPDF, logo, data) {
    var doc = new jsPDF({ unit: 'pt', format: 'a4' });
    var PW = doc.internal.pageSize.getWidth(), PH = doc.internal.pageSize.getHeight();
    var MX = 40, TOP = 78, BOT = 56, y = TOP;
    var summary = data.summary || {}, months = (data.monthly && data.monthly.months) || [], bf = data.batches || {};
    var rules = summary.rules || {};

    var t = months.reduce(function (a, m) {
      a.released += m.released || 0; a.wins += m.wins || 0; a.losses += m.losses || 0; a.expired += m.expired || 0; a.active += m.active || 0; return a;
    }, { released: 0, wins: 0, losses: 0, expired: 0, active: 0 });
    var closed = t.wins + t.losses;
    var rate = closed ? t.wins * 100 / closed : null;
    var strict = (closed + t.expired) ? t.wins * 100 / (closed + t.expired) : null;

    function need(h) { if (y + h > PH - BOT) { doc.addPage(); y = TOP; } }
    function h1(text) { need(34); doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(16, 20, 24); doc.text(text, MX, y); y += 26; }
    function h2(text) { need(30); y += 8; doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5); doc.setTextColor(16, 20, 24); doc.text(text, MX, y); y += 18; }
    function para(text, size) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(size || 9.5); doc.setTextColor(60, 68, 80);
      var lines = doc.splitTextToSize(text, PW - MX * 2);
      lines.forEach(function (ln) { need(14); doc.text(ln, MX, y); y += 13; });
      y += 4;
    }
    function table(cols, rows) {
      var rowH = 16;
      function head() {
        need(rowH + 4);
        doc.setFillColor(238, 241, 245); doc.rect(MX, y - 11, PW - MX * 2, rowH, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(30, 36, 46);
        var x = MX + 4;
        cols.forEach(function (c) { doc.text(c.h, c.right ? x + c.w - 8 : x, y, c.right ? { align: 'right' } : undefined); x += c.w; });
        y += rowH;
      }
      head();
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
      rows.forEach(function (r, i) {
        if (y + rowH > PH - BOT) { doc.addPage(); y = TOP; head(); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); }
        if (i % 2) { doc.setFillColor(248, 249, 251); doc.rect(MX, y - 11, PW - MX * 2, rowH, 'F'); }
        var x = MX + 4;
        r.forEach(function (cell, ci) {
          var c = cols[ci];
          doc.setTextColor(40, 48, 60);
          doc.text(String(cell), c.right ? x + c.w - 8 : x, y, c.right ? { align: 'right' } : undefined);
          x += c.w;
        });
        y += rowH;
      });
      y += 6;
    }

    // ---- page 1: summary
    h1('Signal Track Record');
    para('Every AI trading signal SaPEX NEXUS has released and how it ended: win, loss or expired. Counted from the public ledger' +
      (summary.first_signal ? ', starting ' + dLong(summary.first_signal) : '') + '. Report created ' + new Date().toUTCString().replace(' GMT', ' UTC') +
      (summary.generated_at ? '; data published ' + new Date(summary.generated_at).toUTCString().replace(' GMT', ' UTC') : '') + '.');

    h2('Totals');
    table([{ h: 'Measure', w: 300 }, { h: 'Value', w: 215, right: true }], [
      ['Signals released', fmt(t.released)],
      ['Closed with a result (wins + losses)', fmt(closed)],
      ['Wins (take-profit reached first)', fmt(t.wins)],
      ['Losses (stop-loss reached first)', fmt(t.losses)],
      ['Expired (neither level reached in time, or retired at the open limit)', fmt(t.expired)],
      ['Still open', fmt(t.active)],
      ['Win rate: wins / (wins + losses)', pct(rate)],
      ['Stricter win rate: wins / (wins + losses + expired)', pct(strict)]
    ]);

    h2('How results are decided');
    para('A win is a signal whose take-profit price was reached first. A loss is a signal whose stop-loss price was reached first. An expired signal reached neither' +
      (rules.expiry_hours ? ' within ' + rules.expiry_hours + ' hours' : ' before its time limit') +
      (rules.max_active ? ', or was retired because more than ' + rules.max_active + ' signals were open at once' : '') + '. ' +
      'Open signals are compared with the live price about every ' + (rules.check_minutes || 15) + ' minutes, so a very short spike between two checks can be missed and a recorded price can sit slightly past its target. ' +
      'Every finished batch of 100 closed signals carries a fingerprint code built from its signals and the batch before it, so an altered old batch would no longer match the code published earlier.');

    // ---- monthly
    h2('Signals by release month (UTC)');
    var mrows = months.slice().sort(function (a, b) { return a.month < b.month ? 1 : -1; }).map(function (m) {
      var c = (m.wins || 0) + (m.losses || 0);
      return [mLabel(m.month), fmt(m.released), fmt(m.wins), fmt(m.losses), fmt(m.expired), pct(c ? m.wins * 100 / c : null)];
    });
    table([{ h: 'Month', w: 115 }, { h: 'Released', w: 80, right: true }, { h: 'Wins', w: 80, right: true }, { h: 'Losses', w: 80, right: true }, { h: 'Expired', w: 80, right: true }, { h: 'Win rate', w: 80, right: true }], mrows);
    para('Signals are grouped by the month they were released. Signals from the current month can still be open, so its wins and losses can change.', 8.5);

    // ---- batches
    var list = bf.batches || [];
    h2('Every batch of ' + (bf.batch_size || 100) + ' closed signals');
    var brows = [];
    if (bf.in_progress && bf.in_progress.size > 0) {
      var ip = bf.in_progress;
      brows.push(['#' + ip.n + ' (open)', fmt(ip.size) + ' of ' + (bf.batch_size || 100), rangeTxt(ip), fmt(ip.wins), fmt(ip.losses), pct(ip.win_pct), '-']);
    }
    list.forEach(function (b) {
      brows.push(['#' + b.n, fmt(b.first_seq) + ' - ' + fmt(b.last_seq), rangeTxt(b), fmt(b.wins), fmt(b.losses), pct(b.win_pct), b.fp || '-']);
    });
    if (brows.length) {
      table([{ h: 'Batch', w: 62 }, { h: 'Closed signals', w: 92 }, { h: 'Released between', w: 160 }, { h: 'Wins', w: 42, right: true }, { h: 'Losses', w: 50, right: true }, { h: 'Win rate', w: 56, right: true }, { h: 'Fingerprint', w: 60 }], brows);
    } else {
      para('The first batch is still filling up.');
    }

    h2('Limitations');
    para('A win rate is not a profit: it counts how often a target or a stop was reached, not how large each win or loss was, and it ignores fees and slippage. ' +
      'Expired signals are not in the main win rate, which is why the stricter figure is shown beside it. All dates and months are UTC. The ledger starts at the first date shown above; nothing earlier is included. ' +
      'Open signals are not published here. Live figures are always on https://www.sapexnexus.com/track-record.html.');

    // ---- decorate every page
    var pages = doc.internal.getNumberOfPages();
    for (var i = 1; i <= pages; i++) {
      doc.setPage(i);
      if (logo) { try { doc.addImage(logo, 'PNG', MX, 24, 26, 26); } catch (e) {} }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(20, 24, 32);
      doc.text('SaPEX NEXUS', logo ? MX + 34 : MX, 42);
      doc.setDrawColor(220, 224, 230); doc.line(MX, 58, PW - MX, 58);
      if (logo) {
        try {
          var s = Math.min(PW, PH) * 0.5;
          doc.saveGraphicsState(); doc.setGState(new doc.GState({ opacity: 0.05 }));
          doc.addImage(logo, 'PNG', (PW - s) / 2, (PH - s) / 2, s, s); doc.restoreGraphicsState();
        } catch (e) {}
      }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(120, 128, 140);
      var dl = doc.splitTextToSize(DISCLAIMER, PW - MX * 2 - 60);
      doc.text(dl, MX, PH - 26 - (dl.length - 1) * 8);
      doc.text('Page ' + i + ' of ' + pages, PW - MX, PH - 26, { align: 'right' });
    }
    return doc;
  }

  function generate() {
    var label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Preparing PDF';
    Promise.all([
      loadScript(JSPDF_SRC), loadLogo(),
      getJSON('track-summary.json'),
      getJSON('track-monthly.json'),
      getJSON('track-batches.json').catch(function () { return null; })
    ]).then(function (r) {
      var doc = build(window.jspdf.jsPDF, r[1], { summary: r[2], monthly: r[3], batches: r[4] });
      doc.save('sapex-nexus-track-record-' + new Date().toISOString().slice(0, 10) + '.pdf');
    }).catch(function (e) {
      console.warn('track-pdf.js: PDF failed.', e);
      closePop();
      var pop = document.createElement('div');
      pop.id = 'trPdfPop'; pop.className = 'tr-pdfpop';
      pop.innerHTML = '<p>The PDF could not be created just now. Please try again in a moment.</p>';
      btn.insertAdjacentElement('afterend', pop);
    }).then(function () { btn.disabled = false; btn.innerHTML = label; });
  }

  btn.addEventListener('click', function () {
    closePop();
    getPlan().then(function (state) {
      if (PDF_TIERS.indexOf(state.plan) !== -1) generate(); else showPop(state);
    });
  });
})();
