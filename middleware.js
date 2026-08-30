// Vercel Edge Middleware - dynamic Open Graph previews for DECENT profile
// and portfolio links (Discord, Twitter/X, WhatsApp, Telegram, Slack, etc).
//
// WHY THIS EXISTS: DECENT is a client-side React SPA - the real content only
// exists after JavaScript runs in a browser. Social media crawlers (Discord's
// link-unfurler included) never execute JavaScript; they fetch the raw HTML
// once and read whatever <meta> tags are already there. Without this file,
// every shared link - your profile, someone else's, any portfolio - would
// show the exact same generic index.html preview, if it shows anything at
// all. This intercepts ONLY requests from known bot user-agents and returns
// a tiny, fully-formed HTML document with that specific profile's or
// portfolio's real title/description/image already baked in - before any
// JavaScript would even be needed. Real visitors (normal user-agents) are
// untouched and get the actual app exactly as before.
//
// Also emits <meta name="description">, <link rel="canonical">, and a
// JSON-LD <script> block (Person for profiles, CreativeWork for
// portfolios) - these are what actually help Google's organic search
// (name/title lookups, rich results) beyond just social-link previews.
//
// SETUP (do this before it does anything):
// 1. Save this file as `middleware.js` in the project ROOT - same folder as
//    package.json and app.json, i.e. C:\DECENT App\live claude\middleware.js
// 2. Vercel dashboard -> your project -> Settings -> Environment Variables
//    -> add SUPABASE_ANON_KEY (Production scope) with your Supabase anon/
//    public key (Supabase dashboard -> Project Settings -> API -> anon key -
//    NOT the service_role key, this must stay the public-safe one since it's
//    the same key already shipped in your client bundle).
// 3. git add middleware.js, commit, push. Vercel picks up root-level
//    middleware.js automatically on the next deploy - no other config
//    needed, this works independently of the Expo/static build.
//
// TESTING: Discord has no public debugger, so use a generic one instead -
// https://www.opengraph.xyz/ - paste a /@handle or /p/:id link and it'll
// show you exactly what Discord/Twitter/etc would render. You can also just
// paste the link directly into a private Discord channel to see the real
// embed. For Google's side (description/canonical/JSON-LD), use
// https://search.google.com/test/rich-results or
// `curl.exe -A "Googlebot" <url>` and inspect the raw HTML.

export const config = {
  matcher: ['/@:handleOrId*', '/p/:id*']
};

// Discord's crawler identifies as "Discordbot" - the others are here too
// since the same fix covers every platform's unfurler for free.
const BOT_UA_REGEX = /Discordbot|Twitterbot|facebookexternalhit|Facebot|LinkedInBot|Slackbot|TelegramBot|WhatsApp|Pinterest|vkShare|W3C_Validator|Googlebot|Applebot|redditbot|SkypeUriPreview/i;

