import { next } from '@vercel/edge';

// Rich link previews (like GitHub's) for shared /p/:id and /@:handle URLs.
// The app is a client-rendered SPA (Expo web export) - a preview bot for
// iMessage/WhatsApp/Twitter/Slack/Discord fetches the URL and reads
// whatever's in the raw HTML BEFORE any JavaScript runs, so without this,
// every shared link looks identical (one generic index.html shell) no
// matter which portfolio or designer it actually points to.
//
// This only affects what a preview BOT sees. Real visitors (anything
// that isn't a recognized crawler User-Agent) pass straight through to
// the normal app, completely untouched - see the isCrawler check below.
//
// Framework-agnostic (@vercel/edge, not next/server) because this
// project's vercel.json has "framework": null - it's an Expo web
// export, not Next.js, so the Next-specific NextResponse API used in
// decent-admin's proxy.js doesn't apply here at all.

const SUPABASE_URL = 'https://kqjdqidwzegbtysarksa.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_d59enY6PUoyiMHne-U1bQQ_kDZZq7X7';
const SITE_URL = 'https://www.decent.ink';

const CRAWLER_UA_PATTERN = /facebookexternalhit|Twitterbot|Slackbot|LinkedInBot|Discordbot|TelegramBot|WhatsApp|Pinterest|redditbot|Applebot|SkypeUriPreview|vkShare|W3C_Validator/i;

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildHtml({ title, description, image, url }) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:url" content="${escapeHtml(url)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(image)}">
</head>
<body></body>
</html>`;
}

const DEFAULT_META = {
  title: 'DECENT',
  description: 'Discover and share UI/UX, illustration, and graphic design portfolios.',
  image: `${SITE_URL}/assets/og-default.png`,
};

async function supabaseGet(table, query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
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
      const portfolio = await supabaseGet(
        'portfolios',
        `id=eq.${encodeURIComponent(portfolioId)}&select=title,brief,cover_url`
      );
      if (portfolio) {
        return new Response(
          buildHtml({
            title: portfolio.title || DEFAULT_META.title,
            description: portfolio.brief || 'View this portfolio on DECENT.',
            image: portfolio.cover_url || DEFAULT_META.image,
            url: request.url,
          }),
          { headers: { 'content-type': 'text/html; charset=utf-8' } }
        );
      }
    } else if (path.startsWith('/@')) {
      const handle = path.slice('/@'.length);
      const profile = await supabaseGet(
        'profiles',
        `handle=eq.${encodeURIComponent(handle)}&select=name,avatar_url`
      );
      if (profile) {
        return new Response(
          buildHtml({
            title: `${profile.name} on DECENT`,
            description: `Check out ${profile.name}'s portfolios on DECENT.`,
            image: profile.avatar_url || DEFAULT_META.image,
            url: request.url,
          }),
          { headers: { 'content-type': 'text/html; charset=utf-8' } }
        );
      }
    }
  } catch (e) {
    // Supabase fetch failed for whatever reason - fall through to the
    // generic default below rather than showing a broken/blank preview.
  }

  // Unmatched, or the fetch above found nothing (deleted portfolio, bad
  // handle, etc.) - generic site-wide preview instead of nothing at all.
  return new Response(
    buildHtml({ ...DEFAULT_META, url: request.url }),
    { headers: { 'content-type': 'text/html; charset=utf-8' } }
  );
}
