// ============================================================
// SaPEX_NEXUS — admin.js
// Admin Control Center engine. Talks ONLY to Supabase using the
// public anon key (same as the main site) — the admins-only data
// is protected by Postgres RLS + SECURITY DEFINER functions, not
// by hiding a secret key in this file. Never paste a service_role
// key into this file.
// ============================================================

const SUPABASE_URL = 'https://qdigrvhwvnrjznqkjltn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_vN8drh5iobJ2-mWmjk0joA_eRBQJVJa';

let sb = null;
let currentAdminRole = null;   // 'admin' | 'super_admin'
let currentAdminEmail = null;
let trafficChart = null;
let planChart = null;
let analyticsRangeState = {
    country:  { mode: '30d', start: null, end: null },
    channels: { mode: '30d', start: null, end: null },
    utm:      { mode: '30d', start: null, end: null },
    deviceOs: { mode: '30d', start: null, end: null },
    heatmap:  { mode: '30d', start: null, end: null }
};
let _rangeModalTarget = null;
let channelsChart = null;
let usersPage = 0;
const USERS_PER_PAGE = 20;

function initSb() {
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return sb;
}

async function logAction(action, target, details = {}) {
    try {
        await sb.from('audit_log').insert({ actor_email: currentAdminEmail, action, target, details });
    } catch (e) { /* logging must never break the actual action */ }
}

// ============================================================
// AUTH GATE
// ============================================================
async function bootAdmin() {
    initSb();

    document.getElementById('gate-signin-btn').addEventListener('click', signIn);
    document.getElementById('signout-btn').addEventListener('click', () => sb.auth.signOut().then(() => location.reload()));

    const { data: { session } } = await sb.auth.getSession();
    await handleSession(session);

    sb.auth.onAuthStateChange((_event, session) => handleSession(session));
}

async function signIn() {
    document.getElementById('gate-status').textContent = 'Redirecting to Google...';
    const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + window.location.pathname }
    });
    if (error) document.getElementById('gate-status').textContent = 'Sign-in failed. Try again.';
}

async function handleSession(session) {
    if (!session || !session.user) {
        document.getElementById('gate-screen').style.display = 'flex';
        document.getElementById('mfa-screen').style.display = 'none';
        document.getElementById('admin-app').style.display = 'none';
        return;
    }

    const email = session.user.email;
    document.getElementById('gate-status').textContent = 'Checking admin access...';

    const { data, error } = await sb.from('admins').select('role').eq('email', email).maybeSingle();

    if (error || !data) {
        document.getElementById('gate-status').textContent =
            `❌ ${email} is not authorized for admin access.`;
        document.getElementById('gate-screen').style.display = 'flex';
        document.getElementById('mfa-screen').style.display = 'none';
        document.getElementById('admin-app').style.display = 'none';
        return;
    }

    currentAdminEmail = email;
    currentAdminRole = data.role;

    // 🔐 Require Google Authenticator (TOTP) before granting admin access
    const passedMfa = await enforceMfa();
    if (!passedMfa) return; // mfa-screen is now visible, waiting on user input

    grantAdminAccess(email, data.role);
}

function grantAdminAccess(email, role) {
    document.getElementById('gate-screen').style.display = 'none';
    document.getElementById('mfa-screen').style.display = 'none';
    document.getElementById('admin-app').style.display = 'flex';

    document.getElementById('admin-email-label').textContent = email;
    document.getElementById('admin-role-label').textContent = role.replace('_', ' ');
    document.getElementById('admin-avatar').textContent = email[0].toUpperCase();

    if (role === 'super_admin') {
        document.getElementById('nav-admins').style.display = 'flex';
    }

    initAdminNav();
    loadOverviewTab();
    loadTopPagesAndReferrers();
    loadUsersTab();
    loadAdsTab();
    loadPredictionsTab();
    loadAnalyticsTab();
    loadAnnouncementTab();     // 🩹 was defined but never called — Save button had no handler bound
    initRedeemCodesTab();      // 🎟️ NEW
    loadBlogTab();
    if (role === 'super_admin') loadAdminsTab();

    refreshLiveVisitorCount();
    setInterval(refreshLiveVisitorCount, 20000);

    loadLiveVisitorsDetail();
    setInterval(loadLiveVisitorsDetail, 20000);

    document.getElementById('reset-2fa-btn').onclick = async () => {
        if (!confirm('This signs you out and forces a fresh QR scan next login. Continue?')) return;
        const { data: factorsData } = await sb.auth.mfa.listFactors();
        const verified = (factorsData?.totp || []).find(f => f.status === 'verified');
        if (verified) await sb.auth.mfa.unenroll({ factorId: verified.id });
        await sb.auth.signOut();
        location.reload();
    };
}

// ============================================================
// MFA (Google Authenticator / TOTP)
// ============================================================
let _mfaFactorId = null;

async function enforceMfa() {
    const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal.currentLevel === 'aal2') return true; // already verified this session

    const { data: factorsData } = await sb.auth.mfa.listFactors();
    const verifiedTotp = (factorsData?.totp || []).find(f => f.status === 'verified');

    document.getElementById('gate-screen').style.display = 'none';
    document.getElementById('mfa-screen').style.display = 'flex';
    document.getElementById('mfa-verify-btn').onclick = submitMfaCode;
    document.getElementById('mfa-signout-btn').onclick = () => sb.auth.signOut().then(() => location.reload());

    if (verifiedTotp) {
        _mfaFactorId = verifiedTotp.id;
        document.getElementById('mfa-instructions').textContent = 'Enter the 6-digit code from Google Authenticator.';
        document.getElementById('mfa-enroll-view').style.display = 'none';
    } else {
        const { data: enrollData, error: enrollErr } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'SaPEX Admin' });
        if (enrollErr) {
            document.getElementById('mfa-status').textContent = '❌ Could not start 2FA setup: ' + enrollErr.message;
            return false;
        }
        _mfaFactorId = enrollData.id;
        document.getElementById('mfa-instructions').textContent = 'Scan this with Google Authenticator, then enter the code it shows.';
        document.getElementById('mfa-qr-img').src = enrollData.totp.qr_code;
        document.getElementById('mfa-secret-text').textContent = enrollData.totp.secret;
        document.getElementById('mfa-enroll-view').style.display = 'block';
    }
    return false;
}

async function submitMfaCode() {
    const code = document.getElementById('mfa-code-input').value.trim();
    const statusEl = document.getElementById('mfa-status');
    if (!/^\d{6}$/.test(code)) { statusEl.textContent = 'Enter the 6-digit code.'; return; }

    statusEl.textContent = 'Verifying...';
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: _mfaFactorId, code });

    if (error) {
        statusEl.textContent = '❌ Incorrect code. Try again.';
        document.getElementById('mfa-code-input').value = '';
        return;
    }
    statusEl.textContent = '✅ Verified.';
    grantAdminAccess(currentAdminEmail, currentAdminRole);
}

// ============================================================
// NAVIGATION
// ============================================================
function initAdminNav() {
    document.querySelectorAll('.admin-nav .nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const tab = item.dataset.tab;
            document.querySelectorAll('.admin-nav .nav-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
            document.getElementById('tab-' + tab).classList.add('active');
        });
    });
}

// ============================================================
// OVERVIEW TAB
// ============================================================
async function loadOverviewTab() {
    const { data: summary } = await sb.rpc('get_traffic_summary').single();
    const { data: userStats } = await sb.rpc('get_user_stats').single();

    renderTrafficStatGrid(summary);
    renderNewUsersGrid(userStats);
    renderPlanChart(userStats);
    loadRecentActivity();
    checkBotHealth();
    loadMaintenanceToggle();

    // Traffic chart range toggle
    document.querySelectorAll('.range-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            loadTrafficChart(btn.dataset.range);
        });
    });
    loadTrafficChart('today');
}

async function loadRecentActivity() {
    const { data } = await sb.from('audit_log').select('*').order('created_at', { ascending: false }).limit(10);
    const list = document.getElementById('recent-activity-list');
    if (!data || data.length === 0) { list.innerHTML = `<p class="table-empty">No activity yet.</p>`; return; }
    const actionLabels = {
        plan_change: 'changed plan for', ad_slot_save: 'updated ad slot',
        admin_granted: 'granted admin access to', admin_removed: 'removed admin access for'
    };
    list.innerHTML = data.map(a => `
        <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border-color);font-size:0.82rem;">
            <span><strong>${escapeHtml(a.actor_email)}</strong> ${actionLabels[a.action] || a.action} <span style="color:var(--accent-blue);">${escapeHtml(a.target || '')}</span></span>
            <span style="color:var(--text-muted);font-size:0.74rem;">${new Date(a.created_at).toLocaleString()}</span>
        </div>
    `).join('');
}

async function loadTopPagesAndReferrers() {
    const { data: pages } = await sb.rpc('get_top_pages');
    const { data: refs } = await sb.rpc('get_top_referrers');
    const renderBar = (rows, key) => (rows || []).map(r => {
        const max = Math.max(...rows.map(x => x.views), 1);
        const pct = Math.round((r.views / max) * 100);
        return `<div style="margin-bottom:10px;">
            <div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:4px;">
                <span>${escapeHtml(r[key])}</span><span style="color:var(--text-muted);">${r.views}</span>
            </div>
            <div style="height:5px;background:rgba(255,255,255,0.06);border-radius:4px;">
                <div style="height:100%;width:${pct}%;background:var(--accent-blue);border-radius:4px;"></div>
            </div>
        </div>`;
    }).join('') || `<p class="table-empty">No data yet.</p>`;
    document.getElementById('top-pages-list').innerHTML = renderBar(pages, 'page');
    document.getElementById('top-referrers-list').innerHTML = renderBar(refs, 'referrer');
}

