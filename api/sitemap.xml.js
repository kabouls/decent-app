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

  // Keep this in sync with TOOLS_META's keys in middleware.js (and, one
  // level further back, TOOLS_ROUTE_SLUGS in App.js) - all three describe
  // the same six URLs and have no shared source to stay in sync
  // automatically, so a new tool added to one needs adding to all three.
  //
  // lastmod is only set where a real change date is actually known -
  // same principle as portfolios/profiles below (real date or omit
  // entirely, never a fabricated one just to fill the field). Update
  // the date here whenever a tool's actual content changes enough to
  // matter for re-crawl priority, not on every unrelated deploy.
  const staticUrls = [
    { path: '' },
    { path: '/for-you' },
    { path: '/circle' },
    { path: '/search' },
    { path: '/tools', lastmod: '2026-09-21' },
    { path: '/tools/pdf-editor', lastmod: '2026-09-21' },
    { path: '/tools/image-compressor' },
    { path: '/tools/image-converter' },
    { path: '/tools/qr-code-generator', lastmod: '2026-09-21' },
    { path: '/tools/resume-maker', lastmod: '2026-09-21' }
  ];

  const urls = [
    ...staticUrls.map(({ path, lastmod }) => `  <url><loc>${SITE_URL}${path}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`),
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
