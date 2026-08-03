// === app.js ===
// SaPEX_NEXUS Trading Terminal - Complete JavaScript Engine

// ============================================
// 1. SUPABASE CONFIGURATION
// ============================================
const SUPABASE_URL = 'https://qdigrvhwvnrjznqkjltn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_vN8drh5iobJ2-mWmjk0joA_eRBQJVJa';

let supabaseClient = null;

function initSupabase() {
    if (SUPABASE_URL.includes('YOUR_SUPABASE_URL_HERE') || SUPABASE_ANON_KEY.includes('YOUR_SUPABASE_ANON_KEY_HERE')) {
        console.warn('⚠️ Supabase credentials not configured. Using demo/mock data.');
        return null;
    }
    try {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('✅ Supabase client initialized.');
        return supabaseClient;
    } catch (e) {
        console.error('❌ Failed to initialize Supabase:', e);
        return null;
    }
}

// ============================================
// 2. MOCK DATA (Fallback when Supabase isn't configured)
// ============================================
const mockTradingSignals = [
    { id: 1, market: 'Forex', asset: 'EUR/USD', action: 'BUY', entry_price: 1.0852, take_profit: 1.0920, stop_loss: 1.0800, confidence: 87, time: '09:45', status: 'active' },
    { id: 2, market: 'Crypto', asset: 'BTC/USDT', action: 'SELL', entry_price: 67250.00, take_profit: 66500.00, stop_loss: 67800.00, confidence: 72, time: '09:30', status: 'active' },
    { id: 3, market: 'Crypto', asset: 'ETH/USDT', action: 'BUY', entry_price: 3490.50, take_profit: 3580.00, stop_loss: 3440.00, confidence: 81, time: '09:15', status: 'active' },
    { id: 4, market: 'Forex', asset: 'GBP/USD', action: 'SELL', entry_price: 1.2630, take_profit: 1.2550, stop_loss: 1.2690, confidence: 65, time: '09:00', status: 'pending' },
    { id: 5, market: 'Indices', asset: 'S&P 500', action: 'BUY', entry_price: 5320.00, take_profit: 5380.00, stop_loss: 5280.00, confidence: 93, time: '08:45', status: 'active' },
    { id: 6, market: 'Forex', asset: 'USD/JPY', action: 'BUY', entry_price: 154.80, take_profit: 155.50, stop_loss: 154.20, confidence: 78, time: '08:30', status: 'active' },
    { id: 7, market: 'Crypto', asset: 'SOL/USDT', action: 'SELL', entry_price: 178.50, take_profit: 172.00, stop_loss: 182.00, confidence: 60, time: '08:15', status: 'completed' },
];

const mockInvestmentPicks = [
    { id: 1, market: 'Crypto', asset: 'BTC/USDT', strategy: 'Long Term Hold', valuation: 67250.00, sentiment: 'Bullish', holding_period: '3-6 months', date: '2026-06-10', performance: '+12.4%', risk_level: 'Medium' },
    { id: 2, market: 'Stocks', asset: 'AAPL', strategy: 'Swing Trade', valuation: 198.50, sentiment: 'Neutral', holding_period: '2-4 weeks', date: '2026-06-09', performance: '+3.2%', risk_level: 'Low' },
    { id: 3, market: 'Forex', asset: 'EUR/USD', strategy: 'Position Trade', valuation: 1.0852, sentiment: 'Bullish', holding_period: '1-2 weeks', date: '2026-06-08', performance: '-0.8%', risk_level: 'Medium' },
    { id: 4, market: 'Crypto', asset: 'ETH/USDT', strategy: 'Scalp', valuation: 3490.50, sentiment: 'Very Bullish', holding_period: '1-3 days', date: '2026-06-11', performance: '+5.7%', risk_level: 'High' },
    { id: 5, market: 'Indices', asset: 'S&P 500', strategy: 'Long Term Hold', valuation: 5320.00, sentiment: 'Bullish', holding_period: '6-12 months', date: '2026-06-07', performance: '+8.9%', risk_level: 'Low' },
    { id: 6, market: 'Commodities', asset: 'XAU/USD', strategy: 'Swing Trade', valuation: 2340.00, sentiment: 'Bearish', holding_period: '1-2 weeks', date: '2026-06-06', performance: '-2.1%', risk_level: 'Medium' },
];

const mockNewsArticles = [
    { id: 1, source: 'CoinDesk', title: 'Bitcoin Breaks $67K Resistance as Institutional Demand Surges', summary: 'BTC rallied past key resistance amid growing ETF inflows and bullish options data.', time: '2 hours ago', sentiment: 'bullish', tags: ['Crypto', 'BTC'] },
    { id: 2, source: 'ForexLive', title: 'EUR/USD Struggles Below 1.09 Ahead of ECB Decision', summary: 'The pair remains rangebound as traders await the European Central Bank policy statement.', time: '4 hours ago', sentiment: 'bearish', tags: ['Forex', 'EUR'] },
    { id: 3, source: 'Reuters', title: 'S&P 500 Hits New All-Time High on Tech Earnings Optimism', summary: 'Wall Street indices extended gains, led by AI-driven tech stocks.', time: '5 hours ago', sentiment: 'bullish', tags: ['Stocks', 'SPX'] },
];

// ============================================
// 3. STATE MANAGEMENT
// ============================================
const state = {
    currentPage: 'dashboard',
    tradingData: [],
    investmentData: [],
    newsData: [...mockNewsArticles],
    watchlist: [],
    upcomingPredictions: [], 
    isLoading: true,
    userProfile: {
        name: '',
        email: '',
        experience: 'Intermediate (1-3 years)',
        risk: 'Moderate',
        initials: '',
    },
    tradingPage: 1,
    portfolioPage: 1,
    itemsPerPage: 12,
    isLoggedIn: false,
    subscriptionPlan: 'free',
    subscriptionExpiry: null,          
    cancelAtPeriodEnd: false,
    notifications: [],
    avgConfidence: 0,
    totalTracked: 0,
    activeSignalsCount: 0,
    // 🎟️ Prediction Arena reaction bars — keyed by ticket id:
    // { [ticketId]: { '🔥': { count: 3, mine: true }, ... } }
    predictionReactions: {}
};

// Fixed emoji palette for the Prediction Arena reaction bar.
// Keep this list in sync with the CHECK constraint in the
// prediction_reactions table (see prediction_reactions.sql).
const PA_REACTION_EMOJIS = ['🔥', '🚀', '💀', '😂', '🎯', '🤔'];

// ============================================
// CURRENCY FLAG MAP (used by Economic Calendar)
// ============================================
const CCY_FLAG = {
    USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵',
    CAD: '🇨🇦', AUD: '🇦🇺', CHF: '🇨🇭', NZD: '🇳🇿',
    CNY: '🇨🇳', SEK: '🇸🇪', NOK: '🇳🇴', SGD: '🇸🇬',
    HKD: '🇭🇰', KRW: '🇰🇷', INR: '🇮🇳', BRL: '🇧🇷',
    MXN: '🇲🇽', ZAR: '🇿🇦', TRY: '🇹🇷', RUB: '🇷🇺'
};

function impactDots(impact) {
    const level = (impact || '').toLowerCase();
    const filled = level === 'high' ? 3 : level === 'medium' ? 2 : 1;
    const color  = level === 'high' ? '#ef4444' : level === 'medium' ? '#f0b90b' : '#00d4aa';
    const dot    = (active) =>
        `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;
         background:${active ? color : 'rgba(255,255,255,0.15)'};margin-right:3px;"></span>`;
    return `<div style="display:flex;align-items:center;">
        ${dot(true)}${dot(filled >= 2)}${dot(filled >= 3)}
    </div>`;
}

function loadLocalData() {
    const savedProfile = localStorage.getItem('sapex_user_profile');
    if (savedProfile) {
        try { state.userProfile = { ...state.userProfile, ...JSON.parse(savedProfile) }; } catch (e) {}
    }
    const savedWatchlist = localStorage.getItem('sapex_watchlist');
    if (savedWatchlist) {
        try { state.watchlist = JSON.parse(savedWatchlist); } catch (e) { state.watchlist = []; }
    }
    // ✅ Pre-populate with defaults on first-ever load (empty localStorage)
    if (!savedWatchlist || state.watchlist.length === 0) {
        state.watchlist = [
            { symbol: 'BTC/USDT' },
            { symbol: 'ETH/USDT' },
            { symbol: 'SOL/USDT' },
            { symbol: 'NVDA' },
            { symbol: 'TSLA' }
        ];
        saveWatchlist(); // Persist them immediately
    }
    const savedNotifs = localStorage.getItem('sapex_notifications');
    if (savedNotifs) {
        try { state.notifications = JSON.parse(savedNotifs); } catch(e) { state.notifications = []; }
    }
    const loggedIn = localStorage.getItem('sapex_logged_in');
    state.isLoggedIn = loggedIn === 'true';
    const savedPlan = localStorage.getItem('sapex_subscription_plan');
    // ✅ SECURITY: Never trust localStorage for paid plans — UI exploit prevention.
    // Only 'free' and 'trial' are trusted from localStorage; paid plans always require DB verification.
    const clientTrustedPlans = ['free', 'trial'];
    state.subscriptionPlan = (state.isLoggedIn && savedPlan && clientTrustedPlans.includes(savedPlan))
        ? savedPlan
        : 'free';
}

function saveUserProfile() {
    localStorage.setItem('sapex_user_profile', JSON.stringify(state.userProfile));
}

function saveWatchlist() {
    localStorage.setItem('sapex_watchlist', JSON.stringify(state.watchlist));
}

function saveAuthState() {
    localStorage.setItem('sapex_logged_in', state.isLoggedIn);
    localStorage.setItem('sapex_subscription_plan', state.subscriptionPlan);
}

function getUserInitials() {
    const name = state.userProfile.name.trim();
    const parts = name.split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return (name.slice(0, 2) || 'TR').toUpperCase();
}

// ============================================
// 4. DOM REFERENCES
// ============================================
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

// ============================================
// 5. PARTICLE CANVAS BACKGROUND
// ============================================
function initParticleCanvas() {
    const canvas = $('#particle-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let particles = [];
    const maxParticles = 55;
    let animationId;

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    class Particle {
        constructor() { this.reset(); }
        reset() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.vx = (Math.random() - 0.5) * 0.5;
            this.vy = (Math.random() - 0.5) * 0.5;
            this.radius = Math.random() * 2 + 0.8;
            this.opacity = Math.random() * 0.5 + 0.15;
            this.color = Math.random() > 0.6 ? '59,130,246' : '6,182,212';
        }
        update() {
            this.x += this.vx; this.y += this.vy;
            if (this.x < -20) this.x = canvas.width + 20;
            if (this.x > canvas.width + 20) this.x = -20;
            if (this.y < -20) this.y = canvas.height + 20;
            if (this.y > canvas.height + 20) this.y = -20;
        }
        draw(ctx) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${this.color},${this.opacity})`;
            ctx.fill();
        }
    }

    function initParticles() {
        particles = [];
        for (let i = 0; i < maxParticles; i++) particles.push(new Particle());
    }

    function drawConnections(ctx) {
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 130) {
                    const opacity = (1 - dist / 130) * 0.25;
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.strokeStyle = `rgba(59,130,246,${opacity})`;
                    ctx.lineWidth = 0.6;
                    ctx.stroke();
                }
            }
        }
    }

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => { p.update(); p.draw(ctx); });
        drawConnections(ctx);
        animationId = requestAnimationFrame(animate);
    }

    resize();
    initParticles();
    animate();
    window.addEventListener('resize', () => { resize(); initParticles(); });
}

// ============================================
// 6. LIVE CLOCK
// ============================================
function initLiveClock() {
    const clockEl = $('#live-clock');
    if (!clockEl) return;
    function updateClock() {
        const now = new Date();
        const utc = now.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
        clockEl.textContent = utc;
    }
    updateClock();
    setInterval(updateClock, 1000);
}

// ============================================
// 7. DATA FETCHING (CHART ENABLED)
// ============================================
async function fetchDashboardData() {
    const client = supabaseClient || initSupabase(); // ✅ Reuse existing connection
    state.isLoading = true;

    if (client) {
        try {
            const { data: trades, error: tradeErr } = await supabaseClient.from('trading_signals').select('*').eq('status', 'Active').order('created_at', { ascending: false }).limit(20);
            if (tradeErr) console.error('Trade fetch error:', tradeErr);
            if (!tradeErr && trades) {
                state.tradingData = trades.map(t => {
                    const dateObj = new Date(t.created_at || new Date());
                    return {
                        ...t,
                        time: `${dateObj.getHours().toString().padStart(2, '0')}:${dateObj.getMinutes().toString().padStart(2, '0')}`,
                        status: 'active'
                    };
                });
            }

            const { data: statsData } = await client.from('signal_stats').select('*').single();
            if (statsData) {
                state.avgConfidence = statsData.avg_confidence;
            }

            const { count: totalTracked } = await client
                .from('trading_signals')
                .select('*', { count: 'exact', head: true });
            state.totalTracked = totalTracked || 0;

            // ✅ FIX: Count active signals separately — not capped by the display limit(20)
            const { count: activeCount } = await client
                .from('trading_signals')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'Active');
            state.activeSignalsCount = activeCount || 0;

            const { data: investments, error: invErr } = await client.from('investment_picks').select('*').order('id', { ascending: false }).limit(100);
            if (!invErr && investments) {
                state.investmentData = investments.map(inv => {
                    const dateObj = new Date(inv.updated_at || new Date());
                    let risk = 'Medium';
                    if (inv.market === 'Crypto') risk = 'High';
                    if ((inv.strategy || '').includes('Value') || (inv.strategy || '').includes('Hold')) risk = 'Low';
                    return { ...inv, date: dateObj.toISOString().split('T')[0], performance: inv.performance || 'Tracking...', risk_level: risk };
                });
            }
        } catch (error) {
            console.error('❌ Primary fetch error:', error);
            state.tradingData = typeof mockTradingSignals !== 'undefined' ? [...mockTradingSignals] : [];
            state.investmentData = typeof mockInvestmentPicks !== 'undefined' ? [...mockInvestmentPicks] : [];
        }

        try {
            const { data: liveNews, error: newsErr } = await client.from('market_news').select('*').order('created_at', { ascending: false }).limit(50);
            if (!newsErr && liveNews && liveNews.length > 0) {
                state.newsData = liveNews.map(item => {
                    const dateObj = new Date(item.created_at || new Date());
                    return {
                        id: item.id || Math.random(), title: item.title || 'Market Update', sentiment: item.sentiment || 'Neutral', summary: item.summary || '', tags: item.tags || ['Markets'],
                        time: `${dateObj.getHours().toString().padStart(2, '0')}:${dateObj.getMinutes().toString().padStart(2, '0')}`, source: item.source || 'Yahoo Finance'
                    };
                });
            } else { state.newsData = typeof mockNewsArticles !== 'undefined' ? [...mockNewsArticles] : []; }
        } catch (nErr) {
            console.error("⚠️ News feed fetch error:", nErr);
            state.newsData = typeof mockNewsArticles !== 'undefined' ? [...mockNewsArticles] : [];
        }
    } else {
        state.tradingData = typeof mockTradingSignals !== 'undefined' ? [...mockTradingSignals] : [];
        state.investmentData = typeof mockInvestmentPicks !== 'undefined' ? [...mockInvestmentPicks] : [];
        state.newsData = typeof mockNewsArticles !== 'undefined' ? [...mockNewsArticles] : [];
    }

    state.isLoading = false;
    updateConnectionStatus(client ? true : false);
    if (typeof refreshAllData === 'function') refreshAllData();
}

function updateConnectionStatus(connected) {
    const statusDot = $('.status-dot');
    const statusText = $('#connection-status span:last-child');
    const settingsBadge = $('#settings-connection-status');

    if (connected) {
        if (statusDot) statusDot.classList.add('connected');
        if (statusText) statusText.textContent = 'Cloud Connected';
        if (settingsBadge) { settingsBadge.textContent = 'Connected'; settingsBadge.classList.add('connected'); }
    } else {
        if (statusDot) statusDot.classList.remove('connected');
        if (statusText) statusText.textContent = 'Offline Mode';
        if (settingsBadge) { settingsBadge.textContent = 'Disconnected'; settingsBadge.classList.remove('connected'); }
    }
}

// ============================================
// 8. RENDER FUNCTIONS
// ============================================
function renderTradingTable(data, targetId, limit = 5) {
    const tbody = $(`#${targetId}`);
    if (!tbody) return;
    const sliced = data.slice(0, limit);
    if (sliced.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-muted);">No trading signals available.</td></tr>`;
        return;
    }
    const isPro = ['basic', 'pro', 'premium', 'trial'].includes(state.subscriptionPlan);
    tbody.innerHTML = sliced.map(t => {
        const actionLower = (t.action || '').toLowerCase();
        const actionClass = actionLower.includes('buy') ? 'buy' : 'sell';
        const confColor = (t.confidence || 0) >= 80 ? 'text-green' : (t.confidence || 0) >= 60 ? 'text-yellow' : 'text-red';
        const tpDisplay = isPro ? `$${formatNumber(t.take_profit, 4)}` : '<span class="pro-locked">🔒</span>';
        const slDisplay = isPro ? `$${formatNumber(t.stop_loss, 4)}` : '<span class="pro-locked">🔒</span>';
        const confDisplay = isPro ? `${t.confidence || '—'}%` : '<span class="pro-locked">🔒</span>';
        return `
            <tr>
                <td><span class="badge" style="background:rgba(59,130,246,0.15);color:var(--accent-blue);">${escHtml(t.market)}</span></td>
                <td><strong>${escHtml(t.asset)}</strong></td>
                <td class="${actionClass} fw-bold">${escHtml(t.action)}</td>
                <td class="text-mono">$${formatNumber(t.entry_price, 4)}</td>
                <td class="text-mono ${!isPro ? 'pro-locked' : ''}">${tpDisplay}</td>
                <td class="text-mono ${!isPro ? 'pro-locked' : ''}">${slDisplay}</td>
                <td class="${isPro ? confColor + ' fw-bold' : 'pro-locked'}">${confDisplay}</td>
                <td style="font-size:0.78rem;color:${t.timeframe_consensus === '5m+1h+4h ✅' ? '#00d4aa' : 'var(--text-muted)'};">${escHtml(t.timeframe_consensus || '5m')}</td>
            </tr>
        `;
    }).join('');
}

function renderInvestmentTable(data, targetId, limit = 5) {
    const tbody = $(`#${targetId}`);
    if (!tbody) return;
    const sliced = data.slice(0, limit);
    if (sliced.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text-muted);">No investment data available.</td></tr>`;
        return;
    }
    const isPro = ['pro', 'premium', 'trial'].includes(state.subscriptionPlan)
    tbody.innerHTML = sliced.map(inv => {
        const sentColor = (inv.sentiment || '').toLowerCase().includes('bull') ? 'text-green' : (inv.sentiment || '').toLowerCase().includes('bear') ? 'text-red' : 'text-yellow';
        return `
            <tr>
                <td><span class="badge" style="background:rgba(139,92,246,0.15);color:var(--accent-purple);">${escHtml(inv.market)}</span></td>
                <td><strong>${escHtml(inv.asset)}</strong></td>
                <td>${escHtml(inv.strategy)}</td>
                <td class="text-mono">$${formatNumber(inv.valuation, 2)}</td>
                <td class="${sentColor} fw-bold">${escHtml(inv.sentiment || 'Neutral')}</td>
                <td>${escHtml(inv.holding_period || '—')}</td>
            </tr>
        `;
    }).join('');
}

function renderFullTradingTable(page = 1) {
    const tbody = $('#trading-full-body');
    if (!tbody) return;
    const data = state.tradingData;
    const start = (page - 1) * state.itemsPerPage;
    const paged = data.slice(start, start + state.itemsPerPage);
    if (paged.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:30px;color:var(--text-muted);">No signals found.</td></tr>`;
        return;
    }
    const isPro = ['basic', 'pro', 'premium', 'trial'].includes(state.subscriptionPlan);
    tbody.innerHTML = paged.map(t => {
        const actionClass = (t.action || '').toLowerCase().includes('buy') ? 'buy' : 'sell';
        const statusColor = (t.status === 'active') ? 'text-green' : (t.status === 'pending') ? 'text-yellow' : 'text-muted';
        const entryDisplay = isPro ? `$${formatNumber(t.entry_price, 4)}` : '<span class="pro-locked">🔒</span>';
        const tpDisplay = isPro ? `$${formatNumber(t.take_profit, 4)}` : '<span class="pro-locked">🔒</span>';
        const slDisplay = isPro ? `$${formatNumber(t.stop_loss, 4)}` : '<span class="pro-locked">🔒</span>';
        const isPremium = ['premium', 'trial'].includes(state.subscriptionPlan);
        let rows = `
            <tr>
                <td>${escHtml(t.time || '—')}</td>
                <td>${escHtml(t.market)}</td>
                <td><strong>${escHtml(t.asset)}</strong></td>
                <td class="${actionClass} fw-bold">${escHtml(t.action)}</td>
                <td class="text-mono ${!isPro ? 'pro-locked' : ''}">${entryDisplay}</td>
                <td class="text-mono ${!isPro ? 'pro-locked' : ''}">${tpDisplay}</td>
                <td class="text-mono ${!isPro ? 'pro-locked' : ''}">${slDisplay}</td>
                <td class="${statusColor} fw-bold">● ${escHtml(t.status || 'unknown')}</td>
                <td style="font-size:0.78rem;color:${t.timeframe_consensus === '5m+1h+4h ✅' ? '#00d4aa' : 'var(--text-muted)'};">
                    ${escHtml(t.timeframe_consensus || '5m')}
                </td>
                <td><button onclick="openPositionCalc(${t.entry_price}, ${t.stop_loss}, '${escHtml(t.asset)}', '${escHtml(t.action)}')"
                    style="background:rgba(110,120,255,0.15);border:none;color:#6e78ff;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:0.75rem;">
                    ⚖️ Size
                </button></td>
            </tr>
        `;
        if (isPremium && t.explanation) {
            rows += `<tr style="background:rgba(110,120,255,0.05);">
                <td colspan="10" style="padding:8px 16px;font-size:0.82rem;color:var(--text-muted);border-top:none;">
                    <i class="fa-solid fa-robot" style="color:#6e78ff;margin-right:6px;"></i>
                    <em>${escHtml(t.explanation)}</em>
                </td>
            </tr>`;
        }
        return rows;

    }).join('');
    updatePagination('trading-pagination', page, Math.ceil(data.length / state.itemsPerPage));
}

function renderFullPortfolioTable(page = 1) {
    const tbody = $('#portfolio-full-body');
    if (!tbody) return;
    const data = state.investmentData;
    const start = (page - 1) * state.itemsPerPage;
    const paged = data.slice(start, start + state.itemsPerPage);
    if (paged.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text-muted);">No investments found.</td></tr>`;
        return;
    }
    const isPro = ['pro', 'premium', 'trial'].includes(state.subscriptionPlan);
    tbody.innerHTML = paged.map(inv => {
        const perfClass = (inv.performance || '').startsWith('+') ? 'text-green' : 'text-red';
        const riskColor = (inv.risk_level === 'Low') ? 'text-green' : (inv.risk_level === 'Medium') ? 'text-yellow' : 'text-red';
        const perfDisplay = isPro ? escHtml(inv.performance || '0%') : '<span class="pro-locked">🔒</span>';
        const riskDisplay = isPro ? escHtml(inv.risk_level || 'Medium') : '<span class="pro-locked">🔒</span>';
        return `
            <tr>
                <td>${escHtml(inv.date || '—')}</td>
                <td>${escHtml(inv.market)}</td>
                <td><strong>${escHtml(inv.asset)}</strong></td>
                <td>${escHtml(inv.strategy)}</td>
                <td class="text-mono">$${formatNumber(inv.valuation, 2)}</td>
                <td class="${isPro ? perfClass + ' fw-bold' : 'pro-locked'}">${perfDisplay}</td>
                <td class="${isPro ? riskColor + ' fw-bold' : 'pro-locked'}">${riskDisplay}</td>
            </tr>
        `;
    }).join('');
    updatePagination('portfolio-pagination', page, Math.ceil(data.length / state.itemsPerPage));
}