async function checkBotHealth() {
    const { data } = await sb.from('bot_heartbeat').select('*').eq('id', 1).maybeSingle();
    const dot = document.getElementById('bot-status-dot');
    const text = document.getElementById('bot-status-text');
    const pill = document.getElementById('bot-status-pill');
    if (!data || !data.last_ping) { text.textContent = 'Bot never pinged'; return; }

    const minsAgo = Math.round((Date.now() - new Date(data.last_ping).getTime()) / 60000);
    if (minsAgo <= 20) {
        pill.style.background = 'rgba(16,185,129,0.1)'; pill.style.color = 'var(--accent-green)'; pill.style.borderColor = 'rgba(16,185,129,0.25)';
        dot.style.background = 'var(--accent-green)';
        text.textContent = `Bot online · ${minsAgo}m ago`;
    } else {
        pill.style.background = 'rgba(239,68,68,0.1)'; pill.style.color = 'var(--accent-red)'; pill.style.borderColor = 'rgba(239,68,68,0.25)';
        dot.style.background = 'var(--accent-red)';
        text.textContent = `⚠️ Bot offline · ${minsAgo}m since last ping`;
    }
}

async function loadMaintenanceToggle() {
    const { data } = await sb.from('site_settings').select('value').eq('key', 'maintenance_mode').maybeSingle();
    const toggle = document.getElementById('maintenance-toggle');
    if (!toggle) return;
    toggle.checked = !!(data?.value?.is_active);
    toggle.onchange = async () => {
        const value = { is_active: toggle.checked };
        const { error } = await sb.from('site_settings')
            .upsert({ key: 'maintenance_mode', value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
        if (error) { showToast('Failed to update: ' + error.message, true); toggle.checked = !toggle.checked; return; }
        showToast(toggle.checked ? 'Maintenance mode ON — badge now showing on site.' : 'Maintenance mode OFF.');
        logAction('maintenance_toggled', toggle.checked ? 'on' : 'off');
    };
}

function renderTrafficStatGrid(s) {
    const grid = document.getElementById('traffic-stat-grid');
    if (!s) { grid.innerHTML = '<div class="stat-box">No traffic data yet.</div>'; return; }
    grid.innerHTML = `
        <div class="stat-box"><div class="stat-label">Views Today</div><div class="stat-value">${s.today_views ?? 0}</div><div class="stat-sub">${s.today_visitors ?? 0} unique visitors</div></div>
        <div class="stat-box"><div class="stat-label">Views This Week</div><div class="stat-value">${s.week_views ?? 0}</div><div class="stat-sub">${s.week_visitors ?? 0} unique visitors</div></div>
        <div class="stat-box"><div class="stat-label">Views This Month</div><div class="stat-value">${s.month_views ?? 0}</div><div class="stat-sub">${s.month_visitors ?? 0} unique visitors</div></div>
        <div class="stat-box"><div class="stat-label">All-Time Views</div><div class="stat-value">${s.all_time_views ?? 0}</div><div class="stat-sub">${s.all_time_visitors ?? 0} unique visitors</div></div>
    `;
}

function renderNewUsersGrid(u) {
    const grid = document.getElementById('newusers-stat-grid');
    if (!u) { grid.innerHTML = ''; return; }
    grid.innerHTML = `
        <div class="stat-box"><div class="stat-label">Today</div><div class="stat-value">${u.new_today ?? 0}</div></div>
        <div class="stat-box"><div class="stat-label">This Week</div><div class="stat-value">${u.new_this_week ?? 0}</div></div>
        <div class="stat-box"><div class="stat-label">This Month</div><div class="stat-value">${u.new_this_month ?? 0}</div></div>
    `;
}

async function refreshLiveVisitorCount() {
    const { data } = await sb.rpc('get_live_visitor_count');
    document.getElementById('live-visitor-count').textContent = data ?? 0;
}

function renderPlanChart(u) {
    const ctx = document.getElementById('plan-chart');
    if (!u) return;
    const dataVals = [u.free_users ?? 0, u.trial_users ?? 0, u.basic_users ?? 0, u.pro_users ?? 0, u.premium_users ?? 0];
    if (planChart) planChart.destroy();
    planChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Free', 'Trial', 'Basic', 'Pro', 'Premium'],
            datasets: [{
                data: dataVals,
                backgroundColor: ['#64748b', '#f59e0b', '#3b82f6', '#f59e0b', '#8b5cf6'],
                borderColor: '#161e2a', borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 11 } } } }
        }
    });
}

async function loadTrafficChart(range) {
    const ctx = document.getElementById('traffic-chart');
    let labels = [], views = [], visitors = [];

    if (range === 'today') {
        const { data } = await sb.rpc('get_hourly_traffic');
        const byHour = {};
        (data || []).forEach(r => byHour[r.hour] = r);
        for (let h = 0; h < 24; h++) {
            labels.push(h + ':00');
            views.push(byHour[h]?.views ?? 0);
            visitors.push(byHour[h]?.unique_visitors ?? 0);
        }
    } else if (range === 'week') {
        const { data } = await sb.rpc('get_daily_traffic', { days_back: 6 });
        (data || []).forEach(r => {
            labels.push(new Date(r.day).toLocaleDateString(undefined, { weekday: 'short' }));
            views.push(r.views); visitors.push(r.unique_visitors);
        });
    } else if (range === 'month') {
        const { data } = await sb.rpc('get_daily_traffic', { days_back: 29 });
        (data || []).forEach(r => {
            labels.push(new Date(r.day).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }));
            views.push(r.views); visitors.push(r.unique_visitors);
        });
    } else if (range === 'year') {
        const { data } = await sb.rpc('get_monthly_traffic', { months_back: 11 });
        (data || []).forEach(r => {
            labels.push(new Date(r.month).toLocaleDateString(undefined, { month: 'short', year: '2-digit' }));
            views.push(r.views); visitors.push(r.unique_visitors);
        });
    }

    if (trafficChart) trafficChart.destroy();
    trafficChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: 'Page Views', data: views, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.08)', fill: true, tension: 0.3 },
                { label: 'Unique Visitors', data: visitors, borderColor: '#06b6d4', backgroundColor: 'rgba(6,182,212,0.06)', fill: true, tension: 0.3 }
            ]
        },
        options: {
            responsive: true,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { labels: { color: '#94a3b8' } } },
            scales: {
                x: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.04)' } },
                y: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.04)' }, beginAtZero: true }
            }
        }
    });
}

// ============================================================
// ✅ NEW: LIVE VISITOR DETAIL (country + current page, in the Overview tab)
// ============================================================
function countryFlagEmoji(code) {
    if (!code || code.length !== 2) return '🌐';
    const codePoints = [...code.toUpperCase()].map(c => 127397 + c.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
}

async function loadLiveVisitorsDetail() {
    const list = document.getElementById('live-visitors-list');
    if (!list) return;
    const { data, error } = await sb.rpc('get_live_visitors_detail');
    if (error) { list.innerHTML = `<p class="table-empty">Failed to load: ${error.message}</p>`; return; }
    if (!data || data.length === 0) { list.innerHTML = `<p class="table-empty">No one online right now.</p>`; return; }

    list.innerHTML = data.map(v => {
        const onlineFor = v.first_seen ? Math.max(0, Math.round((Date.now() - new Date(v.first_seen).getTime()) / 60000)) : null;
        const place = [v.city, v.country_name].filter(Boolean).join(', ') || 'Unknown location';
        return `
        <div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border-color);font-size:0.82rem;">
            <span>${countryFlagEmoji(v.country_code)} ${escapeHtml(place)}</span>
            <span style="color:var(--accent-blue);">${escapeHtml(v.current_page || '—')}</span>
            <span style="color:var(--text-muted);">${escapeHtml(v.browser || 'Unknown')} · ${escapeHtml(v.device_type || 'Unknown')}</span>
            <span style="color:var(--text-muted);font-size:0.74rem;">${onlineFor !== null ? onlineFor + 'm online' : ''}</span>
        </div>`;
    }).join('');
}

function getRangeDates(metric) {
    const state = analyticsRangeState[metric] || { mode: '30d' };
    const today = new Date();
    const end = new Date(today);
    if (state.mode === 'custom' && state.start && state.end) {
        return { start_date: state.start, end_date: state.end };
    }
    let start = new Date(today);
    if (state.mode === 'yearly') start.setFullYear(start.getFullYear() - 1);
    else if (state.mode === 'all') start = new Date('2000-01-01');
    else start.setDate(start.getDate() - 30); // '30d' default
    return { start_date: start.toISOString().slice(0, 10), end_date: end.toISOString().slice(0, 10) };
}

function getRangeLabel(metric) {
    const state = analyticsRangeState[metric] || { mode: '30d' };
    if (state.mode === 'custom' && state.start && state.end) {
        const fmt = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        return state.start.slice(0, 7) === state.end.slice(0, 7) ? `(${fmt(state.start)})` : `(${fmt(state.start)} – ${fmt(state.end)})`;
    }
    if (state.mode === 'yearly') return '(Last 12 Months)';
    if (state.mode === 'all') return '(All Time)';
    return '(Last 30 Days)';
}

function refreshRangeLabel(metric) {
    const el = document.getElementById(`range-label-${metric}`);
    if (el) el.textContent = getRangeLabel(metric);
}

const ANALYTICS_RELOADERS = {
    country: loadCountryBreakdown,
    channels: loadTrafficChannels,
    utm: loadUtmCampaigns,
    deviceOs: loadDeviceBrowserOs,
    heatmap: loadWeeklyHeatmap
};

function openCustomRangeModal(metric) {
    _rangeModalTarget = metric;
    const modal = document.getElementById('range-modal');
    if (!modal) return;
    const state = analyticsRangeState[metric];
    document.getElementById('range-modal-start').value = state.start ? state.start.slice(0, 7) : '';
    document.getElementById('range-modal-end').value = state.end ? state.end.slice(0, 7) : '';
    modal.style.display = 'flex';
}

function closeCustomRangeModal() {
    const modal = document.getElementById('range-modal');
    if (modal) modal.style.display = 'none';
    _rangeModalTarget = null;
}

function applyCustomRange() {
    const startMonth = document.getElementById('range-modal-start').value;
    const endMonth = document.getElementById('range-modal-end').value;
    if (!startMonth || !endMonth) { showToast('Pick both a start and end month.', true); return; }
    if (startMonth > endMonth) { showToast('Start month must be before end month.', true); return; }

    const start_date = `${startMonth}-01`;
    const [endY, endM] = endMonth.split('-').map(Number);
    const lastDay = new Date(endY, endM, 0).getDate();
    const end_date = `${endMonth}-${String(lastDay).padStart(2, '0')}`;

    const metric = _rangeModalTarget;
    analyticsRangeState[metric] = { mode: 'custom', start: start_date, end: end_date };

    const group = document.querySelector(`.range-toggle[data-metric="${metric}"]`);
    if (group) {
        group.querySelectorAll('.analytics-range-btn').forEach(b => b.classList.remove('active'));
        const customBtn = group.querySelector('.analytics-range-btn[data-range="custom"]');
        if (customBtn) customBtn.classList.add('active');
    }

    refreshRangeLabel(metric);
    document.getElementById('range-modal').style.display = 'none';
    _rangeModalTarget = null;
    ANALYTICS_RELOADERS[metric]();
}

// ============================================================
// ✅ NEW: ANALYTICS TAB
// ============================================================
async function loadAnalyticsTab() {
    loadCountryBreakdown();
    loadDeviceBrowserOs();
    loadTrafficChannels();
    loadUtmCampaigns();
    loadEngagementStats();
    loadRecentEvents();
    loadPerfStats();
    loadRecentErrors();
    loadWeeklyHeatmap();   // ✅ NEW

    document.querySelectorAll('.analytics-range-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const group = btn.closest('.range-toggle');
            const metric = group.dataset.metric;
            if (btn.dataset.range === 'custom') { openCustomRangeModal(metric); return; }
            group.querySelectorAll('.analytics-range-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            analyticsRangeState[metric] = { mode: btn.dataset.range, start: null, end: null };
            refreshRangeLabel(metric);
            ANALYTICS_RELOADERS[metric]();
        });
    });
    document.getElementById('range-modal-cancel').addEventListener('click', closeCustomRangeModal);
    document.getElementById('range-modal-apply').addEventListener('click', applyCustomRange);
}

