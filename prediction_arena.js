// ============================================================
// prediction-arena.js
// Standalone Prediction Arena — real Supabase data, same auth/
// premium-gating security model as app.js (never trusts localStorage
// for paid plans; always re-verifies against the profiles table).
// ============================================================

const SUPABASE_URL = 'https://qdigrvhwvnrjznqkjltn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_vN8drh5iobJ2-mWmjk0joA_eRBQJVJa';
const PA_REACTION_EMOJIS = ['🔥', '🚀', '💀', '😂', '🎯', '🤔'];

let sb = null;
const state = {
    isLoggedIn: false,
    subscriptionPlan: 'free',
    tickets: [],
    myVotes: {},
    reactions: {},
    activeCategory: 'All',
    openTicketId: null,
    userProfile: {}
};

function initSupabase() {
    try {
        sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } catch (e) {
        console.error('❌ Failed to initialize Supabase:', e);
    }
    return sb;
}

// ---------- utils ----------
function escHtml(str) {
    if (str === null || str === undefined) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(str).replace(/[&<>"']/g, m => map[m]);
}
function timeAgo(dateStr) {
    if (!dateStr) return '';
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}
function showToast(type, message) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><span>${escHtml(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 3600);
}
function predictionArenaIsPremium() {
    return ['premium', 'pro', 'basic', 'trial'].includes(state.subscriptionPlan);
}
function animateCount(el, target, suffix = '') {
    if (!el) return;
    const isNum = typeof target === 'number' && !isNaN(target);
    if (!isNum) { el.textContent = target; return; }
    const start = 0;
    const duration = 900;
    const t0 = performance.now();
    function frame(t) {
        const p = Math.min(1, (t - t0) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(start + (target - start) * eased) + suffix;
        if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}

// ============================================================
// AUTH — mirrors app.js's security model exactly: localStorage is only
// ever trusted for 'free'/'trial' display, paid tiers are re-verified
// against the profiles table every load.
// ============================================================
function loadLocalAuthState() {
    state.isLoggedIn = localStorage.getItem('sapex_logged_in') === 'true';
    const savedPlan = localStorage.getItem('sapex_subscription_plan');
    const trusted = ['free', 'trial'];
    state.subscriptionPlan = (state.isLoggedIn && savedPlan && trusted.includes(savedPlan)) ? savedPlan : 'free';
    try {
        const savedProfile = localStorage.getItem('sapex_user_profile');
        if (savedProfile) state.userProfile = JSON.parse(savedProfile);
    } catch (e) {}
}

async function signInWithGoogle() {
    if (!sb) return;
    showToast('info', 'Connecting to Google...');
    try {
        const { error } = await sb.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin + window.location.pathname + window.location.search }
        });
        if (error) throw error;
    } catch (error) {
        console.error('Google Auth Error:', error);
        showToast('error', 'Failed to initialize Google Sign-In.');
    }
}

async function signOut() {
    if (!sb) return;
    await sb.auth.signOut();
    localStorage.setItem('sapex_logged_in', 'false');
    localStorage.removeItem('sapex_subscription_plan');
    state.isLoggedIn = false;
    state.subscriptionPlan = 'free';
    updateAuthUI();
    renderGrid();
    showToast('success', 'Signed out.');
}

async function loadUserSubscription() {
    if (!sb || !state.isLoggedIn) return;
    try {
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return;
        const { data: profile, error } = await sb
            .from('profiles')
            .select('plan_tier, subscription_expiry')
            .eq('id', user.id)
            .single();

        if (!error && profile && profile.plan_tier && profile.plan_tier !== 'free') {
            const now = new Date();
            const expiry = new Date(profile.subscription_expiry);
            state.subscriptionPlan = (now > expiry) ? 'free' : profile.plan_tier;
        } else {
            state.subscriptionPlan = 'free';
        }
    } catch (e) {
        state.subscriptionPlan = 'free';
    }
    localStorage.setItem('sapex_subscription_plan', state.subscriptionPlan);
    updateAuthUI();
    renderGrid();
}

function handleAuthChange(session) {
    if (session && session.user) {
        state.isLoggedIn = true;
        const meta = session.user.user_metadata || {};
        const fullName = meta.full_name || 'Trader';
        state.userProfile = {
            name: fullName,
            avatar_url: meta.avatar_url,
            initials: (fullName.split(' ').map(n => n[0]).join('').substring(0, 2)).toUpperCase()
        };
        localStorage.setItem('sapex_logged_in', 'true');
        localStorage.setItem('sapex_user_profile', JSON.stringify(state.userProfile));
        loadUserSubscription();
    } else {
        state.isLoggedIn = false;
        state.subscriptionPlan = 'free';
        localStorage.setItem('sapex_logged_in', 'false');
    }
    updateAuthUI();
    renderGrid();
}

function updateAuthUI() {
    const signedOutEl = document.getElementById('pa2-auth-signedout');
    const signedInEl = document.getElementById('pa2-auth-signedin');
    if (!signedOutEl || !signedInEl) return;
    if (state.isLoggedIn) {
        signedOutEl.style.display = 'none';
        signedInEl.style.display = 'flex';
        const avatarEl = document.getElementById('pa2-avatar');
        if (avatarEl) {
            avatarEl.innerHTML = state.userProfile.avatar_url
                ? `<img src="${state.userProfile.avatar_url}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`
                : (state.userProfile.initials || '?');
        }
    } else {
        signedOutEl.style.display = 'flex';
        signedInEl.style.display = 'none';
    }
}

// ============================================================
// DATA FETCHING
// ============================================================
async function fetchTickets() {
    const { data: tickets, error } = await sb
        .from('prediction_tickets')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(40);

    if (error) {
        console.error('❌ Prediction tickets fetch failed:', error.message);
        renderGrid(); // shows empty state
        return;
    }
    state.tickets = tickets || [];
    state.myVotes = {};

    if (state.isLoggedIn && tickets && tickets.length) {
        const ids = tickets.map(t => t.id);
        const { data: myVotes } = await sb.from('prediction_votes').select('ticket_id, choice').in('ticket_id', ids);
        (myVotes || []).forEach(v => { state.myVotes[v.ticket_id] = v.choice; });
    }
    if (tickets && tickets.length) {
        await loadReactions(tickets.map(t => t.id));
    }

    renderStats();
    renderFilters();
    renderTicker();
    renderGrid();

    // If the URL asked for a specific ticket, open it once data is in.
    const params = new URLSearchParams(window.location.search);
    const wanted = params.get('ticket');
    if (wanted) openDetail(Number(wanted));
}

async function fetchStatsSnapshot() {
    const { data } = await sb.from('prediction_performance_history').select('*').order('created_at', { ascending: false }).limit(1);
    return (data && data[0]) || null;
}

// ============================================================
// RENDER — hero stats, ticker, filters, grid
// ============================================================
function renderStats() {
    fetchStatsSnapshot().then(latest => {
        const aiEl = document.getElementById('pa2-stat-ai');
        const crowdEl = document.getElementById('pa2-stat-crowd');
        const resolvedEl = document.getElementById('pa2-stat-resolved');
        if (latest) {
            if (aiEl) animateCount(aiEl, Number(latest.ai_accuracy) || 0, '%');
            if (crowdEl) animateCount(crowdEl, latest.crowd_accuracy != null ? Number(latest.crowd_accuracy) : 'N/A', latest.crowd_accuracy != null ? '%' : '');
            if (resolvedEl) animateCount(resolvedEl, Number(latest.total_resolved) || 0);
        } else {
            if (aiEl) aiEl.textContent = 'N/A';
            if (crowdEl) crowdEl.textContent = 'N/A';
            if (resolvedEl) resolvedEl.textContent = '0';
        }
    });
}

function renderTicker() {
    const track = document.getElementById('pa2-ticker-track');
    if (!track) return;
    const resolved = state.tickets.filter(t => t.status === 'resolved').slice(0, 12);
    if (!resolved.length) {
        document.getElementById('pa2-ticker-wrap')?.style.setProperty('display', 'none');
        return;
    }
    const itemsHtml = resolved.map(t => {
        const won = t.actual_outcome === 'yes';
        return `<span class="pa2-ticker-item"><i class="fa-solid ${won ? 'fa-circle-check' : 'fa-circle-xmark'}" style="color:${won ? '#00d4aa' : '#ef4444'};"></i> ${escHtml(t.question)}: <span class="${won ? 'pa2-t-win' : 'pa2-t-loss'}">${(t.actual_outcome || 'N/A').toUpperCase()}</span></span>`;
    }).join('');
    // duplicated once for a seamless -50% loop (same trick as the site's price ticker)
    track.innerHTML = itemsHtml + itemsHtml;
}

function renderFilters() {
    const wrap = document.getElementById('pa2-filters');
    if (!wrap) return;
    const cats = ['All', ...new Set(state.tickets.map(t => t.category || 'Crypto'))];
    wrap.innerHTML = cats.map(c =>
        `<button type="button" class="pa2-filter-pill${c === state.activeCategory ? ' active' : ''}" data-cat="${escHtml(c)}">${escHtml(c)}</button>`
    ).join('');
    wrap.querySelectorAll('.pa2-filter-pill').forEach(btn => {
        btn.addEventListener('click', () => {
            state.activeCategory = btn.dataset.cat;
            renderFilters();
            renderGrid();
        });
    });
}

// A simple two-point sparkline: neutral 50% → the ticket's real current
// Yes%. Truthful (derived from real vote counts, not fabricated history),
// cheap (no per-card network call), and still gives every card a bit of
// chart-first motion consistent with the terminal's identity.
function buildSparkPath(yesPct) {
    const w = 280, h = 34;
    const y0 = h - (h * 0.5);
    const y1 = h - (h * (yesPct / 100));
    const line = `M0,${y0.toFixed(1)} C${w * 0.4},${y0.toFixed(1)} ${w * 0.3},${y1.toFixed(1)} ${w},${y1.toFixed(1)}`;
    const fill = `${line} L${w},${h} L0,${h} Z`;
    return { line, fill };
}

function renderGrid() {
    const grid = document.getElementById('pa2-grid');
    if (!grid) return;
    const list = state.tickets.filter(t => state.activeCategory === 'All' || (t.category || 'Crypto') === state.activeCategory);

    if (!list.length) {
        grid.innerHTML = `<div class="pa2-empty"><i class="fa-solid fa-scale-balanced"></i>No tickets in this category yet. A new one lands regularly. Check back soon.</div>`;
        return;
    }

    const isPremium = predictionArenaIsPremium();

    grid.innerHTML = list.map(t => {
        const total = (t.yes_votes || 0) + (t.no_votes || 0);
        const yesPct = total > 0 ? Math.round((t.yes_votes / total) * 100) : 50;
        const noPct = 100 - yesPct;
        const myVote = state.myVotes[t.id];
        const isOpen = t.status === 'open';
        const statusColor = isOpen ? '#f0b90b' : (t.actual_outcome === 'yes' ? '#00d4aa' : '#ef4444');
        const statusLabel = isOpen ? 'OPEN' : `RESOLVED: ${(t.actual_outcome || 'N/A').toUpperCase()}`;
        const spark = buildSparkPath(yesPct);

        const aiBox = isPremium
            ? (t.ai_prediction
                ? `<div class="pa-ai-box"><div class="pa-ai-box-title"><i class="fa-solid fa-robot"></i> AI Call: ${escHtml((t.ai_prediction || '').toUpperCase())} (${t.ai_confidence ?? 'N/A'}%)</div><div class="pa-ai-box-text">${escHtml(t.ai_reasoning || '')}</div></div>`
                : `<div class="pa-ai-box"><div class="pa-ai-box-title"><i class="fa-solid fa-robot"></i> AI is analyzing…</div></div>`)
            : `<a href="app.html" style="text-decoration:none;"><div class="pa-ai-locked"><i class="fa-solid fa-lock"></i> Unlock AI's call with Premium</div></a>`;

        const voteButtons = !state.isLoggedIn
            ? `<button class="pa-vote-btn" style="background:rgba(255,255,255,0.06);color:var(--text-secondary);width:100%;" onclick="signInWithGoogle()">Sign in to vote</button>`
            : !isOpen
                ? `<div class="pa-vote-msg">Voting closed</div>`
                : myVote
                    ? `<div class="pa-vote-msg" style="color:${myVote === 'yes' ? '#00d4aa' : '#ef4444'};font-weight:700;"><i class="fa-solid fa-check"></i> You voted ${myVote.toUpperCase()}</div>`
                    : `<div style="display:flex;gap:8px;">
                           <button class="pa-vote-btn pa-vote-yes" onclick="castVote(${t.id}, 'yes')">Yes</button>
                           <button class="pa-vote-btn pa-vote-no" onclick="castVote(${t.id}, 'no')">No</button>
                       </div>`;

        return `
        <div class="pa2-card" style="--pa2-status-color:${statusColor};">
            <div class="pa2-card-top"></div>
            <div class="pa2-card-head">
                <span class="pa2-card-cat">${escHtml(t.category || 'Crypto')}</span>
                <span class="pa2-card-status" style="color:${statusColor};">${isOpen ? `<span class="pa2-live-dot"></span>` : ''}${statusLabel}</span>
            </div>
            <h3 class="pa2-card-headline" onclick="openDetail(${t.id})">${escHtml(t.question || '')}</h3>

            <svg class="pa2-spark" viewBox="0 0 280 34" preserveAspectRatio="none">
                <path class="pa2-spark-fill" d="${spark.fill}" fill="${statusColor}" stroke="none"></path>
                <path class="pa2-spark-line" d="${spark.line}" fill="none" stroke="${statusColor}" stroke-width="2"></path>
            </svg>

            <div class="pa2-odds-row">
                <div><span class="pa2-odds-num">${yesPct}%</span><span class="pa2-odds-sub"> YES</span></div>
                <div style="text-align:right;"><span class="pa2-odds-num pa2-no">${noPct}%</span><span class="pa2-odds-sub"> NO</span></div>
            </div>
            <div class="pa-vote-bar"><div class="pa-vote-bar-yes" style="width:${yesPct}%;"></div><div class="pa-vote-bar-no" style="width:${noPct}%;"></div></div>
            <div class="pa-vote-bar-labels"><span>${total} vote${total === 1 ? '' : 's'}</span><span>${timeAgo(t.created_at)}</span></div>

            ${voteButtons}
            ${aiBox}

            <div class="pa-reaction-bar" id="pa2-reactions-${t.id}" data-ticket-id="${t.id}"></div>

            <div class="pa2-card-footer">
                <span>${escHtml(t.asset || '')}</span>
                <button type="button" onclick="openDetail(${t.id})" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:0.72rem;">Details <i class="fa-solid fa-arrow-right" style="font-size:0.65rem;"></i></button>
            </div>
        </div>`;
    }).join('');

    list.forEach(t => renderReactionBar(t.id));
}

// ============================================================
// VOTING
// ============================================================
async function castVote(ticketId, choice) {
    if (!state.isLoggedIn) { signInWithGoogle(); return; }
    state.myVotes[ticketId] = choice;
    const t = state.tickets.find(x => x.id === ticketId);
    if (t) { if (choice === 'yes') t.yes_votes = (t.yes_votes || 0) + 1; else t.no_votes = (t.no_votes || 0) + 1; }
    renderGrid();
    if (state.openTicketId === ticketId) renderDetailVoteArea();

    const { error } = await sb.rpc('cast_vote', { p_ticket_id: ticketId, p_choice: choice });
    if (error) {
        showToast('error', error.message.includes('already voted') ? 'You already voted on this ticket.' : 'Vote failed. Try again.');
        fetchTickets();
    } else {
        showToast('success', `Vote recorded: ${choice.toUpperCase()}`);
    }
}

// ============================================================
// REACTIONS (ported 1:1 from the terminal's logic)
// ============================================================
async function getLocalUserId() {
    if (!sb || !state.isLoggedIn) return null;
    try {
        const { data: { session } } = await sb.auth.getSession();
        return session?.user?.id || null;
    } catch (e) { return null; }
}

async function loadReactions(ticketIds) {
    if (!ticketIds || !ticketIds.length) { state.reactions = {}; return; }
    const { data: rows, error } = await sb.from('prediction_reactions').select('ticket_id, emoji, user_id').in('ticket_id', ticketIds);
    if (error) { console.error('❌ Reactions fetch failed:', error.message); return; }
    const myId = await getLocalUserId();
    const grouped = {};
    (rows || []).forEach(r => {
        grouped[r.ticket_id] = grouped[r.ticket_id] || {};
        const entry = grouped[r.ticket_id][r.emoji] || { count: 0, mine: false };
        entry.count += 1;
        if (myId && r.user_id === myId) entry.mine = true;
        grouped[r.ticket_id][r.emoji] = entry;
    });
    state.reactions = grouped;
}

function renderReactionBar(ticketId, elementId) {
    // Cards use one bar per ticket (id="pa2-reactions-<id>"); the detail
    // panel is a single reusable element (id="pa2-detail-reactions") since
    // only one ticket's detail can be open at a time.
    const id = elementId || `pa2-reactions-${ticketId}`;
    const el = document.getElementById(id);
    if (!el) return;
    const data = (state.reactions && state.reactions[ticketId]) || {};
    el.innerHTML = PA_REACTION_EMOJIS.map(emoji => {
        const entry = data[emoji] || { count: 0, mine: false };
        return `<button type="button" class="pa-reaction-pill${entry.mine ? ' pa-reaction-pill--active' : ''}" data-emoji="${emoji}" aria-pressed="${entry.mine}" onclick="toggleReaction(${ticketId}, '${emoji}', event)"><span class="pa-reaction-emoji">${emoji}</span>${entry.count > 0 ? `<span class="pa-reaction-count">${entry.count}</span>` : ''}</button>`;
    }).join('');
}

function firePaReactionAnimation(buttonEl, emoji, isAdding) {
    if (!buttonEl) return;
    buttonEl.classList.remove('pa-reaction-pop');
    void buttonEl.offsetWidth;
    buttonEl.classList.add('pa-reaction-pop');
    if (!isAdding) return;
    const particle = document.createElement('span');
    particle.className = 'pa-reaction-particle';
    particle.textContent = emoji;
    buttonEl.appendChild(particle);
    particle.addEventListener('animationend', () => particle.remove());
}

async function toggleReaction(ticketId, emoji, evt) {
    if (!state.isLoggedIn) { signInWithGoogle(); return; }
    if (!PA_REACTION_EMOJIS.includes(emoji)) return;

    state.reactions[ticketId] = state.reactions[ticketId] || {};
    const entry = state.reactions[ticketId][emoji] || { count: 0, mine: false };
    const wasMine = entry.mine;
    entry.mine = !wasMine;
    entry.count = Math.max(0, entry.count + (wasMine ? -1 : 1));
    state.reactions[ticketId][emoji] = entry;
    renderReactionBar(ticketId);
    if (state.openTicketId === ticketId) renderReactionBar(ticketId, 'pa2-detail-reactions');
    firePaReactionAnimation(evt?.currentTarget, emoji, !wasMine);

    const { error } = await sb.rpc('toggle_prediction_reaction', { p_ticket_id: ticketId, p_emoji: emoji });
    if (error) {
        entry.mine = wasMine;
        entry.count = Math.max(0, entry.count + (wasMine ? 1 : -1));
        state.reactions[ticketId][emoji] = entry;
        renderReactionBar(ticketId);
        if (state.openTicketId === ticketId) renderReactionBar(ticketId, 'pa2-detail-reactions');
        showToast('error', 'Reaction failed. Try again.');
    }
}

async function refreshReactionsForTicket(ticketId) {
    const { data: rows, error } = await sb.from('prediction_reactions').select('emoji, user_id').eq('ticket_id', ticketId);
    if (error) return;
    const myId = await getLocalUserId();
    const grouped = {};
    (rows || []).forEach(r => {
        const entry = grouped[r.emoji] || { count: 0, mine: false };
        entry.count += 1;
        if (myId && r.user_id === myId) entry.mine = true;
        grouped[r.emoji] = entry;
    });
    state.reactions[ticketId] = grouped;
}

// ============================================================
// DETAIL PANEL — AI success-rate chart (driven by approved news updates) + timeline
// ============================================================
let paChart = null;
const IMPACT_META = {
    high_positive: { label: 'Strongly Supports AI Call', color: '#00d4aa', delta: 18 },
    low_positive:  { label: 'Mildly Supports AI Call',   color: '#00d4aa', delta: 7 },
    neutral:       { label: 'Informational',             color: '#64748b', delta: 0 },
    low_negative:  { label: 'Mildly Against AI Call',    color: '#ef4444', delta: -7 },
    high_negative: { label: 'Strongly Against AI Call',  color: '#ef4444', delta: -18 }
};

async function openDetail(id) {
    const t = state.tickets.find(x => x.id === id);
    if (!t) return;
    state.openTicketId = id;

    const url = new URL(window.location.href);
    url.searchParams.set('ticket', id);
    window.history.replaceState({}, '', url);

    document.getElementById('pa2-detail-scrim').classList.add('open');
    renderDetailHeader(t);
    renderDetailVoteArea();
    renderReactionBar(id, 'pa2-detail-reactions');

    // Fetched once, shared by both the chart (needs oldest-first for the
    // running total) and the timeline (shown newest-first).
    const { data, error } = await sb
        .from('prediction_ticket_updates')
        .select('*')
        .eq('ticket_id', id)
        .eq('status', 'approved')
        .order('created_at', { ascending: true });
    const updates = error ? [] : (data || []);

    renderDetailChart(t, updates);
    renderDetailTimeline(updates);
}

function closeDetail() {
    state.openTicketId = null;
    document.getElementById('pa2-detail-scrim').classList.remove('open');
    const url = new URL(window.location.href);
    url.searchParams.delete('ticket');
    window.history.replaceState({}, '', url);
}

function renderDetailHeader(t) {
    const total = (t.yes_votes || 0) + (t.no_votes || 0);
    const yesPct = total > 0 ? Math.round((t.yes_votes / total) * 100) : 50;
    document.getElementById('pa2-detail-cat').textContent = t.category || 'Crypto';
    document.getElementById('pa2-detail-time').textContent = timeAgo(t.created_at);
    document.getElementById('pa2-detail-question').textContent = t.question || '';
    document.getElementById('pa2-detail-yes').textContent = `${yesPct}%`;
    document.getElementById('pa2-detail-total').textContent = total;
    document.getElementById('pa2-detail-status').textContent = t.status === 'open' ? 'Open' : (t.actual_outcome || 'N/A').toUpperCase();

    const isPremium = predictionArenaIsPremium();
    const aiWrap = document.getElementById('pa2-detail-ai');
    if (isPremium) {
        aiWrap.innerHTML = t.ai_prediction
            ? `<div class="geo-detail-section"><h4><i class="fa-solid fa-robot" style="color:#a855f7;"></i> AI Call</h4><p>${escHtml((t.ai_prediction || '').toUpperCase())}. ${t.ai_confidence ?? 'N/A'}% confidence.</p></div>
               <div class="geo-detail-section"><h4><i class="fa-solid fa-magnifying-glass" style="color:#3b82f6;"></i> AI Reasoning</h4><p>${escHtml(t.ai_reasoning || 'N/A')}</p></div>`
            : `<div class="geo-detail-section"><h4><i class="fa-solid fa-robot" style="color:#a855f7;"></i> AI Call</h4><p>Analyzing. Check back shortly.</p></div>`;
    } else {
        aiWrap.innerHTML = `<a href="app.html" style="text-decoration:none;"><div class="pa-ai-locked"><i class="fa-solid fa-lock"></i> Unlock the AI's call with Premium</div></a>`;
    }
}

function renderDetailVoteArea() {
    const t = state.tickets.find(x => x.id === state.openTicketId);
    if (!t) return;
    const wrap = document.getElementById('pa2-detail-vote-area');
    const myVote = state.myVotes[t.id];
    const isOpen = t.status === 'open';
    wrap.innerHTML = !state.isLoggedIn
        ? `<button class="btn-primary" style="width:100%;" onclick="signInWithGoogle()"><i class="fa-brands fa-google"></i> Sign in to vote</button>`
        : !isOpen
            ? `<div class="pa-vote-msg">Voting closed</div>`
            : myVote
                ? `<div class="pa-vote-msg" style="color:${myVote === 'yes' ? '#00d4aa' : '#ef4444'};font-weight:700;font-size:0.95rem;"><i class="fa-solid fa-check"></i> You voted ${myVote.toUpperCase()}</div>`
                : `<div style="display:flex;gap:10px;">
                       <button class="pa-vote-btn pa-vote-yes" style="flex:1;padding:12px;font-size:0.95rem;" onclick="castVote(${t.id}, 'yes')">Vote Yes</button>
                       <button class="pa-vote-btn pa-vote-no" style="flex:1;padding:12px;font-size:0.95rem;" onclick="castVote(${t.id}, 'no')">Vote No</button>
                   </div>`;
}

// AI Prediction Success Rate — starts at the AI's own stated confidence in
// its call, then steps up/down at each APPROVED news update according to
// that update's impact rating. This is driven entirely by real, admin-
// approved news events, never by fabricated or estimated history.
function buildSuccessRateSeries(t, updates) {
    if (t.ai_confidence === null || t.ai_confidence === undefined) return null;
    let value = Number(t.ai_confidence);
    const points = [{ x: new Date(t.created_at), y: value }];
    updates.forEach(u => {
        const meta = IMPACT_META[u.impact] || IMPACT_META.neutral;
        value = Math.max(0, Math.min(100, value + meta.delta));
        points.push({ x: new Date(u.created_at), y: value });
    });
    points.push({ x: new Date(), y: value }); // extend the line to "now"
    return points;
}

function renderDetailChart(t, updates) {
    const wrap = document.getElementById('pa2-chart-canvas-wrap');
    const series = buildSuccessRateSeries(t, updates);

    if (!series) {
        wrap.innerHTML = `<div class="pa2-chart-empty"><i class="fa-solid fa-chart-line" style="display:block;font-size:1.4rem;margin-bottom:8px;opacity:0.4;"></i>The AI hasn't made its call yet, so there's no baseline to chart. Check back once it does.</div>`;
        return;
    }
    wrap.innerHTML = `<canvas id="pa2-chart" height="220"></canvas>`;
    const ctx = document.getElementById('pa2-chart').getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 220);
    gradient.addColorStop(0, 'rgba(0,212,170,0.35)');
    gradient.addColorStop(1, 'rgba(0,212,170,0)');

    if (paChart) { paChart.destroy(); paChart = null; }
    paChart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                label: 'AI Success Rate',
                data: series,
                borderColor: '#00d4aa',
                backgroundColor: gradient,
                fill: true,
                stepped: 'before',
                pointRadius: series.length <= 12 ? 3 : 0,
                pointBackgroundColor: '#00d4aa',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 700 },
            scales: {
                x: { type: 'time', time: { unit: 'day' }, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#64748b', font: { family: 'SF Mono, monospace', size: 10 } } },
                y: { min: 0, max: 100, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#64748b', callback: v => v + '%' } }
            },
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => `Success rate: ${Math.round(ctx.parsed.y)}%` } }
            }
        }
    });
}