function updatePagination(paginationId, currentPage, totalPages) {
    const pagination = $(`#${paginationId}`);
    if (!pagination) return;
    let html = '';
    html += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}"><i class="fa-solid fa-chevron-left"></i></button>`;
    for (let i = 1; i <= totalPages; i++) {
        html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    html += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} data-page="${currentPage + 1}"><i class="fa-solid fa-chevron-right"></i></button>`;
    pagination.innerHTML = html;
    pagination.querySelectorAll('.page-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const page = parseInt(btn.dataset.page);
            if (isNaN(page)) return;
            if (paginationId === 'trading-pagination') {
                state.tradingPage = page;
                renderFullTradingTable(page);
            } else {
                state.portfolioPage = page;
                renderFullPortfolioTable(page);
            }
        });
    });
}

// ============================================
// DIGITAL ASSETS AI - FETCH & RENDER
// ============================================
async function fetchUpcomingPredictions() {
    try {
        if (!supabaseClient) return;
        const { data, error } = await supabaseClient
            .from('upcoming_announcements')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20); // 🟢 THIS FORCES THE WEBSITE TO ONLY SHOW THE TOP 20 NEWEST ITEMS

        if (error) throw error;
        
        if (data) {
            state.upcomingPredictions = data;
            renderDigitalAssets();
        }
    } catch (err) {
        console.error('❌ Failed fetching upcoming prediction matrices:', err.message);
    }
}

function renderDigitalAssets() {
    const tbody = document.getElementById('digital-table-body');
    if (!tbody) return;

    if (!state.upcomingPredictions || state.upcomingPredictions.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text-muted);">No AI predictions available yet. The engine is scanning...</td></tr>`;
        return;
    }

    tbody.innerHTML = state.upcomingPredictions.map(item => {
        // Visual class configurations based on algorithmic vibe ranges
        const vibeClass = item.vibe_rating >= 75 ? 'text-green' : item.vibe_rating >= 50 ? 'text-yellow' : 'text-red';
        const sentimentDisplay = item.vibe_rating >= 75 ? 'Bullish' : item.vibe_rating >= 50 ? 'Neutral' : 'Bearish';

        return `
            <tr>
                <td>
                    <strong>${escHtml(item.title)}</strong>
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px; max-width: 300px; white-space: normal;">${escHtml(item.ai_analysis_summary)}</div>
                </td>
                <td><span class="badge" style="background:rgba(236,72,153,0.15);color:var(--accent-pink);">${escHtml(item.category)}</span></td>
                <td class="text-mono">${escHtml(item.estimated_price)}</td>
                <td><span class="badge" style="background:rgba(59,130,246,0.15);color:var(--accent-blue);">${escHtml(item.predicted_platform)}</span></td>
                <td>${escHtml(item.community_sentiment)}</td>
                <td class="${vibeClass} fw-bold">${item.vibe_rating}% (${sentimentDisplay})</td>
            </tr>
        `;
    }).join('');
}

// ============================================
// 9. NEWS FEED RENDERING
// ============================================
function renderNewsMiniList() {
    const container = $('#news-mini-list');
    if (!container) return;
    const articles = state.newsData.slice(0, 3);
    container.innerHTML = articles.map(a => `
        <div class="news-mini-item" data-news-id="${a.id}">
            <span class="news-mini-source">${escHtml(a.source)}</span>
            <span class="news-mini-title">${escHtml(a.title)}</span>
            <span class="news-mini-sentiment sentiment-${a.sentiment}">${a.sentiment.toUpperCase()}</span>
        </div>
    `).join('');
}

function renderNewsFeed(filter = 'all') {
    const container = $('#news-feed-list');
    if (!container) return;
    let articles = state.newsData;
    if (filter !== 'all') {
        articles = articles.filter(a => {
            const tagsArray = Array.isArray(a.tags) ? a.tags : [];
            return tagsArray.some(t => t.toLowerCase() === filter);
        });
    }
    if (articles.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted); text-align:center;">No news matching filter.</p>';
        return;
    }
    container.innerHTML = articles.map(a => {
        let safeTags = ['Markets'];
        if (Array.isArray(a.tags)) { safeTags = a.tags; } 
        else if (typeof a.tags === 'string') { safeTags = a.tags.replace(/[{}]/g, '').split(','); }
        return `
        <div class="news-card">
            <div class="news-card-header">
                <span class="news-source">${escHtml(a.source)}</span>
                <span class="news-time">${escHtml(a.time)}</span>
            </div>
            <h3>${escHtml(a.title)}</h3>
            <p>${escHtml(a.summary)}</p>
            <div class="news-tags">
                <span class="news-tag sentiment-${a.sentiment}">${a.sentiment.toUpperCase()}</span>
                ${safeTags.map(t => `<span class="news-tag" style="background:rgba(59,130,246,0.15);color:var(--accent-blue);">${escHtml(t.trim())}</span>`).join('')}
            </div>
        </div>
        `;
    }).join('');
}

// ============================================
// LIVE MARKET DATA ENGINE (COINGECKO + LOCAL BYPASS)
// ============================================
let liveMarketCache = [];

async function fetchRealMarketData() {
    if (supabaseClient) {
        try {
            const { data: rows, error } = await supabaseClient
                .from('market_overview')
                .select('symbol, price, change_24h')
                .order('volume_24h', { ascending: false })
                .limit(20);
            if (!error && rows && rows.length > 0) {
                const freshData = rows.map(r => ({ symbol: r.symbol, price: r.price, change: r.change_24h }));
                liveMarketCache = freshData;
                return freshData;
            }
        } catch (e) { console.warn('market_overview fetch failed, using cache:', e); }
    }
    if (liveMarketCache.length > 0) return liveMarketCache;
    return [
        { symbol: 'BTC/USDT', price: 67250.00, change: 2.45 },
        { symbol: 'ETH/USDT', price: 3490.50,  change: -1.12 },
        { symbol: 'TSLA',     price: 206.34,   change: -1.75 },
        { symbol: 'AAPL',     price: 209.64,   change: 0.85  }
    ];
}