async function loadCountryBreakdown() {
    const list = document.getElementById('country-list');
    if (!list) return;
    const { data, error } = await sb.rpc('get_visitors_by_country', getRangeDates('country'));
    if (error) { list.innerHTML = `<p class="table-empty">${error.message}</p>`; return; }
    if (!data || data.length === 0) { list.innerHTML = `<p class="table-empty">No geographic data yet.</p>`; return; }

    const max = Math.max(...data.map(r => Number(r.visitors)), 1);
    list.innerHTML = data.map(r => `
        <div style="margin-bottom:10px;">
            <div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:4px;">
                <span>${countryFlagEmoji(r.country_code)} ${escapeHtml(r.country_name || r.country_code || 'Unknown')}</span>
                <span style="color:var(--text-muted);">${r.visitors}</span>
            </div>
            <div style="height:5px;background:rgba(255,255,255,0.06);border-radius:4px;">
                <div style="height:100%;width:${Math.round((Number(r.visitors) / max) * 100)}%;background:var(--accent-blue);border-radius:4px;"></div>
            </div>
        </div>
    `).join('');
}

async function loadWeeklyHeatmap() {
    const container = document.getElementById('heatmap-container');
    if (!container) return;

    const { data, error } = await sb.rpc('get_weekly_heatmap', getRangeDates('heatmap'));
    if (error) { container.innerHTML = `<p class="table-empty">${error.message}</p>`; return; }
    if (!data || data.length === 0) {
        container.innerHTML = `<p class="table-empty">No traffic data yet — heatmap fills as visitors arrive.</p>`;
        return;
    }

    // Build lookup: grid[day][hour] = visitor count
    const grid = {};
    let maxVal = 1;
    data.forEach(r => {
        if (!grid[r.day_of_week]) grid[r.day_of_week] = {};
        grid[r.day_of_week][r.hour_of_day] = Number(r.visitors);
        if (Number(r.visitors) > maxVal) maxVal = Number(r.visitors);
    });

    const days   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const hours  = Array.from({ length: 24 }, (_, i) => i);

    // Header row: hour labels
    let html = `<div style="display:grid;grid-template-columns:44px repeat(24,1fr);gap:3px;margin-bottom:3px;">
        <div></div>
        ${hours.map(h => `<div class="heatmap-label">${h === 0 ? '12am' : h < 12 ? h+'am' : h === 12 ? '12pm' : (h-12)+'pm'}</div>`).join('')}
    </div>`;

    // One row per day
    days.forEach((dayLabel, dayIdx) => {
        html += `<div style="display:grid;grid-template-columns:44px repeat(24,1fr);gap:3px;margin-bottom:3px;">
            <div class="heatmap-label" style="line-height:1;display:flex;align-items:center;">${dayLabel}</div>`;
        hours.forEach(h => {
            const v   = (grid[dayIdx] && grid[dayIdx][h]) || 0;
            const pct = Math.round((v / maxVal) * 100);
            // Opacity range 0.05 (empty) → 0.95 (peak)
            const opacity = v === 0 ? 0.05 : 0.1 + (pct / 100) * 0.85;
            const tip = `${dayLabel} ${h}:00 — ${v} visitor${v !== 1 ? 's' : ''}`;
            html += `<div class="heatmap-cell" 
                style="background:rgba(59,130,246,${opacity.toFixed(2)});" 
                data-tip="${tip}"></div>`;
        });
        html += `</div>`;
    });

    container.innerHTML = html;
}

async function loadDeviceBrowserOs() {
    const deviceList = document.getElementById('device-list');
    const browserList = document.getElementById('browser-list');
    const osList = document.getElementById('os-list');
    if (!deviceList || !browserList || !osList) return;

    const [devicesRes, browsersRes, osRes] = await Promise.all([
        sb.rpc('get_device_breakdown', getRangeDates('deviceOs')),
        sb.rpc('get_browser_breakdown', getRangeDates('deviceOs')),
        sb.rpc('get_os_breakdown', getRangeDates('deviceOs'))
    ]);

    const renderList = (rows, key) => {
        if (!rows || rows.length === 0) return `<p class="table-empty">No data yet.</p>`;
        const total = rows.reduce((s, r) => s + Number(r.sessions), 0) || 1;
        return rows.map(r => `
            <div style="display:flex;justify-content:space-between;font-size:0.8rem;padding:6px 0;border-bottom:1px solid var(--border-color);">
                <span>${escapeHtml(r[key] || 'Unknown')}</span>
                <span style="color:var(--text-muted);">${r.sessions} (${Math.round((Number(r.sessions) / total) * 100)}%)</span>
            </div>`).join('');
    };

    deviceList.innerHTML = renderList(devicesRes.data, 'device_type');
    browserList.innerHTML = renderList(browsersRes.data, 'browser');
    osList.innerHTML = renderList(osRes.data, 'os');
}

async function loadTrafficChannels() {
    const ctx = document.getElementById('channels-chart');
    if (!ctx) return;
    const { data, error } = await sb.rpc('get_traffic_channels', getRangeDates('channels'));
    if (error || !data || data.length === 0) return;

    if (channelsChart) channelsChart.destroy();
    channelsChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: data.map(r => r.channel),
            datasets: [{
                data: data.map(r => r.sessions),
                backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ef4444', '#64748b'],
                borderColor: '#161e2a', borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 11 } } } }
        }
    });
}

