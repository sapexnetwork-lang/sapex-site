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
    myPickedOption: {},  // { ticketId: optionId } — one pick per Multi-Option ticket
    ticketOptions: {},   // { ticketId: [ {id, label, votes}, ... ] }
    reactions: {},
    activeCategory: 'All',
    openTicketId: null,
    userProfile: {}
};

// Up/Down tickets reuse all the same 'yes'/'no' plumbing as binary tickets
// (voting, RPC, storage) — this map just swaps the visible labels/icons.
const TICKET_TYPE_LABELS = {
    binary: { yes: 'Yes', no: 'No', yesShort: 'YES', noShort: 'NO', yesIcon: '', noIcon: '' },
    updown: { yes: 'Up', no: 'Down', yesShort: 'UP', noShort: 'DOWN', yesIcon: '<i class="fa-solid fa-arrow-trend-up"></i> ', noIcon: '<i class="fa-solid fa-arrow-trend-down"></i> ' }
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
    state.myPickedOption = {};
    state.ticketOptions = {};

    const multiIds = state.tickets.filter(t => t.ticket_type === 'multi').map(t => t.id);
    if (multiIds.length) {
        const { data: options, error: optErr } = await sb
            .from('prediction_ticket_options')
            .select('*')
            .in('ticket_id', multiIds)
            .order('display_order', { ascending: true });
        if (!optErr) {
            (options || []).forEach(o => {
                state.ticketOptions[o.ticket_id] = state.ticketOptions[o.ticket_id] || [];
                state.ticketOptions[o.ticket_id].push(o);
            });
        }
    }

    if (state.isLoggedIn && tickets && tickets.length) {
        const ids = tickets.map(t => t.id);
        const { data: myVotes } = await sb.from('prediction_votes').select('ticket_id, option_id, choice').in('ticket_id', ids);
        (myVotes || []).forEach(v => {
            if (v.option_id) state.myPickedOption[v.ticket_id] = v.option_id;
            else state.myVotes[v.ticket_id] = v.choice;
        });
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
        const isOpen = t.status === 'open';
        const statusColor = isOpen ? '#f0b90b' : (t.actual_outcome === 'yes' ? '#00d4aa' : '#ef4444');
        const statusLabel = isOpen ? 'OPEN' : `RESOLVED: ${(t.actual_outcome || 'N/A').toUpperCase()}`;

        const aiBox = isPremium
            ? (t.ai_prediction
                ? `<div class="pa-ai-box"><div class="pa-ai-box-title"><i class="fa-solid fa-robot"></i> AI Call: ${escHtml((t.ai_prediction || '').toUpperCase())} (${t.ai_confidence ?? 'N/A'}%)</div></div>`
                : `<div class="pa-ai-box"><div class="pa-ai-box-title"><i class="fa-solid fa-robot"></i> AI is analyzing…</div></div>`)
            : `<a href="app.html" style="text-decoration:none;"><div class="pa-ai-locked"><i class="fa-solid fa-lock"></i> Unlock AI's call with Premium</div></a>`;

        const body = t.ticket_type === 'multi'
            ? buildMultiCardBody(t, isOpen)
            : buildBinaryCardBody(t, isOpen);

        return `
        <div class="pa2-card" style="--pa2-status-color:${statusColor};">
            <div class="pa2-card-top"></div>
            <div class="pa2-card-head">
                <span class="pa2-card-cat">${escHtml(t.category || 'Crypto')}</span>
                <span class="pa2-card-status" style="color:${statusColor};">${isOpen ? `<span class="pa2-live-dot"></span>` : ''}${statusLabel}</span>
            </div>
            <h3 class="pa2-card-headline" onclick="openDetail(${t.id})">${escHtml(t.question || '')}</h3>

            ${body}

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

// Binary and Up/Down tickets share this layout — only the labels differ.
function buildBinaryCardBody(t, isOpen) {
    const labels = TICKET_TYPE_LABELS[t.ticket_type] || TICKET_TYPE_LABELS.binary;
    const total = (t.yes_votes || 0) + (t.no_votes || 0);
    const yesPct = total > 0 ? Math.round((t.yes_votes / total) * 100) : 50;
    const noPct = 100 - yesPct;
    const myVote = state.myVotes[t.id];
    const spark = buildSparkPath(yesPct);
    const statusColor = isOpen ? '#f0b90b' : (t.actual_outcome === 'yes' ? '#00d4aa' : '#ef4444');

    const voteButtons = !state.isLoggedIn
        ? `<button class="pa-vote-btn" style="background:rgba(255,255,255,0.06);color:var(--text-secondary);width:100%;" onclick="signInWithGoogle()">Sign in to vote</button>`
        : !isOpen
            ? `<div class="pa-vote-msg">Voting closed</div>`
            : myVote
                ? `<div class="pa-vote-msg" style="color:${myVote === 'yes' ? '#00d4aa' : '#ef4444'};font-weight:700;"><i class="fa-solid fa-check"></i> You voted ${myVote === 'yes' ? labels.yesShort : labels.noShort}</div>`
                : `<div style="display:flex;gap:8px;">
                       <button class="pa-vote-btn pa-vote-yes" onclick="castVote(${t.id}, 'yes')">${labels.yesIcon}${labels.yes}</button>
                       <button class="pa-vote-btn pa-vote-no" onclick="castVote(${t.id}, 'no')">${labels.noIcon}${labels.no}</button>
                   </div>`;

    return `
        <svg class="pa2-spark" viewBox="0 0 280 34" preserveAspectRatio="none">
            <path class="pa2-spark-fill" d="${spark.fill}" fill="${statusColor}" stroke="none"></path>
            <path class="pa2-spark-line" d="${spark.line}" fill="none" stroke="${statusColor}" stroke-width="2"></path>
        </svg>
        <div class="pa2-odds-row">
            <div><span class="pa2-odds-num">${yesPct}%</span><span class="pa2-odds-sub"> ${labels.yesShort}</span></div>
            <div style="text-align:right;"><span class="pa2-odds-num pa2-no">${noPct}%</span><span class="pa2-odds-sub"> ${labels.noShort}</span></div>
        </div>
        <div class="pa-vote-bar"><div class="pa-vote-bar-yes" style="width:${yesPct}%;"></div><div class="pa-vote-bar-no" style="width:${noPct}%;"></div></div>
        <div class="pa-vote-bar-labels"><span>${total} vote${total === 1 ? '' : 's'}</span><span>${timeAgo(t.created_at)}</span></div>
        ${voteButtons}`;
}

// Multi-option tickets: pick exactly one named option (candidates, teams,
// etc). Cards show up to 4 rows; the full list is always available in the
// detail view. Exactly one vote per ticket — picking an option locks in
// your choice for the whole ticket.
function buildOptionRowHtml(ticketId, opt, isOpen, isPremium) {
    const allOptions = state.ticketOptions[ticketId] || [opt];
    const totalTicketVotes = allOptions.reduce((sum, o) => sum + (o.votes || 0), 0);
    const pct = totalTicketVotes > 0 ? Math.round(((opt.votes || 0) / totalTicketVotes) * 100) : 0;
    const myPick = state.myPickedOption[ticketId];
    const isMyPick = myPick === opt.id;
    const t = state.tickets.find(x => x.id === ticketId);
    const isAiPick = isPremium && t && t.ai_prediction
        && t.ai_prediction.trim().toLowerCase() === (opt.label || '').trim().toLowerCase();

    const action = !state.isLoggedIn
        ? `<button class="pa2-opt-vote-btn" onclick="signInWithGoogle()">Sign in to vote</button>`
        : !isOpen
            ? `<span class="pa2-opt-closed">Closed</span>`
            : myPick
                ? (isMyPick ? `<span class="pa2-opt-voted"><i class="fa-solid fa-check"></i> Your pick</span>` : '')
                : `<button class="pa2-opt-vote-btn pa2-opt-pick" onclick="castOptionVote(${opt.id})">Vote for this</button>`;

    return `
        <div class="pa2-opt-row${isMyPick ? ' pa2-opt-row--picked' : ''}${isAiPick ? ' pa2-opt-row--ai-pick' : ''}">
            <div class="pa2-opt-row-top">
                <span class="pa2-opt-label">${escHtml(opt.label)}${isAiPick ? ' <span class="pa2-ai-pick-badge"><i class="fa-solid fa-robot"></i> AI PICK</span>' : ''}</span>
                <span class="pa2-opt-pct">${pct}%</span>
            </div>
            <div class="pa2-opt-bar"><div class="pa2-opt-bar-fill" style="width:${pct}%;"></div></div>
            <div class="pa2-opt-actions">${action}</div>
        </div>`;
}

function buildMultiCardBody(t, isOpen) {
    const isPremium = predictionArenaIsPremium();
    const options = state.ticketOptions[t.id] || [];
    const shown = options.slice(0, 4);
    const remaining = options.length - shown.length;
    return `
        <div class="pa2-opt-list">
            ${shown.map(o => buildOptionRowHtml(t.id, o, isOpen, isPremium)).join('')}
            ${remaining > 0 ? `<button type="button" onclick="openDetail(${t.id})" style="background:none;border:none;color:var(--text-muted);font-size:0.75rem;cursor:pointer;padding:4px 0;">+${remaining} more option${remaining === 1 ? '' : 's'}</button>` : ''}
        </div>`;
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

async function castOptionVote(optionId) {
    if (!state.isLoggedIn) { signInWithGoogle(); return; }
    let ownerTicketId = null;
    for (const ticketId in state.ticketOptions) {
        const opt = state.ticketOptions[ticketId].find(o => o.id === optionId);
        if (opt) {
            ownerTicketId = Number(ticketId);
            opt.votes = (opt.votes || 0) + 1;
            break;
        }
    }
    if (ownerTicketId === null) return;
    state.myPickedOption[ownerTicketId] = optionId;
    renderGrid();
    if (state.openTicketId === ownerTicketId) renderDetailOptions();

    const { error } = await sb.rpc('cast_option_vote', { p_option_id: optionId });
    if (error) {
        showToast('error', error.message.includes('already voted') ? 'You already voted on this ticket.' : 'Vote failed. Try again.');
        fetchTickets();
    } else {
        showToast('success', 'Vote recorded.');
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

    // Each render is isolated: a problem in the chart must never prevent
    // the timeline (or anything else) from showing, and vice versa.
    try { renderDetailChart(t, updates); } catch (e) { console.error('Chart render failed:', e); }
    try { renderDetailTimeline(updates); } catch (e) { console.error('Timeline render failed:', e); }
}

function closeDetail() {
    state.openTicketId = null;
    document.getElementById('pa2-detail-scrim').classList.remove('open');
    const url = new URL(window.location.href);
    url.searchParams.delete('ticket');
    window.history.replaceState({}, '', url);
}

function renderDetailHeader(t) {
    document.getElementById('pa2-detail-cat').textContent = t.category || 'Crypto';
    document.getElementById('pa2-detail-time').textContent = timeAgo(t.created_at);
    document.getElementById('pa2-detail-question').textContent = t.question || '';
    document.getElementById('pa2-detail-status').textContent = t.status === 'open' ? 'Open' : (t.actual_outcome || 'N/A').toUpperCase();

    const yesLabelEl = document.getElementById('pa2-detail-yes-label');
    if (t.ticket_type === 'multi') {
        const options = state.ticketOptions[t.id] || [];
        if (yesLabelEl) yesLabelEl.textContent = 'Options';
        document.getElementById('pa2-detail-yes').textContent = options.length;
        document.getElementById('pa2-detail-total').textContent = options.reduce((sum, o) => sum + (o.votes || 0), 0);
    } else {
        const labels = TICKET_TYPE_LABELS[t.ticket_type] || TICKET_TYPE_LABELS.binary;
        const total = (t.yes_votes || 0) + (t.no_votes || 0);
        const yesPct = total > 0 ? Math.round((t.yes_votes / total) * 100) : 50;
        if (yesLabelEl) yesLabelEl.textContent = `Crowd ${labels.yesShort}`;
        document.getElementById('pa2-detail-yes').textContent = `${yesPct}%`;
        document.getElementById('pa2-detail-total').textContent = total;
    }

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

    if (t.ticket_type === 'multi') {
        renderDetailOptions();
        return;
    }

    const labels = TICKET_TYPE_LABELS[t.ticket_type] || TICKET_TYPE_LABELS.binary;
    const myVote = state.myVotes[t.id];
    const isOpen = t.status === 'open';
    wrap.innerHTML = !state.isLoggedIn
        ? `<button class="btn-primary" style="width:100%;" onclick="signInWithGoogle()"><i class="fa-brands fa-google"></i> Sign in to vote</button>`
        : !isOpen
            ? `<div class="pa-vote-msg">Voting closed</div>`
            : myVote
                ? `<div class="pa-vote-msg" style="color:${myVote === 'yes' ? '#00d4aa' : '#ef4444'};font-weight:700;font-size:0.95rem;"><i class="fa-solid fa-check"></i> You voted ${myVote === 'yes' ? labels.yesShort : labels.noShort}</div>`
                : `<div style="display:flex;gap:10px;">
                       <button class="pa-vote-btn pa-vote-yes" style="flex:1;padding:12px;font-size:0.95rem;" onclick="castVote(${t.id}, 'yes')">${labels.yesIcon}Vote ${labels.yes}</button>
                       <button class="pa-vote-btn pa-vote-no" style="flex:1;padding:12px;font-size:0.95rem;" onclick="castVote(${t.id}, 'no')">${labels.noIcon}Vote ${labels.no}</button>
                   </div>`;
}

function renderDetailOptions() {
    const t = state.tickets.find(x => x.id === state.openTicketId);
    if (!t || t.ticket_type !== 'multi') return;
    const wrap = document.getElementById('pa2-detail-vote-area');
    const options = state.ticketOptions[t.id] || [];
    const isOpen = t.status === 'open';
    wrap.innerHTML = `<div class="pa2-opt-list">${options.map(o => buildOptionRowHtml(t.id, o, isOpen, predictionArenaIsPremium())).join('')}</div>`;
}

// AI Prediction Success Rate — starts at the AI's own stated confidence in
// its call, then steps up/down at each APPROVED news update according to
// that update's impact rating. This is driven entirely by real, admin-
// approved news events, never by fabricated or estimated history.
// Labels are pre-formatted strings (not Date objects) on purpose — Chart.js's
// 'category' axis needs no external date-adapter script at all, which
// removes an entire class of "silent blank chart" bug from a broken CDN.
function fmtChartLabel(date) {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function buildSuccessRateSeries(t, updates) {
    if (t.ai_confidence === null || t.ai_confidence === undefined) return null;
    let value = Number(t.ai_confidence);
    const points = [{ label: fmtChartLabel(new Date(t.created_at)), y: value }];
    updates.forEach(u => {
        const meta = IMPACT_META[u.impact] || IMPACT_META.neutral;
        value = Math.max(0, Math.min(100, value + meta.delta));
        points.push({ label: fmtChartLabel(new Date(u.created_at)), y: value });
    });
    points.push({ label: fmtChartLabel(new Date()), y: value }); // extend the line to "now"
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
            labels: series.map(p => p.label),
            datasets: [{
                label: 'AI Success Rate',
                data: series.map(p => p.y),
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
                x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#64748b', font: { family: 'SF Mono, monospace', size: 10 } } },
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
    document.getElementById('pa2-forecast-close')?.addEventListener('click', closeForecastDetail);
    document.getElementById('pa2-forecast-scrim')?.addEventListener('click', (e) => { if (e.target.id === 'pa2-forecast-scrim') closeForecastDetail(); });

    const { data: { session } } = await sb.auth.getSession();
    handleAuthChange(session);
    sb.auth.onAuthStateChange((_event, s) => handleAuthChange(s));

    await fetchTickets();
    subscribeRealtime();
    renderAdSlots();
    fetchEventForecasts();
});

// ============================================================
// AD SLOTS — same table/pattern as app.js's renderAdSlots(), ported
// here since this page has its own script. Banner slots fill a
// [data-ad-slot="..."] container already in the page; a 'popup'
// display_type instead builds a dismissible center-screen overlay.
// ============================================================
function renderAdSlots() {
    if (!sb) return;
    sb.from('ad_slots').select('*').eq('is_active', true).then(({ data, error }) => {
        if (error || !data) return;
        data.forEach(ad => {
            if (ad.display_type === 'popup') {
                setTimeout(() => showPopupAd(ad), 1500); // small delay — less jarring on page load
                return;
            }
            const container = document.querySelector(`[data-ad-slot="${ad.slot_key}"]`);
            if (!container) return;
            container.innerHTML = '';
            if (ad.html_override && ad.html_override.trim()) {
                container.innerHTML = ad.html_override; // admin-authored HTML — trusted by design
                return;
            }
            if (!ad.image_url) return;
            const link = document.createElement('a');
            link.href = ad.link_url || '#';
            link.target = '_blank';
            link.rel = 'noopener sponsored';
            link.className = 'sapex-ad-slot-link';
            const img = document.createElement('img');
            img.src = ad.image_url;
            img.alt = ad.name || 'Advertisement';
            img.className = 'sapex-ad-slot-img';
            img.loading = 'lazy';
            link.appendChild(img);
            container.appendChild(link);
        });
    }).catch(e => console.warn('Ad slot render failed (non-fatal):', e));
}

function showPopupAd(ad) {
    // Shown once per browser session per ad, not on every page load/nav —
    // this is the "not disturbing" behavior asked for.
    const dismissKey = `sapex_popup_dismissed_${ad.id}`;
    if (sessionStorage.getItem(dismissKey)) return;
    if (!ad.image_url && !(ad.html_override && ad.html_override.trim())) return;

    const overlay = document.createElement('div');
    overlay.className = 'sapex-ad-popup-overlay';
    const dismiss = () => { overlay.remove(); sessionStorage.setItem(dismissKey, '1'); };

    const box = document.createElement('div');
    box.className = 'sapex-ad-popup-box';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'sapex-ad-popup-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    closeBtn.onclick = dismiss;
    box.appendChild(closeBtn);

    if (ad.html_override && ad.html_override.trim()) {
        const wrap = document.createElement('div');
        wrap.innerHTML = ad.html_override; // admin-authored HTML — trusted by design
        box.appendChild(wrap);
    } else {
        const link = document.createElement('a');
        link.href = ad.link_url || '#';
        link.target = '_blank';
        link.rel = 'noopener sponsored';
        const img = document.createElement('img');
        img.src = ad.image_url;
        img.alt = ad.name || 'Advertisement';
        img.style.cssText = 'width:100%;display:block;';
        link.appendChild(img);
        box.appendChild(link);
    }

    overlay.appendChild(box);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) dismiss(); });
    document.body.appendChild(overlay);
}

// ============================================================
// 🌍 EVENT FORECASTS — country/election-style AI trackers.
// Read-only on the public side: admin seeds requests, the bot researches
// them, admin publishes. This just fetches and renders what's published.
// ============================================================
const FORECAST_FLAG_EMOJI = {
    'united states': '🇺🇸', 'united kingdom': '🇬🇧', 'canada': '🇨🇦', 'germany': '🇩🇪',
    'france': '🇫🇷', 'brazil': '🇧🇷', 'india': '🇮🇳', 'japan': '🇯🇵', 'australia': '🇦🇺',
    'mexico': '🇲🇽', 'italy': '🇮🇹', 'spain': '🇪🇸', 'south korea': '🇰🇷', 'russia': '🇷🇺',
    'china': '🇨🇳', 'south africa': '🇿🇦', 'argentina': '🇦🇷', 'netherlands': '🇳🇱',
    'sweden': '🇸🇪', 'poland': '🇵🇱', 'turkey': '🇹🇷', 'indonesia': '🇮🇩', 'nigeria': '🇳🇬',
    'ukraine': '🇺🇦', 'israel': '🇮🇱', 'sri lanka': '🇱🇰'
};
function forecastFlagFor(country) {
    return FORECAST_FLAG_EMOJI[(country || '').trim().toLowerCase()] || '🌍';
}

// A fixed palette walked in rank order — top segment gets the strongest
// color, tapering off. Works for any number/kind of segment.
const FORECAST_TILE_COLORS = ['#00d4aa', '#3b82f6', '#a855f7', '#f0b90b', '#ef4444', '#64748b'];
function forecastColorFor(rank) {
    return FORECAST_TILE_COLORS[Math.min(rank, FORECAST_TILE_COLORS.length - 1)];
}

let forecastState = { list: [] };

async function fetchEventForecasts() {
    const { data, error } = await sb
        .from('event_forecasts')
        .select('*, event_forecast_segments(*)')
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .limit(20);

    const section = document.getElementById('pa2-forecasts-section');
    if (error || !data || !data.length) {
        if (section) section.style.display = 'none';
        return;
    }

    forecastState.list = data;
    section.style.display = 'block';
    renderForecastsGrid();
}

function renderForecastsGrid() {
    const grid = document.getElementById('pa2-forecasts-grid');
    if (!grid) return;

    grid.innerHTML = forecastState.list.map(f => {
        const segments = [...(f.event_forecast_segments || [])].sort((a, b) => b.value_pct - a.value_pct);
        const top = segments.slice(0, 3);
        return `
        <div class="pa2-forecast-card" onclick="openForecastDetail(${f.id})">
            <div class="pa2-forecast-top-row">
                <span class="pa2-forecast-flag-sm">${forecastFlagFor(f.country)}</span>
                <span class="pa2-forecast-meta">${escHtml(f.country)} · ${escHtml(f.event_type)}</span>
            </div>
            <h3 class="pa2-forecast-title">${escHtml(f.event_name)}</h3>
            <div class="pa2-forecast-headline-mini">${escHtml(f.headline_stat || '')}</div>
            <div class="pa2-forecast-mini-bars">
                ${top.map((s, i) => `
                    <div class="pa2-forecast-mini-bar-row">
                        <span class="pa2-forecast-mini-bar-label">${escHtml(s.label)}</span>
                        <div class="pa2-forecast-mini-bar-track"><div class="pa2-forecast-mini-bar-fill" data-target-width="${s.value_pct}%" style="background:${forecastColorFor(i)};"></div></div>
                        <span class="pa2-forecast-mini-bar-pct">${Math.round(s.value_pct)}%</span>
                    </div>`).join('')}
            </div>
            <div class="pa2-forecast-card-footer">
                <span>${segments.length} tracked</span>
                <span>Details <i class="fa-solid fa-arrow-right" style="font-size:0.65rem;"></i></span>
            </div>
        </div>`;
    }).join('');

    // Bars start at width:0 in the HTML and animate to their real value a
    // beat after render, so the "growing bar" motion is visible.
    requestAnimationFrame(() => {
        setTimeout(() => {
            grid.querySelectorAll('.pa2-forecast-mini-bar-fill').forEach(el => {
                el.style.width = el.dataset.targetWidth;
            });
        }, 50);
    });
}

function openForecastDetail(id) {
    const f = forecastState.list.find(x => x.id === id);
    if (!f) return;
    const segments = [...(f.event_forecast_segments || [])].sort((a, b) => b.value_pct - a.value_pct);

    document.getElementById('pa2-forecast-flag').textContent = forecastFlagFor(f.country);
    document.getElementById('pa2-forecast-country').textContent = `${f.country} · ${f.event_type}`;
    document.getElementById('pa2-forecast-updated').textContent = f.researched_at ? `Updated ${timeAgo(f.researched_at)}` : '';
    document.getElementById('pa2-forecast-name').textContent = f.event_name || '';
    document.getElementById('pa2-forecast-headline').textContent = f.headline_stat || '';
    document.getElementById('pa2-forecast-summary').textContent = f.summary || '';
    document.getElementById('pa2-forecast-sources').textContent = f.source_notes ? `Research basis: ${f.source_notes}` : '';

    const barsWrap = document.getElementById('pa2-forecast-bars');
    barsWrap.innerHTML = segments.map((s, i) => `
        <div class="pa2-forecast-bar-row">
            <div class="pa2-forecast-bar-top">
                <span class="pa2-forecast-bar-label">${escHtml(s.label)}</span>
                <span class="pa2-forecast-bar-pct" style="color:${forecastColorFor(i)};">${Math.round(s.value_pct)}%</span>
            </div>
            <div class="pa2-forecast-bar-track"><div class="pa2-forecast-bar-fill" data-target-width="${s.value_pct}%" style="background:${forecastColorFor(i)};"></div></div>
        </div>`).join('');

    const mosaicWrap = document.getElementById('pa2-forecast-mosaic');
    mosaicWrap.innerHTML = segments.map((s, i) => `
        <div class="pa2-forecast-tile" style="background:${forecastColorFor(i)}33;border:1px solid ${forecastColorFor(i)}88;animation-delay:${i * 0.03}s;">
            <div class="pa2-forecast-tile-label">${escHtml(s.label)}</div>
            <div class="pa2-forecast-tile-pct" style="color:${forecastColorFor(i)};">${Math.round(s.value_pct)}%</div>
        </div>`).join('');

    document.getElementById('pa2-forecast-scrim').classList.add('open');

    requestAnimationFrame(() => {
        setTimeout(() => {
            barsWrap.querySelectorAll('.pa2-forecast-bar-fill').forEach(el => { el.style.width = el.dataset.targetWidth; });
        }, 50);
    });
}

function closeForecastDetail() {
    document.getElementById('pa2-forecast-scrim').classList.remove('open');
}