const SUPABASE_URL = 'https://kqjdqidwzegbtysarksa.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const DEFAULT_IMAGE = 'https://ui-avatars.com/api/?name=%3F&background=8B5CF6&color=FFFFFF&size=400&bold=true&format=png';

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function ogPage({ title, description, image, url, jsonLd, heading, bodyText, authorLine }) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${escapeHtml(url)}" />
<meta property="og:site_name" content="DECENT" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:image" content="${escapeHtml(image)}" />
<meta property="og:url" content="${escapeHtml(url)}" />
<meta property="og:type" content="website" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${escapeHtml(image)}" />
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body>
<h1>${escapeHtml(heading)}</h1>
${authorLine ? `<p>${escapeHtml(authorLine)}</p>` : ''}
<p>${escapeHtml(bodyText)}</p>
${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(heading)}" />` : ''}
</body>
</html>`;
}

export default async function middleware(req) {
  const userAgent = req.headers.get('user-agent') || '';
  // Real visitors: do nothing, let the actual app load exactly as before.
  if (!BOT_UA_REGEX.test(userAgent)) return;
  if (!SUPABASE_ANON_KEY) return; // env var not set yet - fail open to the normal SPA rather than a broken preview

  const url = new URL(req.url);
  const path = url.pathname;
  const canonicalUrl = `${url.origin}${url.pathname}`;
  const sbHeaders = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };

  try {
    const designerMatch = path.match(/^\/@([^/]+)$/);
    if (designerMatch) {
      const handleOrId = decodeURIComponent(designerMatch[1]);
      // Same handle-then-id fallback as handleIncomingRoute in App.js, so
      // this stays correct for both /@handle and /@rawUserId share links.
      let rows = await (await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?handle=eq.${encodeURIComponent(handleOrId)}&select=name,avatar_url,bio,role,handle,links`,
        { headers: sbHeaders }
      )).json();
      if (!Array.isArray(rows) || !rows.length) {
        rows = await (await fetch(
          `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(handleOrId)}&select=name,avatar_url,bio,role,handle,links`,
          { headers: sbHeaders }
        )).json();
      }
      const profile = Array.isArray(rows) ? rows[0] : null;
      if (!profile) return; // unknown handle/id - fall through to the normal app (which shows its own not-found state)

      const description = profile.bio || profile.role || "Check out this designer's portfolio on DECENT.";
      // sameAs: profiles.links is already a plain array of URL strings the
      // user added themselves (LinkedIn, Dribbble, etc) - passing it straight
      // through helps Google tie "Iqbal Aprianda Putra" to one consistent
      // entity across platforms for exact-name searches.
      const sameAs = Array.isArray(profile.links) ? profile.links.filter((l) => typeof l === 'string' && l.trim()) : [];
      return new Response(ogPage({
        title: `${profile.name || 'Designer'} on DECENT`,
        description,
        image: profile.avatar_url || DEFAULT_IMAGE,
        url: canonicalUrl,
        heading: profile.name || 'Designer',
        bodyText: description,
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'Person',
          name: profile.name || 'Designer',
          alternateName: profile.handle || handleOrId,
          jobTitle: profile.role || undefined,
          description,
          image: profile.avatar_url || undefined,
          url: canonicalUrl,
          sameAs: sameAs.length ? sameAs : undefined
        }
      }), { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }

    const portfolioMatch = path.match(/^\/p\/([^/]+)$/);
    if (portfolioMatch) {
      const portfolioId = decodeURIComponent(portfolioMatch[1]);
      const rows = await (await fetch(
        `${SUPABASE_URL}/rest/v1/portfolios?id=eq.${encodeURIComponent(portfolioId)}&select=title,cover_url,user_name,user_handle,brief`,
        { headers: sbHeaders }
      )).json();
      const portfolio = Array.isArray(rows) ? rows[0] : null;
      if (!portfolio) return;

      const description = portfolio.brief || 'Check out this portfolio on DECENT.';
      const authorLine = portfolio.user_name ? `By ${portfolio.user_name}` : undefined;
      return new Response(ogPage({
        title: `${portfolio.title || 'Portfolio'} by ${portfolio.user_name || 'a DECENT designer'}`,
        description,
        image: portfolio.cover_url || DEFAULT_IMAGE,
        url: canonicalUrl,
        heading: portfolio.title || 'Portfolio',
        bodyText: description,
        authorLine,
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'CreativeWork',
          name: portfolio.title || 'Portfolio',
          description,
          image: portfolio.cover_url || undefined,
          url: canonicalUrl,
          author: portfolio.user_name
            ? {
                '@type': 'Person',
                name: portfolio.user_name,
                url: portfolio.user_handle ? `${url.origin}/@${portfolio.user_handle}` : undefined
              }
            : undefined
        }
      }), { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
  } catch (e) {
    return; // any failure (network, bad data) falls through to the normal SPA instead of a broken preview
  }
}