async function loadUtmCampaigns() {
    const tbody = document.getElementById('utm-table-body');
    if (!tbody) return;
    const { data, error } = await sb.rpc('get_utm_campaigns', getRangeDates('utm'));
    if (error) { tbody.innerHTML = `<tr><td colspan="4" class="table-empty">${error.message}</td></tr>`; return; }
    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="table-empty">No campaign traffic yet — add ?utm_source=...&utm_medium=...&utm_campaign=... to your marketing links.</td></tr>`;
        return;
    }
    tbody.innerHTML = data.map(r => `
        <tr>
            <td>${escapeHtml(r.utm_source || '—')}</td>
            <td>${escapeHtml(r.utm_medium || '—')}</td>
            <td>${escapeHtml(r.utm_campaign || '—')}</td>
            <td>${r.sessions}</td>
        </tr>
    `).join('');
}

async function loadEngagementStats() {
    const grid = document.getElementById('engagement-stat-grid');
    if (!grid) return;
    const { data, error } = await sb.rpc('get_session_engagement', { days_back: 30 }).single();
    if (error || !data) { grid.innerHTML = '<div class="stat-box">No session data yet.</div>'; return; }

    const mins = data.avg_duration_seconds ? Math.round((data.avg_duration_seconds / 60) * 10) / 10 : 0;
    grid.innerHTML = `
        <div class="stat-box"><div class="stat-label">Bounce Rate</div><div class="stat-value">${data.bounce_rate_pct ?? 0}%</div><div class="stat-sub">${data.bounced_sessions ?? 0} of ${data.total_sessions ?? 0} sessions · 30 days</div></div>
        <div class="stat-box"><div class="stat-label">Avg Session Duration</div><div class="stat-value">${mins}m</div><div class="stat-sub">last 30 days</div></div>
    `;
}

async function loadRecentEvents() {
    const list = document.getElementById('recent-events-list');
    if (!list) return;
    const { data, error } = await sb.rpc('get_recent_events', { limit_count: 15 });
    if (error) { list.innerHTML = `<p class="table-empty">${error.message}</p>`; return; }
    if (!data || data.length === 0) { list.innerHTML = `<p class="table-empty">No events logged yet.</p>`; return; }

    const eventLabels = { outbound_click: 'clicked outbound link to', file_download: 'downloaded', video_play: 'played video' };
    list.innerHTML = data.map(e => `
        <div style="padding:8px 0;border-bottom:1px solid var(--border-color);font-size:0.8rem;">
            <div>${escapeHtml(eventLabels[e.event_type] || e.event_type)} <span style="color:var(--accent-blue);">${escapeHtml(e.event_label || '')}</span></div>
            <div style="color:var(--text-muted);font-size:0.74rem;">on ${escapeHtml(e.page || '')} · ${new Date(e.created_at).toLocaleString()}</div>
        </div>
    `).join('');
}

async function loadPerfStats() {
    const grid = document.getElementById('perf-stat-grid');
    if (!grid) return;
    const { data, error } = await sb.rpc('get_avg_page_load_time', { days_back: 7 }).single();
    if (error || !data || !data.avg_load_ms) { grid.innerHTML = '<div class="stat-box">No load-time data yet.</div>'; return; }

    grid.innerHTML = `
        <div class="stat-box"><div class="stat-label">Avg Page Load Time</div><div class="stat-value">${(data.avg_load_ms / 1000).toFixed(2)}s</div><div class="stat-sub">${data.sample_size} page loads · 7 days</div></div>
    `;
}

async function loadRecentErrors() {
    const list = document.getElementById('recent-errors-list');
    if (!list) return;
    const { data, error } = await sb.rpc('get_recent_errors', { limit_count: 15 });
    if (error) { list.innerHTML = `<p class="table-empty">${error.message}</p>`; return; }
    if (!data || data.length === 0) { list.innerHTML = `<p class="table-empty">No client-side errors logged. 🎉</p>`; return; }

    list.innerHTML = data.map(e => `
        <div style="padding:8px 0;border-bottom:1px solid var(--border-color);font-size:0.78rem;">
            <div style="color:var(--accent-red);">${escapeHtml(e.message || 'Unknown error')}</div>
            <div style="color:var(--text-muted);">${escapeHtml(e.page || '')}${e.source ? ' · ' + escapeHtml(e.source) : ''} · ${new Date(e.created_at).toLocaleString()}</div>
        </div>
    `).join('');
}

// ============================================================
// USERS TAB
// ============================================================
let allUsersCache = [];

async function loadUsersTab() {
    document.getElementById('export-users-csv-btn').addEventListener('click', exportUsersCsv);
    const { data, error } = await sb.from('profiles')
        .select('id, email, full_name, avatar_url, plan_tier, created_at, subscription_expiry')
        .order('created_at', { ascending: false })
        .limit(500); // hard ceiling for safety; pagination below works off this cache

    if (error) {
        document.getElementById('users-table-body').innerHTML =
            `<tr><td colspan="6" class="table-empty">Failed to load users: ${error.message}</td></tr>`;
        return;
    }

    allUsersCache = data || [];
    usersPage = 0;
    renderUsersTable();

    document.getElementById('user-search').addEventListener('input', () => { usersPage = 0; renderUsersTable(); });
    document.getElementById('user-plan-filter').addEventListener('change', () => { usersPage = 0; renderUsersTable(); });
}

function renderUsersTable() {
    const search = document.getElementById('user-search').value.trim().toLowerCase();
    const planFilter = document.getElementById('user-plan-filter').value;

    let filtered = allUsersCache.filter(u => {
        const matchesSearch = !search ||
            (u.full_name || '').toLowerCase().includes(search) ||
            (u.email || '').toLowerCase().includes(search);
        const matchesPlan = !planFilter || (u.plan_tier || 'free') === planFilter;
        return matchesSearch && matchesPlan;
    });

    const totalPages = Math.max(1, Math.ceil(filtered.length / USERS_PER_PAGE));
    usersPage = Math.min(usersPage, totalPages - 1);
    const pageItems = filtered.slice(usersPage * USERS_PER_PAGE, (usersPage + 1) * USERS_PER_PAGE);

    const tbody = document.getElementById('users-table-body');
    if (pageItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="table-empty">No users match this filter.</td></tr>`;
    } else {
        tbody.innerHTML = pageItems.map(u => {
            const plan = u.plan_tier || 'free';
            const initials = (u.full_name || u.email || '?').substring(0, 2).toUpperCase();
            const avatarHtml = u.avatar_url
                ? `<img class="user-avatar-sm" src="${escapeHtml(u.avatar_url)}">`
                : `<div class="user-avatar-fallback">${escapeHtml(initials)}</div>`;
            const joined = u.created_at ? new Date(u.created_at).toLocaleDateString() : '—';
            const expiry = u.subscription_expiry ? new Date(u.subscription_expiry).toLocaleDateString() : '—';

            return `
            <tr>
                <td><div class="user-cell">${avatarHtml}<span>${escapeHtml(u.full_name || 'Unnamed')}</span></div></td>
                <td>${escapeHtml(u.email || '—')}</td>
                <td><span class="plan-badge plan-${plan}">${plan}</span></td>
                <td>${joined}</td>
                <td>${expiry}</td>
                <td>
                    <select class="plan-select-inline" data-user-id="${u.id}">
                        ${['free','trial','basic','pro','premium'].map(p =>
                            `<option value="${p}" ${p === plan ? 'selected' : ''}>${p}</option>`).join('')}
                    </select>
                </td>
            </tr>`;
        }).join('');

        tbody.querySelectorAll('.plan-select-inline').forEach(sel => {
            sel.addEventListener('change', () => {
                const oldPlan = pageItems.find(u => u.id === sel.dataset.userId)?.plan_tier || 'free';
                const isDowngrade = ['basic','pro','premium'].includes(oldPlan) && ['free','trial'].includes(sel.value);
                if (isDowngrade && !confirm(`This removes their paid access immediately. Continue?`)) {
                    sel.value = oldPlan; return;
                }
                updateUserPlan(sel.dataset.userId, sel.value);
            });
        });
    }

    renderUsersPager(totalPages);
}

function renderUsersPager(totalPages) {
    const pager = document.getElementById('users-pager');
    if (totalPages <= 1) { pager.innerHTML = ''; return; }
    let html = `<button ${usersPage === 0 ? 'disabled' : ''} id="pager-prev">‹ Prev</button>`;
    html += `<span style="color:var(--text-muted);font-size:0.82rem;align-self:center;">Page ${usersPage + 1} of ${totalPages}</span>`;
    html += `<button ${usersPage >= totalPages - 1 ? 'disabled' : ''} id="pager-next">Next ›</button>`;
    pager.innerHTML = html;
    document.getElementById('pager-prev')?.addEventListener('click', () => { usersPage--; renderUsersTable(); });
    document.getElementById('pager-next')?.addEventListener('click', () => { usersPage++; renderUsersTable(); });
}

async function updateUserPlan(userId, newPlan) {
    // Setting a fresh 30-day expiry whenever an admin manually assigns a paid plan.
    // Free/trial get expiry cleared.
    const payload = { plan_tier: newPlan };
    if (['basic', 'pro', 'premium'].includes(newPlan)) {
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 30);
        payload.subscription_expiry = expiry.toISOString();
    } else {
        payload.subscription_expiry = null;
    }

    const { error } = await sb.from('profiles').update(payload).eq('id', userId);
    if (error) {
        showToast('Failed to update plan: ' + error.message, true);
    } else {
        showToast('Plan updated successfully.');
        const cached = allUsersCache.find(u => u.id === userId);
        const oldPlan = cached?.plan_tier || 'free';
        if (cached) { cached.plan_tier = newPlan; cached.subscription_expiry = payload.subscription_expiry; }
        logAction('plan_change', cached?.email || userId, { from: oldPlan, to: newPlan });
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}

let _toastTimer = null;
function showToast(message, isError = false) {
    const toast = document.getElementById('admin-toast');
    if (!toast) return; // fail-soft — never let a missing element throw elsewhere
    toast.textContent = message;
    toast.classList.toggle('error', !!isError);
    toast.classList.add('show');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
}

function exportUsersCsv() {
    const rows = [['Name', 'Email', 'Plan', 'Joined', 'Expiry']];
    allUsersCache.forEach(u => rows.push([
        u.full_name || '', u.email || '', u.plan_tier || 'free',
        u.created_at ? new Date(u.created_at).toLocaleDateString() : '',
        u.subscription_expiry ? new Date(u.subscription_expiry).toLocaleDateString() : ''
    ]));
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sapex_users_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
}

// ============================================================
// ADS TAB
// ============================================================
async function loadAdsTab() {
    const { data, error } = await sb.from('ad_slots').select('*').order('display_order', { ascending: true });
    const grid = document.getElementById('ads-grid');

    if (error) { grid.innerHTML = `<p class="table-empty">Failed to load ad slots: ${error.message}</p>`; return; }
    renderAdsGrid(data || []);

    document.getElementById('add-ad-slot-btn').addEventListener('click', createNewAdSlot);
}