function renderDetailTimeline(updates) {
    const wrap = document.getElementById('pa2-timeline-wrap');
    if (!updates || !updates.length) {
        wrap.innerHTML = `<p style="color:var(--text-muted);font-size:0.82rem;">No news updates posted for this ticket yet.</p>`;
        return;
    }
    const newestFirst = [...updates].reverse();
    wrap.innerHTML = `<ul class="pa2-timeline">${newestFirst.map(u => {
        const meta = IMPACT_META[u.impact] || IMPACT_META.neutral;
        return `
        <li>
            <div class="pa2-timeline-time">${timeAgo(u.created_at)}</div>
            <div class="pa2-timeline-note">${escHtml(u.note)}</div>
            <span class="pa2-impact-tag" style="color:${meta.color};border-color:${meta.color}55;background:${meta.color}1a;">${meta.label}</span>
        </li>`;
    }).join('')}</ul>`;
}


// ============================================================
// REALTIME
// ============================================================
function subscribeRealtime() {
    sb.channel('pa2-tickets').on('postgres_changes', { event: '*', schema: 'public', table: 'prediction_tickets' }, () => fetchTickets()).subscribe();
    sb.channel('pa2-reactions').on('postgres_changes', { event: '*', schema: 'public', table: 'prediction_reactions' }, async (payload) => {
        const row = payload.eventType === 'DELETE' ? payload.old : payload.new;
        if (!row || row.ticket_id == null) return;
        await refreshReactionsForTicket(row.ticket_id);
        renderReactionBar(row.ticket_id);
        if (state.openTicketId === row.ticket_id) renderReactionBar(row.ticket_id, 'pa2-detail-reactions');
    }).subscribe();
    sb.channel('pa2-updates').on('postgres_changes', { event: '*', schema: 'public', table: 'prediction_ticket_updates' }, (payload) => {
        const row = payload.new || payload.old;
        if (row && state.openTicketId === row.ticket_id) openDetail(row.ticket_id);
    }).subscribe();
}

// ============================================================
// BOOTSTRAP
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    loadLocalAuthState();
    updateAuthUI();
    initSupabase();

    document.getElementById('pa2-signin-btn')?.addEventListener('click', signInWithGoogle);
    document.getElementById('pa2-signout-btn')?.addEventListener('click', signOut);
    document.getElementById('pa2-detail-close')?.addEventListener('click', closeDetail);
    document.getElementById('pa2-detail-scrim')?.addEventListener('click', (e) => { if (e.target.id === 'pa2-detail-scrim') closeDetail(); });

    const { data: { session } } = await sb.auth.getSession();
    handleAuthChange(session);
    sb.auth.onAuthStateChange((_event, s) => handleAuthChange(s));

    await fetchTickets();
    subscribeRealtime();
});