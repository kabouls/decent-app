import { next } from '@vercel/edge';

// Rich previews AND real SEO for shared /p/:id and /@:handle URLs.
//
// b613 correction (second correction on this file today): my prior
// "fix" in this same conversation used a nested `profiles(name,handle)`
// select assuming a foreign key between portfolios and profiles - that
// FK does NOT exist in this schema, confirmed directly in a prior
// session. portfolios denormalizes user_name/user_handle/user_avatar
// directly onto its own row instead of joining. A nested select against
// a nonexistent relationship fails against Supabase's PostgREST API, so
// that version would have silently fallen through to the generic
// default for every single portfolio - the exact kind of regression
// this whole audit was asked to catch. Also switched from hardcoded
// Supabase credentials to process.env, matching this project's
// established convention (needs SUPABASE_URL and SUPABASE_ANON_KEY set
// in Vercel's Environment Variables - Production scope).
//
// Framework-agnostic (@vercel/edge, not next/server) because this
// project's vercel.json has "framework": null - it's an Expo web
// export, not Next.js.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SITE_URL = 'https://www.decent.ink';

const CRAWLER_UA_PATTERN = /bot|crawl|spider|facebookexternalhit|Twitterbot|Slackbot|LinkedInBot|WhatsApp|Discordbot|TelegramBot|Googlebot|Bingbot|Pinterest|redditbot|Applebot|SkypeUriPreview|vkShare/i;

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildHtml({ title, description, image, url, jsonLd }) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(url)}">
<meta property="og:site_name" content="DECENT">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:url" content="${escapeHtml(url)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(image)}">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body></body>
</html>`;
}

const DEFAULT_META = {
  title: 'DECENT',
  description: 'Discover and share UI/UX, illustration, and graphic design portfolios.',
  image: `${SITE_URL}/assets/og-default.png`,
};

const CACHE_HEADERS = { 'Cache-Control': 'public, max-age=3600, s-maxage=3600' };

async function supabaseGet(query) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null; // fail open, not a crash
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

export const config = {
  matcher: ['/p/:path*', '/@:path*'],
};

export default async function middleware(request) {
  const userAgent = request.headers.get('user-agent') || '';
  if (!CRAWLER_UA_PATTERN.test(userAgent)) {
    return next(); // real visitor - untouched, normal SPA loads as usual
  }

  const url = new URL(request.url);
  const path = url.pathname;

  try {
    if (path.startsWith('/p/')) {
      const portfolioId = path.slice('/p/'.length);
      // No join - user_name/user_handle/user_avatar are denormalized
      // directly onto portfolios, there is no FK to profiles.
      const p = await supabaseGet(
        `portfolios?id=eq.${encodeURIComponent(portfolioId)}&select=title,brief,cover_url,user_name,user_handle,portfolio_type`
      );
      if (p) {
        const typeLabel =
          p.portfolio_type === 'graphic_design' ? 'Graphic Design' :
          p.portfolio_type === 'illustration' ? 'Illustration' : 'UI/UX Design';
        const title = p.user_name ? `${p.title} by ${p.user_name} | DECENT` : `${p.title} | DECENT`;
        const description = (p.brief || `A ${typeLabel} portfolio by ${p.user_name || 'a designer'} on DECENT.`).slice(0, 160);
        const image = p.cover_url || DEFAULT_META.image;
        return new Response(
          buildHtml({
            title,
            description,
            image,
            url: request.url,
            jsonLd: {
              '@context': 'https://schema.org',
              '@type': 'CreativeWork',
              name: p.title,
              description,
              image,
              url: request.url,
              ...(p.user_name ? {
                author: {
                  '@type': 'Person',
                  name: p.user_name,
                  ...(p.user_handle ? { url: `${SITE_URL}/@${p.user_handle}` } : {}),
                },
              } : {}),
            },
          }),
          { headers: { 'content-type': 'text/html; charset=utf-8', ...CACHE_HEADERS } }
        );
      }
    } else if (path.startsWith('/@')) {
      const handle = path.slice('/@'.length);
      const profile = await supabaseGet(
        `profiles?handle=eq.${encodeURIComponent(handle)}&select=name,bio,avatar_url`
      );
      if (profile) {
        const description = (profile.bio || `Check out ${profile.name}'s portfolios on DECENT.`).slice(0, 160);
        const image = profile.avatar_url || DEFAULT_META.image;
        return new Response(
          buildHtml({
            title: `${profile.name} on DECENT`,
            description,
            image,
            url: request.url,
            jsonLd: {
              '@context': 'https://schema.org',
              '@type': 'Person',
              name: profile.name,
              description,
              image,
              url: request.url,
            },
          }),
          { headers: { 'content-type': 'text/html; charset=utf-8', ...CACHE_HEADERS } }
        );
      }
    }
  } catch (e) {
    // Supabase fetch failed for whatever reason - fall through to the
    // generic default below rather than showing a broken/blank preview.
  }

  // Unmatched, or the fetch above found nothing (deleted portfolio, bad
  // handle, missing env vars, etc.) - generic site-wide preview instead
  // of nothing at all.
  return new Response(
    buildHtml({
      ...DEFAULT_META,
      url: request.url,
      jsonLd: { '@context': 'https://schema.org', '@type': 'WebSite', name: 'DECENT', url: SITE_URL },
    }),
    { headers: { 'content-type': 'text/html; charset=utf-8', ...CACHE_HEADERS } }
  );
}