async function loadAnnouncementTab() {
    const { data } = await sb.from('site_settings').select('value').eq('key', 'homepage_announcement').maybeSingle();
    const v = data?.value || {};
    document.getElementById('ann-active').checked = !!v.is_active;
    document.getElementById('ann-title').value = v.title || '';
    document.getElementById('ann-date').value = v.badge_date || '';
    document.getElementById('ann-image').value = v.image_url || '';
    document.getElementById('ann-body').value = v.body || '';
    document.getElementById('ann-bullets').value = (v.bullets || []).join('\n');
    document.getElementById('ann-save-btn').onclick = saveAnnouncement;
}

async function saveAnnouncement() {
    const value = {
        is_active: document.getElementById('ann-active').checked,
        title: document.getElementById('ann-title').value.trim(),
        badge_date: document.getElementById('ann-date').value.trim(),
        image_url: document.getElementById('ann-image').value.trim(),
        body: document.getElementById('ann-body').value.trim(),
        bullets: document.getElementById('ann-bullets').value.split('\n').map(s => s.trim()).filter(Boolean)
    };
    const { error } = await sb.from('site_settings').update({ value, updated_at: new Date().toISOString() }).eq('key', 'homepage_announcement');
    if (error) showToast('Failed to save: ' + error.message, true);
    else { showToast('Announcement saved — live on site now.'); logAction('announcement_updated', 'homepage_announcement'); }
}

let allRedeemCodesCache = [];

function initRedeemCodesTab() {
    document.getElementById('rc-generate-btn').addEventListener('click', generateRedeemCodes);
    document.getElementById('rc-refresh-btn').addEventListener('click', loadRedeemCodes);
    document.getElementById('rc-search').addEventListener('input', renderRedeemCodesTable);
    document.getElementById('rc-status-filter').addEventListener('change', renderRedeemCodesTable);
    document.getElementById('rc-export-csv-btn').addEventListener('click', exportRedeemCodesCsv);
    loadRedeemCodes();
}

function generateOneCode() {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const bytes = new Uint32Array(16);
    crypto.getRandomValues(bytes);
    let code = '';
    for (let i = 0; i < 16; i++) code += alphabet[bytes[i] % 26];
    return code;
}

function formatCodeForDisplay(code) {
    return code.replace(/(.{4})/g, '$1-').replace(/-$/, '');
}

async function generateRedeemCodes() {
    const plan = document.getElementById('rc-form-plan').value;
    const months = parseInt(document.getElementById('rc-form-months').value, 10);
    const count = parseInt(document.getElementById('rc-form-count').value, 10);
    const note = document.getElementById('rc-form-note').value.trim() || null;
    const statusEl = document.getElementById('rc-form-status');
    const btn = document.getElementById('rc-generate-btn');

    if (!months || months < 1 || months > 60) { statusEl.textContent = 'Enter a valid duration (1–60 months).'; return; }
    if (!count  || count  < 1 || count  > 200) { statusEl.textContent = 'Enter a valid count (1–200).'; return; }

    btn.disabled = true;
    statusEl.textContent = `Generating ${count} code(s)...`;

    const seen = new Set();
    const rows = [];
    while (rows.length < count) {
        const code = generateOneCode();
        if (seen.has(code)) continue;
        seen.add(code);
        rows.push({ code, plan_tier: plan, duration_months: months, note, created_by: currentAdminEmail });
    }

    const { data, error } = await sb.from('redeem_codes').insert(rows).select();
    btn.disabled = false;

    if (error) {
        statusEl.textContent = 'Failed: ' + error.message;
        showToast('Failed to generate codes: ' + error.message, true);
        return;
    }

    statusEl.textContent = `✅ Generated ${data.length} code(s).`;
    showToast(`Generated ${data.length} redeem code(s).`);
    logAction('redeem_codes_generated', plan, { count: data.length, months, note });

    const box  = document.getElementById('rc-generated-box');
    const list = document.getElementById('rc-generated-list');
    list.innerHTML = data.map(r => formatCodeForDisplay(r.code)).join('<br>');
    box.style.display = 'block';
    document.getElementById('rc-copy-all-btn').onclick = () => {
        navigator.clipboard.writeText(data.map(r => formatCodeForDisplay(r.code)).join('\n'));
        showToast('Copied to clipboard.');
    };

    loadRedeemCodes();
}

async function loadRedeemCodes() {
    const { data, error } = await sb.from('redeem_codes')
        .select('id, code, plan_tier, duration_months, status, note, created_at, redeemed_email, redeemed_at')
        .order('created_at', { ascending: false })
        .limit(1000);

    if (error) {
        document.getElementById('rc-table-body').innerHTML =
            `<tr><td colspan="9" class="table-empty">Failed to load codes: ${error.message}</td></tr>`;
        return;
    }
    allRedeemCodesCache = data || [];
    renderRedeemCodesTable();
}