// ============================================
// 10. REAL-TIME WATCHLIST UPDATER
// ============================================
async function updateWatchlistWithRealPrices() {
    if (state.watchlist.length === 0) return;
    if (!supabaseClient) return;

    try {
        const symbols = state.watchlist.map(i => i.symbol.replace('/USDT', '').replace('/USD', ''));
        const { data: rows } = await supabaseClient
            .from('market_overview')
            .select('symbol, price, change_24h')
            .in('symbol', symbols);

        if (rows && rows.length > 0) {
            state.watchlist = state.watchlist.map(item => {
                const base = item.symbol.replace('/USDT', '').replace('/USD', '');
                const match = rows.find(r => r.symbol === base);
                if (match) return { ...item, price: match.price, change: match.change_24h };
                return item;
            });
        } else {
            // Fallback: use liveMarketCache if Supabase has no data yet
            const stillMissing = [];
            state.watchlist = state.watchlist.map(item => {
                const live = liveMarketCache.find(l => l.symbol === item.symbol || l.symbol === item.symbol + '/USDT');
                if (live) return { ...item, price: live.price, change: live.change };
                if (!item.price) stillMissing.push(item.symbol); // track symbols with no price
                return item;
            });

            // ✅ For symbols not in cache, fetch directly from CoinGecko
            if (stillMissing.length > 0) {
                const ids = stillMissing.map(s => s.replace('/USDT','').replace('/USD','').toLowerCase()).join(',');
                try {
                    const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`);
                    const prices = await r.json();
                    state.watchlist = state.watchlist.map(item => {
                        const key = item.symbol.replace('/USDT','').replace('/USD','').toLowerCase();
                        if (prices[key]) return { ...item, price: prices[key].usd, change: parseFloat(prices[key].usd_24h_change?.toFixed(2) || 0) };
                        return item;
                    });
                } catch(e) { /* CoinGecko lookup failed silently */ }
            }
        }
    } catch(e) {
        console.warn('Watchlist price fetch failed:', e);
    }

    saveWatchlist();
    renderWatchlistTable();
}

function renderWatchlistTable() {
    const tbody = document.getElementById('watchlist-body');
    if (!tbody) return;
    if (state.watchlist.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--text-muted);">No items in watchlist. Add a symbol above.</td></tr>';
        return;
    }
    tbody.innerHTML = state.watchlist.map((item, index) => {
        const priceDisplay = item.price ? `$${formatNumber(item.price, 4)}` : '<span style="color:var(--text-muted)">Loading...</span>';
        let changeDisplay = '—';
        let changeClass = 'text-muted';
        if (item.change !== undefined && item.change !== null) {
            const sign = item.change > 0 ? '+' : '';
            changeDisplay = `${sign}${item.change}%`;
            changeClass = item.change >= 0 ? 'text-green' : 'text-red';
        }
        return `
            <tr>
                <td><strong>${escHtml(item.symbol)}</strong></td>
                <td class="text-mono">${priceDisplay}</td>
                <td class="${changeClass} fw-bold">${changeDisplay}</td>
                <td class="text-muted">Live</td>
                <td>
                    <button class="remove-watchlist-btn" onclick="removeFromWatchlist(${index})">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

window.removeFromWatchlist = function(index) {
    state.watchlist.splice(index, 1);
    saveWatchlist();
    renderWatchlistTable();
    showToast('info', 'Asset removed from watchlist.');
};

function addToWatchlist(symbol) {
    const cleanSymbol = symbol.toUpperCase().trim();
    if (!cleanSymbol) return;
    if (state.watchlist.some(item => item.symbol === cleanSymbol)) {
        showToast('error', `${cleanSymbol} is already in your watchlist.`);
        return;
    }
    state.watchlist.push({ symbol: cleanSymbol });
    saveWatchlist();
    renderWatchlistTable();
    updateWatchlistWithRealPrices(); 
    showToast('success', `${cleanSymbol} added!`);
}

// ============================================
// 11. LIVE TICKER BAR
// ============================================
async function initTicker() {
    const tickerEl = document.getElementById('ticker-content');
    if (!tickerEl) return;
    tickerEl.innerHTML = '<span class="ticker-item"><span class="symbol text-blue" style="color: #3b82f6;">🔄 Establishing Secure Link to Live Markets...</span></span>';
    function generateTickerHTML(symbolsArray) {
        return symbolsArray.map(s => {
            const changeClass = s.change >= 0 ? 'up' : 'down';
            const sign = s.change > 0 ? '+' : '';
            return `<span class="ticker-item"><span class="symbol">${s.symbol}</span> <span class="price">$${formatNumber(s.price, 2)}</span> <span class="change ${changeClass}">${sign}${s.change}%</span></span>`;
        }).join('');
    }
    async function refreshLiveTicker() {
        const realData = await fetchRealMarketData();
        if (realData && realData.length > 0) {
            const baseHTML = generateTickerHTML(realData);
            tickerEl.innerHTML = baseHTML.repeat(6);
            updateWatchlistWithRealPrices();
        }
    }
    await refreshLiveTicker();
    setInterval(refreshLiveTicker, 60000); 
}

// ============================================
// 12. UPDATE ALL DASHBOARD DATA
// ============================================
function refreshAllData() {
    renderTradingTable(state.tradingData, 'trading-table-body', 5);
    renderInvestmentTable(state.investmentData, 'investment-table-body', 5);
    renderFullTradingTable(state.tradingPage);
    renderFullPortfolioTable(state.portfolioPage);
    renderNewsMiniList();
    renderNewsFeed('all');
    renderWatchlistTable();
    // ✅ Also refresh prices on every 5-min background sync, not just the 60s ticker
    if (typeof updateWatchlistWithRealPrices === 'function') updateWatchlistWithRealPrices();

    // Trigger Digital Assets AI predictions
    if (typeof fetchUpcomingPredictions === 'function') {
        fetchUpcomingPredictions();
    }

    // Only render when Dashboard is active — canvas needs visible dimensions
    if (typeof renderPremiumPerformanceChart === 'function' && supabaseClient && state.currentPage === 'dashboard') {
        renderPremiumPerformanceChart();
    }

    updateStatsCards();
    updateUIBasedOnAuth();
    if (typeof loadEconomicCalendar === 'function') loadEconomicCalendar(); // ✅ refresh every 5min
    if (typeof populateProfileForm === 'function') populateProfileForm();
    if (typeof updateSettingsSubscriptionCard === 'function') updateSettingsSubscriptionCard(); // ✅ NEW
    if (typeof loadGeoPredictions === 'function') loadGeoPredictions();
    if (typeof loadCovertPredictions === 'function' && activeGeoTab === 'covert') {
        loadCovertPredictions();
    }
}

// ============================================
// GEOPOLITICAL & ECONOMIC RISK AI (TICKETS)
// ============================================
async function loadGeoPredictions() {
    if (!supabaseClient) return;
    const { data, error } = await supabaseClient
        .from('geo_predictions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
    if (error) { console.warn('Geo predictions fetch failed:', error); return; }
    state.geoPredictions = data || [];
    renderGeoTickets();
}

function renderGeoTickets() {
    const grid = document.getElementById('geo-tickets-grid');
    if (!grid) return;
    const tickets = state.geoPredictions || [];
    if (tickets.length === 0) {
        grid.innerHTML = `<div style="text-align:center;padding:60px 20px;color:var(--text-muted);grid-column:1/-1;">
            <i class="fa-solid fa-earth-americas" style="font-size:2.5rem;opacity:0.2;display:block;margin-bottom:12px;"></i>
            No risk predictions yet. The AI scans world news every 15 minutes — check back shortly.
        </div>`;
        return;
    }

    const sevColor  = (s) => s === 'Critical' ? '#ef4444' : s === 'High' ? '#f97316' : s === 'Medium' ? '#f0b90b' : '#00d4aa';
    const probColor = (p) => p >= 80 ? '#ef4444' : p >= 60 ? '#f97316' : p >= 40 ? '#f0b90b' : '#00d4aa';

    grid.innerHTML = tickets.map(t => {
        const sc   = sevColor(t.severity);
        const prob = t.probability_percent ?? 0;
        const pc   = probColor(prob);
        return `
        <div class="geo-ticket" onclick="openGeoDetail(${t.id})" style="border-top-color:${sc};">
            <div class="geo-ticket-top">
                <span class="geo-ticket-category">${escHtml(t.category || 'Geopolitical')}</span>
                <span class="geo-ticket-severity" style="color:${sc};border-color:${sc};background:${sc}18;">
                    ${escHtml(t.severity || 'Medium')}
                </span>
            </div>
            <h3 class="geo-ticket-headline">${escHtml(t.headline || '')}</h3>
            <p class="geo-ticket-summary">${escHtml(t.summary || '')}</p>
            <div class="geo-ticket-footer">
                <span class="geo-ticket-prob" style="color:${pc};">
                    <div class="geo-ticket-prob-bar">
                        <div class="geo-ticket-prob-fill" style="width:${prob}%;background:${pc};"></div>
                    </div>
                    ${prob}% likely
                </span>
                <span class="geo-ticket-time">${timeAgo(t.created_at)}</span>
            </div>
        </div>`;
    }).join('');
}

function openGeoDetail(id) {
    const t = (state.geoPredictions || []).find(p => p.id === id);
    const modal = document.getElementById('geo-detail-modal');
    const body = document.getElementById('geo-detail-body');
    if (!t || !modal || !body) return;
    body.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap;">
            <span class="badge" style="background:rgba(239,68,68,0.15);color:var(--accent-red);">${escHtml(t.category || 'Geopolitical')}</span>
            <span style="color:var(--text-muted);font-size:0.8rem;">${timeAgo(t.created_at)}</span>
        </div>
        <h2 style="color:#fff;font-size:1.4rem;margin-bottom:14px;">${escHtml(t.headline)}</h2>
        <p style="color:var(--text-secondary);line-height:1.6;margin-bottom:20px;">${escHtml(t.summary || '')}</p>
        <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;">
            <div class="geo-detail-stat"><div class="geo-detail-stat-value">${t.probability_percent ?? '—'}%</div><div class="geo-detail-stat-label">Probability</div></div>
            <div class="geo-detail-stat"><div class="geo-detail-stat-value">${escHtml(t.severity || '—')}</div><div class="geo-detail-stat-label">Severity</div></div>
        </div>
        <div class="geo-detail-section"><h4><i class="fa-solid fa-industry"></i> Affected Industries</h4><p>${escHtml(t.affected_industries || 'Not specified')}</p></div>
        <div class="geo-detail-section"><h4><i class="fa-solid fa-globe"></i> Global Market Impact</h4><p>${escHtml(t.market_impact || 'Not specified')}</p></div>
        <div class="geo-timeline">
            <div class="geo-timeline-item"><div class="geo-timeline-label">3 Months</div><p>${escHtml(t.impact_3_months || '—')}</p></div>
            <div class="geo-timeline-item"><div class="geo-timeline-label">6 Months</div><p>${escHtml(t.impact_6_months || '—')}</p></div>
            <div class="geo-timeline-item"><div class="geo-timeline-label">12 Months</div><p>${escHtml(t.impact_12_months || '—')}</p></div>
            <div class="geo-timeline-item"><div class="geo-timeline-label">Long Term</div><p>${escHtml(t.impact_long_term || '—')}</p></div>
        </div>
    `;
    modal.style.display = 'flex';
}

function updateStatsCards() {
    const signalsEl = document.getElementById('stat-signals');
    const signalsChangeEl = document.getElementById('stat-signals-change');
    const liveCount = state.activeSignalsCount || state.tradingData.length; // ✅ Real count
    if (signalsEl) signalsEl.textContent = liveCount;
    if (signalsChangeEl) signalsChangeEl.textContent = `+${liveCount} Live`;

    const winrateEl = document.getElementById('stat-winrate');
    if (winrateEl) {
        winrateEl.innerHTML = `${state.avgConfidence || 0}<span class="stat-percent">%</span>`;
    }

    const portfolioEl = document.getElementById('stat-portfolio');
    if (portfolioEl) {
        const count = state.totalTracked;
        const display = count >= 1000 ? `${(count/1000).toFixed(1)}K` : count;
        portfolioEl.innerHTML = `${display}<span class="stat-percent"> signals</span>`;
    }
}

// ============================================
// INSTANT REALTIME LISTENER FOR DIGITAL ASSETS
// ============================================
function subscribeToDigitalAssets() {
    if (!supabaseClient) return;
    
    console.log('📡 Arming Realtime AI Receiver...');
    
    supabaseClient
        .channel('live-ai-predictions')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'upcoming_announcements' },
            (payload) => {
                console.log('⚡ NEW AI PREDICTION INTERCEPTED!', payload);
                
                // 1. Show a pop-up notification to the user
                if (typeof showToast === 'function') {
                    showToast('success', 'New AI Prediction Detected!');
                }
                if (typeof addNotification === 'function') {
                    addNotification('AI Engine found a new digital asset!', 'system');
                }
                
                // 2. Instantly fetch the fresh data and redraw the table
                if (typeof fetchUpcomingPredictions === 'function') {
                    fetchUpcomingPredictions();
                }
            }
        )
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('✅ Live Digital Assets link established.');
            }
        });
}

function subscribeToGeoPredictions() {
    if (!supabaseClient) return;
    supabaseClient
        .channel('live-geo-predictions')
        .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'geo_predictions' },
            (payload) => {
                console.log('🌍 NEW GEO-RISK TICKET DETECTED!', payload);
                if (typeof addNotification === 'function') {
                    addNotification('New Geo-Risk: ' + (payload.new?.headline || 'Check Geo Risk AI'), 'system');
                }
                if (typeof loadGeoPredictions === 'function') {
                    loadGeoPredictions();
                }
            }
        )
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('✅ Live Geo-Risk link established.');
            }
        });
    setInterval(() => {
        if (state.currentPage === 'georisk') loadGeoPredictions();
    }, 15 * 60 * 1000);
}

// ============================================
// SECRET INTEL — COVERT PREDICTIONS ENGINE
// ============================================
let activeGeoTab = 'georisk';

function switchGeoTab(tab) {
    activeGeoTab = tab;
    const panelGeo    = document.getElementById('panel-georisk');
    const panelCovert = document.getElementById('panel-covert');
    const btnGeo      = document.getElementById('tab-georisk-btn');
    const btnCovert   = document.getElementById('tab-covert-btn');
    const badge       = document.getElementById('geo-tab-badge');

    if (tab === 'georisk') {
        if (panelGeo)    panelGeo.style.display    = 'block';
        if (panelCovert) panelCovert.style.display = 'none';
        if (btnGeo)    { btnGeo.style.background    = 'rgba(239,68,68,0.2)';  btnGeo.style.color    = 'var(--accent-red)'; }
        if (btnCovert) { btnCovert.style.background = 'transparent';           btnCovert.style.color = 'var(--text-muted)'; }
        if (badge) { badge.textContent = 'Updates every 15 min'; badge.style.color = 'var(--accent-red)'; badge.style.background = 'rgba(239,68,68,0.15)'; }
    } else {
        if (panelGeo)    panelGeo.style.display    = 'none';
        if (panelCovert) panelCovert.style.display = 'block';
        if (btnGeo)    { btnGeo.style.background    = 'transparent';            btnGeo.style.color    = 'var(--text-muted)'; }
        if (btnCovert) { btnCovert.style.background = 'rgba(168,85,247,0.2)';  btnCovert.style.color = '#a855f7'; }
        if (badge) { badge.textContent = 'Updates every 60 min'; badge.style.color = '#a855f7'; badge.style.background = 'rgba(168,85,247,0.15)'; }
        updateCovertAccessControl();
        loadCovertPredictions(); // ✅ Always runs even if panel elements are null
    }
}

function updateCovertAccessControl() {
    const overlay   = document.getElementById('covert-upgrade-overlay');
    const grid      = document.getElementById('covert-tickets-grid');
    const isPremium = ['premium', 'pro', 'basic', 'trial'].includes(state.subscriptionPlan);
    if (overlay) overlay.style.display = isPremium ? 'none' : 'flex';
    if (grid)    grid.style.filter     = isPremium ? 'none' : 'blur(5px)';
}

async function loadCovertPredictions() {
    if (!supabaseClient) { console.warn('loadCovertPredictions: no supabaseClient'); return; }
    const { data, error } = await supabaseClient
        .from('covert_predictions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(15);

    // ✅ Show the real error in console so RLS/permission issues are visible
    if (error) {
        console.error('❌ Covert fetch failed — check RLS on covert_predictions table:', error.message, error);
        return;
    }

    // ✅ Log what we got so empty vs blocked is obvious
    console.log(`🕵️ Covert predictions loaded: ${(data||[]).length} records`);
    state.covertPredictions = data || [];
    renderCovertTickets();
}

function renderCovertTickets() {
    const grid = document.getElementById('covert-tickets-grid');
    if (!grid) return;
    const tickets = state.covertPredictions || [];
    if (tickets.length === 0) {
        grid.innerHTML = `<div style="text-align:center;padding:60px 20px;color:var(--text-muted);grid-column:1/-1;"><i class="fa-solid fa-satellite-dish" style="font-size:2rem;margin-bottom:12px;display:block;opacity:0.35;"></i>No intel gathered yet. AI scans every 60 minutes — check back shortly.</div>`;
        return;
    }
    const typeColor = (t) => t === 'open_war' ? '#ef4444' : '#a855f7';
    const typeLabel = (t) => t === 'open_war' ? '⚔️ OPEN WAR' : '🕵️ COVERT OP';
    const sevColor  = (s) => s === 'Critical' ? '#ef4444' : s === 'High' ? '#f97316' : s === 'Medium' ? '#f0b90b' : '#00d4aa';

    grid.innerHTML = tickets.map(t => `
        <div class="geo-ticket" onclick="openCovertDetail(${t.id})" style="border-left:3px solid ${typeColor(t.prediction_type)};cursor:pointer;">
            <div class="geo-ticket-top">
                <span class="geo-ticket-category" style="background:rgba(168,85,247,0.12);color:${typeColor(t.prediction_type)};">${escHtml(typeLabel(t.prediction_type))}</span>
                <span class="geo-ticket-severity" style="color:${sevColor(t.severity)};">${escHtml(t.severity || 'High')}</span>
            </div>
            <h3 class="geo-ticket-headline">${escHtml(t.title || '')}</h3>
            <p class="geo-ticket-summary" style="font-size:0.78rem;">${escHtml((t.summary || '').substring(0,120))}...</p>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 6px;">
                <span style="background:rgba(239,68,68,0.1);color:#ef4444;border-radius:4px;padding:2px 7px;font-size:0.7rem;">🎯 ${escHtml(t.target || '—')}</span>
                <span style="background:rgba(59,130,246,0.1);color:#3b82f6;border-radius:4px;padding:2px 7px;font-size:0.7rem;">👤 ${escHtml(t.actors || '—')}</span>
            </div>
            <div class="geo-ticket-footer">
                <span class="geo-ticket-prob" style="color:${sevColor(t.severity)};">${t.probability_percent ?? '—'}% likely</span>
                <span class="geo-ticket-time">${timeAgo(t.created_at)}</span>
            </div>
        </div>
    `).join('');
}

function openCovertDetail(id) {
    const t     = (state.covertPredictions || []).find(p => p.id === id);
    const modal = document.getElementById('covert-detail-modal');
    const body  = document.getElementById('covert-detail-body');
    if (!t || !modal || !body) return;
    const typeColor = t.prediction_type === 'open_war' ? '#ef4444' : '#a855f7';
    const typeLabel = t.prediction_type === 'open_war' ? '⚔️ OPEN WAR PREDICTION' : '🕵️ COVERT OP PREDICTION';
    const sevColor  = (s) => s === 'Critical' ? '#ef4444' : s === 'High' ? '#f97316' : s === 'Medium' ? '#f0b90b' : '#00d4aa';

    body.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap;">
            <span class="badge" style="background:rgba(168,85,247,0.15);color:${typeColor};padding:4px 12px;">${typeLabel}</span>
            <span class="badge" style="background:rgba(100,116,139,0.15);color:var(--text-muted);">${escHtml(t.category || '')}</span>
            <span style="color:var(--text-muted);font-size:0.8rem;">${timeAgo(t.created_at)}</span>
        </div>
        <h2 style="color:#fff;font-size:1.25rem;margin-bottom:14px;line-height:1.4;">${escHtml(t.title || '')}</h2>
        <div style="background:rgba(168,85,247,0.06);border:1px solid rgba(168,85,247,0.2);border-radius:8px;padding:14px;margin-bottom:18px;">
            <p style="color:var(--text-secondary);line-height:1.7;margin:0;font-size:0.88rem;">${escHtml(t.summary || '')}</p>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:18px;">
            <div class="geo-detail-stat"><div class="geo-detail-stat-value" style="color:${sevColor(t.severity)};">${t.probability_percent ?? '—'}%</div><div class="geo-detail-stat-label">Probability</div></div>
            <div class="geo-detail-stat"><div class="geo-detail-stat-value" style="color:${sevColor(t.severity)};font-size:1rem;">${escHtml(t.severity || '—')}</div><div class="geo-detail-stat-label">Severity</div></div>
            <div class="geo-detail-stat"><div class="geo-detail-stat-value" style="font-size:0.82rem;color:var(--text-secondary);">${escHtml(t.timeline || '—')}</div><div class="geo-detail-stat-label">Timeline</div></div>
        </div>
        <div class="geo-detail-section"><h4><i class="fa-solid fa-crosshairs" style="color:#ef4444;"></i> Target</h4><p>${escHtml(t.target || '—')}</p></div>
        <div class="geo-detail-section"><h4><i class="fa-solid fa-user-secret" style="color:#a855f7;"></i> Actors / Agencies</h4><p>${escHtml(t.actors || '—')}</p></div>
        <div class="geo-detail-section"><h4><i class="fa-solid fa-bullseye" style="color:#f97316;"></i> Purpose &amp; Goal</h4><p>${escHtml(t.purpose || '—')}</p></div>
        <div class="geo-detail-section"><h4><i class="fa-solid fa-magnifying-glass" style="color:#3b82f6;"></i> Evidence &amp; Signals</h4><p>${escHtml(t.evidence || '—')}</p></div>
        <div class="geo-detail-section"><h4><i class="fa-solid fa-chart-line" style="color:#00d4aa;"></i> Market Impact if Triggered</h4><p>${escHtml(t.market_impact || '—')}</p></div>
        <div style="margin-top:16px;padding:10px 14px;background:rgba(239,68,68,0.05);border-radius:8px;border:1px solid rgba(239,68,68,0.12);">
            <p style="color:var(--text-muted);font-size:0.74rem;margin:0;text-align:center;"><i class="fa-solid fa-triangle-exclamation" style="color:#f0b90b;margin-right:6px;"></i>AI-generated speculation for informational purposes only. Not confirmed intelligence.</p>
        </div>
    `;
    modal.style.display = 'flex';
}

// ==========================================
// 🎟️ PREDICTION ARENA — crowd vote vs. AI
// ==========================================
async function loadPredictionTickets() {
    if (!supabaseClient) { console.warn('loadPredictionTickets: no supabaseClient'); return; }

    const { data: tickets, error } = await supabaseClient
        .from('prediction_tickets')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

    if (error) {
        console.error('❌ Prediction tickets fetch failed — check RLS on prediction_tickets:', error.message);
        return;
    }

    state.predictionTickets = tickets || [];
    state.myPredictionVotes = {};

    // RLS on prediction_votes only ever returns the CURRENT user's own rows,
    // so this is always safe — it can never leak anyone else's vote.
    if (state.isLoggedIn && tickets && tickets.length) {
        const ticketIds = tickets.map(t => t.id);
        const { data: myVotes, error: voteErr } = await supabaseClient
            .from('prediction_votes')
            .select('ticket_id, choice')
            .in('ticket_id', ticketIds);
        if (!voteErr && myVotes) {
            myVotes.forEach(v => { state.myPredictionVotes[v.ticket_id] = v.choice; });
        }

        // 🎟️ Reaction counts + which pills the current user has toggled on.
        // Public read (RLS allows SELECT to everyone), so this stays accurate
        // for logged-out visitors too — "mine" just won't ever be true for them.
        await loadPredictionReactions(ticketIds);
    } else if (tickets && tickets.length) {
        await loadPredictionReactions(tickets.map(t => t.id));
    }

    // Public track record strip — most recent rolling snapshot
    const { data: historyRows } = await supabaseClient
        .from('prediction_performance_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);
    const latest = (historyRows && historyRows[0]) || null;
    const aiAccEl    = document.getElementById('pa-ai-accuracy');
    const crowdAccEl = document.getElementById('pa-crowd-accuracy');
    const totalEl    = document.getElementById('pa-total-resolved');
    if (aiAccEl)    aiAccEl.textContent    = latest ? `${latest.ai_accuracy}%` : '—';
    if (crowdAccEl) crowdAccEl.textContent = (latest && latest.crowd_accuracy != null) ? `${latest.crowd_accuracy}%` : '—';
    if (totalEl)    totalEl.textContent    = latest ? latest.total_resolved : '0';

    renderPredictionTickets();
}

function predictionArenaIsPremium() {
    return ['premium', 'pro', 'basic', 'trial'].includes(state.subscriptionPlan);
}

function renderPredictionTickets() {
    const grid = document.getElementById('pa-tickets-grid');
    if (!grid) return;
    const tickets = state.predictionTickets || [];
    if (tickets.length === 0) {
        grid.innerHTML = `<div style="text-align:center;padding:60px 20px;color:var(--text-muted);grid-column:1/-1;"><i class="fa-solid fa-scale-balanced" style="font-size:2rem;margin-bottom:12px;display:block;opacity:0.35;"></i>No ticket live yet. A new one is posted every 24 hours — check back shortly.</div>`;
        return;
    }
    const isPremium = predictionArenaIsPremium();

    grid.innerHTML = tickets.map(t => {
        const total  = (t.yes_votes || 0) + (t.no_votes || 0);
        const yesPct = total > 0 ? Math.round((t.yes_votes / total) * 100) : 50;
        const noPct  = 100 - yesPct;
        const myVote = state.myPredictionVotes ? state.myPredictionVotes[t.id] : null;
        const isOpen = t.status === 'open';
        const statusColor = isOpen ? '#f0b90b' : (t.actual_outcome === 'yes' ? '#00d4aa' : '#ef4444');
        const statusLabel = isOpen ? 'OPEN' : `RESOLVED: ${(t.actual_outcome || '—').toUpperCase()}`;

        const aiBox = isPremium
            ? `<div class="pa-ai-box">
                   <div class="pa-ai-box-title"><i class="fa-solid fa-robot"></i> AI Call: ${escHtml((t.ai_prediction || '').toUpperCase())} (${t.ai_confidence ?? '—'}%)</div>
                   <div class="pa-ai-box-text">${escHtml(t.ai_reasoning || '')}</div>
               </div>`
            : `<div class="pa-ai-locked" onclick="openPricingModal()">
                   <i class="fa-solid fa-lock"></i> Unlock AI's call with Premium
               </div>`;

        const voteButtons = !state.isLoggedIn
            ? `<div class="pa-vote-msg">Sign in to vote</div>`
            : !isOpen
                ? `<div class="pa-vote-msg">Voting closed</div>`
                : myVote
                    ? `<div class="pa-vote-msg" style="color:${myVote === 'yes' ? '#00d4aa' : '#ef4444'};font-weight:700;"><i class="fa-solid fa-check"></i> You voted ${myVote.toUpperCase()}</div>`
                    : `<div style="display:flex;gap:8px;">
                           <button class="pa-vote-btn pa-vote-yes" onclick="castPredictionVote(${t.id}, 'yes')">Yes</button>
                           <button class="pa-vote-btn pa-vote-no" onclick="castPredictionVote(${t.id}, 'no')">No</button>
                       </div>`;

        return `
        <div class="geo-ticket" style="cursor:default;border-top-color:${statusColor};">
            <div class="geo-ticket-top">
                <span class="geo-ticket-category">${escHtml(t.category || 'Crypto')}</span>
                <span class="geo-ticket-severity" style="color:${statusColor};">${statusLabel}</span>
            </div>
            <h3 class="geo-ticket-headline" style="cursor:pointer;" onclick="openPredictionDetail(${t.id})">${escHtml(t.question || '')}</h3>

            <div class="pa-vote-bar">
                <div class="pa-vote-bar-yes" style="width:${yesPct}%;"></div>
                <div class="pa-vote-bar-no" style="width:${noPct}%;"></div>
            </div>
            <div class="pa-vote-bar-labels">
                <span style="color:#00d4aa;font-weight:700;">Yes ${yesPct}%</span>
                <span>${total} vote${total === 1 ? '' : 's'}</span>
                <span style="color:#ef4444;font-weight:700;">No ${noPct}%</span>
            </div>

            ${voteButtons}
            ${aiBox}

            <div class="pa-reaction-bar" id="pa-reactions-${t.id}" data-ticket-id="${t.id}"></div>

            <div class="geo-ticket-footer">
                <span class="geo-ticket-time">${escHtml(t.asset || '')}</span>
                <span class="geo-ticket-time">${timeAgo(t.created_at)}</span>
            </div>
        </div>`;
    }).join('');

    // Each card's reaction bar is its own self-contained render — populating
    // them here (after the grid HTML is in the DOM) never touches any other
    // ticket's markup or in-flight animation.
    tickets.forEach(t => renderReactionBar(t.id));
}

// ------------------------------------------
// 🎟️ PREDICTION ARENA — per-ticket reaction bar
// Every ticket gets its own isolated reaction bar: rendering/updating one
// ticket's pills never re-renders the grid or touches any other ticket.
// ------------------------------------------

// Cheap local read of the signed-in user's id (no network round trip) —
// only used to mark which pills are "mine" client-side. The real gate is
// server-side: RLS + the toggle_prediction_reaction() RPC below.
async function getLocalUserId() {
    if (!supabaseClient || !state.isLoggedIn) return null;
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        return session?.user?.id || null;
    } catch (e) {
        return null;
    }
}

async function loadPredictionReactions(ticketIds) {
    if (!supabaseClient || !ticketIds || !ticketIds.length) { state.predictionReactions = {}; return; }

    const { data: rows, error } = await supabaseClient
        .from('prediction_reactions')
        .select('ticket_id, emoji, user_id')
        .in('ticket_id', ticketIds);

    if (error) {
        console.error('❌ Reactions fetch failed — check RLS on prediction_reactions:', error.message);
        return;
    }

    const myId = await getLocalUserId();
    const grouped = {};
    (rows || []).forEach(r => {
        grouped[r.ticket_id] = grouped[r.ticket_id] || {};
        const entry = grouped[r.ticket_id][r.emoji] || { count: 0, mine: false };
        entry.count += 1;
        if (myId && r.user_id === myId) entry.mine = true;
        grouped[r.ticket_id][r.emoji] = entry;
    });
    state.predictionReactions = grouped;
}

// Re-renders ONLY the reaction pills for one ticket. Safe to call as often
// as needed — it never touches the vote bar, AI box, or any other card.
function renderReactionBar(ticketId) {
    const el = document.getElementById(`pa-reactions-${ticketId}`);
    if (!el) return;
    const data = (state.predictionReactions && state.predictionReactions[ticketId]) || {};

    el.innerHTML = PA_REACTION_EMOJIS.map(emoji => {
        const entry = data[emoji] || { count: 0, mine: false };
        return `
            <button type="button"
                class="pa-reaction-pill${entry.mine ? ' pa-reaction-pill--active' : ''}"
                data-emoji="${emoji}"
                aria-pressed="${entry.mine ? 'true' : 'false'}"
                onclick="toggleReaction(${ticketId}, '${emoji}', event)">
                <span class="pa-reaction-emoji">${emoji}</span>${entry.count > 0 ? `<span class="pa-reaction-count">${entry.count}</span>` : ''}
            </button>`;
    }).join('');
}

// Small "pop + float" animation on the exact pill that was clicked.
function firePaReactionAnimation(buttonEl, emoji, isAdding) {
    if (!buttonEl) return;
    buttonEl.classList.remove('pa-reaction-pop');
    void buttonEl.offsetWidth; // restart animation even on rapid re-clicks
    buttonEl.classList.add('pa-reaction-pop');

    if (!isAdding) return; // only float a particle when reacting, not un-reacting
    const particle = document.createElement('span');
    particle.className = 'pa-reaction-particle';
    particle.textContent = emoji;
    buttonEl.appendChild(particle);
    particle.addEventListener('animationend', () => particle.remove());
}

async function toggleReaction(ticketId, emoji, evt) {
    if (!supabaseClient) return;
    if (!state.isLoggedIn) {
        if (typeof signInWithGoogle === 'function') signInWithGoogle();
        return;
    }
    if (!PA_REACTION_EMOJIS.includes(emoji)) return;

    state.predictionReactions[ticketId] = state.predictionReactions[ticketId] || {};
    const entry = state.predictionReactions[ticketId][emoji] || { count: 0, mine: false };
    const wasMine = entry.mine;

    // Optimistic flip — instant feedback, reconciled with the server after.
    entry.mine = !wasMine;
    entry.count = Math.max(0, entry.count + (wasMine ? -1 : 1));
    state.predictionReactions[ticketId][emoji] = entry;
    renderReactionBar(ticketId);
    firePaReactionAnimation(evt?.currentTarget, emoji, !wasMine);

    const { error } = await supabaseClient.rpc('toggle_prediction_reaction', {
        p_ticket_id: ticketId,
        p_emoji: emoji
    });

    if (error) {
        console.error('❌ Reaction failed:', error.message);
        // Revert the optimistic change and re-render just this one bar.
        entry.mine = wasMine;
        entry.count = Math.max(0, entry.count + (wasMine ? 1 : -1));
        state.predictionReactions[ticketId][emoji] = entry;
        renderReactionBar(ticketId);
        if (typeof addNotification === 'function') {
            addNotification('Reaction failed — please try again.', 'system');
        }
    }
}

// Re-counts reactions for ONE ticket from the server (source of truth) and
// repaints only that ticket's bar — used by the realtime subscription below
// so one person reacting never disturbs any other ticket on screen.
async function refreshReactionsForTicket(ticketId) {
    if (!supabaseClient) return;
    const { data: rows, error } = await supabaseClient
        .from('prediction_reactions')
        .select('emoji, user_id')
        .eq('ticket_id', ticketId);

    if (error) { console.error('❌ Reaction refresh failed:', error.message); return; }

    const myId = await getLocalUserId();
    const grouped = {};
    (rows || []).forEach(r => {
        const entry = grouped[r.emoji] || { count: 0, mine: false };
        entry.count += 1;
        if (myId && r.user_id === myId) entry.mine = true;
        grouped[r.emoji] = entry;
    });
    state.predictionReactions = state.predictionReactions || {};
    state.predictionReactions[ticketId] = grouped;
}

function subscribeToPredictionReactions() {
    if (!supabaseClient) return;
    supabaseClient
        .channel('live-prediction-reactions')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'prediction_reactions' }, async (payload) => {
            if (state.currentPage !== 'predictions') return;
            const row = payload.eventType === 'DELETE' ? payload.old : payload.new;
            if (!row || row.ticket_id == null) return;
            await refreshReactionsForTicket(row.ticket_id);
            renderReactionBar(row.ticket_id); // ← only this one card repaints
        })
        .subscribe();
}

async function castPredictionVote(ticketId, choice) {
    if (!supabaseClient) return;
    if (!state.isLoggedIn) {
        if (typeof signInWithGoogle === 'function') signInWithGoogle();
        return;
    }

    // Optimistic UI — lock the vote in immediately, reconcile with the server after.
    state.myPredictionVotes = state.myPredictionVotes || {};
    state.myPredictionVotes[ticketId] = choice;
    const ticket = (state.predictionTickets || []).find(t => t.id === ticketId);
    if (ticket) {
        if (choice === 'yes') ticket.yes_votes = (ticket.yes_votes || 0) + 1;
        else ticket.no_votes = (ticket.no_votes || 0) + 1;
    }
    renderPredictionTickets();

    const { error } = await supabaseClient.rpc('cast_vote', { p_ticket_id: ticketId, p_choice: choice });
    if (error) {
        console.error('❌ Vote failed:', error.message);
        if (typeof addNotification === 'function') {
            addNotification(
                error.message.includes('already voted') ? 'You already voted on this ticket.' : 'Vote failed — please try again.',
                'system'
            );
        }
        loadPredictionTickets(); // reconcile with the real server state
    }
}

function openPredictionDetail(id) {
    const t     = (state.predictionTickets || []).find(p => p.id === id);
    const modal = document.getElementById('pa-detail-modal');
    const body  = document.getElementById('pa-detail-body');
    if (!t || !modal || !body) return;

    const isPremium = predictionArenaIsPremium();
    const total  = (t.yes_votes || 0) + (t.no_votes || 0);
    const yesPct = total > 0 ? Math.round((t.yes_votes / total) * 100) : 50;

    body.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap;">
            <span class="badge" style="background:rgba(240,185,11,0.15);color:#f0b90b;">${escHtml(t.category || 'Crypto')}</span>
            <span style="color:var(--text-muted);font-size:0.8rem;">${timeAgo(t.created_at)}</span>
        </div>
        <h2 style="color:#fff;font-size:1.2rem;margin-bottom:14px;line-height:1.4;">${escHtml(t.question || '')}</h2>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:18px;">
            <div class="geo-detail-stat"><div class="geo-detail-stat-value" style="color:#00d4aa;">${yesPct}%</div><div class="geo-detail-stat-label">Crowd Yes</div></div>
            <div class="geo-detail-stat"><div class="geo-detail-stat-value">${total}</div><div class="geo-detail-stat-label">Total Votes</div></div>
            <div class="geo-detail-stat"><div class="geo-detail-stat-value" style="font-size:0.85rem;">${t.status === 'open' ? 'Open' : (t.actual_outcome || '—').toUpperCase()}</div><div class="geo-detail-stat-label">Status</div></div>
        </div>
        ${isPremium ? `
        <div class="geo-detail-section"><h4><i class="fa-solid fa-robot" style="color:#a855f7;"></i> AI Call</h4><p>${escHtml((t.ai_prediction || '').toUpperCase())} — ${t.ai_confidence ?? '—'}% confidence</p></div>
        <div class="geo-detail-section"><h4><i class="fa-solid fa-magnifying-glass" style="color:#3b82f6;"></i> AI Reasoning</h4><p>${escHtml(t.ai_reasoning || '—')}</p></div>
        ` : `
        <div class="pa-ai-locked" onclick="openPricingModal()" style="margin-top:6px;">
            <i class="fa-solid fa-lock"></i> Unlock the AI's call with Premium
        </div>
        `}
        ${t.status === 'resolved' ? `<div class="geo-detail-section"><h4><i class="fa-solid fa-flag-checkered" style="color:${t.actual_outcome === 'yes' ? '#00d4aa' : '#ef4444'};"></i> Resolved Price</h4><p>$${t.resolved_price ?? '—'}</p></div>` : ''}
    `;
    modal.style.display = 'flex';
}

function subscribeToPredictionTickets() {
    if (!supabaseClient) return;
    supabaseClient
        .channel('live-prediction-tickets')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'prediction_tickets' }, () => {
            if (state.currentPage === 'predictions' && typeof loadPredictionTickets === 'function') {
                loadPredictionTickets();
            }
        })
        .subscribe();
}

function subscribeToCovertPredictions() {
    if (!supabaseClient) return;
    supabaseClient
        .channel('live-covert-predictions')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'covert_predictions' }, (payload) => {
            console.log('🕵️ NEW COVERT INTEL INTERCEPTED!', payload);
            if (typeof addNotification === 'function') {
                addNotification('New Secret Intel: ' + (payload.new?.title || 'Check Secret Intel tab'), 'system');
            }
            if (activeGeoTab === 'covert' && typeof loadCovertPredictions === 'function') {
                loadCovertPredictions();
            }
        })
        .subscribe();
    setInterval(() => {
        if (state.currentPage === 'georisk' && activeGeoTab === 'covert') loadCovertPredictions();
    }, 60 * 60 * 1000);
}

// ============================================
// 13. AUTH UI & UPGRADE HANDLING
// ============================================
function updateUIBasedOnAuth() {
    const tradingFooter = document.getElementById('trading-upgrade-footer');
    const googleContainer = $('#google-signin-container');
    const userDropdown = $('#user-dropdown');
    const proBadge = $('#pro-badge');
    const sidebarUpgrade = $('#sidebar-upgrade');
    const upgradeBanner = $('#upgrade-banner');
    const investmentOverlay = $('#investment-upgrade-overlay');
    const investmentWrapper = $('#investment-table-wrapper');
    const chartLock = document.getElementById('premium-chart-lock'); 
    
    // 🟢 NEW: Digital Assets DOM Elements
    const digitalOverlay = document.getElementById('digital-upgrade-overlay');
    const digitalWrapper = document.getElementById('digital-table-wrapper');

    // 🟢 NEW: Geo Risk AI DOM Elements
    const geoOverlay = document.getElementById('geo-upgrade-overlay');
    const geoWrapper = document.getElementById('geo-tickets-grid');

    if (state.isLoggedIn) {
        if (googleContainer) googleContainer.style.display = 'none';
        if (userDropdown) userDropdown.style.display = 'block';
        if (proBadge) {
            proBadge.style.display = state.subscriptionPlan !== 'free' ? 'flex' : 'none';
            if (state.subscriptionPlan === 'trial') {
                proBadge.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
                proBadge.innerHTML = `<i class="fa-solid fa-flask"></i> TRIAL`;
            } else {
                proBadge.style.background = '';
                proBadge.innerHTML = `<i class="fa-solid fa-crown"></i> ${state.subscriptionPlan.toUpperCase()}`;
            }
        }
    } else {
        if (googleContainer) googleContainer.style.display = 'flex';
        if (userDropdown) userDropdown.style.display = 'none';
        if (proBadge) proBadge.style.display = 'none';
    }

    const hasBasic = ['basic', 'pro', 'premium', 'trial'].includes(state.subscriptionPlan);
    const hasPro = ['pro', 'premium', 'trial'].includes(state.subscriptionPlan);
    const hasPremium = ['premium', 'trial'].includes(state.subscriptionPlan);

    // Sidebar & Banner
    if (!hasBasic) {
        if (sidebarUpgrade) sidebarUpgrade.style.display = 'block';
        if (upgradeBanner) upgradeBanner.style.display = 'flex';
    } else {
        if (sidebarUpgrade) sidebarUpgrade.style.display = 'none';
        if (upgradeBanner) upgradeBanner.style.display = 'none';
    }

    // Trading Radar Lock
    if (!hasBasic) {
        if (tradingFooter) tradingFooter.style.display = 'flex';
        const tradingBtn = document.getElementById('btn-upgrade-trading');
        if (tradingBtn) tradingBtn.textContent = state.isLoggedIn ? 'View Plans' : 'Sign In to Unlock';
    } else {
        if (tradingFooter) tradingFooter.style.display = 'none';
    }

    // Investment Board Lock
    if (!hasPro) {
        if (investmentOverlay) investmentOverlay.style.display = 'flex';
        if (investmentWrapper) investmentWrapper.style.filter = 'blur(4px)';
        const overlayBtn = $('#btn-upgrade-investment');
        if (overlayBtn) overlayBtn.textContent = state.isLoggedIn ? 'View Plans' : 'Sign In to Upgrade';
    } else {
        if (investmentOverlay) investmentOverlay.style.display = 'none';
        if (investmentWrapper) investmentWrapper.style.filter = 'none';
    }

    // 🟢 NEW: Digital Assets Lock (Requires Pro or Premium)
    if (!hasPro) {
        if (digitalOverlay) digitalOverlay.style.display = 'flex';
        if (digitalWrapper) digitalWrapper.style.filter = 'blur(4px)';
        const digitalBtn = document.querySelector('.btn-upgrade-digital');
        if (digitalBtn) digitalBtn.textContent = state.isLoggedIn ? 'View Plans' : 'Sign In to Upgrade';
    } else {
        if (digitalOverlay) digitalOverlay.style.display = 'none';
        if (digitalWrapper) digitalWrapper.style.filter = 'none';
    }

    // Terminal Chart Lock
    if (chartLock) {
        chartLock.style.display = hasPremium ? 'none' : 'flex';
    }

    // Geo Risk AI Lock (Premium only — this is the new exclusive feature)
    if (!hasPremium) {
        if (geoOverlay) geoOverlay.style.display = 'flex';
        if (geoWrapper) geoWrapper.style.filter = 'blur(4px)';
        const geoBtn = document.querySelector('.btn-upgrade-georisk');
        if (geoBtn) geoBtn.textContent = state.isLoggedIn ? 'View Plans' : 'Sign In to Upgrade';
    } else {
        if (geoOverlay) geoOverlay.style.display = 'none';
        if (geoWrapper) geoWrapper.style.filter = 'none';
    }

    // Redraw all tables with their new unlocked states!
    renderTradingTable(state.tradingData, 'trading-table-body', 5);
    renderInvestmentTable(state.investmentData, 'investment-table-body', 5);
    renderFullTradingTable(state.tradingPage);
    renderFullPortfolioTable(state.portfolioPage);
    if (typeof renderGeoTickets === 'function') renderGeoTickets();
    if (typeof renderPredictionTickets === 'function') renderPredictionTickets();
}

async function signInWithGoogle() {
    const client = supabaseClient || initSupabase();
    if (!client) { showToast('error', 'Database connection failed.'); return; }
    showToast('info', 'Connecting to Google...');
    try {
        const { data, error } = await client.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin + window.location.pathname }
        });
        if (error) throw error;
    } catch (error) {
        console.error('Google Auth Error:', error);
        showToast('error', 'Failed to initialize Google Sign-In.');
    }
}

function handleAuthChange(session) {
    if (session && session.user) {
        state.isLoggedIn = true;
        const meta = session.user.user_metadata;
        const fullName = meta.full_name || 'Trader';
        
        state.userProfile = {
            ...state.userProfile,
            name: fullName,
            email: session.user.email,
            avatar_url: meta.avatar_url,
            initials: (fullName.split(' ').map(n => n[0]).join('').substring(0, 2)).toUpperCase()
        };

        saveAuthState(); 
        saveUserProfile(); 
        populateProfileForm(); 
        updateUIBasedOnAuth();

        // Ensure this user has a profile row in Supabase (creates it if first login)
        if (supabaseClient && session?.user?.id) {
            supabaseClient.from('profiles').upsert({
                id: session.user.id,
                plan_tier: 'free',
                updated_at: new Date().toISOString()
            }, { onConflict: 'id', ignoreDuplicates: true })
            .then(({ error }) => { if (error) console.warn('Profile row error:', error); });
        }

        // 🟢 THE FIX: The moment they sign in, explicitly ask the cloud database for their real plan!
        if (typeof loadUserSubscription === 'function') {
            loadUserSubscription();
        }

        // ✅ FIX 2: If they paid before logging in, retry the pending verification now
        const pendingOrderId = localStorage.getItem('sapex_pending_order_id');
        if (pendingOrderId) {
            console.log('🔄 Pending payment found — retrying verification for order:', pendingOrderId);
            setTimeout(() => handlePaymentSuccessRedirect(), 1500);
        }

        const headerAvatar = document.getElementById('header-avatar');
        const profileAvatarLarge = document.getElementById('profile-avatar-large');
        if (meta.avatar_url) {
            const imgHtml = `<img src="${meta.avatar_url}" alt="Avatar" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
            if (headerAvatar) headerAvatar.innerHTML = imgHtml;
            if (profileAvatarLarge) profileAvatarLarge.innerHTML = imgHtml;
        } else {
            if (headerAvatar) headerAvatar.textContent = state.userProfile.initials;
            if (profileAvatarLarge) profileAvatarLarge.textContent = state.userProfile.initials;
        }
    } else {
        state.isLoggedIn = false;
        state.subscriptionPlan  = 'free';
        state.subscriptionExpiry = null;        // ✅ NEW
        state.cancelAtPeriodEnd  = false;       // ✅ NEW
        saveAuthState();
        updateUIBasedOnAuth();
        if (typeof updateSettingsSubscriptionCard === 'function') // ✅ NEW
            updateSettingsSubscriptionCard();
    }
}

// SOLUTION
function openPricingModal() {
    if (!state.isLoggedIn) {
        showToast('info', 'Please sign in first to view upgrade options.');
        signInWithGoogle(); return;
    }
    if (typeof closeAnnouncementModal === 'function') closeAnnouncementModal(); // 🔧 never let the ad sit on top of the plans
    const modal = document.getElementById('pricing-modal');
    if (modal) modal.style.display = 'flex';
    // Reset terms checkbox and lock all buttons every time modal opens
    const cb = document.getElementById('terms-checkbox');
    if (cb) cb.checked = false;
    document.querySelectorAll('.select-plan-btn').forEach(btn => {
        btn.disabled = true;
        btn.classList.add('terms-locked');
    });
}

// ✅ FIX: This function was called on every upgrade button but never defined
function upgradeToPro() {
    openPricingModal();
}

function closePricingModal() {
    const modal = document.getElementById('pricing-modal');
    if (modal) modal.style.display = 'none';
    // Reset on close so next open starts fresh
    const cb = document.getElementById('terms-checkbox');
    if (cb) cb.checked = false;
    document.querySelectorAll('.select-plan-btn').forEach(btn => {
        btn.disabled = true;
        btn.classList.add('terms-locked');
    });
}

// ============================================
// 🎓 ONBOARDING TOUR — shown once, first visit only
// ============================================
const TOUR_STORAGE_KEY = 'sapex_tour_completed';
let tourStepIndex = 0;
let tourActiveSteps = [];

function getTourSteps() {
    const steps = [];

    // Step 1 — sign in (only shown to logged-out visitors)
    if (!state.isLoggedIn) {
        steps.push({
            target: '#google-signin-container',
            title: 'Welcome to SaPEX NEXUS',
            text: "Start by signing in with Google — it's free and takes a few seconds.",
        });
    }

    // Step 2 — upgrade button
    steps.push({
        target: '#sidebar-upgrade',
        title: 'Try Everything, Completely Free',
        text: "This button is completely free to open — it includes a 15-day free trial with no credit card required.",
    });

    // Step 3 — the Free Trial card inside the pricing modal
    steps.push({
        target: '.pricing-tier.trial',
        title: 'Start Your Free Trial',
        text: '15 days of every premium feature unlocked, completely free — no card needed.',
        onEnter: () => {
            const modal = document.getElementById('pricing-modal');
            if (modal) modal.style.display = 'flex';
        },
    });

    // Step 4 — the close button on the pricing modal
    steps.push({
        target: '#close-pricing-modal',
        title: 'Close Anytime',
        text: "You can close this window anytime — nothing is locked in until you actually choose a plan.",
        onExit: () => closePricingModal(),
    });

    // Steps 5+ — one per sidebar feature, no page navigation needed
    const sidebarFeatures = [
        ['dashboard',   'Dashboard',        'Your command center — live signals, sentiment, and trending coins at a glance.'],
        ['trading',     'Live Trading',     'Real-time AI Buy/Sell signals for crypto and stocks, updated continuously.'],
        ['portfolio',   'Portfolio',        'Track your positions and overall performance in one place.'],
        ['watchlist',   'Watchlist',        'Pin the assets you care about most for quick access.'],
        ['news',        'News Feed',        'AI-curated market news with automatic Bullish / Bearish / Neutral tagging.'],
        ['digital',     'Digital Assets AI','Predictions on upcoming game releases, tech launches, and Web3 trends.'],
        ['marketsize',  'Market Size AI',   'Visualize where capital is concentrated across crypto and stocks.'],
        ['georisk',     'Geo Risk AI',      'AI-tracked geopolitical events and their potential market impact.'],
        ['predictions', 'Prediction Arena', "Vote Yes or No against the AI's own call on real outcomes."],
        ['profile',     'Profile',          'Manage your account details and connected email.'],
        ['settings',    'Settings',         'Customize your terminal preferences.'],
    ];
    sidebarFeatures.forEach(([page, title, text]) => {
        steps.push({ target: `.nav-item[data-page="${page}"]`, title, text });
    });

    // Final step — centered, no spotlight target
    steps.push({
        target: null,
        title: "You're All Set!",
        text: "That's the full terminal. Explore any tab, and upgrade whenever you're ready.",
    });

    return steps;
}

function startOnboardingTour() {
    if (localStorage.getItem(TOUR_STORAGE_KEY)) return; // already seen — never show again
    tourActiveSteps = getTourSteps();
    tourStepIndex = 0;

    const overlay = document.createElement('div');
    overlay.className = 'tour-overlay';
    overlay.id = 'tour-overlay';
    const spotlight = document.createElement('div');
    spotlight.className = 'tour-spotlight';
    spotlight.id = 'tour-spotlight';
    const tooltip = document.createElement('div');
    tooltip.className = 'tour-tooltip';
    tooltip.id = 'tour-tooltip';
    overlay.appendChild(spotlight);
    document.body.appendChild(overlay);
    document.body.appendChild(tooltip);

    renderTourStep();
    window.addEventListener('resize', positionTourStep);
}

function renderTourStep() {
    const step = tourActiveSteps[tourStepIndex];
    const tooltip = document.getElementById('tour-tooltip');
    const spotlight = document.getElementById('tour-spotlight');
    if (!step || !tooltip || !spotlight) return;

    if (step.onEnter) step.onEnter();

    const isLast = tourStepIndex === tourActiveSteps.length - 1;
    tooltip.innerHTML = `
        <div class="tour-tooltip-step">Step ${tourStepIndex + 1} of ${tourActiveSteps.length}</div>
        <h4>${escHtml(step.title)}</h4>
        <p>${escHtml(step.text)}</p>
        <div class="tour-tooltip-actions">
            <button class="tour-skip-btn" onclick="skipOnboardingTour()">Skip tour</button>
            <button class="tour-next-btn" onclick="advanceOnboardingTour()">${isLast ? 'Finish' : 'Next'}</button>
        </div>
    `;

    // small delay so onEnter's DOM changes (e.g. opening the pricing modal) have painted
    setTimeout(positionTourStep, 50);
}

function positionTourStep() {
    const step = tourActiveSteps[tourStepIndex];
    const spotlight = document.getElementById('tour-spotlight');
    const tooltip = document.getElementById('tour-tooltip');
    if (!step || !spotlight || !tooltip) return;

    if (!step.target) {
        // centered "finish" step — no spotlight box
        spotlight.classList.add('centered');
        spotlight.style.cssText += 'width:0;height:0;top:50%;left:50%;';
        tooltip.style.top = '50%';
        tooltip.style.left = '50%';
        tooltip.style.transform = 'translate(-50%, -50%)';
        return;
    }

    const el = document.querySelector(step.target);
    if (!el) { advanceOnboardingTour(); return; } // target missing — don't get stuck, just move on

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => {
        const r = el.getBoundingClientRect();
        const pad = 8;
        spotlight.classList.remove('centered');
        spotlight.style.top = `${r.top - pad}px`;
        spotlight.style.left = `${r.left - pad}px`;
        spotlight.style.width = `${r.width + pad * 2}px`;
        spotlight.style.height = `${r.height + pad * 2}px`;

        const spaceBelow = window.innerHeight - r.bottom;
        const placeBelow = spaceBelow > 200;
        tooltip.style.transform = 'none';
        tooltip.style.top = placeBelow ? `${r.bottom + 16}px` : `${Math.max(16, r.top - 190)}px`;
        let left = r.left;
        left = Math.min(left, window.innerWidth - 336);
        left = Math.max(left, 16);
        tooltip.style.left = `${left}px`;
    }, 250);
}

function advanceOnboardingTour() {
    const step = tourActiveSteps[tourStepIndex];
    if (step && step.onExit) step.onExit();

    if (tourStepIndex >= tourActiveSteps.length - 1) {
        endOnboardingTour();
        return;
    }
    tourStepIndex++;
    renderTourStep();
}

function skipOnboardingTour() {
    const step = tourActiveSteps[tourStepIndex];
    if (step && step.onExit) step.onExit();
    endOnboardingTour();
}

function endOnboardingTour() {
    localStorage.setItem(TOUR_STORAGE_KEY, 'true');
    document.getElementById('tour-overlay')?.remove();
    document.getElementById('tour-tooltip')?.remove();
    window.removeEventListener('resize', positionTourStep);
}

function handleTermsCheck(checked) {
    document.querySelectorAll('.select-plan-btn').forEach(btn => {
        btn.disabled = !checked;
        if (checked) btn.classList.remove('terms-locked');
        else btn.classList.add('terms-locked');
    });
    // Record acceptance in Supabase profile
    if (checked && supabaseClient && state.isLoggedIn) {
        supabaseClient.auth.getUser().then(({ data: { user } }) => {
            if (user) {
                supabaseClient.from('profiles').update({
                    terms_accepted: true,
                    terms_accepted_at: new Date().toISOString()
                }).eq('id', user.id).then(({ error }) => {
                    if (error) console.warn('Terms save failed:', error.message);
                });
            }
        });
    }
}

function openTermsModal(event) {
    event.preventDefault();
    document.getElementById('terms-modal').style.display = 'flex';
}

function acceptTermsFromModal() {
    document.getElementById('terms-modal').style.display = 'none';
    const cb = document.getElementById('terms-checkbox');
    if (cb) { cb.checked = true; handleTermsCheck(true); }
}

// CHECKOUT LOADING OVERLAY
let _checkoutLoaderMsgTimer = null;

function showCheckoutLoader() {
    const el = document.getElementById('checkout-loader');
    if (!el) return;
    el.style.display = 'flex';

    const msgs = [
        'Connecting to the payment network…',
        'Generating your secure invoice…',
        'Locking in your plan pricing…',
        'Almost there — redirecting you now…'
    ];
    let i = 0;
    const msgEl = document.getElementById('checkout-loader-msg');
    if (msgEl) msgEl.textContent = msgs[0];
    clearInterval(_checkoutLoaderMsgTimer);
    _checkoutLoaderMsgTimer = setInterval(() => {
        i = (i + 1) % msgs.length;
        if (msgEl) msgEl.textContent = msgs[i];
    }, 1800);

    clearTimeout(el._safetyTimeout);
    el._safetyTimeout = setTimeout(() => {
        hideCheckoutLoader();
        showToast('warning', 'This is taking longer than expected. Please try again.');
    }, 15000);
}

function hideCheckoutLoader() {
    const el = document.getElementById('checkout-loader');
    if (!el) return;
    el.style.display = 'none';
    clearInterval(_checkoutLoaderMsgTimer);
    clearTimeout(el._safetyTimeout);
}

async function processPlanSelection(planId) {
    // Trial flow — unchanged
    if (planId === 'trial') {
        closePricingModal();
        if (!state.isLoggedIn) {
            showToast('info', 'Please sign in first to start your free trial.');
            return;
        }
        startFreeTrial();
        return;
    }

    if (!state.isLoggedIn || !state.userProfile.email) {
        showToast('error', 'Please sign in before purchasing a plan.');
        return;
    }

    closePricingModal();

    // Admin localhost bypass — unchanged
    const adminEmails = ['sapexnetwork@gmail.com'];
    const isLocal = (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost');
    const isAdmin = adminEmails.includes(state.userProfile.email);

    if (isLocal && isAdmin) {
        showCheckoutLoader(); // ✅ NEW — also cover the admin test flow for consistency
        showToast('info', '🛠️ Admin Override: Simulating Payment...');
        setTimeout(async () => {
            if (supabaseClient) {
                const { data: { user } } = await supabaseClient.auth.getUser();
                if (user) {
                    const expiryDate = new Date();
                    expiryDate.setDate(expiryDate.getDate() + 30);
                    await supabaseClient.from('profiles').upsert({
                        id: user.id, plan_tier: planId,
                        subscription_expiry: expiryDate.toISOString(),
                        updated_at: new Date()
                    });
                }
            }
            state.subscriptionPlan = planId;
            saveAuthState();
            updateUIBasedOnAuth();
            hideCheckoutLoader(); // ✅ NEW — simulated payment "completes", so remove the wait screen
            showToast('success', `Simulated Success! Upgraded to ${planId.toUpperCase()}`);
        }, 1500);
        return;
    }

    // ✅ NOWPayments crypto checkout
    showCheckoutLoader(); // ✅ NEW — show full-screen wait state right as checkout starts
    showToast('info', `Creating crypto checkout for ${planId.toUpperCase()}...`);

    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
            hideCheckoutLoader(); // ✅ NEW — don't leave the overlay stuck if we bail out here
            showToast('error', 'Session expired. Please sign in again.');
            return;
        }

        // Call Edge Function — API key stays safely server-side
        const res = await fetch(`${SUPABASE_URL}/functions/v1/create-nowpayments-invoice`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ plan: planId })
        });

        const data = await res.json();

        if (!res.ok || !data.invoice_url) {
            hideCheckoutLoader(); // ✅ NEW — same reason, don't strand the user on the loader
            showToast('error', data.error || 'Could not create payment. Please try again.');
            return;
        }

        // Store nonce and plan for post-payment verification
        sessionStorage.setItem('sapex_payment_nonce', data.nonce);
        localStorage.setItem('sapex_pending_plan', planId);

        // Redirect to NOWPayments — user picks their crypto there
        // No hideCheckoutLoader() needed here — window.location.href unloads this
        // page entirely, taking the overlay with it the moment the gateway loads.
        setTimeout(() => { window.location.href = data.invoice_url; }, 800);

    } catch (e) {
        hideCheckoutLoader(); // ✅ NEW — network/JS error, don't leave them staring at a frozen screen
        console.error('Checkout error:', e);
        showToast('error', 'Checkout failed. Please try again or contact support.');
    }
}

