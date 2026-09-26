// api/map-config.js
//
// Vercel serverless function. This is the ONLY place the Supabase anon key
// and Mapbox token get read from environment variables before being handed
// to the browser.
//
// Set these three in Vercel: Project → Settings → Environment Variables
// (this is your ".env" for the live site — nothing here should ever be
// committed to git). For local dev with `vercel dev`, put the same three
// keys in a .env file at your project root (see frontend/.env.example).
//
//   MAPBOX_TOKEN=pk.xxxxx
//   SUPABASE_URL=https://your-project-ref.supabase.co
//   SUPABASE_ANON_KEY=xxxxx
//
// Honest heads-up: the JSON this returns IS visible in the browser's
// Network tab once the page loads — that part is unavoidable, because the
// browser has to send these values to Supabase/Mapbox directly. What this
// setup actually buys you is that the values live only in Vercel's env
// vars, never in a file sitting in your repo or static bundle. The real
// protections are (1) Supabase RLS — these tables are already public-read
// only, the anon key can't write/delete anything, and (2) restricting the
// Mapbox token to your domain — see README "Locking down the Mapbox token".
//
// This file MUST stay inside an "api" folder at your project root — that
// exact folder name is how Vercel finds serverless functions for a plain
// (non-framework) project. Everything else in this feature (conflict_map.html,
// conflict-map.css, conflict-map-animations.js, conflict-map-app.js) is a
// normal static file and can sit flat at your project root, same as your
// other pages (app.html, admin.html, etc.).

module.exports = (req, res) => {
  if (!process.env.MAPBOX_TOKEN || !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    res.status(500).json({ error: 'Map config env vars not set on the server. Check Vercel Project Settings.' });
    return;
  }

  // Short edge cache — this response doesn't vary per request or per user.
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
  res.status(200).json({
    mapboxToken: process.env.MAPBOX_TOKEN,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  });
};