function renderRedeemCodesTable() {
    const search = document.getElementById('rc-search').value.trim().toLowerCase();
    const statusFilter = document.getElementById('rc-status-filter').value;

    const filtered = allRedeemCodesCache.filter(r => {
        const matchesSearch = !search || r.code.toLowerCase().includes(search) || (r.note || '').toLowerCase().includes(search);
        const matchesStatus = !statusFilter || r.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const tbody = document.getElementById('rc-table-body');
    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="9" class="table-empty">No codes match this filter.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(r => `
        <tr>
            <td style="font-family:var(--font-mono);white-space:nowrap;">${formatCodeForDisplay(r.code)}</td>
            <td><span class="plan-badge plan-${r.plan_tier}">${r.plan_tier}</span></td>
            <td>${r.duration_months}</td>
            <td><span class="status-badge status-${r.status}">${r.status}</span></td>
            <td>${escapeHtml(r.note || '—')}</td>
            <td>${new Date(r.created_at).toLocaleDateString()}</td>
            <td>${escapeHtml(r.redeemed_email || '—')}</td>
            <td>${r.redeemed_at ? new Date(r.redeemed_at).toLocaleDateString() : '—'}</td>
            <td>${r.status === 'active' ? `<button class="btn-ghost-small rc-revoke-btn" data-id="${r.id}">Revoke</button>` : ''}</td>
        </tr>`).join('');

    tbody.querySelectorAll('.rc-revoke-btn').forEach(btn => {
        btn.addEventListener('click', () => revokeRedeemCode(btn.dataset.id));
    });
}

async function revokeRedeemCode(id) {
    if (!confirm('Revoke this code? It can no longer be redeemed.')) return;
    const { error } = await sb.from('redeem_codes').update({ status: 'revoked' }).eq('id', id);
    if (error) { showToast('Failed to revoke: ' + error.message, true); return; }
    showToast('Code revoked.');
    logAction('redeem_code_revoked', id);
    loadRedeemCodes();
}

function exportRedeemCodesCsv() {
    const rows = [['Code', 'Plan', 'Months', 'Status', 'Note', 'Created', 'Redeemed By', 'Redeemed At']];
    allRedeemCodesCache.forEach(r => rows.push([
        formatCodeForDisplay(r.code), r.plan_tier, r.duration_months, r.status, r.note || '',
        new Date(r.created_at).toLocaleDateString(),
        r.redeemed_email || '', r.redeemed_at ? new Date(r.redeemed_at).toLocaleDateString() : ''
    ]));
    const csv = rows.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `redeem-codes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
}

// ============================================================
// PREDICTIONS TAB — manually add a Prediction Arena ticket
// ============================================================
let paQuestionManuallyEdited = false;

// Categories the bot can actually check against a live price feed.
// Everything else is a manual ticket: admin supplies the AI call and later
// resolves the outcome by hand — the bot skips these rows entirely.
const PA_BOT_CATEGORIES = ['Crypto', 'Stock'];

function paGetEffectiveCategory() {
    const sel = document.getElementById('pa-form-category').value;
    if (sel === '__custom__') {
        return document.getElementById('pa-form-category-custom').value.trim() || 'Custom';
    }
    return sel;
}

function paIsBotCategory(cat) {
    return PA_BOT_CATEGORIES.includes(cat);
}

function paSyncCategoryFields() {
    const isCustom = document.getElementById('pa-form-category').value === '__custom__';
    document.getElementById('pa-form-category-custom').style.display = isCustom ? 'block' : 'none';

    const isBotCat = paIsBotCategory(paGetEffectiveCategory());
    document.getElementById('pa-price-fields').style.display = isBotCat ? 'contents' : 'none';
    document.getElementById('pa-manual-ai-fields').style.display = isBotCat ? 'none' : 'block';
    document.getElementById('pa-form-asset-label').textContent = isBotCat ? 'Asset' : 'Subject / Topic';
    document.getElementById('pa-form-asset').placeholder = isBotCat ? 'e.g. BTC/USDT or AAPL' : 'e.g. 2028 US Presidential Election';

    paRefreshSuggestedQuestion();
}

function paDefaultResolvesAt() {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    d.setSeconds(0, 0);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function paBuildSuggestedQuestion() {
    const asset = document.getElementById('pa-form-asset').value.trim() || (paIsBotCategory(paGetEffectiveCategory()) ? '[asset]' : '[subject]');
    const resolvesRaw = document.getElementById('pa-form-resolves').value;
    let dateLabel = '[date]';
    if (resolvesRaw) {
        const d = new Date(resolvesRaw);
        if (!isNaN(d)) {
            dateLabel = d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }) + ' UTC';
        }
    }
    if (!paIsBotCategory(paGetEffectiveCategory())) {
        return `Will ${asset} happen by ${dateLabel}?`;
    }
    const direction = document.getElementById('pa-form-direction').value === 'below' ? 'below' : 'above';
    const target = document.getElementById('pa-form-target').value;
    const targetLabel = target ? `$${Number(target).toLocaleString()}` : '$[target]';
    return `Will ${asset} close ${direction} ${targetLabel} by ${dateLabel}?`;
}

function paRefreshSuggestedQuestion() {
    if (paQuestionManuallyEdited) return;
    document.getElementById('pa-form-question').value = paBuildSuggestedQuestion();
}

function initPredictionsForm() {
    document.getElementById('pa-form-resolves').value = paDefaultResolvesAt();

    ['pa-form-asset', 'pa-form-direction', 'pa-form-target', 'pa-form-resolves'].forEach(id => {
        const el = document.getElementById(id);
        el.addEventListener('input', paRefreshSuggestedQuestion);
        el.addEventListener('change', paRefreshSuggestedQuestion);
    });
    document.getElementById('pa-form-question').addEventListener('input', () => { paQuestionManuallyEdited = true; });
    document.getElementById('pa-form-category').addEventListener('change', paSyncCategoryFields);
    document.getElementById('pa-form-category-custom').addEventListener('input', paSyncCategoryFields);

    paSyncCategoryFields();
    document.getElementById('pa-post-btn').addEventListener('click', postPredictionTicket);
}

async function loadPredictionsTab() {
    initPredictionsForm();
    await refreshPredictionsList();
    initPredictionUpdatesPanel();
}

async function refreshPredictionsList() {
    const tbody = document.getElementById('pa-tickets-table-body');
    const { data, error } = await sb
        .from('prediction_tickets')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

    if (error) {
        tbody.innerHTML = `<tr><td colspan="6" class="table-empty">Failed to load: ${escapeHtml(error.message)}</td></tr>`;
        return;
    }
    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="table-empty">No tickets yet.</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(t => {
        const verdict = t.ai_prediction
            ? `${escapeHtml(t.ai_prediction.toUpperCase())} (${t.ai_confidence}%)`
            : (t.bot_excluded
                ? `<span style="color:var(--text-muted);">Manual — not set</span>`
                : `<span style="color:var(--text-muted);">Analyzing...</span>`);
        const statusLabel = t.status === 'open'
            ? '<span style="color:#f0b90b;">Open</span>'
            : `<span style="color:${t.actual_outcome === 'yes' ? '#00d4aa' : '#ef4444'};">Resolved: ${escapeHtml((t.actual_outcome || '—').toUpperCase())}</span>`;
        const actionBtns = t.status === 'open'
            ? `<button class="btn-primary-small pa-resolve-btn" data-outcome="yes" style="padding:5px 10px;font-size:0.72rem;margin-right:4px;">Resolve ✓</button>
               <button class="btn-primary-small pa-resolve-btn" data-outcome="no" style="padding:5px 10px;font-size:0.72rem;margin-right:4px;background:linear-gradient(135deg,var(--accent-red),var(--accent-yellow));">Resolve ✗</button>
               <button class="btn-danger-small pa-delete-btn">Delete</button>`
            : `<button class="btn-danger-small pa-delete-btn">Delete</button>`;
        return `
        <tr data-ticket-id="${t.id}">
            <td style="max-width:320px;">${escapeHtml(t.question)}</td>
            <td>${t.source === 'admin' ? 'Admin' : 'Bot'}</td>
            <td>${statusLabel}</td>
            <td>${verdict}</td>
            <td>${t.yes_votes || 0} Y / ${t.no_votes || 0} N</td>
            <td style="white-space:nowrap;">${actionBtns}</td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('tr').forEach(row => {
        const id = row.dataset.ticketId;
        const delBtn = row.querySelector('.pa-delete-btn');
        if (id && delBtn) delBtn.addEventListener('click', () => deletePredictionTicket(id, row));
        row.querySelectorAll('.pa-resolve-btn').forEach(btn => {
            btn.addEventListener('click', () => resolvePredictionTicket(id, btn.dataset.outcome, row));
        });
    });

    populateUpdateTicketSelect(data);
}

// ------------------------------------------------------------
// 🗞️ Prediction Arena — News & Updates timeline (per ticket)
// Powers the timeline shown on each ticket's detail view in the
// standalone prediction_arena.html page.
// ------------------------------------------------------------
function populateUpdateTicketSelect(tickets) {
    const select = document.getElementById('pa-update-ticket-select');
    if (!select) return;
    const previouslySelected = select.value;

    select.innerHTML = (tickets || []).map(t =>
        `<option value="${t.id}">#${t.id} — ${escapeHtml((t.question || '').slice(0, 70))}${(t.question || '').length > 70 ? '…' : ''}</option>`
    ).join('');

    if (previouslySelected && [...select.options].some(o => o.value === previouslySelected)) {
        select.value = previouslySelected;
    }
}

function initPredictionUpdatesPanel() {
    const select = document.getElementById('pa-update-ticket-select');
    const postBtn = document.getElementById('pa-update-post-btn');
    if (!select || select.dataset.wired) return; // avoid double-binding on repeat tab visits
    select.dataset.wired = 'true';

    select.addEventListener('change', () => loadTicketUpdates(select.value));
    postBtn.addEventListener('click', postTicketUpdate);

    if (select.value) loadTicketUpdates(select.value);
}

async function loadTicketUpdates(ticketId) {
    const list = document.getElementById('pa-update-list');
    if (!ticketId) { list.innerHTML = ''; return; }
    list.innerHTML = `<p class="tab-hint">Loading updates...</p>`;

    const { data, error } = await sb
        .from('prediction_ticket_updates')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: false });

    if (error) {
        list.innerHTML = `<p class="tab-hint" style="color:var(--accent-red);">Failed to load: ${escapeHtml(error.message)}</p>`;
        return;
    }
    if (!data || !data.length) {
        list.innerHTML = `<p class="tab-hint">No updates posted for this ticket yet.</p>`;
        return;
    }

    list.innerHTML = data.map(u => `
        <div data-update-id="${u.id}" style="display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--border-color);">
            <div>
                <div style="font-size:0.7rem;color:var(--text-muted);font-family:var(--font-mono);">${new Date(u.created_at).toLocaleString()}</div>
                <div style="font-size:0.88rem;color:var(--text-secondary);margin-top:2px;">${escapeHtml(u.note)}</div>
            </div>
            <button class="btn-danger-small pa-update-delete-btn" style="height:fit-content;">Delete</button>
        </div>`).join('');

    list.querySelectorAll('.pa-update-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const row = e.target.closest('[data-update-id]');
            deleteTicketUpdate(row.dataset.updateId, ticketId);
        });
    });
}

async function postTicketUpdate() {
    const select = document.getElementById('pa-update-ticket-select');
    const textarea = document.getElementById('pa-update-note');
    const status = document.getElementById('pa-update-status');
    const ticketId = select.value;
    const note = textarea.value.trim();

    if (!ticketId) { status.textContent = 'Pick a ticket first.'; return; }
    if (!note) { status.textContent = 'Write an update first.'; return; }

    status.textContent = 'Posting...';
    const { error } = await sb.from('prediction_ticket_updates').insert({ ticket_id: ticketId, note });

    if (error) {
        status.textContent = `Failed: ${error.message}`;
        return;
    }
    status.textContent = 'Posted ✓';
    textarea.value = '';
    setTimeout(() => { status.textContent = ''; }, 2500);
    loadTicketUpdates(ticketId);
}

async function deleteTicketUpdate(updateId, ticketId) {
    if (!confirm('Delete this update?')) return;
    const { error } = await sb.from('prediction_ticket_updates').delete().eq('id', updateId);
    if (error) { alert('Failed to delete: ' + error.message); return; }
    loadTicketUpdates(ticketId);
}

async function postPredictionTicket() {
    const category = paGetEffectiveCategory();
    const isBotCat = paIsBotCategory(category);
    const asset = document.getElementById('pa-form-asset').value.trim();
    const direction = document.getElementById('pa-form-direction').value;
    const targetRaw = document.getElementById('pa-form-target').value;
    const resolvesRaw = document.getElementById('pa-form-resolves').value;
    const question = document.getElementById('pa-form-question').value.trim();
    const statusEl = document.getElementById('pa-form-status');

    if (!category || !asset || !resolvesRaw || !question) {
        statusEl.textContent = 'Fill in category, subject, resolve date, and the question.';
        statusEl.style.color = '#ef4444';
        return;
    }
    if (isBotCat && !targetRaw) {
        statusEl.textContent = 'Fill in the target price for a bot-analyzed category.';
        statusEl.style.color = '#ef4444';
        return;
    }

    const payload = {
        question,
        category,
        asset,
        target_price: isBotCat ? Number(targetRaw) : null,
        direction: isBotCat ? direction : null,
        resolves_at: new Date(resolvesRaw).toISOString(),
        status: 'open',
        source: 'admin',
        yes_votes: 0,
        no_votes: 0,
        bot_excluded: !isBotCat
    };

    if (!isBotCat) {
        const manualVerdict = document.getElementById('pa-form-manual-verdict').value;
        const manualConfidence = document.getElementById('pa-form-manual-confidence').value;
        const manualReasoning = document.getElementById('pa-form-manual-reasoning').value.trim();
        if (manualVerdict) payload.ai_prediction = manualVerdict;
        if (manualConfidence) payload.ai_confidence = Number(manualConfidence);
        if (manualReasoning) payload.ai_reasoning = manualReasoning;
    }

    statusEl.textContent = 'Posting...';
    statusEl.style.color = 'var(--text-muted)';

    const { error } = await sb.from('prediction_tickets').insert(payload).select().single();

    if (error) {
        statusEl.textContent = 'Failed: ' + error.message;
        statusEl.style.color = '#ef4444';
        showToast('Failed to post ticket: ' + error.message, true);
        return;
    }

    showToast("Ticket posted — live on site now. AI verdict fills in on the bot's next turn.");
    logAction('prediction_ticket_added', asset, { question });
    statusEl.textContent = 'Posted ✅';
    statusEl.style.color = '#00d4aa';

    document.getElementById('pa-form-category').value = 'Crypto';
    document.getElementById('pa-form-category-custom').value = '';
    document.getElementById('pa-form-asset').value = '';
    document.getElementById('pa-form-target').value = '';
    document.getElementById('pa-form-resolves').value = paDefaultResolvesAt();
    document.getElementById('pa-form-question').value = '';
    document.getElementById('pa-form-manual-verdict').value = '';
    document.getElementById('pa-form-manual-confidence').value = '';
    document.getElementById('pa-form-manual-reasoning').value = '';
    paQuestionManuallyEdited = false;
    paSyncCategoryFields();

    refreshPredictionsList();
}