async function logout() {
    if (supabaseClient) { showToast('info', 'Signing out...'); await supabaseClient.auth.signOut(); }
    state.isLoggedIn = false; state.subscriptionPlan = 'free';
    saveAuthState(); updateUIBasedOnAuth();
    showToast('success', 'Signed out safely.');
}

// ============================================
// 14. EVENT LISTENERS
// ============================================
function initNavigation() {
    $$('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            if (page) navigateTo(page);
        });
    });

    $$('.dropdown-item[data-page]').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            if (page) navigateTo(page);
            $('#dropdown-menu')?.classList.remove('show');
        });
    });

    const mobileToggle = $('#mobile-nav-toggle');
    const sidebar = $('#sidebar');
    if (mobileToggle && sidebar) {
        mobileToggle.addEventListener('click', () => { sidebar.classList.toggle('open'); });
    }

    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768 && sidebar && sidebar.classList.contains('open')) {
            if (!sidebar.contains(e.target) && e.target !== mobileToggle && !mobileToggle?.contains(e.target)) {
                sidebar.classList.remove('open');
            }
        }
    });

    const dropdownToggle = $('#user-dropdown-toggle');
    const dropdownMenu = $('#dropdown-menu');
    if (dropdownToggle && dropdownMenu) {
        dropdownToggle.addEventListener('click', (e) => { e.stopPropagation(); dropdownMenu.classList.toggle('show'); });
        document.addEventListener('click', (e) => {
            if (!dropdownToggle.contains(e.target) && !dropdownMenu.contains(e.target)) { dropdownMenu.classList.remove('show'); }
        });
    }

    $('#refresh-trading')?.addEventListener('click', async () => {
        showToast('info', 'Refreshing trading data...');
        await fetchDashboardData(); refreshAllData();
        showToast('success', 'Trading data updated!');
    });

    $('#refresh-investments')?.addEventListener('click', async () => {
        showToast('info', 'Refreshing investment data...');
        await fetchDashboardData(); refreshAllData();
        showToast('success', 'Investment data updated!');
    });

    $('#profile-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const nameInput = $('#profile-name'); const emailInput = $('#profile-email');
        const expSelect = $('#profile-experience'); const riskSelect = $('#profile-risk');

        if (nameInput) state.userProfile.name = nameInput.value;
        if (emailInput) state.userProfile.email = emailInput.value;
        if (expSelect) state.userProfile.experience = expSelect.value;
        if (riskSelect) state.userProfile.risk = riskSelect.value;
        state.userProfile.initials = getUserInitials();

        saveUserProfile(); populateProfileForm();
        showToast('success', 'Profile updated successfully!');
    });

    const notifBtn = document.getElementById('notification-btn');
    const notifMenu = document.getElementById('notification-menu');
    if (notifBtn && notifMenu) {
        notifBtn.addEventListener('click', (e) => {
            e.stopPropagation(); notifMenu.classList.toggle('show');
            document.getElementById('dropdown-menu')?.classList.remove('show'); 
            state.notifications.forEach(n => n.unread = false);
            localStorage.setItem('sapex_notifications', JSON.stringify(state.notifications));
            renderNotifications(); 
        });
    }
    document.getElementById('clear-notifications')?.addEventListener('click', (e) => {
        e.stopPropagation(); state.notifications = [];
        localStorage.setItem('sapex_notifications', JSON.stringify(state.notifications)); 
        renderNotifications();
    });
    document.addEventListener('click', (e) => {
        if (notifBtn && !notifBtn.contains(e.target) && !notifMenu.contains(e.target)) { notifMenu.classList.remove('show'); }
    });

    $$('#page-trading .filter-chip').forEach(chip => {
        chip.addEventListener('click', function() {
            $$('#page-trading .filter-chip').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            filterTradingData(this.textContent.trim().toLowerCase());
        });
    });

    $$('#page-portfolio .filter-chip').forEach(chip => {
        chip.addEventListener('click', function() {
            $$('#page-portfolio .filter-chip').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            filterPortfolioData(this.textContent.trim().toLowerCase());
        });
    });

    $$('#page-news .filter-chip').forEach(chip => {
        chip.addEventListener('click', function() {
            $$('#page-news .filter-chip').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            renderNewsFeed(this.textContent.trim().toLowerCase());
        });
    });

    // ✅ NEW: Bubble Chart Market Toggle (Crypto vs Stocks)
    $$('#bubble-market-toggle .filter-chip').forEach(chip => {
        chip.addEventListener('click', function() {
            $$('#bubble-market-toggle .filter-chip').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            
            // Re-run the physics engine with the new dataset
            if (typeof initMarketBubbles === 'function') {
                initMarketBubbles(this.getAttribute('data-market'));
            }
        });
    });

    $('#add-to-watchlist')?.addEventListener('click', () => {
        const input = $('#watchlist-symbol-input');
        const val = input?.value.trim();
        if (!val) {
            showToast('info', 'Type a symbol first — e.g. BTC/USDT or NVDA');
            if (input) { input.focus(); input.style.borderColor = '#f0b90b'; setTimeout(() => input.style.borderColor = '', 1500); }
            return;
        }
        addToWatchlist(val);
        input.value = '';
    });
    $('#watchlist-symbol-input')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const input = $('#watchlist-symbol-input');
            if (input && input.value.trim()) { addToWatchlist(input.value.trim()); input.value = ''; }
        }
    });

    const searchInput = $('#header-search');
    if (searchInput) {
        searchInput.addEventListener('input', debounce((e) => { searchData(e.target.value.toLowerCase().trim()); }, 300));
    }

    $('#logout-btn')?.addEventListener('click', () => { logout(); });
    $('#google-signin-btn')?.addEventListener('click', () => { signInWithGoogle(); });
    $$('#btn-upgrade-sidebar, #btn-upgrade-banner, #btn-upgrade-investment, #btn-upgrade-trading').forEach(btn => {
        btn?.addEventListener('click', () => upgradeToPro());
    });
    $$('.btn-upgrade-pro').forEach(btn => { btn.addEventListener('click', () => openPricingModal()); });
    $('#close-pricing-modal')?.addEventListener('click', closePricingModal);
    $$('.select-plan-btn').forEach(btn => { btn.addEventListener('click', (e) => { processPlanSelection(e.target.getAttribute('data-plan')); }); });

    $$('.stat-card').forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left; const y = e.clientY - rect.top;
            const centerX = rect.width / 2; const centerY = rect.height / 2;
            const rotateX = (y - centerY) / centerY * -5; const rotateY = (x - centerX) / centerX * 5;
            card.style.transform = `perspective(600px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-3px)`;
        });
        card.addEventListener('mouseleave', () => { card.style.transform = 'perspective(600px) rotateX(0) rotateY(0) translateY(0)'; });
    });

    $('#news-mini-list')?.addEventListener('click', (e) => {
        const item = e.target.closest('.news-mini-item');
        if (item) navigateTo('news');
    });
}

