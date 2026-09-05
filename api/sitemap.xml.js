// Vercel Edge Function - generates the sitemap fresh from live Supabase
// data on each request (1hr cache below). New portfolios/profiles
// become sitemap-visible automatically, no manual rebuild step needed.
export const config = { runtime: 'edge' };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SITE_URL = 'https://www.decent.ink';

async function supaGet(query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
  });
  return res.ok ? res.json() : [];
}

export default async function handler() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return new Response('Missing SUPABASE_URL / SUPABASE_ANON_KEY env vars', { status: 500 });
  }

  // portfolios has no updated_at column - created_at is the correct
  // lastmod source there. profiles does have updated_at.
  const [portfolios, profiles] = await Promise.all([
    supaGet('portfolios?select=id,created_at&is_nsfw=eq.false'),
    supaGet('profiles?select=handle,updated_at&handle=not.is.null')
  ]);

  const staticUrls = ['', '/for-you', '/circle', '/search'];

  const urls = [
    ...staticUrls.map((p) => `  <url><loc>${SITE_URL}${p}</loc></url>`),
    ...portfolios.map(
      (p) => `  <url><loc>${SITE_URL}/p/${p.id}</loc>${p.created_at ? `<lastmod>${p.created_at.split('T')[0]}</lastmod>` : ''}</url>`
    ),
    ...profiles.map(
      (p) => `  <url><loc>${SITE_URL}/@${p.handle}</loc>${p.updated_at ? `<lastmod>${p.updated_at.split('T')[0]}</lastmod>` : ''}</url>`
    )
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' }
  });
}