async function deletePredictionTicket(id, row) {
    if (!confirm('Delete this ticket? This cannot be undone.')) return;
    const { error } = await sb.from('prediction_tickets').delete().eq('id', id);
    if (error) { showToast('Failed to delete: ' + error.message, true); return; }
    if (row) row.remove();
    showToast('Ticket deleted.');
    logAction('prediction_ticket_deleted', String(id));
}

async function resolvePredictionTicket(id, outcome, row) {
    if (!confirm(`Mark this ticket resolved as ${outcome.toUpperCase()}? This cannot be undone.`)) return;
    const { data, error } = await sb.rpc('resolve_prediction_ticket', {
        p_ticket_id: Number(id),
        p_outcome: outcome
    });
    if (error) { showToast('Failed to resolve: ' + error.message, true); return; }
    if (!data) { showToast('Nothing changed — ticket may not exist anymore.', true); return; }
    showToast(`Ticket resolved as ${outcome.toUpperCase()}.`);
    logAction('prediction_ticket_resolved', String(id), { outcome });
    refreshPredictionsList();
}

// Recommended dimensions per slot — based on each container's actual CSS
// width. Images use max-width:100% (never stretched up, only shrunk down),
// so undersized uploads will look small instead of filling the space.
const AD_SLOT_SIZE_HINTS = {
    sidebar_bottom: 'Recommended: 220 × 100px (sidebar is 260px wide; short height keeps the nav menu from being pushed down)',
    dashboard_top: 'Recommended: 1200 × 150px (wide banner — scales down on smaller screens automatically)',
    newsfeed_top: 'Recommended: 1140 × 150px (same as Dashboard, slightly narrower due to extra inner padding)',
};
function adSizeHintFor(slotKey) {
    return AD_SLOT_SIZE_HINTS[(slotKey || '').trim()]
        || 'Recommended: 1200 × 150px for a full-width placement, or 220 × 100px if this sits in the sidebar — depends on where the container is in the page.';
}

// Tracks a chosen-but-not-yet-uploaded File per ad card, keyed by ad.id.
const adPendingImageFiles = new Map();

async function adUploadImageIfNeeded(id, slotKey) {
    const file = adPendingImageFiles.get(id);
    if (!file) return undefined; // undefined = no new upload, leave existing image_url untouched
    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const safeKey = (slotKey || 'ad').replace(/[^a-z0-9_-]/gi, '') || 'ad';
    const path = `ads/${safeKey}-${Date.now()}.${ext}`;
    const { error: uploadError } = await sb.storage.from('blog-images').upload(path, file, { upsert: false });
    if (uploadError) throw new Error('Image upload failed: ' + uploadError.message);
    const { data } = sb.storage.from('blog-images').getPublicUrl(path);
    return data.publicUrl;
}

function renderAdsGrid(slots) {
    const grid = document.getElementById('ads-grid');
    if (slots.length === 0) { grid.innerHTML = `<p class="table-empty">No ad slots yet.</p>`; return; }

    grid.innerHTML = slots.map(ad => `
        <div class="ad-card" data-ad-id="${ad.id}" data-slot-key="${escapeHtml(ad.slot_key)}">
            <div class="ad-card-header">
                <div>
                    <h4>${escapeHtml(ad.name || ad.slot_key)}</h4>
                    <span class="ad-key-tag">${escapeHtml(ad.slot_key)}</span>
                </div>
                <label class="toggle-switch">
                    <input type="checkbox" class="ad-active-toggle" ${ad.is_active ? 'checked' : ''}>
                    <span class="toggle-slider"></span>
                </label>
            </div>

            <label class="ad-field-label">Upload Image (from your computer)</label>
            <input type="file" accept="image/*" class="input-field ad-image-file" style="width:100%;">
            <p style="margin:6px 0 0;font-size:0.78rem;color:var(--text-muted);">${adSizeHintFor(ad.slot_key)}</p>
            <div class="ad-image-preview" style="margin-top:10px;${ad.image_url ? '' : 'display:none;'}">
                <img src="${escapeHtml(ad.image_url || '')}" alt="" style="max-width:220px;border-radius:8px;display:block;border:1px solid var(--border-color);">
            </div>

            <label class="ad-field-label" style="margin-top:12px;display:block;">Or paste an Image URL</label>
            <input type="text" class="input-field ad-image-url" value="${escapeHtml(ad.image_url || '')}" placeholder="https://...">

            <label class="ad-field-label">Click-through Link</label>
            <input type="text" class="input-field ad-link-url" value="${escapeHtml(ad.link_url || '')}" placeholder="https://...">

            <label class="ad-field-label">Custom HTML override (optional — leave blank to use image+link above)</label>
            <textarea class="ad-html-override" placeholder="<div>...</div>">${escapeHtml(ad.html_override || '')}</textarea>

            <div class="ad-card-footer">
                <button class="btn-danger-small ad-delete-btn">Delete</button>
                <button class="btn-primary-small ad-save-btn"><i class="fa-solid fa-floppy-disk"></i> Save</button>
            </div>
        </div>
    `).join('');

    grid.querySelectorAll('.ad-card').forEach(card => {
        const id = card.dataset.adId;
        const slotKey = card.dataset.slotKey;
        card.querySelector('.ad-save-btn').addEventListener('click', () => saveAdSlot(id, card));
        card.querySelector('.ad-delete-btn').addEventListener('click', () => deleteAdSlot(id, card));
        card.querySelector('.ad-active-toggle').addEventListener('change', () => saveAdSlot(id, card));
        card.querySelector('.ad-image-file').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                adPendingImageFiles.set(id, file);
                const preview = card.querySelector('.ad-image-preview');
                preview.querySelector('img').src = URL.createObjectURL(file);
                preview.style.display = 'block';
            } else {
                adPendingImageFiles.delete(id);
            }
        });
    });
}

async function saveAdSlot(id, card) {
    const slotKey = card.dataset.slotKey;
    let uploadedUrl;
    try {
        uploadedUrl = await adUploadImageIfNeeded(id, slotKey);
    } catch (e) {
        showToast(e.message, true);
        return;
    }
    if (uploadedUrl) {
        card.querySelector('.ad-image-url').value = uploadedUrl; // reflect the new hosted URL back into the field
    }

    const payload = {
        image_url: card.querySelector('.ad-image-url').value.trim(),
        link_url: card.querySelector('.ad-link-url').value.trim(),
        html_override: card.querySelector('.ad-html-override').value.trim(),
        is_active: card.querySelector('.ad-active-toggle').checked,
        updated_at: new Date().toISOString()
    };
    const { error } = await sb.from('ad_slots').update(payload).eq('id', id);
    if (error) { showToast('Failed to save ad: ' + error.message, true); return; }
    adPendingImageFiles.delete(id);
    showToast('Ad slot saved — live on site now.');
    logAction('ad_slot_save', id, { is_active: payload.is_active });
}

async function deleteAdSlot(id, card) {
    if (!confirm('Delete this ad slot permanently?')) return;
    const { error } = await sb.from('ad_slots').delete().eq('id', id);
    if (error) { showToast('Failed to delete: ' + error.message, true); return; }
    card.remove();
    showToast('Ad slot deleted.');
}

async function createNewAdSlot() {
    const key = prompt('Slot key (used in the site code, e.g. "homepage_banner"):');
    if (!key) return;
    const cleanKey = key.trim().toLowerCase().replace(/\s+/g, '_');
    const { data, error } = await sb.from('ad_slots').insert({
        slot_key: cleanKey, name: cleanKey, is_active: false, display_order: 99
    }).select().single();
    if (error) { showToast('Failed to create slot: ' + error.message, true); return; }
    showToast('New ad slot created.');
    loadAdsTab();
}

// ============================================================
// BLOG TAB — manual posts + full list (manual & bot) with edit/delete
// ============================================================
let blogEditingId = null; // null = creating a new post; otherwise the id being edited
let blogPendingImageFile = null;

function blogResetForm() {
    blogEditingId = null;
    blogPendingImageFile = null;
    document.getElementById('blog-form-id').value = '';
    document.getElementById('blog-form-title').value = '';
    document.getElementById('blog-form-category').value = 'signals';
    document.getElementById('blog-form-dek').value = '';
    document.getElementById('blog-form-body').value = '';
    document.getElementById('blog-form-image').value = '';
    document.getElementById('blog-form-image-alt').value = '';
    document.getElementById('blog-form-image-preview').style.display = 'none';
    document.getElementById('blog-form-heading').textContent = 'Blog — Add a Post';
    document.getElementById('blog-post-btn').innerHTML = '<i class="fa-solid fa-paper-plane"></i> Publish Post';
    document.getElementById('blog-cancel-edit-btn').style.display = 'none';
    document.getElementById('blog-form-status').textContent = '';
}

