/*
 * blog-paywall.js
 * Included on every blog/<slug>.html page (see Social_bot.py's
 * _render_post_page). Free/anonymous visitors see the first 2 <h2>
 * sections of an article; everything from the 3rd section onward
 * requires an active Basic, Pro, Premium, or Trial plan — same
 * subscription data as the Terminal (profiles.plan_tier in Supabase).
 *
 * The actual HIDING is done by CSS in blog-post.css, the instant the
 * stylesheet loads — before this script even runs. That's deliberate:
 * a free visitor should never even briefly glimpse gated content while
 * this script is off fetching their plan. This script only ever does
 * one of two things once it knows the answer:
 *   - paid plan  -> add .paywall-unlocked, which reveals everything
 *   - free/none  -> drop in the "Unlock with Basic" card
 * If an article has 2 or fewer <h2> sections, the CSS selector simply
 * matches nothing and this script has nothing to do either way.
 */
(function () {
    const SUPABASE_URL = 'https://qdigrvhwvnrjznqkjltn.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_vN8drh5iobJ2-mWmjk0joA_eRBQJVJa';
    const PAID_TIERS = ['basic', 'pro', 'premium', 'trial'];

    async function getSubscriptionPlan() {
        if (typeof supabase === 'undefined') return 'free'; // supabase-js failed to load — fail to the safe (locked) state
        try {
            const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            const { data: { user } } = await sb.auth.getUser();
            if (!user) return 'free';
            const { data: profile, error } = await sb
                .from('profiles')
                .select('plan_tier, subscription_expiry')
                .eq('id', user.id)
                .single();
            if (error || !profile || !profile.plan_tier || profile.plan_tier === 'free') return 'free';
            const now = new Date();
            const expiry = new Date(profile.subscription_expiry);
            return (now > expiry) ? 'free' : profile.plan_tier; // expired plan reads back as free, same rule as the Terminal
        } catch (e) {
            return 'free';
        }
    }

    function buildGate(hiddenSectionCount) {
        const gate = document.createElement('div');
        gate.className = 'blog-paywall-gate';
        gate.innerHTML = `
            <div class="blog-paywall-gate__icon"><i class="fa-solid fa-lock"></i></div>
            <h3>Keep reading with a Basic plan</h3>
            <p>${hiddenSectionCount} more section${hiddenSectionCount === 1 ? '' : 's'} of this article ${hiddenSectionCount === 1 ? 'is' : 'are'} for Basic, Pro, Premium, and Trial members.</p>
            <a href="../app.html#pricing" class="blog-paywall-gate__btn">Unlock with Basic <i class="fa-solid fa-arrow-right"></i></a>
        `;
        return gate;
    }

    async function applyPaywall() {
        const body = document.querySelector('.blog-post__body');
        if (!body) return;
        const headings = body.querySelectorAll('h2');
        if (headings.length <= 2) return; // nothing gated on this article — CSS already shows everything

        const plan = await getSubscriptionPlan();
        if (PAID_TIERS.includes(plan)) {
            body.classList.add('paywall-unlocked');
            return;
        }

        const hiddenHeadingCount = headings.length - 2;
        body.appendChild(buildGate(hiddenHeadingCount));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyPaywall);
    } else {
        applyPaywall();
    }
})();