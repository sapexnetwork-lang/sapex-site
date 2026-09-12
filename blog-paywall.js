/*
 * blog-paywall.js
 * Included on every blog/<slug>.html page (see Social_bot.py's
 * _render_post_page). Two jobs:
 *
 * 1. HEADER — swaps the static "Sign In" button for an avatar + plan
 *    badge when someone's logged in, same visual pattern as the
 *    Terminal/Prediction Arena. Signing in happens right here on the
 *    blog page (Google OAuth, redirects back to this same article) —
 *    no detour through app.html needed just to log in.
 *
 * 2. PAYWALL — free/anonymous visitors see the first 2 <h2> sections
 *    of an article; everything from the 3rd section onward requires
 *    an active Basic, Pro, Premium, or Trial plan (profiles.plan_tier
 *    in Supabase — same data the Terminal reads). Short articles with
 *    2 or fewer sections have nothing to hide, so free/anonymous
 *    visitors get a lightweight "upgrade" banner instead of a hard
 *    gate — a nudge, not a block.
 *
 * The actual HIDING for #2 is done by CSS in blog-post.css the instant
 * the stylesheet loads, before this script runs — a free visitor should
 * never even briefly glimpse gated content while this script is still
 * checking their plan. This script only ever reveals it (paid) or drops
 * in the unlock card (not paid).
 */