function filterTradingData(filter) {
    const tbody = $('#trading-full-body');
    if (!tbody) return;
    let filtered = state.tradingData;
    if (filter !== 'all') {
        filtered = state.tradingData.filter(t => {
            const action = (t.action || '').toLowerCase(); const market = (t.market || '').toLowerCase();
            return action.includes(filter) || market.includes(filter);
        });
    }
    const isPro = ['basic', 'pro', 'premium', 'trial'].includes(state.subscriptionPlan)
    const isPremium = ['premium', 'trial'].includes(state.subscriptionPlan);
    tbody.innerHTML = filtered.slice(0, state.itemsPerPage).map(t => {
        const actionClass = (t.action || '').toLowerCase().includes('buy') ? 'buy' : 'sell';
        const statusColor = (t.status === 'active') ? 'text-green' : (t.status === 'pending') ? 'text-yellow' : 'text-muted';
        const entryDisplay = isPro ? `$${formatNumber(t.entry_price, 4)}` : '<span class="pro-locked">🔒</span>';
        const tpDisplay = isPro ? `$${formatNumber(t.take_profit, 4)}` : '<span class="pro-locked">🔒</span>';
        const slDisplay = isPro ? `$${formatNumber(t.stop_loss, 4)}` : '<span class="pro-locked">🔒</span>';
        let rows = `
            <tr>
                <td>${escHtml(t.time || '—')}</td>
                <td>${escHtml(t.market)}</td>
                <td><strong>${escHtml(t.asset)}</strong></td>
                <td class="${actionClass} fw-bold">${escHtml(t.action)}</td>
                <td class="text-mono ${!isPro ? 'pro-locked' : ''}">${entryDisplay}</td>
                <td class="text-mono ${!isPro ? 'pro-locked' : ''}">${tpDisplay}</td>
                <td class="text-mono ${!isPro ? 'pro-locked' : ''}">${slDisplay}</td>
                <td class="${statusColor} fw-bold">● ${escHtml(t.status || 'unknown')}</td>
                <td style="font-size:0.78rem;color:${t.timeframe_consensus === '5m+1h+4h ✅' ? '#00d4aa' : 'var(--text-muted)'};">
                    ${escHtml(t.timeframe_consensus || '5m')}
                </td>
                <td><button onclick="openPositionCalc(${t.entry_price}, ${t.stop_loss}, '${escHtml(t.asset)}', '${escHtml(t.action)}')"
                    style="background:rgba(110,120,255,0.15);border:none;color:#6e78ff;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:0.75rem;">
                    ⚖️ Size
                </button></td>
            </tr>
        `;
        if (isPremium && t.explanation) {
            rows += `<tr style="background:rgba(110,120,255,0.05);">
                <td colspan="10" style="padding:8px 16px;font-size:0.82rem;color:var(--text-muted);border-top:none;">
                    <i class="fa-solid fa-robot" style="color:#6e78ff;margin-right:6px;"></i>
                    <em>${escHtml(t.explanation)}</em>
                </td>
            </tr>`;
        }
        return rows;
    }).join('');
}

function filterPortfolioData(filter) {
    const tbody = $('#portfolio-full-body');
    if (!tbody) return;
    let filtered = state.investmentData;
    if (filter !== 'all') {
        filtered = state.investmentData.filter(inv => {
            const strategy = (inv.strategy || '').toLowerCase();
            return strategy.includes(filter);
        });
    }
    const isPro = ['pro', 'premium', 'trial'].includes(state.subscriptionPlan)
    tbody.innerHTML = filtered.slice(0, state.itemsPerPage).map(inv => {
        const perfClass = (inv.performance || '').startsWith('+') ? 'text-green' : 'text-red';
        const riskColor = (inv.risk_level === 'Low') ? 'text-green' : (inv.risk_level === 'Medium') ? 'text-yellow' : 'text-red';
        const perfDisplay = isPro ? escHtml(inv.performance || '0%') : '<span class="pro-locked">🔒</span>';
        const riskDisplay = isPro ? escHtml(inv.risk_level || 'Medium') : '<span class="pro-locked">🔒</span>';
        return `
            <tr>
                <td>${escHtml(inv.date || '—')}</td>
                <td>${escHtml(inv.market)}</td>
                <td><strong>${escHtml(inv.asset)}</strong></td>
                <td>${escHtml(inv.strategy)}</td>
                <td class="text-mono">$${formatNumber(inv.valuation, 2)}</td>
                <td class="${isPro ? perfClass + ' fw-bold' : 'pro-locked'}">${perfDisplay}</td>
                <td class="${isPro ? riskColor + ' fw-bold' : 'pro-locked'}">${riskDisplay}</td>
            </tr>
        `;
    }).join('');
}

function searchData(query) {
    if (!query) { refreshAllData(); return; }
    const filteredTrades = state.tradingData.filter(t => (t.asset || '').toLowerCase().includes(query) || (t.market || '').toLowerCase().includes(query));
    const filteredInvestments = state.investmentData.filter(inv => (inv.asset || '').toLowerCase().includes(query) || (inv.market || '').toLowerCase().includes(query));
    renderTradingTable(filteredTrades, 'trading-table-body', 5);
    renderInvestmentTable(filteredInvestments, 'investment-table-body', 5);
}