function blogSlugify(text) {
    return (text || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'post';
}

async function blogUploadImageIfNeeded() {
    if (!blogPendingImageFile) return undefined; // undefined = leave image_url untouched on edit
    const file = blogPendingImageFile;
    const path = `${Date.now()}-${blogSlugify(file.name.replace(/\.[^.]+$/, ''))}.${file.name.split('.').pop()}`;
    const { error: uploadError } = await sb.storage.from('blog-images').upload(path, file, { upsert: false });
    if (uploadError) throw new Error('Image upload failed: ' + uploadError.message);
    const { data } = sb.storage.from('blog-images').getPublicUrl(path);
    return data.publicUrl;
}

document.getElementById('blog-form-image').addEventListener('change', (e) => {
    const file = e.target.files[0];
    blogPendingImageFile = file || null;
    const preview = document.getElementById('blog-form-image-preview');
    if (file) {
        preview.querySelector('img').src = URL.createObjectURL(file);
        preview.style.display = 'block';
    } else {
        preview.style.display = 'none';
    }
});

async function publishOrUpdateBlogPost() {
    const title = document.getElementById('blog-form-title').value.trim();
    const category = document.getElementById('blog-form-category').value;
    const dek = document.getElementById('blog-form-dek').value.trim();
    const body = document.getElementById('blog-form-body').value.trim();
    const imageAlt = document.getElementById('blog-form-image-alt').value.trim();
    const statusEl = document.getElementById('blog-form-status');

    if (!title || !dek || !body) {
        statusEl.textContent = 'Fill in title, description, and article body.';
        statusEl.style.color = '#ef4444';
        return;
    }
    if (blogPendingImageFile && !imageAlt) {
        statusEl.textContent = 'Add alt text for the image (required for SEO/accessibility).';
        statusEl.style.color = '#ef4444';
        return;
    }

    statusEl.textContent = blogEditingId ? 'Saving...' : 'Publishing...';
    statusEl.style.color = 'var(--text-muted)';

    let imageUrl;
    try {
        imageUrl = await blogUploadImageIfNeeded();
    } catch (e) {
        statusEl.textContent = e.message;
        statusEl.style.color = '#ef4444';
        showToast(e.message, true);
        return;
    }

    const readTime = Math.max(2, Math.round(body.split(/\s+/).length / 200));
    const payload = {
        title, category, dek, body,
        image_alt: imageAlt || null,
        read_time_minutes: readTime,
    };
    if (imageUrl !== undefined) payload.image_url = imageUrl;

    let error;
    if (blogEditingId) {
        ({ error } = await sb.from('blog_posts').update(payload).eq('id', blogEditingId));
    } else {
        payload.slug = `${blogSlugify(title)}-${Date.now().toString(36)}`;
        payload.source = 'manual';
        payload.status = 'published';
        ({ error } = await sb.from('blog_posts').insert(payload));
    }

    if (error) {
        statusEl.textContent = 'Failed: ' + error.message;
        statusEl.style.color = '#ef4444';
        showToast('Failed to save post: ' + error.message, true);
        return;
    }

    showToast(blogEditingId ? 'Post updated — live on site within a few minutes.' : 'Post published — live on site within a few minutes.');
    logAction(blogEditingId ? 'blog_post_updated' : 'blog_post_created', title, { category });
    blogResetForm();
    refreshBlogPostsList();
}

document.getElementById('blog-post-btn').addEventListener('click', publishOrUpdateBlogPost);
document.getElementById('blog-cancel-edit-btn').addEventListener('click', blogResetForm);

function editBlogPost(post) {
    blogEditingId = post.id;
    blogPendingImageFile = null;
    document.getElementById('blog-form-id').value = post.id;
    document.getElementById('blog-form-title').value = post.title || '';
    document.getElementById('blog-form-category').value = post.category || 'signals';
    document.getElementById('blog-form-dek').value = post.dek || '';
    document.getElementById('blog-form-body').value = post.body || '';
    document.getElementById('blog-form-image-alt').value = post.image_alt || '';
    const preview = document.getElementById('blog-form-image-preview');
    if (post.image_url) {
        preview.querySelector('img').src = post.image_url;
        preview.style.display = 'block';
    } else {
        preview.style.display = 'none';
    }
    document.getElementById('blog-form-heading').textContent = 'Blog — Editing Post';
    document.getElementById('blog-post-btn').innerHTML = '<i class="fa-solid fa-check"></i> Save Changes';
    document.getElementById('blog-cancel-edit-btn').style.display = 'inline-flex';
    document.getElementById('blog-form-status').textContent = '';
    document.getElementById('tab-blog').scrollIntoView({ behavior: 'smooth' });
}

async function deleteBlogPost(id, row) {
    if (!confirm('Delete this post? This removes it from the live site on the next sync (within a few minutes) and cannot be undone.')) return;
    const { error } = await sb.from('blog_posts').delete().eq('id', id);
    if (error) { showToast('Failed to delete: ' + error.message, true); return; }
    if (row) row.remove();
    showToast('Post deleted.');
    logAction('blog_post_deleted', String(id));
    if (blogEditingId === id) blogResetForm();
}

const BLOG_CATEGORY_LABELS = {
    signals: 'Signals', georisk: 'Geo Risk', updates: 'Product Updates', market: 'Market Notes',
    covert: 'Secret Intel', prediction: 'Prediction Arena', digital_assets: 'Digital Assets',
};

async function refreshBlogPostsList() {
    const tbody = document.getElementById('blog-posts-table-body');
    const { data, error } = await sb.from('blog_posts').select('*').order('published_at', { ascending: false });

    if (error) { tbody.innerHTML = `<tr><td colspan="6" class="table-empty">${escapeHtml(error.message)}</td></tr>`; return; }
    if (!data || !data.length) { tbody.innerHTML = `<tr><td colspan="6" class="table-empty">No posts yet.</td></tr>`; return; }

    tbody.innerHTML = data.map(p => `
        <tr data-post-id="${p.id}">
            <td style="max-width:320px;">${escapeHtml(p.title)}</td>
            <td>${escapeHtml(BLOG_CATEGORY_LABELS[p.category] || p.category)}</td>
            <td>${p.source === 'manual' ? 'Manual' : 'Bot'}</td>
            <td><span class="status-badge ${p.status === 'published' ? 'status-active' : 'status-redeemed'}">${escapeHtml(p.status)}</span></td>
            <td>${p.published_at ? new Date(p.published_at).toLocaleDateString() : '—'}</td>
            <td style="white-space:nowrap;">
                <button class="btn-ghost-small blog-edit-btn" style="width:auto;margin-top:0;display:inline-flex;">Edit</button>
                <button class="btn-danger-small blog-delete-btn" style="margin-left:6px;">Delete</button>
            </td>
        </tr>
    `).join('');

    tbody.querySelectorAll('tr').forEach(row => {
        const id = Number(row.dataset.postId);
        const post = data.find(p => p.id === id);
        row.querySelector('.blog-edit-btn').addEventListener('click', () => editBlogPost(post));
        row.querySelector('.blog-delete-btn').addEventListener('click', () => deleteBlogPost(id, row));
    });
}

async function loadBlogTab() {
    blogResetForm();
    await refreshBlogPostsList();
}

// ============================================================
// ADMIN ACCESS TAB (super_admin only)
// ============================================================
async function loadAdminsTab() {
    const { data, error } = await sb.from('admins').select('*').order('added_at', { ascending: true });
    const tbody = document.getElementById('admins-table-body');

    if (error) { tbody.innerHTML = `<tr><td colspan="4" class="table-empty">${error.message}</td></tr>`; return; }

    tbody.innerHTML = (data || []).map(a => `
        <tr>
            <td>${escapeHtml(a.email)}</td>
            <td><span class="plan-badge plan-premium">${a.role.replace('_', ' ')}</span></td>
            <td>${a.added_at ? new Date(a.added_at).toLocaleDateString() : '—'}</td>
            <td>
                ${a.email === currentAdminEmail
                    ? '<span style="color:var(--text-muted);font-size:0.78rem;">(you)</span>'
                    : `<button class="btn-danger-small admin-remove-btn" data-email="${escapeHtml(a.email)}">Remove</button>`}
            </td>
        </tr>
    `).join('');

    tbody.querySelectorAll('.admin-remove-btn').forEach(btn => {
        btn.addEventListener('click', () => removeAdmin(btn.dataset.email));
    });

    document.getElementById('add-admin-btn').addEventListener('click', addAdmin);
}

async function addAdmin() {
    const emailInput = document.getElementById('new-admin-email');
    const roleInput = document.getElementById('new-admin-role');
    const email = emailInput.value.trim().toLowerCase();
    if (!email || !email.includes('@')) { showToast('Enter a valid email.', true); return; }

    const { error } = await sb.from('admins').insert({
        email, role: roleInput.value, added_by: currentAdminEmail
    });
    if (error) { showToast('Failed to add admin: ' + error.message, true); return; }
    showToast(`${email} granted ${roleInput.value} access.`);
    logAction('admin_granted', email, { role: roleInput.value });
    emailInput.value = '';
    loadAdminsTab();
}

async function removeAdmin(email) {
    if (!confirm(`Remove admin access for ${email}?`)) return;
    const { error } = await sb.from('admins').delete().eq('email', email);
    if (error) { showToast('Failed to remove: ' + error.message, true); return; }
    showToast(`${email} removed.`);
    logAction('admin_removed', email);
    loadAdminsTab();
}

// ============================================================
// BOOT
// ============================================================
document.addEventListener('DOMContentLoaded', bootAdmin);