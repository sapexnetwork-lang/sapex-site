/*
 * blog-ads.js — renders every admin-managed ad placement on the blog.
 *
 * Loaded by blog.html (the index) and by every blog/<slug>.html article
 * page (see Social_bot.py's _render_post_page). One file, both pages —
 * it works out which page it is on from the DOM and only mounts the
 * placements that exist there.
 *
 * WHERE THE CONTENT COMES FROM
 * Rows in the Supabase `ad_slots` table, the exact same table the admin
 * panel's Ads tab writes to. Nothing here is hardcoded per advertiser:
 * flip a slot Active in the admin and it appears on the next page load,
 * no redeploy. Slot keys are matched against SLOT_MOUNTS below; a key
 * that is not in that map is ignored on the blog (it belongs to the
 * Terminal or the Prediction Arena instead).
 *
 * WHY A RAW fetch() AND NOT supabase-js
 * blog-enhance.js already creates a supabase-js client for auth on the
 * article pages. Creating a second one against the same key makes
 * GoTrue log a "multiple instances" warning and can confuse session
 * handling. Reading ad slots needs no auth at all, so this file talks to
 * PostgREST directly with the publishable key. That also means the ads
 * still render on any page where supabase-js failed to load.
 *
 * FAILURE MODE
 * Every step is wrapped. If the table is unreachable, the network is
 * blocked, or a row is malformed, nothing is injected and the page reads
 * exactly as it does today. An ad never breaks an article.
 */