// ============================================
// 15. TOAST NOTIFICATIONS
// ============================================
function showToast(type, message) {
    const container = $('#toast-container');
    if (!container) return;
    const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><span>${escHtml(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 3600);
}

// ============================================
// 16. UTILITY FUNCTIONS
// ============================================
function escHtml(str) {
    if (str === null || str === undefined) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(str).replace(/[&<>"']/g, m => map[m]);
}

function formatNumber(num, decimals = 2) {
    if (num === null || num === undefined || isNaN(num)) return '0.00';
    return Number(num).toFixed(decimals);
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

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => { clearTimeout(timeout); func(...args); };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function addNotification(title, type = 'system') {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    state.notifications.unshift({ title, type, time, unread: true });
    if (state.notifications.length > 30) state.notifications.pop();
    localStorage.setItem('sapex_notifications', JSON.stringify(state.notifications));
    renderNotifications();
}

function renderNotifications() {
    const list = document.getElementById('notification-list');
    const badge = document.getElementById('notification-badge');
    if (!list || !badge) return;
    
    const unreadCount = state.notifications.filter(n => n.unread).length;
    if (unreadCount > 0) {
        badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
    
    if (state.notifications.length === 0) {
        list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">No new alerts</div>';
        return;
    }
    
    list.innerHTML = state.notifications.map(n => {
        let iconClass = 'fa-bell'; let bgClass = 'icon-system';
        if (n.type === 'trade') { iconClass = 'fa-bolt'; bgClass = 'icon-trade'; }
        if (n.type === 'news') { iconClass = 'fa-newspaper'; bgClass = 'icon-news'; }
        return `
            <div class="notification-item ${n.unread ? 'unread' : ''}">
                <div class="notification-icon ${bgClass}"><i class="fa-solid ${iconClass}"></i></div>
                <div class="notification-content">
                    <div class="notification-title">${escHtml(n.title)}</div>
                    <div class="notification-time">${n.time}</div>
                </div>
            </div>
        `;
    }).join('');
}

// ✅ UPDATED: The missing NavigateTo function with Bubble Trigger
function navigateTo(pageId) {
    state.currentPage = pageId;
    
    // Update sidebar active states
    document.querySelectorAll('.nav-item').forEach(item => {
        if (item.dataset.page === pageId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    
    // Update visible page content
    document.querySelectorAll('.page-content').forEach(page => {
        if (page.id === 'page-' + pageId) {
            page.classList.add('active');
        } else {
            page.classList.remove('active');
        }
    });
    
    // Update header title dynamically
    const titleEl = document.getElementById('page-title');
    if (titleEl) {
        const titles = {
            'dashboard': 'Dashboard Overview',
            'trading': 'Live Trading',
            'portfolio': 'Investment Portfolio',
            'watchlist': 'My Watchlist',
            'news': 'Market News',
            'digital': 'Digital Assets AI',
            'marketsize': 'Global Market Size AI', // Added this!
            'georisk': 'Geopolitical & Economic Risk AI',
            'predictions': 'Prediction Arena',
            'profile': 'User Profile',
            'settings': 'Terminal Settings'
        };
        titleEl.textContent = titles[pageId] || 'SaPEX_NEXUS';
    }

    // ✅ THE MISSING BUBBLE TRIGGER: Fires physics when the tab opens
    if (pageId === 'marketsize') {
        setTimeout(() => {
            if (typeof initMarketBubbles === 'function') {
                initMarketBubbles('crypto');
                
                // Ensure the Crypto toggle button is visually active by default
                document.querySelectorAll('#bubble-market-toggle .filter-chip').forEach(c => c.classList.remove('active'));
                const cryptoBtn = document.querySelector('#bubble-market-toggle .filter-chip[data-market="crypto"]');
                if (cryptoBtn) cryptoBtn.classList.add('active');
            }
        }, 100);
    }

    if (pageId === 'georisk') {
        if (typeof loadGeoPredictions === 'function') {
            loadGeoPredictions();
        } else if (typeof renderGeoTickets === 'function') {
            renderGeoTickets();
        }
    }

    if (pageId === 'predictions') {
        if (typeof loadPredictionTickets === 'function') {
            loadPredictionTickets();
        }
    }

    // ✅ Re-render chart immediately when user navigates to Dashboard
    if (pageId === 'dashboard') {
        setTimeout(() => {
            if (typeof renderPremiumPerformanceChart === 'function' && supabaseClient) {
                renderPremiumPerformanceChart();
            }
        }, 80); // Small delay so the section is visible before getBoundingClientRect runs
    }
}

function populateProfileForm() {
    const loggedOut = document.getElementById('profile-logged-out');
    const loggedIn  = document.getElementById('profile-logged-in-content');

    // Show login prompt if not signed in
    if (!state.isLoggedIn) {
        if (loggedOut) loggedOut.style.display = 'block';
        if (loggedIn)  loggedIn.style.display  = 'none';
        return;
    }

    // Signed in — show real data
    if (loggedOut) loggedOut.style.display = 'none';
    if (loggedIn)  loggedIn.style.display  = 'block';

    const nameInput = document.getElementById('profile-name');
    const emailInput = document.getElementById('profile-email');
    const expSelect = document.getElementById('profile-experience');
    const riskSelect = document.getElementById('profile-risk');
    const profileDisplayName = document.getElementById('profile-display-name');
    const avatarLarge = document.getElementById('profile-avatar-large');
    const headerUsername = document.getElementById('header-username');

    if (nameInput) nameInput.value = state.userProfile.name || '';
    if (emailInput) emailInput.value = state.userProfile.email || '';
    if (expSelect) expSelect.value = state.userProfile.experience || 'Intermediate (1-3 years)';
    if (riskSelect) riskSelect.value = state.userProfile.risk || 'Moderate';

    const displayName = state.userProfile.name || 'Trader';
    const initials = state.userProfile.initials ||
        displayName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2) || 'TR';

    if (profileDisplayName) profileDisplayName.textContent = displayName;
    if (avatarLarge) avatarLarge.textContent = initials;
    if (headerUsername) headerUsername.textContent = displayName.split(' ')[0];

    const statSignals  = document.getElementById('profile-stat-signals');
    const statWinrate  = document.getElementById('profile-stat-winrate');
    const statPortfolio = document.getElementById('profile-stat-portfolio');
    if (statPortfolio) {
        const val = state.userProfile?.portfolioValue;
        statPortfolio.textContent = val ? `$${Number(val).toLocaleString()}` : '—';
    }
    if (statSignals) statSignals.textContent = state.totalTracked || 0;
    if (statWinrate) statWinrate.textContent = `${(state.realWinRate ?? state.avgConfidence ?? 0)}%`;
}

function applyTheme(theme) {
    const root = document.documentElement;
    root.removeAttribute('data-theme');
    if (theme && theme !== 'dark') root.setAttribute('data-theme', theme);
}

function initSettingsControls() {
    const saved = JSON.parse(localStorage.getItem('sapex_settings') || '{}');
    const els = {
        trade: $('#setting-trade-alerts'), price: $('#setting-price-alerts'),
        news: $('#setting-news-digest'), refresh: $('#setting-refresh-interval'),
        anim: $('#setting-animations'), theme: $('#setting-theme')
    };

    // Restore saved theme immediately on load
    if (saved.theme) { applyTheme(saved.theme); if (els.theme) els.theme.value = saved.theme; }
    if (els.trade) els.trade.checked = saved.trade ?? true;
    if (els.price) els.price.checked = saved.price ?? true;
    if (els.news) els.news.checked = saved.news ?? true;
    if (els.refresh && saved.refresh) els.refresh.value = saved.refresh;
    if (els.anim) els.anim.checked = saved.anim ?? true;

    const persist = () => localStorage.setItem('sapex_settings', JSON.stringify({
        trade: els.trade?.checked, price: els.price?.checked, news: els.news?.checked,
        refresh: els.refresh?.value, anim: els.anim?.checked, theme: els.theme?.value
    }));

    els.trade?.addEventListener('change', persist);
    els.price?.addEventListener('change', persist);
    els.news?.addEventListener('change', persist);
    els.anim?.addEventListener('change', () => {
        document.body.classList.toggle('disable-animations', !els.anim.checked);
        persist();
    });
    els.refresh?.addEventListener('change', () => {
        persist();
        const ms = { '30 seconds': 30000, '1 minute': 60000, '5 minutes': 300000, 'Manual only': 0 }[els.refresh.value] ?? 60000;
        if (syncIntervalId) clearInterval(syncIntervalId);
        if (ms > 0) syncIntervalId = setInterval(async () => { await fetchDashboardData(); }, ms);
        showToast('success', `Auto-refresh set to ${els.refresh.value}.`);
    });
    els.theme?.addEventListener('change', () => {
        applyTheme(els.theme.value);
        persist();
        showToast('success', `Theme changed to ${els.theme.options[els.theme.selectedIndex].text}.`);
    });
}

function openPositionCalc(entry, sl, asset, action, tp) {
    if (!['basic', 'pro','premium','trial'].includes(state.subscriptionPlan)) {
        showToast('info', 'Position Calculator is a Pro feature. Upgrade to access it.');
        return;
    }
    const fmt = (v) => parseFloat(v) < 0.01 ? parseFloat(v).toFixed(6) : parseFloat(v).toFixed(4);
    const isShort = /sell|short/i.test(action || '');
    const ac = isShort ? '#ef4444' : '#00d4aa';
    document.getElementById('calc-signal-info').innerHTML =
        `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <strong style="font-size:0.92rem;">${asset}</strong>
            <span style="font-size:0.75rem;font-weight:700;color:${ac};background:${ac}18;padding:2px 8px;border-radius:6px;">${action}</span>
         </div>
         <div style="display:flex;gap:14px;font-size:0.8rem;color:var(--text-secondary);flex-wrap:wrap;">
             <span>Entry <strong style="color:var(--text-primary);">$${fmt(entry)}</strong></span>
             <span>Stop Loss <strong style="color:#ef4444;">$${fmt(sl)}</strong></span>
             ${tp ? `<span>Take Profit <strong style="color:#00d4aa;">$${fmt(tp)}</strong></span>` : ''}
         </div>`;
    const modal = document.getElementById('position-calc-modal');
    modal.dataset.entry   = entry;
    modal.dataset.sl      = sl;
    modal.dataset.tp      = tp || '';
    modal.dataset.isShort = isShort ? '1' : '0';
    document.getElementById('calc-result').innerHTML = '';
    modal.style.display = 'flex';
}

function setCalcBalance(amount) {
    const input = document.getElementById('calc-balance');
    if (input) { input.value = amount; calculatePosition(); }
    document.querySelectorAll('.calc-preset-btn').forEach(b => {
        const btnVal = parseFloat(b.textContent.replace('$','').replace('K','')) * (b.textContent.includes('K') ? 1000 : 1);
        const active = btnVal === amount;
        b.style.background   = active ? 'rgba(0,212,170,0.12)' : '';
        b.style.borderColor  = active ? 'rgba(0,212,170,0.55)' : '';
        b.style.color        = active ? '#00d4aa' : '';
    });
}

function setCalcRisk(pct, el) {
    const input = document.getElementById('calc-risk');
    if (input) { input.value = pct; }
    document.querySelectorAll('.calc-risk-chip').forEach(c => { c.style.background = 'transparent'; });
    if (el) el.style.background = 'rgba(255,255,255,0.08)';
    calculatePosition();
}

function calculatePosition() {
    const balance  = parseFloat(document.getElementById('calc-balance')?.value) || 0;
    const risk     = parseFloat(document.getElementById('calc-risk')?.value)    || 1;
    const modal    = document.getElementById('position-calc-modal');
    const resultEl = document.getElementById('calc-result');
    const entry    = parseFloat(modal?.dataset.entry);
    const sl       = parseFloat(modal?.dataset.sl);
    const tp       = parseFloat(modal?.dataset.tp) || 0;
    const isShort  = modal?.dataset.isShort === '1';

    // Update risk bar indicator
    const ind = document.getElementById('calc-risk-indicator');
    if (ind) {
        const pos = Math.min(100, (risk / 5) * 100);
        ind.style.left        = `${pos}%`;
        ind.style.borderColor = risk <= 1 ? '#00d4aa' : risk <= 3 ? '#f0b90b' : '#ef4444';
    }

    // No balance yet — guide message
    if (!balance) {
        if (resultEl) resultEl.innerHTML = `
            <div style="background:rgba(240,185,11,0.07);border:1px solid rgba(240,185,11,0.2);border-radius:10px;padding:14px;font-size:0.8rem;color:#f0b90b;text-align:center;">
                <i class="fa-solid fa-arrow-up" style="margin-right:5px;"></i>
                <strong>Pick a balance above</strong> — results appear instantly.
            </div>`;
        return;
    }
    if (!entry || !sl) return;

    const riskAmount    = balance * (risk / 100);
    const slDistance    = Math.abs(entry - sl);
    const positionSize  = riskAmount / slDistance;
    const positionValue = positionSize * entry;
    const slPct         = (slDistance / entry * 100).toFixed(2);
    const fmtUnits      = positionSize >= 1 ? positionSize.toFixed(2) : positionSize.toFixed(6);
    const fmtValue      = positionValue >= 1000 ? `$${(positionValue/1000).toFixed(1)}K` : `$${positionValue.toFixed(2)}`;
    const fmtBal        = balance >= 1000 ? `$${(balance/1000).toFixed(1)}K` : `$${balance}`;
    const rl            = risk <= 1 ? {label:'Safe',c:'#00d4aa'} : risk <= 2 ? {label:'Moderate',c:'#f0b90b'} : risk <= 3 ? {label:'Bold',c:'#f97316'} : {label:'High Risk ⚠️',c:'#ef4444'};

    // Take Profit section
    let tpHtml = '';
    if (tp) {
        const tpDist   = Math.abs(tp - entry);
        const tpProfit = positionSize * tpDist;
        const rr       = (tpDist / slDistance).toFixed(1);
        tpHtml = `
        <div style="background:rgba(0,212,170,0.05);border:1px solid rgba(0,212,170,0.15);border-radius:10px;padding:12px;margin-top:9px;">
            <div style="font-size:0.68rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">🎯 If Take Profit Hits</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;text-align:center;">
                <div><div style="font-size:1.05rem;font-weight:700;color:#00d4aa;">+$${tpProfit.toFixed(2)}</div>
                     <div style="font-size:0.67rem;color:var(--text-muted);">Potential profit</div></div>
                <div><div style="font-size:1.05rem;font-weight:700;color:#a855f7;">${rr}:1</div>
                     <div style="font-size:0.67rem;color:var(--text-muted);">Risk/Reward ratio</div></div>
            </div>
        </div>`;
    }

    // High risk warning
    const warnHtml = risk > 3 ? `
        <div style="background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.2);border-radius:8px;padding:10px 12px;margin-top:8px;font-size:0.76rem;color:#ef4444;line-height:1.5;">
            <i class="fa-solid fa-triangle-exclamation" style="margin-right:5px;"></i>
            <strong>${risk}% risk is very high.</strong> Pro traders cap at 1–2% per trade to protect their account from drawdown.
        </div>` : '';

    if (resultEl) resultEl.innerHTML = `
        <div>
            <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:13px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                    <span style="font-size:0.68rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;">📊 Your Trade Plan</span>
                    <span style="font-size:0.68rem;font-weight:700;padding:2px 8px;border-radius:8px;background:${rl.c}18;color:${rl.c};">${rl.label}</span>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;">
                    <div style="background:rgba(239,68,68,0.06);border-radius:8px;padding:10px;text-align:center;">
                        <div style="font-size:1.05rem;font-weight:700;color:#ef4444;">$${riskAmount.toFixed(2)}</div>
                        <div style="font-size:0.66rem;color:var(--text-muted);margin-top:2px;">Max loss (if SL hit)</div>
                    </div>
                    <div style="background:rgba(0,212,170,0.06);border-radius:8px;padding:10px;text-align:center;">
                        <div style="font-size:1.05rem;font-weight:700;color:#00d4aa;">${fmtUnits}</div>
                        <div style="font-size:0.66rem;color:var(--text-muted);margin-top:2px;">Units to trade</div>
                    </div>
                    <div style="background:rgba(240,185,11,0.06);border-radius:8px;padding:10px;text-align:center;">
                        <div style="font-size:1.05rem;font-weight:700;color:#f0b90b;">${fmtValue}</div>
                        <div style="font-size:0.66rem;color:var(--text-muted);margin-top:2px;">Total position value</div>
                    </div>
                    <div style="background:rgba(239,68,68,0.06);border-radius:8px;padding:10px;text-align:center;">
                        <div style="font-size:1.05rem;font-weight:700;color:#ef4444;">${slPct}%</div>
                        <div style="font-size:0.66rem;color:var(--text-muted);margin-top:2px;">SL distance from entry</div>
                    </div>
                </div>
            </div>
            ${tpHtml}
            <div style="background:rgba(139,92,246,0.06);border:1px solid rgba(139,92,246,0.1);border-radius:8px;padding:10px 12px;margin-top:8px;font-size:0.77rem;color:var(--text-secondary);line-height:1.6;">
                <i class="fa-solid fa-lightbulb" style="color:#a855f7;margin-right:5px;"></i>
                <strong style="color:var(--text-primary);">In plain English:</strong>
                ${isShort ? 'Short-sell' : 'Buy'} <strong>${fmtUnits} units</strong> of this asset.
                If price hits the stop loss, your account loses <strong>$${riskAmount.toFixed(2)}</strong> (${risk}% of your ${fmtBal}).
                ${tp ? `If take profit is reached, you gain proportionally (see above).` : `Add a Take Profit to this signal to see potential profit here.`}
            </div>
            ${warnHtml}
        </div>`;
}

// ============================================
// ADVANCED ECONOMIC CALENDAR
// ============================================
const calState = {
    month: new Date().getMonth(),
    year:  new Date().getFullYear(),
    events: [],
    selectedDate: null,
    _clockId: null,
    _initialized: false
};

async function loadEconomicCalendar() {
    if (!supabaseClient) return;

    // Fetch ALL events ordered by event_date (not limited to 10)
    const { data } = await supabaseClient
        .from('economic_events')
        .select('*')
        .order('event_date', { ascending: true });

    calState.events = data || [];

    if (!calState._initialized) {
        _initCalendarControls();
        _startCalendarClock();
        calState._initialized = true;
    }

    renderCalendarGrid();
}

function _initCalendarControls() {
    const monthSel = document.getElementById('cal-month-sel');
    const yearSel  = document.getElementById('cal-year-sel');
    const prevBtn  = document.getElementById('cal-prev');
    const nextBtn  = document.getElementById('cal-next');
    const todayBtn = document.getElementById('cal-today');
    if (!monthSel || !yearSel) return;

    const MONTHS = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];
    MONTHS.forEach((m, i) => {
        const o = document.createElement('option');
        o.value = i; o.textContent = m;
        if (i === calState.month) o.selected = true;
        monthSel.appendChild(o);
    });

    const now = new Date().getFullYear();
    for (let y = now - 1; y <= now + 2; y++) {
        const o = document.createElement('option');
        o.value = y; o.textContent = y;
        if (y === calState.year) o.selected = true;
        yearSel.appendChild(o);
    }

    monthSel.addEventListener('change', () => {
        calState.month = parseInt(monthSel.value);
        calState.selectedDate = null;
        renderCalendarGrid();
        if (document.getElementById('cal-detail-panel'))
            document.getElementById('cal-detail-panel').style.display = 'none';
    });
    yearSel.addEventListener('change', () => {
        calState.year = parseInt(yearSel.value);
        calState.selectedDate = null;
        renderCalendarGrid();
        if (document.getElementById('cal-detail-panel'))
            document.getElementById('cal-detail-panel').style.display = 'none';
    });

    if (prevBtn) prevBtn.addEventListener('click', () => {
        calState.month--;
        if (calState.month < 0) { calState.month = 11; calState.year--; }
        calState.selectedDate = null;
        _syncCalSelectors();
        renderCalendarGrid();
        if (document.getElementById('cal-detail-panel'))
            document.getElementById('cal-detail-panel').style.display = 'none';
    });
    if (nextBtn) nextBtn.addEventListener('click', () => {
        calState.month++;
        if (calState.month > 11) { calState.month = 0; calState.year++; }
        calState.selectedDate = null;
        _syncCalSelectors();
        renderCalendarGrid();
        if (document.getElementById('cal-detail-panel'))
            document.getElementById('cal-detail-panel').style.display = 'none';
    });
    if (todayBtn) todayBtn.addEventListener('click', () => {
        const n = new Date();
        calState.month = n.getMonth();
        calState.year  = n.getFullYear();
        calState.selectedDate = null;
        _syncCalSelectors();
        renderCalendarGrid();
        if (document.getElementById('cal-detail-panel'))
            document.getElementById('cal-detail-panel').style.display = 'none';
    });
}

function _syncCalSelectors() {
    const ms = document.getElementById('cal-month-sel');
    const ys = document.getElementById('cal-year-sel');
    if (ms) ms.value = calState.month;
    if (ys) ys.value = calState.year;
}

function _startCalendarClock() {
    if (calState._clockId) return;
    calState._clockId = setInterval(() => {
        const el = document.getElementById('cal-live-clock');
        if (el) {
            const n = new Date();
            el.textContent = '🕐 Live: ' + n.toUTCString().replace('GMT', 'UTC');
        }
    }, 1000);
}

function _parseCalDate(raw) {
    if (!raw) return null;
    let d = new Date(raw);
    if (!isNaN(d)) return d;
    const m = raw.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{1,2}):(\d{2})(AM|PM)/i);
    if (m) {
        let h = parseInt(m[4]);
        if (m[6].toUpperCase() === 'PM' && h !== 12) h += 12;
        if (m[6].toUpperCase() === 'AM' && h === 12) h = 0;
        return new Date(parseInt(m[3]), parseInt(m[1])-1, parseInt(m[2]), h, parseInt(m[5]));
    }
    return null;
}

function renderCalendarGrid() {
    const wrap = document.getElementById('cal-grid-wrap');
    if (!wrap) return;

    const today     = new Date();
    const firstDay  = new Date(calState.year, calState.month, 1);
    const totalDays = new Date(calState.year, calState.month + 1, 0).getDate();
    // ISO week: Monday = 0
    const startOffset = (firstDay.getDay() + 6) % 7;

    // Map events to their day number for this month
    const eventsByDay = {};
    calState.events.forEach(ev => {
        const d = _parseCalDate(ev.event_date || ev.created_at);
        if (!d) return;
        if (d.getFullYear() !== calState.year || d.getMonth() !== calState.month) return;
        const day = d.getDate();
        if (!eventsByDay[day]) eventsByDay[day] = [];
        eventsByDay[day].push(ev);
    });

    const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const cellBase = 'border-radius:8px;padding:7px 5px 5px;cursor:pointer;transition:filter 0.15s;min-height:58px;position:relative;';

    let html = `
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:4px;">
        ${DAYS.map(d => `<div style="text-align:center;font-size:0.7rem;color:var(--text-muted);padding:5px 0;font-weight:600;letter-spacing:0.05em;">${d}</div>`).join('')}
    </div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;">`;

    // Pre-month blank cells
    for (let i = 0; i < startOffset; i++) {
        html += `<div style="min-height:58px;"></div>`;
    }

    for (let day = 1; day <= totalDays; day++) {
        const isToday    = today.getDate() === day && today.getMonth() === calState.month && today.getFullYear() === calState.year;
        const isSelected = calState.selectedDate === `${calState.year}-${calState.month}-${day}`;
        const dayEvts    = eventsByDay[day] || [];
        const count      = dayEvts.length;

        const hasBullish = dayEvts.some(e => e.sentiment === 'Bullish');
        const hasBearish = dayEvts.some(e => e.sentiment === 'Bearish');
        const hasNeutral = dayEvts.some(e => !e.sentiment || e.sentiment === 'Neutral');

        let bg, border;
        if (isSelected) {
            bg = 'background:rgba(0,212,170,0.18);';
            border = 'border:1.5px solid var(--accent-green);';
        } else if (isToday) {
            bg = 'background:rgba(59,130,246,0.2);';
            border = 'border:1.5px solid var(--accent-blue);';
        } else {
            bg = 'background:var(--surface-2);';
            border = 'border:1px solid var(--border);';
        }

        const numColor = isToday ? 'color:var(--accent-blue);font-weight:700;'
                       : isSelected ? 'color:var(--accent-green);font-weight:700;'
                       : 'color:var(--text-primary);';

        let dots = '';
        if (count > 0) {
            dots = `<div style="display:flex;gap:2px;justify-content:center;margin-top:4px;flex-wrap:wrap;">`;
            if (hasBullish) dots += `<span style="width:6px;height:6px;border-radius:50%;background:#00d4aa;display:inline-block;" title="Bullish"></span>`;
            if (hasBearish) dots += `<span style="width:6px;height:6px;border-radius:50%;background:#ef4444;display:inline-block;" title="Bearish"></span>`;
            if (hasNeutral) dots += `<span style="width:6px;height:6px;border-radius:50%;background:#f0b90b;display:inline-block;" title="Neutral"></span>`;
            dots += `</div>`;
            if (count > 1) dots += `<div style="font-size:0.6rem;color:var(--text-muted);text-align:center;">${count} events</div>`;
        }

        html += `
        <div onclick="selectCalendarDate(${day})"
             onmouseover="this.style.filter='brightness(1.25)'"
             onmouseout="this.style.filter=''"
             title="${count} event${count !== 1 ? 's' : ''}"
             style="${cellBase}${bg}${border}">
            <div style="font-size:0.83rem;${numColor}">${day}</div>
            ${isToday ? `<div style="font-size:0.55rem;color:var(--accent-blue);font-weight:600;letter-spacing:0.04em;">TODAY</div>` : ''}
            ${dots}
        </div>`;
    }

    html += `</div>`;
    wrap.innerHTML = html;
}

function selectCalendarDate(day) {
    calState.selectedDate = `${calState.year}-${calState.month}-${day}`;
    renderCalendarGrid();
    _showCalDayDetail(day);
}

function _showCalDayDetail(day) {
    const panel = document.getElementById('cal-detail-panel');
    if (!panel) return;

    const dayEvts = calState.events.filter(ev => {
        const d = _parseCalDate(ev.event_date || ev.created_at);
        return d && d.getFullYear() === calState.year && d.getMonth() === calState.month && d.getDate() === day;
    });

    const dateLabel = new Date(calState.year, calState.month, day)
        .toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

    const closeBtn = `<button onclick="closeCalendarDetail()" style="background:rgba(100,116,139,0.15);border:1px solid var(--border);color:var(--text-muted);border-radius:6px;padding:4px 10px;cursor:pointer;font-size:0.78rem;">✕ Close</button>`;

    if (!dayEvts.length) {
        panel.style.display = 'block';
        panel.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <div style="font-size:0.88rem;font-weight:600;color:var(--text-primary);">📅 ${dateLabel}</div>
            ${closeBtn}
        </div>
        <div style="text-align:center;padding:16px 0;color:var(--text-muted);font-size:0.83rem;">
            <i class="fa-solid fa-calendar-xmark" style="font-size:1.4rem;opacity:0.35;display:block;margin-bottom:8px;"></i>
            No economic events on this date. The bot will populate future events automatically.
        </div>`;
        return;
    }

    const rows = dayEvts.map(ev => {
        const d = _parseCalDate(ev.event_date || ev.created_at);
        const timeStr = d ? d.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', hour12:false }) : '—';
        const flag = CCY_FLAG[ev.currency] || '🌐';
        const sentColor = ev.sentiment === 'Bullish' ? '#00d4aa' : ev.sentiment === 'Bearish' ? '#ef4444' : '#f0b90b';
        const sentBg   = ev.sentiment === 'Bullish' ? '0,212,170' : ev.sentiment === 'Bearish' ? '239,68,68' : '240,185,11';
        const impactColor = (ev.impact||'').toLowerCase() === 'high' ? '#ef4444' : (ev.impact||'').toLowerCase() === 'medium' ? '#f0b90b' : '#00d4aa';

        // ✅ CHANGED: detect no-data fallback and render a distinct styled box
        const rawPred = (ev.ai_prediction || '').replace(/\*\*/g,'').replace(/\*/g,'').trim();
        const isNoData = !rawPred || rawPred.toLowerCase().includes('no ai analysis') || rawPred.toLowerCase().includes('check back');
        const predHtml = isNoData
            ? `<div style="font-size:0.78rem;color:var(--text-muted);padding:7px 10px;background:rgba(100,116,139,0.08);border:1px dashed rgba(100,116,139,0.25);border-radius:6px;display:flex;align-items:center;gap:8px;">
                   <i class="fa-solid fa-robot" style="opacity:0.4;flex-shrink:0;"></i>
                   <span style="opacity:0.65;">AI analysis pending — bot updates every 6 hours.</span>
               </div>`
            : `<div style="font-size:0.81rem;color:var(--text-secondary);line-height:1.55;padding-left:8px;border-left:2px solid ${sentColor};">
                   ${escHtml(rawPred)}
               </div>`;

        return `
        <div style="background:var(--surface-2);border:1px solid var(--border);border-left:3px solid ${sentColor};border-radius:8px;padding:12px;margin-bottom:8px;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
                <span style="font-size:1.1rem;">${flag}</span>
                <span style="font-weight:600;color:var(--text-primary);font-size:0.88rem;">${escHtml(ev.event_name)}</span>
                <span style="margin-left:auto;font-size:0.72rem;font-weight:600;padding:2px 8px;border-radius:20px;
                      background:rgba(${sentBg},0.15);color:${sentColor};">${escHtml(ev.sentiment||'Neutral')}</span>
            </div>
            <div style="display:flex;gap:14px;font-size:0.76rem;color:var(--text-muted);margin-bottom:8px;flex-wrap:wrap;">
                <span>🕐 ${timeStr} UTC</span>
                <span>💱 ${escHtml(ev.currency||'—')}</span>
                <span style="color:${impactColor};">⚡ ${escHtml(ev.impact||'Medium')} Impact</span>
            </div>
            ${predHtml}
        </div>`;
    }).join('');

    panel.style.display = 'block';
    panel.innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px;gap:8px;flex-wrap:wrap;">
        <div>
            <div style="font-size:0.9rem;font-weight:600;color:var(--text-primary);">📅 ${dateLabel}</div>
            <div style="font-size:0.73rem;color:var(--text-muted);margin-top:2px;">${dayEvts.length} economic event${dayEvts.length!==1?'s':''} scheduled</div>
        </div>
        ${closeBtn}
    </div>
    ${rows}`;
}

function closeCalendarDetail() {
    const panel = document.getElementById('cal-detail-panel');
    if (panel) panel.style.display = 'none';
    calState.selectedDate = null;
    renderCalendarGrid();
}

async function fetchFearGreedAndTrending() {
    // Fear & Greed
    try {
        const fngRes = await fetch('https://api.alternative.me/fng/?limit=1');
        const fngData = await fngRes.json();
        const val = parseInt(fngData.data[0].value);
        const label = fngData.data[0].value_classification;
        const color = val <= 25 ? '#ef4444' : val <= 45 ? '#f97316' : val <= 55 ? '#f0b90b' : val <= 75 ? '#84cc16' : '#00d4aa';
        const emoji = val <= 25 ? '😱' : val <= 45 ? '😰' : val <= 55 ? '😐' : val <= 75 ? '😊' : '🤑';
        document.getElementById('fng-score').textContent = val;
        document.getElementById('fng-score').style.color = color;
        document.getElementById('fng-label').textContent = label;
        document.getElementById('fng-label').style.color = color;
        document.getElementById('fng-emoji').textContent = emoji;
        document.getElementById('fng-marker').style.left = `${val}%`;
    } catch(e) { console.warn('FNG fetch failed:', e); }

    // Trending Coins
    try {
        const trendRes = await fetch('https://api.coingecko.com/api/v3/search/trending');
        const trendData = await trendRes.json();
        const container = document.getElementById('trending-coins-list');
        if (container && trendData.coins) {
            container.className = 'trending-coins-list';
            container.innerHTML = trendData.coins.slice(0, 8).map(c => `
                <div class="trend-coin-chip">
                    <img src="${c.item.small}" class="trend-coin-icon" alt="${c.item.symbol}" loading="lazy">
                    <span class="trend-coin-symbol">${c.item.symbol.toUpperCase()}</span>
                    <span class="trend-coin-rank">#${c.item.market_cap_rank ?? '—'}</span>
                </div>`).join('');
        }
    } catch(e) { console.warn('Trending fetch failed:', e); }
}

// ============================================================
// ✅ NEW: VISITOR ANALYTICS TRACKING
// ============================================================

// --- Real device/browser/OS detection, parsed live from the visitor's own navigator.userAgent ---
function parseUserAgentDetails() {
    const ua = navigator.userAgent || '';
    let browser = 'Unknown', os = 'Unknown', deviceType = 'desktop';

    if (/Edg\//.test(ua)) browser = 'Edge';
    else if (/OPR\//.test(ua) || /Opera/.test(ua)) browser = 'Opera';
    else if (/Brave\//.test(ua)) browser = 'Brave';
    else if (/Firefox\//.test(ua)) browser = 'Firefox';
    else if (/CriOS\//.test(ua)) browser = 'Chrome (iOS)';
    else if (/Chrome\//.test(ua)) browser = 'Chrome';
    else if (/Safari\//.test(ua) && /Version\//.test(ua)) browser = 'Safari';
    else if (/MSIE|Trident/.test(ua)) browser = 'Internet Explorer';

    if (/Windows NT/.test(ua)) os = 'Windows';
    else if (/Mac OS X/.test(ua) && !/iPhone|iPad|iPod/.test(ua)) os = 'macOS';
    else if (/Android/.test(ua)) os = 'Android';
    else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
    else if (/CrOS/.test(ua)) os = 'ChromeOS';
    else if (/Linux/.test(ua)) os = 'Linux';

    if (/iPad/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) deviceType = 'tablet';
    else if (/Mobi|iPhone|Android.*Mobile/.test(ua)) deviceType = 'mobile';

    return {
        browser, os, deviceType,
        screenResolution: (window.screen && window.screen.width && window.screen.height)
            ? `${window.screen.width}x${window.screen.height}` : null
    };
}

// --- Real IP-based geolocation (the visitor's own browser calls the geo API, so it sees their real IP).
//     Cached once per browser session to avoid repeat lookups and stay well within free-tier limits. ---
async function resolveVisitorGeo() {
    try {
        const cached = sessionStorage.getItem('sapex_geo_cache');
        if (cached) return JSON.parse(cached);
    } catch (e) { /* sessionStorage unavailable — skip cache */ }

    const withTimeout = (promise, ms) => Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('geo timeout')), ms))
    ]);

    let geo = null;

    try {
        const res = await withTimeout(fetch('https://ipapi.co/json/'), 4000);
        if (res.ok) {
            const d = await res.json();
            if (!d.error) {
                geo = { country_code: d.country_code || null, country_name: d.country_name || null, region: d.region || null, city: d.city || null };
            }
        }
    } catch (e) { /* primary geo provider unavailable — try fallback below */ }

    if (!geo) {
        try {
            const res = await withTimeout(fetch('https://ipwho.is/'), 4000);
            if (res.ok) {
                const d = await res.json();
                if (d.success !== false) {
                    geo = { country_code: d.country_code || null, country_name: d.country || null, region: d.region || null, city: d.city || null };
                }
            }
        } catch (e) { /* both geo providers unavailable this session — proceed without geo data */ }
    }

    if (!geo) geo = { country_code: null, country_name: null, region: null, city: null };

    try { sessionStorage.setItem('sapex_geo_cache', JSON.stringify(geo)); } catch (e) { /* non-fatal */ }
    return geo;
}

// --- First-touch UTM capture. Persists for the browser session so every page view in this visit
//     is attributed to the campaign that actually brought the visitor in. ---
function captureUtmParams() {
    const params = new URLSearchParams(window.location.search);
    const fresh = {
        utm_source: params.get('utm_source'),
        utm_medium: params.get('utm_medium'),
        utm_campaign: params.get('utm_campaign'),
        utm_term: params.get('utm_term'),
        utm_content: params.get('utm_content')
    };
    if (Object.values(fresh).some(v => v)) {
        try { sessionStorage.setItem('sapex_utm', JSON.stringify(fresh)); } catch (e) { /* non-fatal */ }
        return fresh;
    }
    try {
        const stored = sessionStorage.getItem('sapex_utm');
        if (stored) return JSON.parse(stored);
    } catch (e) { /* non-fatal */ }
    return { utm_source: null, utm_medium: null, utm_campaign: null, utm_term: null, utm_content: null };
}

// --- Generic event logger. Reused by the auto-instrumented listeners below, and callable
//     directly anywhere in the app for custom goals (e.g. trackEvent(client, 'signup_clicked', 'header_cta')). ---
async function trackEvent(client, eventType, eventLabel, extra = {}) {
    try {
        const visitorId = localStorage.getItem('sapex_visitor_id');
        const sessionId = sessionStorage.getItem('sapex_session_id');
        await client.from('page_events').insert({
            visitor_id: visitorId,
            session_id: sessionId,
            event_type: eventType,
            event_label: eventLabel || null,
            page: window.location.pathname,
            details: extra
        });
    } catch (e) { console.warn('Event tracking failed (non-fatal):', e); }
}

// --- Auto-instrumented event tracking: outbound link clicks, file downloads, and native video plays.
//     Binds once per browser load (guarded against re-binding on repeated init() calls). ---
function initAutoEventTracking(client) {
    if (window.__sapexAutoEventsBound) return;
    window.__sapexAutoEventsBound = true;

    const downloadExtensions = /\.(pdf|csv|xlsx?|docx?|zip|rar|pptx?)$/i;

    document.addEventListener('click', (e) => {
        const link = e.target.closest('a[href]');
        if (!link) return;
        let url;
        try { url = new URL(link.href, window.location.href); } catch (err) { return; }

        if (url.hostname && url.hostname !== window.location.hostname) {
            trackEvent(client, 'outbound_click', url.hostname, { href: url.href });
        } else if (downloadExtensions.test(url.pathname)) {
            trackEvent(client, 'file_download', url.pathname.split('/').pop(), { href: url.href });
        }
    }, true);

    document.addEventListener('play', (e) => {
        if (e.target && e.target.tagName === 'VIDEO') {
            const label = e.target.currentSrc || e.target.src || e.target.id || 'video';
            trackEvent(client, 'video_play', label);
        }
    }, true);
}

// --- Client-side error logging (JS exceptions + unhandled promise rejections), capped per session
//     so a runaway error loop can never flood the table. ---
function initErrorTracking(client) {
    if (window.__sapexErrorTrackingBound) return;
    window.__sapexErrorTrackingBound = true;

    let errorsLoggedThisSession = 0;
    const MAX_ERRORS_PER_SESSION = 10;

    const logError = (payload) => {
        if (errorsLoggedThisSession >= MAX_ERRORS_PER_SESSION) return;
        errorsLoggedThisSession++;
        client.from('client_errors').insert({
            visitor_id: localStorage.getItem('sapex_visitor_id'),
            page: window.location.pathname,
            message: (payload.message || '').slice(0, 500),
            source: payload.source || null,
            lineno: payload.lineno || null,
            colno: payload.colno || null,
            stack: (payload.stack || '').slice(0, 2000),
            user_agent: navigator.userAgent
        }).then(() => {}).catch(() => {});
    };

    window.addEventListener('error', (e) => {
        logError({ message: e.message, source: e.filename, lineno: e.lineno, colno: e.colno, stack: e.error && e.error.stack });
    });

    window.addEventListener('unhandledrejection', (e) => {
        const reason = e.reason;
        logError({ message: (reason && reason.message) || String(reason), stack: reason && reason.stack });
    });
}

// --- Real page load timing via the Navigation Timing API, attached to this page view once the
//     page has actually finished loading (not estimated, not hardcoded). ---
function capturePageLoadTime(client, pageViewId) {
    const finish = () => {
        try {
            const nav = performance.getEntriesByType('navigation')[0];
            const loadTimeMs = nav ? Math.round(nav.loadEventEnd - nav.startTime) : null;
            if (loadTimeMs && pageViewId) {
                client.from('page_views').update({ load_time_ms: loadTimeMs }).eq('id', pageViewId).then(() => {}).catch(() => {});
            }
        } catch (e) { /* Navigation Timing API unavailable — skip, non-fatal */ }
    };
    if (document.readyState === 'complete') {
        setTimeout(finish, 0);
    } else {
        window.addEventListener('load', () => setTimeout(finish, 0));
    }
}

// --- UUID generator with fallback for non-secure (non-HTTPS) contexts, where
//     crypto.randomUUID() doesn't exist and would otherwise silently kill tracking. ---
function generateUUID() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
}

async function trackPageView(client) {
    try {
        let visitorId = localStorage.getItem('sapex_visitor_id');
        if (!visitorId) {
            visitorId = generateUUID();
            localStorage.setItem('sapex_visitor_id', visitorId);
        }

        // One session_id per browser session (tab lifetime) — powers bounce-rate / session-duration
        // and lets every page view in this visit be grouped together correctly.
        let sessionId = sessionStorage.getItem('sapex_session_id');
        let sessionStartedAt = sessionStorage.getItem('sapex_session_started_at');
        if (!sessionId) {
            sessionId = generateUUID();
            sessionStartedAt = new Date().toISOString();
            sessionStorage.setItem('sapex_session_id', sessionId);
            sessionStorage.setItem('sapex_session_started_at', sessionStartedAt);
        }

        const utm = captureUtmParams();
        const ua = parseUserAgentDetails();
        const geo = await resolveVisitorGeo();

        // One-time log for this page load — feeds Views Today/Week/Month/All-Time, plus every
        // new geo/device/channel/UTM breakdown in the admin panel.
        const { data: inserted, error: pvError } = await client.from('page_views').insert({
            page: window.location.pathname,
            referrer: document.referrer || null,
            visitor_id: visitorId,
            session_id: sessionId,
            utm_source: utm.utm_source,
            utm_medium: utm.utm_medium,
            utm_campaign: utm.utm_campaign,
            utm_term: utm.utm_term,
            utm_content: utm.utm_content,
            country_code: geo.country_code,
            country_name: geo.country_name,
            region: geo.region,
            city: geo.city,
            device_type: ua.deviceType,
            browser: ua.browser,
            os: ua.os,
            screen_resolution: ua.screenResolution
        }).select('id').single();
        if (pvError) console.error('❌ [tracking] page_views insert failed:', pvError.message);

        capturePageLoadTime(client, inserted && inserted.id);

        // Permanent session record (one row per session_id, never overwritten by other sessions)
        // — this is what bounce-rate and average session duration are computed from.
        const { error: sessError } = await client.from('sessions').upsert({
            session_id: sessionId,
            visitor_id: visitorId,
            started_at: sessionStartedAt,
            ended_at: new Date().toISOString(),
            entry_page: window.location.pathname,
            country_code: geo.country_code,
            country_name: geo.country_name,
            city: geo.city,
            device_type: ua.deviceType,
            browser: ua.browser,
            os: ua.os
        }, { onConflict: 'session_id', ignoreDuplicates: false });
        if (sessError) console.error('❌ [tracking] sessions upsert failed:', sessError.message);

        // Live presence heartbeat — feeds "online now" count + the live visitor detail list
        const heartbeat = {
            visitor_id: visitorId,
            session_id: sessionId,
            last_seen: new Date().toISOString(),
            first_seen: sessionStartedAt,
            current_page: window.location.pathname,
            country_code: geo.country_code,
            country_name: geo.country_name,
            city: geo.city,
            device_type: ua.deviceType,
            browser: ua.browser,
            os: ua.os
        };
        const { error: liveError } = await client.from('live_sessions').upsert(heartbeat, { onConflict: 'visitor_id' });
        if (liveError) console.error('❌ [tracking] live_sessions upsert failed:', liveError.message);

        // Refresh the live presence row + extend the session record every 60s while the tab stays open
        setInterval(async () => {
            try {
                const now = new Date().toISOString();
                await client.from('live_sessions').upsert({
                    visitor_id: visitorId,
                    session_id: sessionId,
                    last_seen: now,
                    first_seen: sessionStartedAt,
                    current_page: window.location.pathname
                }, { onConflict: 'visitor_id' });
                await client.from('sessions').upsert({
                    session_id: sessionId,
                    visitor_id: visitorId,
                    started_at: sessionStartedAt,
                    ended_at: now
                }, { onConflict: 'session_id', ignoreDuplicates: false });
            } catch (e) { /* non-fatal */ }
        }, 60000);

        initAutoEventTracking(client);
        initErrorTracking(client);

    } catch (e) {
        console.warn('Analytics tracking failed (non-fatal):', e);
    }
}

function maybeShowAnnouncementModal() {
    const pricingOpen = document.getElementById('pricing-modal')?.style.display === 'flex';
    const termsOpen    = document.getElementById('terms-modal')?.style.display === 'flex';
    const cancelOpen   = document.getElementById('cancel-sub-modal')?.style.display === 'flex';
    if (pricingOpen || termsOpen || cancelOpen) return; // don't interrupt the user
    showAnnouncementModal();
}

// ============================================
// 17. INITIALIZATION – OPTIMIZED (WITH BOOT SCREEN)
// ============================================
async function init() {
    console.log('🎬 Initializing SaPEX_NEXUS Terminal Application...');
    const loader = document.getElementById('global-loader');
    const progress = document.getElementById('loader-progress');
    const loaderText = document.getElementById('loader-text');

    if (progress) progress.style.width = '20%';

    loadLocalData();
    initNavigation();
    updateUIBasedOnAuth();

    if (loaderText) loaderText.textContent = 'Connecting to Cloud Core...';
    const client = initSupabase();
    if (client) {
        const { data: { session } } = await client.auth.getSession();
        handleAuthChange(session);
        client.auth.onAuthStateChange((event, session) => handleAuthChange(session));

        // ✅ FIX #1: trackPageView() was fully built but never called — this line
        // is the entire fix for Analytics/Traffic/Performance showing empty.
        trackPageView(client);
        // ✅ FIX #4: paint any active ad slots into their [data-ad-slot] containers
        renderAdSlots(client);
        // ✅ FIX #5: pull the admin-controlled announcement before the modal can show it
        await loadAnnouncementSlides(client);
    }

    // ✅ NEW: Public bot activity indicator
    checkPublicBotStatus();
    setInterval(checkPublicBotStatus, 30000);
    checkMaintenanceMode();
    setInterval(checkMaintenanceMode, 30000);

    if (typeof renderNotifications === 'function') renderNotifications();
    populateProfileForm();
    initSettingsControls();

    const headerAvatar = $('#header-avatar');
    const headerUsername = $('#header-username');
    if (headerAvatar && !state.isLoggedIn) headerAvatar.textContent = getUserInitials();
    if (headerUsername && !state.isLoggedIn) headerUsername.textContent = state.userProfile.name.split(' ')[0];

    refreshAllData(); 
    navigateTo('dashboard');

    if (progress) progress.style.width = '50%';
    if (loaderText) loaderText.textContent = 'Syncing Live Market Data...';

    const safeRun = (promise) => promise.catch(e => console.warn('⚠️ Init task failed (non-fatal):', e));

    const dashboardPromise = safeRun(fetchDashboardData().then(() => refreshAllData()));
    const tickerPromise = safeRun(initTicker());

    if (progress) progress.style.width = '75%';

    // Hard 10-second ceiling — loader ALWAYS disappears no matter what
    await Promise.race([
        Promise.all([
            dashboardPromise,
            tickerPromise,
            new Promise(resolve => setTimeout(resolve, 1500))
        ]),
        new Promise(resolve => setTimeout(resolve, 10000))
    ]);

    if (progress) progress.style.width = '100%';
    if (loaderText) loaderText.textContent = 'Terminal Armed and Ready.';

    setTimeout(() => {
        if (loader) {
            loader.style.opacity = '0';
            setTimeout(() => {
                loader.style.display = 'none';
                if (!localStorage.getItem(TOUR_STORAGE_KEY)) {
                    startOnboardingTour(); // 🎓 first-ever visit — walk them through it instead of the ad
                } else {
                    maybeShowAnnouncementModal(); // 🔧 fires right when the terminal becomes visible
                }
            }, 500);
        }
    }, 400);

    setTimeout(() => {
        initParticleCanvas();
        initLiveClock();
    }, 1000);

    if (typeof startBackgroundSync === 'function') {
        startBackgroundSync(); 
    }
    
    // ✅ ADD THIS TO START THE LIVE LISTENER
    if (typeof subscribeToDigitalAssets === 'function') {
        subscribeToDigitalAssets();
    }
    if (typeof subscribeToGeoPredictions === 'function') {
        subscribeToGeoPredictions();
    }
    if (typeof subscribeToCovertPredictions === 'function') {
        subscribeToCovertPredictions();
    }
    if (typeof subscribeToPredictionTickets === 'function') {
        subscribeToPredictionTickets();
    }
    if (typeof subscribeToPredictionReactions === 'function') {
        subscribeToPredictionReactions();
    }
    fetchFearGreedAndTrending();
    setInterval(fetchFearGreedAndTrending, 300000);
    loadEconomicCalendar();
    initRatingWidget();

    console.log('🚀 SaPEX_NEXUS Terminal v2.0 fully synchronized and monitoring live streams.');
}

async function checkPublicBotStatus() {
    if (!supabaseClient) return;
    const { data } = await supabaseClient.from('bot_heartbeat').select('*').eq('id', 1).maybeSingle();
    const dot = document.getElementById('site-bot-status-dot');
    const text = document.getElementById('site-bot-status-text');
    const pill = document.getElementById('site-bot-status-pill');
    if (!dot || !text || !pill) return;

    if (!data || !data.last_ping) { text.textContent = 'Bot status unavailable'; return; }

    const minsAgo = Math.round((Date.now() - new Date(data.last_ping).getTime()) / 60000);
    if (minsAgo <= 20) {
        pill.style.background = 'rgba(16,185,129,0.1)'; pill.style.color = '#10b981'; pill.style.borderColor = 'rgba(16,185,129,0.25)';
        dot.style.background = '#10b981';
        text.textContent = `Bot Active · Last sync ${minsAgo}m ago`;
    } else {
        pill.style.background = 'rgba(239,68,68,0.1)'; pill.style.color = '#ef4444'; pill.style.borderColor = 'rgba(239,68,68,0.25)';
        dot.style.background = '#ef4444';
        text.textContent = `Bot Offline · Last seen ${minsAgo}m ago`;
    }
}

async function checkMaintenanceMode() {
    if (!supabaseClient) return;
    const badge = document.getElementById('site-maintenance-badge');
    if (!badge) return;
    const { data } = await supabaseClient.from('site_settings').select('value').eq('key', 'maintenance_mode').maybeSingle();
    badge.style.display = data?.value?.is_active ? 'inline-flex' : 'none';
}

// ============================================
// RATING SYSTEM
// ============================================
async function initRatingWidget() {
    await loadAggregateRating();
    const stars = document.querySelectorAll('.rating-star-btn');
    if (!state.isLoggedIn) {
        document.getElementById('rating-login-hint').style.display = 'block';
    } else {
        document.getElementById('rating-input-area').style.display = 'flex';
        document.getElementById('rating-login-hint').style.display = 'none';
        // Load user's existing rating
        if (supabaseClient) {
            const { data: { user } } = await supabaseClient.auth.getUser();
            if (user) {
                const { data } = await supabaseClient.from('ratings').select('rating').eq('user_id', user.id).maybeSingle();
                if (data) highlightStars(data.rating);
            }
        }
    }
    stars.forEach(star => {
        star.addEventListener('mouseover', () => highlightStars(parseInt(star.dataset.value), true));
        star.addEventListener('mouseout', () => highlightStars(0, true));
        star.addEventListener('click', () => submitRating(parseInt(star.dataset.value)));
    });
}

function highlightStars(value, hoverOnly = false) {
    document.querySelectorAll('.rating-star-btn').forEach(s => {
        const v = parseInt(s.dataset.value);
        s.className = 'fa-solid fa-star rating-star-btn ' + (v <= value ? (hoverOnly ? 'hovered' : 'selected') : '');
        if (!hoverOnly && v <= value) s.classList.add('selected');
    });
}

async function submitRating(value) {
    if (!supabaseClient || !state.isLoggedIn) return;
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;
    await supabaseClient.from('ratings').upsert({ user_id: user.id, rating: value }, { onConflict: 'user_id' });
    highlightStars(value);
    showToast('success', `Thanks for rating SaPEX_NEXUS ${value}/5 ⭐`);
    await loadAggregateRating();
}

async function loadAggregateRating() {
    if (!supabaseClient) return;
    const { data } = await supabaseClient.from('ratings').select('rating');
    if (!data || data.length === 0) return;
    const count = data.length;
    const avg = (data.reduce((s, r) => s + r.rating, 0) / count).toFixed(1);
    document.getElementById('rating-avg-display').textContent = avg;
    document.getElementById('rating-count-display').textContent = `${count} rating${count > 1 ? 's' : ''}`;
    // Render star display
    const full = Math.floor(avg); const half = avg - full >= 0.25 && avg - full < 0.75;
    let stars = '';
    for (let i = 1; i <= 5; i++) {
        if (i <= full) stars += '<i class="fa-solid fa-star"></i>';
        else if (i === full + 1 && half) stars += '<i class="fa-solid fa-star-half-stroke"></i>';
        else stars += '<i class="fa-regular fa-star"></i>';
    }
    document.getElementById('rating-stars-display').innerHTML = stars;
    // Update JSON-LD schema dynamically for Google
    const schema = document.querySelector('script[type="application/ld+json"]:last-of-type');
    if (schema) {
        try {
            const obj = JSON.parse(schema.textContent);
            if (obj['@type'] === 'FAQPage') return;
        } catch(e) {}
    }
    document.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
        try {
            const obj = JSON.parse(s.textContent);
            if (obj['@type'] === 'WebApplication') {
                obj.aggregateRating = { '@type': 'AggregateRating', ratingValue: avg, ratingCount: count, bestRating: 5, worstRating: 1 };
                s.textContent = JSON.stringify(obj);
            }
        } catch(e) {}
    });
}

document.addEventListener('DOMContentLoaded', () => {
    init().catch(e => {
        console.error('❌ Fatal init error:', e);
        const loader = document.getElementById('global-loader');
        if (loader) {
            loader.style.opacity = '0';
            setTimeout(() => loader.style.display = 'none', 500);
        }
    });
});

// ============================================
// SILENT BACKGROUND SYNC ENGINE & TICKER
// ============================================
let syncCountdown = 300;
let syncIntervalId = null;
let countdownTimerId = null; 

function startBackgroundSync() {
    if (countdownTimerId) clearInterval(countdownTimerId);
    if (syncIntervalId) clearInterval(syncIntervalId);

    const SYNC_SECONDS = 300; // ✅ Matches bot cycle (5 minutes)

    // Set initial display
    syncCountdown = SYNC_SECONDS;
    const initEl = document.getElementById('stat-update');
    if (initEl) initEl.innerHTML = `${SYNC_SECONDS}<span class="stat-percent">s</span>`;

    // Tick down the visual counter every second
    countdownTimerId = setInterval(() => {
        const el = document.getElementById('stat-update');
        if (!el) return;
        syncCountdown = Math.max(0, syncCountdown - 1);
        el.innerHTML = syncCountdown > 0
            ? `${syncCountdown}<span class="stat-percent">s</span>`
            : `<span class="stat-percent" style="font-size:0.75rem;">Syncing...</span>`;
    }, 1000);

    // Fetch fresh data every 5 minutes
    syncIntervalId = setInterval(async () => {
        console.log('🔄 Background Sync: Fetching Fresh Cloud Data...');
        syncCountdown = SYNC_SECONDS; // Reset countdown
        await fetchDashboardData();
    }, SYNC_SECONDS * 1000); // 300,000ms = 5 min
}

// ============================================
// MARKET BUBBLE MAP (RESPONSIVE KINETIC ENGINE)
// ============================================
let bubbleSimulation = null;

async function initMarketBubbles(marketType = 'crypto') {
    const container = document.getElementById('bubble-container');
    const tooltip = document.getElementById('bubble-tooltip');
    if (!container || typeof d3 === 'undefined') return;

    if (bubbleSimulation) bubbleSimulation.stop();
    container.innerHTML = '';
    const width = container.clientWidth;
    const height = container.clientHeight || 600; 

    // ✅ DETECT MOBILE SCREENS
    const isMobile = width < 768;

   // Fetch live data from Supabase
    let data = [];
    try {
        const { data: rows } = await supabaseClient
            .from('market_overview')
            .select('*')
            .eq('market', marketType);
        if (rows && rows.length > 0) {
            data = rows.map(r => ({
                id: r.symbol, name: r.name,
                val: Math.abs(r.market_cap_b) || 1,
                change: r.change_24h || 0
            }));
        }
    } catch(e) { console.warn('Bubble data fetch failed:', e); }

    if (!data.length) {
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:200px;color:var(--text-muted)">Market data loading — bot pipeline running...</div>';
        return;
    }

    // ✅ DYNAMIC SCALING: Shrink max size significantly on mobile so they fit
    const minRadius = isMobile ? 18 : 30;
    const maxRadius = isMobile ? 45 : 95;
    const maxVal = d3.max(data, d => Math.abs(d.change) + (d.val * 0.1)); 
    const radiusScale = d3.scaleSqrt().domain([0, maxVal]).range([minRadius, maxRadius]);

    const svg = d3.select('#bubble-container').append('svg')
        .attr('width', width)
        .attr('height', height);

    const defs = svg.append("defs");
    const filterGreen = defs.append("filter").attr("id", "glow-green");
    filterGreen.append("feGaussianBlur").attr("stdDeviation", "8").attr("result", "coloredBlur");
    const feMergeGreen = filterGreen.append("feMerge");
    feMergeGreen.append("feMergeNode").attr("in", "coloredBlur");
    feMergeGreen.append("feMergeNode").attr("in", "SourceGraphic");

    const filterRed = defs.append("filter").attr("id", "glow-red");
    filterRed.append("feGaussianBlur").attr("stdDeviation", "8").attr("result", "coloredBlur");
    const feMergeRed = filterRed.append("feMerge");
    feMergeRed.append("feMergeNode").attr("in", "coloredBlur");
    feMergeRed.append("feMergeNode").attr("in", "SourceGraphic");

    bubbleSimulation = d3.forceSimulation(data)
        .force('charge', d3.forceManyBody().strength(isMobile ? -15 : -30)) 
        .force('collide', d3.forceCollide().radius(d => radiusScale(d.val) + 3).iterations(12).strength(1)) 
        .force('center', d3.forceCenter(width / 2, height / 2).strength(0.01)) 
        // Slightly stronger X/Y gravity on mobile to keep them centered
        .force('x', d3.forceX(width / 2).strength(isMobile ? 0.03 : 0.015))
        .force('y', d3.forceY(height / 2).strength(isMobile ? 0.03 : 0.015));

    const node = svg.selectAll('.bubble-node')
        .data(data)
        .enter().append('g')
        .attr('class', 'bubble-node')
        .call(d3.drag()
            .on('start', dragstarted)
            .on('drag', dragged)
            .on('end', dragended));

    node.append('circle')
        .attr('r', d => radiusScale(d.val))
        .style('fill', '#111822') 
        .style('stroke', d => d.change >= 0 ? '#10b981' : '#ef4444') 
        .style('stroke-width', isMobile ? 2 : 4) 
        .style('filter', d => d.change >= 0 ? 'url(#glow-green)' : 'url(#glow-red)'); 

    // ✅ DYNAMIC FONT SIZING FOR MOBILE
    node.append('text')
        .attr('class', 'bubble-symbol')
        .attr('dy', '-0.1em') 
        .text(d => d.id)
        .style('font-size', d => Math.min(isMobile ? 0.9 : 1.4, radiusScale(d.val) / (isMobile ? 20 : 25)) + 'rem');

    node.append('text')
        .attr('class', 'bubble-change')
        .attr('dy', '1.1em') 
        .text(d => (d.change > 0 ? '+' : '') + d.change + '%')
        .style('fill', d => d.change >= 0 ? '#10b981' : '#ef4444') 
        .style('font-size', d => Math.min(isMobile ? 0.7 : 1.1, radiusScale(d.val) / (isMobile ? 25 : 30)) + 'rem');

    node.on('mouseover', (event, d) => {
        tooltip.style.opacity = 1;
        tooltip.innerHTML = `
            <h4>${d.name} (${d.id})</h4>
            <div class="stat">24h Change: <span style="color: ${d.change >= 0 ? '#10b981' : '#ef4444'}">${(d.change > 0 ? '+' : '')}${d.change}%</span></div>
            <div class="stat">Market Cap: <span>$${d.val} Billion</span></div>
        `;
    }).on('mousemove', (event) => {
        const containerRect = container.getBoundingClientRect();
        tooltip.style.left = (event.clientX - containerRect.left + 15) + 'px';
        tooltip.style.top = (event.clientY - containerRect.top + 15) + 'px';
    }).on('mouseout', () => {
        tooltip.style.opacity = 0;
    });

    bubbleSimulation.on('tick', () => {
        node.attr('transform', d => {
            d.vx += (Math.random() - 0.5) * 0.3;
            d.vy += (Math.random() - 0.5) * 0.3;

            const r = radiusScale(d.val);
            if (d.x < r) { d.x = r; d.vx *= -0.5; }
            if (d.x > width - r) { d.x = width - r; d.vx *= -0.5; }
            if (d.y < r) { d.y = r; d.vy *= -0.5; }
            if (d.y > height - r) { d.y = height - r; d.vy *= -0.5; }

            return `translate(${d.x},${d.y})`;
        });
    });

    bubbleSimulation.alphaTarget(0.1).restart();

    function dragstarted(event, d) {
        if (!event.active) bubbleSimulation.alphaTarget(0.3).restart();
        d.fx = d.x; d.fy = d.y;
    }
    function dragged(event, d) {
        d.fx = event.x; d.fy = event.y;
    }
    function dragended(event, d) {
        if (!event.active) bubbleSimulation.alphaTarget(0.1); 
        d.fx = null; d.fy = null;
    }
}

// Add to your global state variables at the top of app.js
let performanceChartInstance = null;

// Call this function inside your initialization block or refreshAllData routine
async function renderPremiumPerformanceChart() {
    const canvas = document.getElementById('premiumPerformanceChart');
    if (!canvas || !supabaseClient) return;

    // 1. Attempt to download real performance history metrics from Supabase
    const { data: metrics, error } = await supabaseClient
        .from('performance_history')
        .select('*')
        .order('created_at', { ascending: true });

    let winRates = [];
    
    // Check if we have valid live database rows to display
    if (!error && metrics && metrics.length >= 2) {
        const displayMetrics = metrics.slice(-50);
        winRates = displayMetrics.map(item => parseFloat(item.win_rate));
    } else {
        const badge = document.getElementById('win-rate-badge');
        if (badge) badge.innerText = 'Awaiting first validation cycle...';
        if (canvas) canvas.style.display = 'none';
        const msg = document.createElement('div');
        msg.style.cssText = 'text-align:center;padding:40px;color:var(--text-muted);font-size:0.85rem;';
        msg.textContent = 'Win rate chart will appear after the bot completes its first validation cycle.';
        canvas.parentNode.insertBefore(msg, canvas);
        return;
    }

    // Update real-time accuracy text badge header 
    const currentWinRate = winRates[winRates.length - 1];
    const badge = document.getElementById('win-rate-badge');
    if (badge) badge.innerText = `${currentWinRate.toFixed(2)}% Accuracy`;
    state.realWinRate = currentWinRate;
    if (typeof populateProfileForm === 'function') populateProfileForm();

    // Populate the Accuracy / Correct / Wrong stat tiles from the latest real snapshot
    const latestSnapshot = metrics[metrics.length - 1];
    const totalPredictions = Number(latestSnapshot.total_predictions) || 0;
    const wins = Number(latestSnapshot.wins) || 0;
    const losses = totalPredictions - wins;
    const rateEl = document.getElementById('accuracy-stat-rate');
    const winsEl = document.getElementById('accuracy-stat-wins');
    const lossEl = document.getElementById('accuracy-stat-losses');
    if (rateEl) rateEl.textContent = `${currentWinRate.toFixed(1)}%`;
    if (winsEl) winsEl.textContent = wins;
    if (lossEl) lossEl.textContent = losses;

    // 2. Render Native HTML5 Canvas Smooth Line Grid
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    if (rect.width === 0 || rect.height === 0) return;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const padding = 40;

    ctx.clearRect(0, 0, width, height);

    const minX = padding;
    const maxX = width - padding;
    const minY = height - padding;
    const maxY = padding;

    ctx.strokeStyle = '#1e2a3a';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = minY - (i * (minY - maxY) / 4);
        ctx.beginPath();
        ctx.moveTo(minX, y);
        ctx.lineTo(maxX, y);
        ctx.stroke();

        ctx.fillStyle = '#64748b';
        ctx.font = '11px monospace';
        ctx.fillText(`${(i * 25)}%`, 5, y + 3);
    }

    const points = winRates.map((val, idx) => {
        const x = minX + (idx * (maxX - minX) / (winRates.length - 1));
        const y = minY - (val * (minY - maxY) / 100);
        return { x, y };
    });

    // Draws a smoothed curve through every point instead of straight jagged segments
    function tracePath(path) {
        path.moveTo(points[0].x, points[0].y);
        for (let i = 0; i < points.length - 1; i++) {
            const xc = (points[i].x + points[i + 1].x) / 2;
            const yc = (points[i].y + points[i + 1].y) / 2;
            path.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
        }
        path.lineTo(points[points.length - 1].x, points[points.length - 1].y);
    }

    const fillGradient = ctx.createLinearGradient(0, maxY, 0, minY);
    fillGradient.addColorStop(0, 'rgba(139, 92, 246, 0.25)'); 
    fillGradient.addColorStop(1, 'rgba(139, 92, 246, 0.0)');

    ctx.beginPath();
    ctx.moveTo(points[0].x, minY);
    tracePath(ctx);
    ctx.lineTo(points[points.length - 1].x, minY);
    ctx.closePath();
    ctx.fillStyle = fillGradient;
    ctx.fill();

    ctx.beginPath();
    tracePath(ctx);
    ctx.strokeStyle = '#8b5cf6'; 
    ctx.lineWidth = 3;
    ctx.shadowColor = 'rgba(139, 92, 246, 0.5)';
    ctx.shadowBlur = 10;
    ctx.stroke();
    
    ctx.shadowBlur = 0;

    // Mark every snapshot point so the trend is readable, highlight the latest one
    points.forEach((p, idx) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, idx === points.length - 1 ? 5 : 2.5, 0, 2 * Math.PI);
        ctx.fillStyle = idx === points.length - 1 ? '#ec4899' : '#8b5cf6';
        ctx.fill();
    });
}

// ✅ FIX: Removed duplicate DOMContentLoaded. renderPremiumPerformanceChart()
// is now called inside refreshAllData() after data loads (see Step 13 below).

// =====================================================================
// SUBSCRIPTION & PAYMENT CHECKER
// =====================================================================

// 1. Checks if the user just came back from a successful Lemon Squeezy payment
async function handlePaymentSuccessRedirect() {
    const urlParams = new URLSearchParams(window.location.search);

    // Handle cancelled payment
    if (urlParams.get('session') === 'cancelled') {
        window.history.replaceState({}, document.title, window.location.pathname);
        showToast('info', 'Payment cancelled — you can try again anytime.');
        return true;
    }

    if (urlParams.get('session') !== 'success') return false;

    // Verify nonce so nobody can trigger this by typing the URL manually
    const urlNonce   = urlParams.get('nonce');
    const savedNonce = sessionStorage.getItem('sapex_payment_nonce');
    sessionStorage.removeItem('sapex_payment_nonce');

    if (!urlNonce || urlNonce !== savedNonce) {
        window.history.replaceState({}, document.title, window.location.pathname);
        console.warn('⚠️ Blocked spoofed ?session=success — nonce mismatch.');
        return false;
    }

    window.history.replaceState({}, document.title, window.location.pathname);
    localStorage.removeItem('sapex_pending_plan');
    showToast('success', '✅ Payment received! Activating your plan...');

    // The NOWPayments IPN fires server-to-server and writes the plan to the DB.
    // We poll until the plan updates (usually within 5-30s depending on crypto network).
    let attempts = 0;
    const poll = setInterval(async () => {
        attempts++;
        if (typeof loadUserSubscription === 'function') await loadUserSubscription();

        if (state.subscriptionPlan && !['free', 'trial'].includes(state.subscriptionPlan)) {
            clearInterval(poll);
            showToast('success', `🎉 ${state.subscriptionPlan.toUpperCase()} plan is now active!`);
            return;
        }
        if (attempts >= 20) {
            clearInterval(poll);
            showToast('warning',
                '⏳ Payment processing — your plan will activate within a few minutes. ' +
                'If it doesn\'t, email support@sapexnexus.com with your transaction ID.');
        }
    }, 1500);

    return true;
}

// 2. Checks the database every time the page loads to see if they are Premium
async function loadUserSubscription() {
    if (!supabaseClient || !state.isLoggedIn) return;

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return;

        const { data: profile, error } = await supabaseClient
            .from('profiles')
            .select('plan_tier, subscription_expiry, cancel_at_period_end') // ✅ NEW FIELD
            .eq('id', user.id)
            .single();

        if (!error && profile && profile.plan_tier && profile.plan_tier !== 'free') {
            const now = new Date();
            const expiry = new Date(profile.subscription_expiry);

            if (now > expiry) {
                console.log("ℹ️ Subscription expired. Downgrading to Free Tier.");
                await supabaseClient.from('profiles')
                    .update({ plan_tier: 'free', cancel_at_period_end: false })
                    .eq('id', user.id);
                state.subscriptionPlan  = 'free';
                state.subscriptionExpiry = null;        // ✅ NEW
                state.cancelAtPeriodEnd  = false;       // ✅ NEW
            } else {
                console.log(`✅ Subscription Active. Expires: ${expiry.toLocaleDateString()}`);
                state.subscriptionPlan   = profile.plan_tier;
                state.subscriptionExpiry = profile.subscription_expiry; // ✅ NEW
                state.cancelAtPeriodEnd  = profile.cancel_at_period_end || false; // ✅ NEW
            }
        } else {
            state.subscriptionPlan  = 'free';
            state.subscriptionExpiry = null;            // ✅ NEW
            state.cancelAtPeriodEnd  = false;           // ✅ NEW
        }

        saveAuthState();
        updateUIBasedOnAuth();
        if (typeof updateSettingsSubscriptionCard === 'function') // ✅ NEW
            updateSettingsSubscriptionCard();

    } catch (err) {
        console.log("ℹ️ No profile found. Forcing Free Tier.");
        state.subscriptionPlan  = 'free';
        state.subscriptionExpiry = null;                // ✅ NEW
        state.cancelAtPeriodEnd  = false;               // ✅ NEW
        saveAuthState();
        updateUIBasedOnAuth();
        if (typeof updateSettingsSubscriptionCard === 'function') // ✅ NEW
            updateSettingsSubscriptionCard();
    }
}

