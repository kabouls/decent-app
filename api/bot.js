// Vercel Edge Function — serves crawlers (Googlebot, Bingbot, facebookexternalhit,
// Twitterbot, LinkedInBot, WhatsApp, Discordbot, etc.) a minimal server-rendered
// HTML page with real <title>/meta/OG/JSON-LD, instead of the empty SPA shell.
// Normal users never hit this — vercel.json only routes here when the
// User-Agent matches a known bot (see vercel.json rewrites).
export const config = { runtime: 'edge' };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SITE_URL = 'https://www.decent.ink';

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function supaGet(query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`
    }
  });
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data) ? data[0] || null : data;
}

function renderShell({ title, description, image, url, jsonLd }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:url" content="${url}" />
${image ? `<meta property="og:image" content="${escapeHtml(image)}" />` : ''}
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
${image ? `<meta name="twitter:image" content="${escapeHtml(image)}" />` : ''}
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(description)}</p>
</body>
</html>`;
}

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  const id = searchParams.get('id');
  const handle = searchParams.get('handle');

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return new Response('Missing SUPABASE_URL / SUPABASE_ANON_KEY env vars', { status: 500 });
  }

  if (type === 'portfolio' && id) {
    // user_name/user_handle are denormalized directly on portfolios —
    // no join to profiles needed.
    const p = await supaGet(
      `portfolios?id=eq.${encodeURIComponent(id)}&select=title,brief,cover_url,portfolio_type,user_name,user_handle`
    );
    if (!p) return new Response('Not found', { status: 404 });

    const designerName = p.user_name || 'a DECENT designer';
    const typeLabel =
      p.portfolio_type === 'graphic_design' ? 'Graphic Design' :
      p.portfolio_type === 'illustration' ? 'Illustration' : 'UI/UX Design';
    const title = `${p.title} by ${designerName} | DECENT`;
    const description = (p.brief || `A ${typeLabel} portfolio by ${designerName} on DECENT.`).slice(0, 160);
    const url = `${SITE_URL}/p/${id}`;
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'CreativeWork',
      name: p.title,
      description,
      image: p.cover_url,
      url,
      author: p.user_name
        ? { '@type': 'Person', name: p.user_name, url: p.user_handle ? `${SITE_URL}/@${p.user_handle}` : undefined }
        : undefined
    };
    return new Response(renderShell({ title, description, image: p.cover_url, url, jsonLd }), {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600' }
    });
  }

  if (type === 'profile' && handle) {
    const person = await supaGet(
      `profiles?handle=eq.${encodeURIComponent(handle)}&select=name,role,bio,avatar_url,location`
    );
    if (!person) return new Response('Not found', { status: 404 });

    const title = `${person.name} (@${handle}) — ${person.role || 'Designer'} | DECENT`;
    const description = (
      person.bio || `${person.name} is a ${person.role || 'designer'} on DECENT${person.location ? `, based in ${person.location}` : ''}.`
    ).slice(0, 160);
    const url = `${SITE_URL}/@${handle}`;
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: person.name,
      alternateName: handle,
      jobTitle: person.role || undefined,
      description,
      image: person.avatar_url || undefined,
      url
    };
    return new Response(renderShell({ title, description, image: person.avatar_url, url, jsonLd }), {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600' }
    });
  }

  return new Response('Bad request', { status: 400 });
}