(function () {
    'use strict';

    var SUPABASE_URL = 'https://qdigrvhwvnrjznqkjltn.supabase.co';
    var SUPABASE_ANON_KEY = 'sb_publishable_vN8drh5iobJ2-mWmjk0joA_eRBQJVJa';

    var PAID_TIERS = ['basic', 'pro', 'premium', 'trial'];

    /* ------------------------------------------------------------------
     * Slot registry.
     *
     * `page`  — which page the slot belongs to.
     * `type`  — how it mounts: rail | banner | popup | toast.
     * `mount` — where in the DOM it goes.
     *
     * The recommended pixel sizes for each of these live in admin.js
     * (AD_SLOT_SIZE_HINTS) and are shown on the slot's card in the admin
     * panel. If a placement's container width ever changes here, update
     * the hint there too so they do not drift apart.
     * ------------------------------------------------------------------ */
    var SLOT_MOUNTS = {
        // ---- blog index (blog.html) ----
        blog_index_left_rail:  { page: 'index',   type: 'rail',   side: 'left' },
        blog_index_right_rail: { page: 'index',   type: 'rail',   side: 'right' },
        blog_index_top:        { page: 'index',   type: 'banner', mount: 'indexTop' },
        blog_index_mid:        { page: 'index',   type: 'banner', mount: 'indexGrid' },
        blog_index_popup:      { page: 'index',   type: 'popup' },
        blog_index_corner:     { page: 'index',   type: 'toast' },

        // ---- article pages (blog/<slug>.html) ----
        blog_article_left_rail:  { page: 'article', type: 'rail',   side: 'left' },
        blog_article_right_rail: { page: 'article', type: 'rail',   side: 'right' },
        blog_article_inline:     { page: 'article', type: 'banner', mount: 'articleInline' },
        blog_article_bottom:     { page: 'article', type: 'banner', mount: 'articleBottom' },
        blog_article_popup:      { page: 'article', type: 'popup' },
        blog_article_corner:     { page: 'article', type: 'toast' }
    };

    // Deliberately no article top banner: an ad above the headline pushes
    // the article itself below the fold and reads as a content farm.

    var CARDS_BEFORE_GRID_AD = 6; // 2 rows of 3 on desktop

    /* ---------------------------- helpers ---------------------------- */

    function cfg(ad) {
        var c = ad.config;
        if (typeof c === 'string') {
            try { c = JSON.parse(c); } catch (e) { c = null; }
        }
        return c && typeof c === 'object' ? c : {};
    }

    function num(value, fallback) {
        var n = parseInt(value, 10);
        return isNaN(n) ? fallback : n;
    }

    // Frequency capping. 'session' uses sessionStorage (resets when the tab
    // closes), 'day' uses localStorage with a date stamp, 'always' never caps.
    function alreadyShown(ad) {
        var freq = cfg(ad).frequency || 'session';
        if (freq === 'always') return false;
        var key = 'sapex_ad_seen_' + ad.slot_key;
        try {
            if (freq === 'day') {
                return window.localStorage.getItem(key) === new Date().toDateString();
            }
            return window.sessionStorage.getItem(key) === '1';
        } catch (e) {
            return false; // private mode / storage blocked — show it rather than suppress it
        }
    }

    function markShown(ad) {
        var freq = cfg(ad).frequency || 'session';
        if (freq === 'always') return;
        var key = 'sapex_ad_seen_' + ad.slot_key;
        try {
            if (freq === 'day') window.localStorage.setItem(key, new Date().toDateString());
            else window.sessionStorage.setItem(key, '1');
        } catch (e) { /* storage blocked — worst case it shows again next load */ }
    }

    // Builds the actual creative: custom HTML if the slot has an override,
    // otherwise the uploaded image wrapped in the click-through link.
    function buildCreative(ad, opts) {
        opts = opts || {};
        var html = (ad.html_override || '').trim();
        if (html) {
            var wrap = document.createElement('div');
            wrap.innerHTML = html;
            return wrap;
        }
        if (!ad.image_url) return null;

        var link = document.createElement('a');
        link.className = 'sapex-ad__link';
        link.href = ad.link_url || '#';
        link.target = '_blank';
        link.rel = 'noopener sponsored';
        link.setAttribute('aria-label', ad.name || 'Sponsored');

        var img = document.createElement('img');
        img.className = 'sapex-ad__img';
        img.src = ad.image_url;
        img.alt = ad.name || 'Sponsored';
        img.loading = opts.eager ? 'eager' : 'lazy';
        img.decoding = 'async';
        link.appendChild(img);
        return link;
    }

    function labelledBlock(ad, extraClass, opts) {
        var creative = buildCreative(ad, opts);
        if (!creative) return null;
        var block = document.createElement('div');
        block.className = 'sapex-ad ' + extraClass;
        block.setAttribute('data-ad-slot', ad.slot_key);

        var label = document.createElement('span');
        label.className = 'sapex-ad__label';
        label.textContent = 'Sponsored';
        block.appendChild(label);
        block.appendChild(creative);
        return block;
    }

    /* ---------------------------- mounts ---------------------------- */

    function mountRail(ad) {
        var side = SLOT_MOUNTS[ad.slot_key].side;
        var block = labelledBlock(ad, 'sapex-ad--rail sapex-ad-rail sapex-ad-rail--' + side);
        if (!block) return;
        document.body.appendChild(block);
    }

    function mountBanner(ad) {
        var where = SLOT_MOUNTS[ad.slot_key].mount;

        if (where === 'indexTop') {
            var grid = document.getElementById('blogGrid');
            if (!grid) return;
            var block = labelledBlock(ad, 'sapex-ad-banner sapex-ad-banner--top', { eager: true });
            if (!block) return;
            // Above the grid but below the category filters, so the filters
            // stay the first thing a reader reaches for.
            grid.parentNode.insertBefore(block, grid);
            return;
        }

        if (where === 'indexGrid') {
            var g = document.getElementById('blogGrid');
            if (!g) return;
            var cards = g.querySelectorAll('.blog-card');
            if (cards.length <= CARDS_BEFORE_GRID_AD) return; // nothing after it to separate
            var b = labelledBlock(ad, 'sapex-ad-banner sapex-ad-banner--grid');
            if (!b) return;
            g.insertBefore(b, cards[CARDS_BEFORE_GRID_AD]);
            return;
        }

        if (where === 'articleInline') {
            var body = document.querySelector('.blog-post__body');
            if (!body) return;
            var headings = body.querySelectorAll('h2');
            var block2 = labelledBlock(ad, 'sapex-ad-banner sapex-ad-banner--inline');
            if (!block2) return;
            if (headings.length >= 2) {
                // Immediately BEFORE the 2nd <h2>, which keeps it inside the
                // free-to-read region for everyone. It must never land after
                // the 3rd <h2>: blog-post.css hides `h2:nth-of-type(n+3) ~ *`,
                // which would silently swallow the ad for free readers.
                body.insertBefore(block2, headings[1]);
            } else {
                var paras = body.querySelectorAll('p');
                if (paras.length >= 2) body.insertBefore(block2, paras[1]);
                else body.appendChild(block2);
            }
            return;
        }

        if (where === 'articleBottom') {
            var article = document.querySelector('.blog-post');
            if (!article) return;
            var block3 = labelledBlock(ad, 'sapex-ad-banner sapex-ad-banner--bottom');
            if (!block3) return;
            // After the whole article, references included — the last thing
            // before the footer.
            article.appendChild(block3);
        }
    }

    function mountPopup(ad) {
        if (alreadyShown(ad)) return;
        var c = cfg(ad);
        var delay = num(c.delay_seconds, 8) * 1000;
        var autoClose = num(c.auto_close_seconds, 0) * 1000;

        window.setTimeout(function () {
            var creative = buildCreative(ad, { eager: true });
            if (!creative) return;

            var overlay = document.createElement('div');
            overlay.className = 'sapex-ad-overlay';
            overlay.setAttribute('data-ad-slot', ad.slot_key);

            var box = document.createElement('div');
            box.className = 'sapex-ad-popup';
            box.setAttribute('role', 'dialog');
            box.setAttribute('aria-label', ad.name || 'Sponsored message');

            var close = document.createElement('button');
            close.className = 'sapex-ad-close';
            close.type = 'button';
            close.setAttribute('aria-label', 'Close');
            close.innerHTML = '<i class="fa-solid fa-xmark"></i>';

            function dismiss() {
                overlay.classList.remove('is-open');
                window.setTimeout(function () { overlay.remove(); }, 260);
                document.removeEventListener('keydown', onKey);
            }
            function onKey(e) { if (e.key === 'Escape') dismiss(); }

            close.addEventListener('click', dismiss);
            overlay.addEventListener('click', function (e) { if (e.target === overlay) dismiss(); });
            document.addEventListener('keydown', onKey);

            box.appendChild(close);
            box.appendChild(creative);
            overlay.appendChild(box);
            document.body.appendChild(overlay);
            requestAnimationFrame(function () { overlay.classList.add('is-open'); });

            markShown(ad);
            if (autoClose > 0) window.setTimeout(dismiss, autoClose);
        }, delay);
    }

    function mountToast(ad) {
        if (alreadyShown(ad)) return;
        var c = cfg(ad);
        var delay = num(c.delay_seconds, 15) * 1000;
        var autoClose = num(c.auto_close_seconds, 20) * 1000;
        var position = c.position || 'bottom-right';

        window.setTimeout(function () {
            var creative = buildCreative(ad);
            if (!creative) return;

            var toast = document.createElement('div');
            toast.className = 'sapex-ad-toast sapex-ad-toast--' + position;
            toast.setAttribute('data-ad-slot', ad.slot_key);
            toast.setAttribute('role', 'complementary');

            var close = document.createElement('button');
            close.className = 'sapex-ad-close';
            close.type = 'button';
            close.setAttribute('aria-label', 'Close');
            close.innerHTML = '<i class="fa-solid fa-xmark"></i>';

            var timer = null;
            function dismiss() {
                if (timer) window.clearTimeout(timer);
                toast.classList.remove('is-open');
                window.setTimeout(function () { toast.remove(); }, 320);
            }
            close.addEventListener('click', dismiss);
            // Hovering pauses the auto-dismiss, so a toast never vanishes
            // out from under a cursor that is on its way to the button.
            toast.addEventListener('mouseenter', function () { if (timer) window.clearTimeout(timer); });
            toast.addEventListener('mouseleave', function () {
                if (autoClose > 0) timer = window.setTimeout(dismiss, autoClose);
            });

            toast.appendChild(close);
            toast.appendChild(creative);
            document.body.appendChild(toast);
            requestAnimationFrame(function () { toast.classList.add('is-open'); });

            markShown(ad);
            if (autoClose > 0) timer = window.setTimeout(dismiss, autoClose);
        }, delay);
    }

    var MOUNTERS = { rail: mountRail, banner: mountBanner, popup: mountPopup, toast: mountToast };

    /* ---------------------------- viewer plan ---------------------------- */

    // blog-enhance.js resolves the signed-in visitor's plan for the paywall
    // and publishes it on window.SAPEX_VIEWER_PLAN. Slots flagged "hide from
    // paid members" use it. It resolves a moment after this file starts, so
    // wait briefly — but never block the ads on it, and treat a timeout as
    // "free", which is the state the overwhelming majority of readers are in.
    function viewerPlan() {
        return new Promise(function (resolve) {
            if (window.SAPEX_VIEWER_PLAN) return resolve(window.SAPEX_VIEWER_PLAN);
            var waited = 0;
            var tick = window.setInterval(function () {
                waited += 100;
                if (window.SAPEX_VIEWER_PLAN || waited >= 2500) {
                    window.clearInterval(tick);
                    resolve(window.SAPEX_VIEWER_PLAN || 'free');
                }
            }, 100);
        });
    }

    /* ---------------------------- boot ---------------------------- */

    function currentPage() {
        if (document.querySelector('.blog-post__body')) return 'article';
        if (document.getElementById('blogGrid')) return 'index';
        return null;
    }

    async function fetchSlots() {
        var url = SUPABASE_URL + '/rest/v1/ad_slots' +
            '?select=slot_key,name,display_type,image_url,link_url,html_override,config,display_order' +
            '&is_active=eq.true&order=display_order.asc';
        var res = await fetch(url, {
            headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY }
        });
        if (!res.ok) throw new Error('ad_slots read failed: ' + res.status);
        return await res.json();
    }

    async function run() {
        var page = currentPage();
        if (!page) return;

        var slots;
        try {
            slots = await fetchSlots();
        } catch (e) {
            console.warn('blog-ads.js: could not load ad slots, rendering page without ads.', e);
            return;
        }

        var relevant = (slots || []).filter(function (ad) {
            var def = SLOT_MOUNTS[ad.slot_key];
            return def && def.page === page;
        });
        if (!relevant.length) return;

        var needsPlan = relevant.some(function (ad) { return cfg(ad).hide_for_paid; });
        var plan = needsPlan ? await viewerPlan() : 'free';
        var isPaid = PAID_TIERS.indexOf(plan) !== -1;

        relevant.forEach(function (ad) {
            try {
                if (isPaid && cfg(ad).hide_for_paid) return;
                var def = SLOT_MOUNTS[ad.slot_key];
                // display_type on the row is what the admin chose; the slot's
                // own mount type wins for rails and banners, because a rail
                // container cannot host a center-screen overlay. Popup and
                // toast slots honour the row so one slot can be switched
                // between the two without moving it.
                var kind = def.type;
                if (def.type === 'popup' && ad.display_type === 'corner_toast') kind = 'toast';
                if (def.type === 'toast' && (ad.display_type === 'popup' || ad.display_type === 'popup_collage')) kind = 'popup';
                MOUNTERS[kind](ad);
            } catch (e) {
                console.warn('blog-ads.js: slot "' + ad.slot_key + '" failed to mount.', e);
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run);
    } else {
        run();
    }
})();