// 3. Removes the black lock screens
function applyPremiumUILayout(tierName) {
    console.log(`👑 Unlocking ${tierName.toUpperCase()} features...`);
    
    // Find all the lock screen overlays and hide them
    document.querySelectorAll('.premium-card-overlay, .upgrade-overlay, .trading-upgrade-footer').forEach(block => {
        block.style.display = 'none'; 
        block.style.opacity = '0';
        block.style.pointerEvents = 'none';
    });
    
    // Hide the sidebar upgrade button
    const sidebarUpgrade = document.getElementById('sidebar-upgrade');
    if (sidebarUpgrade) sidebarUpgrade.style.display = 'none';
}

// (removed — handled by init() already)

// =====================================================================
// ANNOUNCEMENT / AD MODAL LOGIC
// =====================================================================
// ── EDIT YOUR SLIDES HERE ────────────────────────────────────
// ── EDIT YOUR SLIDES HERE ────────────────────────────────────
// ✅ FIX #5: renamed from ANN_SLIDES to ANN_SLIDES_DEFAULT. This array is now only
// the FALLBACK shown when the admin panel has no active announcement configured.
// The actual live content is loaded by loadAnnouncementSlides() below from
// site_settings.homepage_announcement — the exact table Admin → Homepage
// Announcement already saves to. Previously nothing on the site ever read that
// table, so admin edits there had no visible effect.
const ANN_SLIDES_DEFAULT = [
    { badge: 'Free Trial', badgeBg: 'rgba(16,185,129,0.15)', badgeColor: 'var(--accent-green)',
      date: '', title: 'Start Your Free Trial', image: '/Assets/Ad2.jpeg',
      desc: 'Try every premium feature, no card required.',
      bullets: [{ icon: 'fa-circle-check', color: 'var(--accent-green)', html: 'Full dashboard access' }] },
    { badge: 'New Update', badgeBg: 'rgba(59,130,246,0.15)', badgeColor: 'var(--accent-blue)',
      date: '', title: 'What\'s New', image: '/Assets/ad.jpeg',
      desc: 'Latest improvements to the platform.',
      bullets: [{ icon: 'fa-circle-check', color: 'var(--accent-blue)', html: 'Faster signal delivery' }] },
    { badge: 'Pro Feature', badgeBg: 'rgba(168,85,247,0.15)', badgeColor: 'var(--accent-purple)',
      date: '', title: 'Go Pro', image: '/Assets/Ad1.jpeg',
      desc: 'Unlock advanced analytics.',
      bullets: [{ icon: 'fa-circle-check', color: 'var(--accent-purple)', html: 'Advanced AI predictions' }] },
];

