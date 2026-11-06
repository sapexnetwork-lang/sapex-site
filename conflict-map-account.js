// conflict-map-account.js (redesign stage 10)
// The map joins the SaPEX account system. It is NOT a second auth system: it uses the same Supabase project, the same
// Google sign-in and the same `profiles` table as the terminal (app.js: signInWithGoogle, handleAuthChange,
// loadUserSubscription). The Supabase client from /api/map-config shares its saved session with the app (same origin,
// same project), so a visitor who is already signed in to the terminal is signed in here too.
//
// Plan source: profiles.plan_tier ('free' | 'trial' | 'basic' | 'pro' | 'premium') and profiles.subscription_expiry.
// The plan is read from the database after every sign-in. Only 'free' and 'trial' are cached in localStorage (matching
// the app's own security note); a paid plan is never read from the browser. This file never writes a plan.
//
// Public API (window.SapexAccount):
//   getUser()            -> { id, email, name, avatar, initials } or null
//   getPlan()            -> 'guest' | 'free' | 'trial' | 'basic' | 'pro' | 'premium'
//   onChange(cb)         -> cb({ user, plan }) on every sign-in, sign-out or plan change; returns an unsubscribe function
//   requirePlan(plan, o) -> true if the current plan includes `plan` (trial counts as premium). With { prompt: true } a
//                           guest is sent to Google sign-in and a signed-in user to the app's pricing page.
//   isReady()           -> true once the first session lookup has finished (before that the plan is not known yet)
//   locked(plan, o)     -> HTML for the one shared locked-content block (stage 11): black bars, lock icon, plan name and an
//                          "Unlock details" button that opens the app's pricing page. Callers pass generic copy only, never real data.
// Gating itself is decided by the server (stage 12). This object only tells the page what to display.
window.SapexAccount = (function () {
  'use strict';

  var RANK = { guest: 0, free: 1, basic: 2, pro: 3, premium: 4, trial: 4 };
  var LABEL = { free: 'Free', trial: 'Trial', basic: 'Basic', pro: 'Pro', premium: 'Premium' };
  var CACHE_KEY = 'sapex_map_plan_v1';
  var APP = 'app.html', PRICING = 'app.html#pricing', PROFILE = 'app.html#profile';
  var REFRESH_MS = 60000;

  var ctx = null, client = null, slot = null, menu = null, btn = null;
  var S = { user: null, plan: 'guest', ready: false };
  var listeners = [], lastPlanAt = 0, ensuredFor = null, loadingFor = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function safeImg(u) { return /^https:\/\//i.test(u || '') ? u : ''; }

  /* ---------------- public API ---------------- */
  function getUser() { return S.user ? { id: S.user.id, email: S.user.email, name: S.user.name, avatar: S.user.avatar, initials: S.user.initials } : null; }
  function getPlan() { return S.plan; }
  function onChange(cb) {
    if (typeof cb !== 'function') return function () {};
    listeners.push(cb);
    return function () { listeners = listeners.filter(function (f) { return f !== cb; }); };
  }
  function requirePlan(plan, opts) {
    var ok = (RANK[S.plan] || 0) >= (RANK[plan] || 0);
    if (!ok && opts && opts.prompt) { if (!S.user) signIn(); else window.open(PRICING, '_blank', 'noopener'); }
    return ok;
  }
  function emit() {
    var snap = { user: getUser(), plan: S.plan };
    listeners.slice().forEach(function (f) { try { f(snap); } catch (e) { console.warn('[account] listener failed:', e); } });
  }

  function isReady() { return S.ready; }

  /** The one locked block used by the panel and the ticker. It never contains the locked text, only bars and generic copy. */
  var BARS = [92, 78, 64];
  function locked(plan, o) {
    o = o || {};
    var name = LABEL[plan] || 'Paid', n = Math.max(1, Math.min(3, o.bars || 3)), bars = '';
    for (var i = 0; i < n; i++) bars += '<span style="width:' + BARS[i] + '%"></span>';
    return '<div class="lk' + (o.compact ? ' lk-compact' : '') + '" role="group" aria-label="Locked: ' + esc(name) + ' plan required">' +
      '<div class="lk-bars" aria-hidden="true">' + bars + '</div>' +
      '<div class="lk-row"><i class="fa-solid fa-lock" aria-hidden="true"></i><span class="lk-plan">' + esc(name) + ' plan</span></div>' +
      (o.text ? '<p class="lk-text">' + esc(o.text) + '</p>' : '') +
      (o.noButton ? '' : '<button type="button" class="pbtn lk-btn" data-unlock="' + esc(plan) + '">Unlock details</button>') + '</div>';
  }
  document.addEventListener('click', function (e) {   // one handler for every Unlock button on the page
    if (e.target.closest('[data-unlock]')) window.open(PRICING, '_blank', 'noopener');
  });

  /* ---------------- session and plan ---------------- */
  function toUser(session) {
    if (!session || !session.user) return null;
    var u = session.user, meta = u.user_metadata || {}, name = meta.full_name || meta.name || 'Trader';
    return { id: u.id, email: u.email || '', name: name, avatar: safeImg(meta.avatar_url),
      initials: name.split(' ').map(function (n) { return n[0] || ''; }).join('').substring(0, 2).toUpperCase() || 'S' };
  }

  function readCache(uid) {
    try {
      var c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (!c || c.uid !== uid) return null;
      if (c.plan === 'free') return 'free';
      if (c.plan === 'trial' && c.exp > Date.now()) return 'trial';
    } catch (e) { /* storage unavailable */ }
    return null;
  }
  function writeCache(uid, plan, expMs) {
    try {
      if (plan === 'free' || plan === 'trial') localStorage.setItem(CACHE_KEY, JSON.stringify({ uid: uid, plan: plan, exp: expMs || 0 }));
      else localStorage.removeItem(CACHE_KEY);   // paid plans are never kept in the browser
    } catch (e) { /* ignore */ }
  }

  /** profiles.plan_tier + subscription_expiry, exactly as the app reads them. An expired paid plan counts as Free
   *  (display only: the app is the one that writes the downgrade). */
  async function fetchPlan(uid) {
    var r = await client.from('profiles').select('plan_tier, subscription_expiry').eq('id', uid).maybeSingle();
    if (r.error) throw r.error;
    var tier = r.data && r.data.plan_tier ? String(r.data.plan_tier).toLowerCase() : 'free';
    if (!LABEL[tier]) tier = 'free';
    var exp = r.data && r.data.subscription_expiry ? Date.parse(r.data.subscription_expiry) : 0;
    if (tier !== 'free' && !(exp > Date.now())) tier = 'free';
    return { plan: tier, exp: exp };
  }

  function setState(user, plan) {
    var changed = (S.user && S.user.id) !== (user && user.id) || S.plan !== plan || !S.ready;   // the first answer counts as a change
    S.user = user; S.plan = plan; S.ready = true;
    renderButton();
    if (changed) emit();
  }

  async function loadPlan(user, force) {
    if (loadingFor === user.id) return;
    if (!force && Date.now() - lastPlanAt < REFRESH_MS && S.user && S.user.id === user.id) return;
    loadingFor = user.id;
    try {
      var p = await fetchPlan(user.id);
      lastPlanAt = Date.now();
      writeCache(user.id, p.plan, p.exp);
      setState(user, p.plan);
    } catch (e) {
      console.warn('[account] plan lookup failed, showing Free:', e);
      lastPlanAt = Date.now();
      setState(user, 'free');   // fail closed: never guess a paid plan
    } finally { loadingFor = null; }
  }

  /** First sign-in from the map creates the same profile row the app creates (id + free plan, never overwrites). */
  function ensureProfile(user) {
    if (ensuredFor === user.id) return;
    ensuredFor = user.id;
    client.from('profiles').upsert({ id: user.id, plan_tier: 'free', updated_at: new Date().toISOString() }, { onConflict: 'id', ignoreDuplicates: true })
      .then(function (r) { if (r && r.error) console.warn('[account] profile row:', r.error); }, function () { /* non-fatal */ });
  }

  function onSession(session) {
    var user = toUser(session);
    if (!user) { ensuredFor = null; lastPlanAt = 0; setState(null, 'guest'); return; }
    var same = S.user && S.user.id === user.id;
    var plan = same ? S.plan : (readCache(user.id) || 'free');   // first paint only; the database answer replaces it
    setState(user, plan);
    ensureProfile(user);
    loadPlan(user, !same);
  }

  /* ---------------- sign in / out ---------------- */
  async function signIn() {
    if (!client) return;
    try {
      var res = await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: location.origin + location.pathname + location.search }   // back to this exact map view
      });
      if (res.error) throw res.error;
    } catch (e) { console.warn('[account] Google sign-in failed:', e); notice('Google sign-in could not start. Please try again.'); }
  }
  async function signOut() {
    closeMenu();
    try { await client.auth.signOut(); } catch (e) { console.warn('[account] sign-out failed:', e); }
    onSession(null);
  }
  function notice(msg) {
    var n = document.createElement('div');
    n.className = 'acct-note'; n.setAttribute('role', 'status'); n.textContent = msg;
    document.body.appendChild(n);
    setTimeout(function () { n.remove(); }, 4000);
  }

  /* ---------------- UI ---------------- */
  function renderButton() {
    if (!slot) return;
    closeMenu();
    if (!S.ready) { slot.innerHTML = ''; return; }
    if (!S.user) {
      slot.innerHTML =
        '<button type="button" class="acct-in" data-acct="in"><i class="fa-brands fa-google" aria-hidden="true"></i><span>Sign in</span></button>' +
        '<button type="button" class="acct-join" data-acct="in">Join SaPEX</button>';
      btn = null;
      return;
    }
    var u = S.user, badge = S.plan !== 'free' ? '<span class="acct-badge acct-' + S.plan + '">' + LABEL[S.plan].toUpperCase() + '</span>' : '';
    var av = u.avatar ? '<img src="' + esc(u.avatar) + '" alt="" referrerpolicy="no-referrer" decoding="async">' : esc(u.initials);
    slot.innerHTML = badge + '<button type="button" class="acct-av" id="acct-av" aria-haspopup="menu" aria-expanded="false" aria-controls="acct-menu" aria-label="Account menu for ' + esc(u.name) + '">' + av + '</button>';
    btn = document.getElementById('acct-av');
  }

  function openMenu() {
    if (!btn || menu) return;
    var u = S.user, r = btn.getBoundingClientRect();
    menu = document.createElement('div');
    menu.id = 'acct-menu'; menu.className = 'acct-menu'; menu.setAttribute('role', 'menu');
    menu.style.top = Math.round(r.bottom + 8) + 'px';
    menu.style.right = Math.max(8, Math.round(window.innerWidth - r.right)) + 'px';
    menu.innerHTML =
      '<div class="acct-who"><b>' + esc(u.name) + '</b><span>' + esc(u.email) + '</span><span class="acct-planline">Plan: ' + esc(LABEL[S.plan]) + '</span></div>' +
      '<a role="menuitem" href="' + PROFILE + '">View Profile</a>' +
      (S.plan === 'premium' || S.plan === 'trial' ? '' : '<a role="menuitem" href="' + PRICING + '">Upgrade</a>') +
      '<a role="menuitem" href="' + APP + '">Back to App</a>' +
      '<button type="button" role="menuitem" data-acct="out">Sign out</button>';
    document.body.appendChild(menu);
    btn.setAttribute('aria-expanded', 'true');
    var first = menu.querySelector('[role="menuitem"]');
    if (first) first.focus();
  }
  function closeMenu(refocus) {
    if (!menu) return;
    menu.remove(); menu = null;
    if (btn) { btn.setAttribute('aria-expanded', 'false'); if (refocus) btn.focus(); }
  }

  function onSlotClick(e) {
    var t = e.target.closest('[data-acct],#acct-av');
    if (!t) return;
    if (t.id === 'acct-av') { menu ? closeMenu(true) : openMenu(); return; }
    if (t.dataset.acct === 'in') signIn();
  }
  function onDocClick(e) {
    if (!menu) return;
    if (e.target.closest('#acct-menu')) { if (e.target.closest('[data-acct="out"]')) signOut(); return; }
    if (e.target.closest('#acct-av')) return;
    closeMenu();
  }
  function onKey(e) {
    if (!menu) return;
    if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    var items = Array.prototype.slice.call(menu.querySelectorAll('[role="menuitem"]')), i = items.indexOf(document.activeElement);
    e.preventDefault();
    items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
  }

  /* ---------------- start ---------------- */
  async function init(c) {
    if (ctx) return;
    ctx = c;
    client = ctx.supa && ctx.supa();
    slot = document.getElementById('account-slot');
    if (!client || !client.auth) return;   // no client: the slot stays empty and the page works as a guest
    if (slot) {
      slot.classList.add('acct-slot');
      slot.addEventListener('click', onSlotClick);
      document.addEventListener('click', onDocClick);
      document.addEventListener('keydown', onKey);
      window.addEventListener('resize', function () { closeMenu(); });
    }
    client.auth.onAuthStateChange(function (event, session) {
      // supabase-js asks not to call the client from inside this callback, so the work is deferred one tick
      setTimeout(function () {
        if (event === 'TOKEN_REFRESHED' && S.user) return;
        onSession(session);
      }, 0);
    });
    try {
      var res = await client.auth.getSession();
      onSession(res && res.data ? res.data.session : null);
    } catch (e) { onSession(null); }
    document.addEventListener('visibilitychange', function () {   // a plan bought in the app shows up when the visitor comes back
      if (!document.hidden && S.user) loadPlan(S.user, false);
    });
  }

  return { init: init, getUser: getUser, getPlan: getPlan, onChange: onChange, requirePlan: requirePlan, isReady: isReady, locked: locked };
})();