(function () {
    const SUPABASE_URL = 'https://qdigrvhwvnrjznqkjltn.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_vN8drh5iobJ2-mWmjk0joA_eRBQJVJa';
    const PAID_TIERS = ['basic', 'pro', 'premium', 'trial'];

    let sb = null;
    function getClient() {
        if (!sb && typeof supabase !== 'undefined') {
            sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        }
        return sb;
    }

    async function loadAuthAndPlan() {
        const client = getClient();
        if (!client) return { isLoggedIn: false, plan: 'free', user: null }; // supabase-js failed to load — fail to the safe (locked, logged-out) state
        try {
            const { data: { user } } = await client.auth.getUser();
            if (!user) return { isLoggedIn: false, plan: 'free', user: null };

            const { data: profile, error } = await client
                .from('profiles')
                .select('plan_tier, subscription_expiry')
                .eq('id', user.id)
                .single();
            if (error || !profile || !profile.plan_tier || profile.plan_tier === 'free') {
                return { isLoggedIn: true, plan: 'free', user };
            }
            const now = new Date();
            const expiry = new Date(profile.subscription_expiry);
            const plan = (now > expiry) ? 'free' : profile.plan_tier; // expired plan reads back as free, same rule as the Terminal
            return { isLoggedIn: true, plan, user };
        } catch (e) {
            console.warn('blog-paywall.js: auth/plan check failed, defaulting to signed-out.', e);
            return { isLoggedIn: false, plan: 'free', user: null };
        }
    }

    async function signIn() {
        const client = getClient();
        if (!client) return;
        await client.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.href } // back to THIS article, not off to the Terminal
        });
    }

    async function signOut() {
        const client = getClient();
        if (!client) return;
        await client.auth.signOut();
        window.location.reload();
    }

    function updateHeader({ isLoggedIn, plan, user }) {
        const signedOutEl = document.getElementById('blog-auth-signedout');
        const signedInEl = document.getElementById('blog-auth-signedin');
        if (!signedOutEl || !signedInEl) return;

        if (isLoggedIn) {
            signedOutEl.style.display = 'none';
            signedInEl.style.display = 'flex';

            const avatarEl = document.getElementById('blog-avatar');
            if (avatarEl) {
                const avatarUrl = user?.user_metadata?.avatar_url;
                const name = user?.user_metadata?.full_name || user?.email || '?';
                avatarEl.innerHTML = avatarUrl
                    ? `<img src="${avatarUrl}" alt="">`
                    : name.charAt(0).toUpperCase();
            }

            const badgeEl = document.getElementById('blog-pro-badge');
            if (badgeEl) {
                if (plan && plan !== 'free') {
                    badgeEl.style.display = 'flex';
                    badgeEl.style.background = (plan === 'trial')
                        ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                        : '';
                    badgeEl.innerHTML = plan === 'trial'
                        ? `<i class="fa-solid fa-flask"></i> TRIAL`
                        : `<i class="fa-solid fa-crown"></i> ${plan.toUpperCase()}`;
                } else {
                    badgeEl.style.display = 'none';
                }
            }
        } else {
            signedOutEl.style.display = 'block';
            signedInEl.style.display = 'none';
        }

        const signinBtn = document.getElementById('blog-signin-btn');
        if (signinBtn && !signinBtn.dataset.wired) {
            signinBtn.dataset.wired = 'true';
            signinBtn.addEventListener('click', signIn);
        }
        const signoutBtn = document.getElementById('blog-signout-btn');
        if (signoutBtn && !signoutBtn.dataset.wired) {
            signoutBtn.dataset.wired = 'true';
            signoutBtn.addEventListener('click', signOut);
        }
    }

    function buildGate(hiddenSectionCount, isLoggedIn) {
        const gate = document.createElement('div');
        gate.className = 'blog-paywall-gate';
        const ctaHtml = isLoggedIn
            ? `<a href="../app.html#pricing" class="blog-paywall-gate__btn">Upgrade to Basic <i class="fa-solid fa-arrow-right"></i></a>`
            : `<button class="blog-paywall-gate__btn" id="blog-paywall-signin-btn">Sign In to Continue Reading <i class="fa-solid fa-arrow-right"></i></button>`;
        gate.innerHTML = `
            <div class="blog-paywall-gate__icon"><i class="fa-solid fa-lock"></i></div>
            <h3>Keep reading with a Basic plan</h3>
            <p>${hiddenSectionCount} more section${hiddenSectionCount === 1 ? '' : 's'} of this article ${hiddenSectionCount === 1 ? 'is' : 'are'} for Basic, Pro, Premium, and Trial members.
            ${isLoggedIn ? '' : ' Sign in first, then upgrade if you\'re not already on a paid plan.'}</p>
            ${ctaHtml}
        `;
        const btn = gate.querySelector('#blog-paywall-signin-btn');
        if (btn) btn.addEventListener('click', signIn);
        return gate;
    }

    // Shown instead of a hard gate when an article has nothing to hide
    // (2 or fewer sections) — free/anonymous visitors still get a nudge
    // toward subscribing, they just aren't blocked from anything here.
    function buildPromoBanner(isLoggedIn) {
        const banner = document.createElement('div');
        banner.className = 'blog-promo-banner';
        const ctaHtml = isLoggedIn
            ? `<a href="../app.html#pricing" class="blog-promo-banner__btn">Upgrade Now <i class="fa-solid fa-crown"></i></a>`
            : `<button class="blog-promo-banner__btn" id="blog-promo-signin-btn">Sign In to Upgrade <i class="fa-solid fa-crown"></i></button>`;
        banner.innerHTML = `<span>Basic, Pro, Premium, and Trial members get every full article, including the longer ones.</span>${ctaHtml}`;
        const btn = banner.querySelector('#blog-promo-signin-btn');
        if (btn) btn.addEventListener('click', signIn);
        return banner;
    }

    async function run() {
        let authState = { isLoggedIn: false, plan: 'free', user: null };
        try {
            authState = await loadAuthAndPlan();
        } catch (e) {
            console.warn('blog-paywall.js: unexpected error, treating visitor as signed-out/free.', e);
        }

        try { updateHeader(authState); } catch (e) { console.warn('blog-paywall.js: header update failed.', e); }

        try {
            const body = document.querySelector('.blog-post__body');
            if (!body) return;
            const headings = body.querySelectorAll('h2');
            const isPaid = PAID_TIERS.includes(authState.plan);

            if (headings.length <= 2) {
                // Nothing to gate on a short article — still nudge free/
                // anonymous visitors toward subscribing, just without
                // blocking anything here.
                if (!isPaid) body.appendChild(buildPromoBanner(authState.isLoggedIn));
                return;
            }

            if (isPaid) {
                body.classList.add('paywall-unlocked');
                return;
            }
            const hiddenHeadingCount = headings.length - 2;
            body.appendChild(buildGate(hiddenHeadingCount, authState.isLoggedIn));
        } catch (e) {
            console.warn('blog-paywall.js: paywall gate failed to apply.', e);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run);
    } else {
        run();
    }
})();