// The array the modal actually renders from. Starts pointed at the hardcoded
// defaults; loadAnnouncementSlides() below may repoint it before the modal opens.
let ANN_SLIDES = ANN_SLIDES_DEFAULT;

// ✅ FIX #5: this is what makes Admin → Homepage Announcement actually reach the
// site. It reads the same site_settings row the admin form already saves to. If
// the admin has switched it on and given it a title, that becomes the single
// slide shown; otherwise ANN_SLIDES stays on the default marketing slides above.
// NOTE: this does NOT touch upcoming_announcements or master_bot.py's
// analyze_and_predict_announcements() — that pipeline feeds the separate
// Digital Assets AI table and is working correctly as-is.
async function loadAnnouncementSlides(client) {
    try {
        const { data, error } = await client
            .from('site_settings')
            .select('value')
            .eq('key', 'homepage_announcement')
            .maybeSingle();
        if (error || !data || !data.value) return; // stays on ANN_SLIDES_DEFAULT

        const v = data.value;
        if (v.is_active && v.title) {
            ANN_SLIDES = [{
                badge: 'Announcement',
                badgeBg: 'rgba(16,185,129,0.15)',
                badgeColor: 'var(--accent-green)',
                date: v.badge_date || '',
                title: v.title,
                image: v.image_url || ANN_SLIDES_DEFAULT[0].image,
                desc: v.body || '',
                bullets: (v.bullets || []).map(b => ({
                    icon: 'fa-circle-check',
                    color: 'var(--accent-green)',
                    html: escHtml(b)
                }))
            }];
        }
    } catch (e) {
        console.warn('Announcement fetch failed (non-fatal):', e); // stays on ANN_SLIDES_DEFAULT
    }
}

// ✅ FIX #4: reads active rows from ad_slots and paints each one into the
// matching <div data-ad-slot="..."> container placed in the page markup.
// Identical copy of this function also lives in script.js for the landing page —
// both write to / read from the same ad_slots table.
function renderAdSlots(client) {
    if (!client) return;
    client.from('ad_slots').select('*').eq('is_active', true).then(({ data, error }) => {
        if (error || !data) return;
        data.forEach(ad => {
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

let annCurrent = 0, annTimer = null, annDragX = 0, annDragging = false;

function annBuild() {
    const track = document.getElementById('ann-img-track');
    const dots  = document.getElementById('ann-dots');
    const wrap  = document.getElementById('ann-img-wrapper');
    if (!track || !dots || !wrap) return;

    track.innerHTML = ANN_SLIDES.map((s,i) =>
        `<img class="ann-img-slide" src="${s.image}" alt="Slide ${i+1}" draggable="false">`
    ).join('');

    dots.innerHTML = ANN_SLIDES.map((_,i) =>
        `<span class="ann-dot${i===0?' active':''}" data-i="${i}"></span>`
    ).join('');

    dots.querySelectorAll('.ann-dot').forEach(d =>
        d.addEventListener('click', () => { annGo(+d.dataset.i); annResetTimer(); })
    );

    // mouse drag
    wrap.addEventListener('mousedown', e => { annDragX=e.clientX; annDragging=true; annPause(); e.preventDefault(); });
    window.addEventListener('mouseup', e => {
        if (!annDragging) return; annDragging=false;
        const dx = e.clientX - annDragX;
        if (Math.abs(dx)>40) dx<0 ? annNext() : annPrev();
        annResetTimer();
    });

    // touch swipe
    wrap.addEventListener('touchstart', e => { annDragX=e.touches[0].clientX; annPause(); }, {passive:true});
    wrap.addEventListener('touchend',   e => {
        const dx = e.changedTouches[0].clientX - annDragX;
        if (Math.abs(dx)>40) dx<0 ? annNext() : annPrev();
        annResetTimer();
    }, {passive:true});

    annGo(0, false);
}

function annGo(idx, animate=true) {
    annCurrent = ((idx % ANN_SLIDES.length) + ANN_SLIDES.length) % ANN_SLIDES.length;
    const track = document.getElementById('ann-img-track');
    if (track) {
        if (!animate) { track.style.transition='none'; requestAnimationFrame(()=>{ track.style.transform=`translateX(-${annCurrent*100}%)`; requestAnimationFrame(()=>{ track.style.transition=''; }); }); }
        else track.style.transform = `translateX(-${annCurrent*100}%)`;
    }
    document.querySelectorAll('.ann-dot').forEach((d,i) => d.classList.toggle('active', i===annCurrent));
    annFadeText(annCurrent, animate);
}

function annNext() { annGo(annCurrent+1); }
function annPrev() { annGo(annCurrent-1); }

function annFadeText(idx, fade=true) {
    const s = ANN_SLIDES[idx];
    const badge=document.getElementById('ann-badge'), dateEl=document.getElementById('ann-date'),
          title=document.getElementById('ann-title'), desc=document.getElementById('ann-desc'),
          bullets=document.getElementById('ann-bullets'), body=document.getElementById('ann-body');
    const apply = () => {
        if(badge)   { badge.textContent=s.badge; badge.style.background=s.badgeBg; badge.style.color=s.badgeColor; }
        if(dateEl)  dateEl.textContent = s.date;
        if(title)   title.textContent  = s.title;
        if(desc)    desc.textContent   = s.desc;
        if(bullets) bullets.innerHTML  = s.bullets.map(b=>`<li style="margin-bottom:8px;"><i class="fa-solid ${b.icon}" style="color:${b.color};margin-right:10px;"></i>${b.html}</li>`).join('');
    };
    if (fade && body && title) {
        body.style.opacity='0'; title.style.opacity='0';
        setTimeout(()=>{ apply(); body.style.opacity='1'; title.style.opacity='1'; }, 220);
    } else apply();
}

function annPause()      { if(annTimer){clearInterval(annTimer); annTimer=null;} }
function annResetTimer() { annPause(); annTimer=setInterval(annNext, 4000); }

function showAnnouncementModal() {
    const modal = document.getElementById('announcement-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    annCurrent = 0;
    annBuild();
    annResetTimer();
}

function closeAnnouncementModal() {
    const modal = document.getElementById('announcement-modal');
    if (modal) modal.style.display = 'none';
    annPause();
}

document.getElementById('close-announcement-btn')?.addEventListener('click', closeAnnouncementModal);
document.getElementById('btn-announcement-continue')?.addEventListener('click', closeAnnouncementModal);

async function startFreeTrial() {
    showToast('info', 'Activating your free trial...');
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const res = await fetch('https://qdigrvhwvnrjznqkjltn.supabase.co/functions/v1/start-trial', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            }
        });
        const result = await res.json();
        if (res.ok) {
            state.subscriptionPlan = 'trial';
            saveAuthState();
            updateUIBasedOnAuth();
            showToast('success', '🎉 Free trial activated! All features unlocked for 15 days.');
        } else {
            showToast('error', result.message || 'Trial could not be activated.');
        }
    } catch (err) {
        showToast('error', 'Something went wrong. Please try again.');
    }
}

// ============================================
// ✅ NEW — SETTINGS: SUBSCRIPTION MANAGEMENT
// ============================================
function updateSettingsSubscriptionCard() {
    const loggedOutEl = document.getElementById('settings-sub-logged-out');
    const loggedInEl  = document.getElementById('settings-sub-logged-in');
    const planBadge   = document.getElementById('settings-plan-badge');
    const expiryEl    = document.getElementById('settings-expiry-date');
    const cancelRow   = document.getElementById('settings-cancel-row');
    const cancelStatus = document.getElementById('settings-cancel-status');

    if (!loggedOutEl || !loggedInEl) return;

    if (!state.isLoggedIn) {
        loggedOutEl.style.display = 'block';
        loggedInEl.style.display  = 'none';
        return;
    }

    loggedOutEl.style.display = 'none';
    loggedInEl.style.display  = 'block';

    const plan = state.subscriptionPlan || 'free';
    const isPaid = ['basic', 'pro', 'premium'].includes(plan);

    // Plan badge colour
    if (planBadge) {
        planBadge.textContent = plan.toUpperCase();
        if (isPaid) {
            planBadge.style.background = 'rgba(16,185,129,0.15)';
            planBadge.style.color = 'var(--accent-green)';
        } else {
            planBadge.style.background = 'rgba(100,116,139,0.15)';
            planBadge.style.color = 'var(--text-muted)';
        }
    }

    // Expiry date
    const expiryStr = (isPaid && state.subscriptionExpiry)
        ? new Date(state.subscriptionExpiry).toLocaleDateString('en-US',
            { year: 'numeric', month: 'long', day: 'numeric' })
        : '—';
    if (expiryEl) expiryEl.textContent = expiryStr;

    // Cancel button — only show for paid + not already cancelled
    if (cancelRow) cancelRow.style.display = (isPaid && !state.cancelAtPeriodEnd) ? 'flex' : 'none';

    // Cancellation notice — shown only after cancelling
    if (cancelStatus) {
        if (state.cancelAtPeriodEnd && isPaid) {
            cancelStatus.style.display = 'block';
            cancelStatus.innerHTML =
                `<i class="fa-solid fa-clock" style="color:#f0b90b;margin-right:6px;"></i>` +
                `<span style="color:#f0b90b;">Cancelled — Full access until <strong>${expiryStr}</strong>. No auto-renewal.</span>`;
        } else {
            cancelStatus.style.display = 'none';
        }
    }
}

function cancelSubscription() {
    if (!state.isLoggedIn) {
        showToast('error', 'You must be signed in to manage your subscription.');
        return;
    }
    if (!['basic', 'pro', 'premium'].includes(state.subscriptionPlan)) {
        showToast('info', 'You are already on the Free plan — nothing to cancel.');
        return;
    }

    // Populate the expiry info in the confirmation modal
    const expiryEl = document.getElementById('cancel-modal-expiry');
    const expiryStr = state.subscriptionExpiry
        ? new Date(state.subscriptionExpiry).toLocaleDateString('en-US',
            { year: 'numeric', month: 'long', day: 'numeric' })
        : 'your billing period end date';
    if (expiryEl) {
        expiryEl.innerHTML =
            `<i class="fa-solid fa-calendar-check" style="margin-right:6px;"></i>` +
            `Your <strong>${state.subscriptionPlan.toUpperCase()}</strong> access remains active until:<br>` +
            `<strong style="font-size:1rem;">${expiryStr}</strong>`;
    }

    const modal = document.getElementById('cancel-sub-modal');
    if (modal) modal.style.display = 'flex';
}

function closeCancelModal() {
    const modal = document.getElementById('cancel-sub-modal');
    if (modal) modal.style.display = 'none';
}

async function confirmCancelSubscription() {
    closeCancelModal();
    if (!supabaseClient) {
        showToast('error', 'Database connection required. Please refresh and try again.');
        return;
    }
    showToast('info', 'Processing cancellation...');

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) { showToast('error', 'Authentication error. Please sign in again.'); return; }

        const { error } = await supabaseClient
            .from('profiles')
            .update({ cancel_at_period_end: true })
            .eq('id', user.id);

        if (error) throw error;

        state.cancelAtPeriodEnd = true;
        showToast('success', '✅ Cancelled. Your access stays active until your billing date.');
        if (typeof updateSettingsSubscriptionCard === 'function') updateSettingsSubscriptionCard();

    } catch (err) {
        console.error('Cancel error:', err);
        showToast('error', 'Could not process cancellation. Please try again or contact support.');
    }
}

function formatRedeemCodeInput(el) {
    const raw = el.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 16);
    el.value = raw.replace(/(.{4})/g, '$1-').replace(/-$/, '');
}

async function redeemCode() {
    if (!supabaseClient) { showToast('error', 'Database connection required. Please refresh and try again.'); return; }
    if (!state.isLoggedIn) { signInWithGoogle(); return; }

    const input    = document.getElementById('redeem-code-input');
    const statusEl = document.getElementById('redeem-code-status');
    const btn      = document.getElementById('redeem-code-btn');
    const rawCode  = (input?.value || '').toUpperCase().replace(/[^A-Z]/g, '');

    if (rawCode.length !== 16) {
        if (statusEl) { statusEl.textContent = 'Enter the full 16-letter code.'; statusEl.style.color = '#ef4444'; }
        return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Redeeming...'; }
    if (statusEl) statusEl.textContent = '';

    const { data, error } = await supabaseClient.rpc('redeem_code', { p_code: rawCode });

    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-gift" style="margin-right:5px;"></i>Redeem'; }

    if (error) {
        const msg = error.message || 'Could not redeem this code. Please try again.';
        if (statusEl) { statusEl.textContent = msg; statusEl.style.color = '#ef4444'; }
        showToast('error', msg);
        return;
    }

    if (input) input.value = '';
    if (statusEl) { statusEl.textContent = data?.message || 'Code redeemed!'; statusEl.style.color = 'var(--accent-green)'; }
    showToast('success', data?.message || 'Code redeemed successfully!');

    if (data?.plan)   state.subscriptionPlan   = data.plan;
    if (data?.expiry) state.subscriptionExpiry = data.expiry;
    state.cancelAtPeriodEnd = false;
    saveAuthState();
    if (typeof updateSettingsSubscriptionCard === 'function') updateSettingsSubscriptionCard();
    if (typeof updateUIBasedOnAuth === 'function') updateUIBasedOnAuth();
}

// ============================================
// ✅ NEW — SETTINGS: CONTACT ADMIN
// ============================================
function contactAdmin() {
    const ADMIN_EMAIL = 'support.sapex@gmail.com'; // ← Replace with your actual Gmail address

    const subject = encodeURIComponent('SaPEX_NEXUS Support Request');
    const body = encodeURIComponent(
        `Hi SaPEX_NEXUS Team,\n\n` +
        `I need help with:\n[Describe your issue here]\n\n` +
        `Account: ${state.userProfile.email || 'Not signed in'}\n` +
        `Plan: ${(state.subscriptionPlan || 'free').toUpperCase()}\n\n` +
        `Thanks`
    );

    window.open(
        `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(ADMIN_EMAIL)}&su=${subject}&body=${body}`,
        '_blank'
    );
}

// ============================================================
// COOKIE CONSENT BANNER
// Location: app.js — appended at end (after line 3015)
// ============================================================

/**
 * Checks localStorage for saved consent.
 * If not found → shows the banner (slides up from bottom).
 * Called on DOMContentLoaded with a short delay so it doesn't
 * fight with the main loading screen animation.
 */
function initCookieBanner() {
    const consent = localStorage.getItem('sapex_cookie_consent');
    if (consent === 'accepted') return; // already accepted, do nothing

    const banner = document.getElementById('cookie-banner');
    if (banner) {
        banner.style.display = 'flex';
    }
}


// Show the banner 1.8 seconds after page load
// (gives the main loading screen time to finish first)
window.addEventListener('DOMContentLoaded', () => {
    setTimeout(initCookieBanner, 1800);
});