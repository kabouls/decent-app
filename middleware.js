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

function buildHtml({ title, description, image, url, jsonLd, bodyContent }) {
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
<body>${bodyContent || ''}</body>
</html>`;
}

// Canonical/og:url need to be a single, stable form regardless of how a
// crawler actually reached the page - stripping query strings (so a
// ?utm_source=... link doesn't get treated as a separate canonical page
// from the plain one) and always using SITE_URL's host rather than
// whatever host the incoming request happened to use (so a non-www hit,
// if one ever reaches this middleware before any host-level redirect,
// can't produce a www/non-www canonical split). request.url was used
// directly for this everywhere before - same fix applies to portfolios
// and profiles below, not just /tools.
function canonicalUrl(path) {
  return `${SITE_URL}${path}`;
}

const DEFAULT_META = {
  title: 'DECENT',
  description: 'Discover and share UI/UX, illustration, and graphic design portfolios.',
  image: `${SITE_URL}/assets/og-default.png`,
};

const CACHE_HEADERS = { 'Cache-Control': 'public, max-age=3600, s-maxage=3600' };

// /tools pages are static (not user-generated like portfolios/profiles),
// so this needs no Supabase fetch at all - just a lookup table. Keys
// match the URL slug used by the app's own client-side router (see
// TOOLS_ROUTE_SLUGS in App.js) so the two stay in sync by construction
// rather than by convention alone.
//
// `image` is per-tool (falls back to DEFAULT_META.image via `|| ` below
// if left unset) so a shared link to the PDF editor doesn't look
// visually identical to a shared portfolio link in social previews -
// add real asset paths here once dedicated per-tool images exist rather
// than leaving every tool on the same generic one indefinitely.
//
// `blurb` is the visible body copy the bot-facing page actually renders
// - previously this page shipped with an empty <body>, meta tags only.
// Google specifically still works fine either way (it renders the real
// JS app on a second pass and sees the full page there), but plenty of
// other crawlers - most AI-answer bots (ClaudeBot, PerplexityBot,
// GPTBot), and Bing less reliably than Google - never execute JS at
// all, so this response IS the entire page they ever see. A title and
// meta description alone gives a relevance algorithm almost nothing to
// evaluate a page against search intent with.
const TOOLS_META = {
  '': {
    title: 'Free Tools for Designers & Job Seekers | DECENT',
    description: 'Free image compressor, QR code generator, image converter, PDF editor, and resume maker. No signup, no ads, no limits - everything runs on your device.',
    blurb: 'Five free tools that run entirely in your browser or the DECENT app: compress images to a target size, generate custom QR codes, convert between JPEG/PNG/WEBP, edit PDFs (merge, reorder, rotate, crop, compress), and build a resume as a PDF. No account, no upload to a server, no limits.',
  },
  'image-compressor': {
    title: 'Free Image Compressor - Shrink Photos to Any Size | DECENT Tools',
    description: 'Compress images to a target file size for free. No signup, no upload - runs entirely in your browser or the DECENT app.',
    blurb: 'Compress JPEG, PNG, or WEBP images down to a target file size in kilobytes - useful for application portals, email attachment limits, or anywhere with a strict upload cap. Processes entirely on your device; nothing is uploaded to a server.',
  },
  'qr-code-generator': {
    title: 'Free QR Code Generator - Customizable, No Signup | DECENT Tools',
    description: 'Generate QR codes for URLs, WiFi, contact cards, and more. Custom colors, logo, and export as PNG or SVG - completely free.',
    blurb: 'Generate a QR code for a URL, WiFi network, contact card (vCard), or plain text. Customize the color, dot style, and add a logo in the center, then export as PNG or SVG. Free, with no account required.',
  },
  'image-converter': {
    title: 'Free Image Converter - JPEG, PNG, WEBP | DECENT Tools',
    description: 'Convert images between JPEG, PNG, and WEBP for free, in batches of up to 10. No signup, nothing uploaded anywhere.',
    blurb: 'Convert images between JPEG, PNG, and WEBP formats, up to 10 at a time. Runs entirely on your device - nothing is uploaded anywhere. Free, no account required.',
  },
  'pdf-editor': {
    title: 'Free PDF Editor - Merge, Reorder, Rotate Pages | DECENT Tools',
    description: 'Merge PDFs and photos into one document, reorder pages, rotate, and delete - free, no signup, no software to install.',
    blurb: 'Merge multiple PDFs and photos into a single document, reorder and rotate pages, crop, delete, add page numbers, and compress the result to a target file size. Free, with no account or software install required.',
  },
  'resume-maker': {
    title: 'Free Resume Maker - Build & Export a Resume PDF | DECENT Tools',
    description: 'Build a resume with your experience, education, and skills, then export as a real PDF - free, no signup, no software to install.',
    blurb: 'Fill in your personal info, work experience, education, and skills, then export a clean, professional resume as a PDF. Optionally include a QR code linking to your DECENT portfolio. Free, with no account or software install required.',
  },
};

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
  matcher: ['/p/:path*', '/@:path*', '/tools', '/tools/:path*'],
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
        const pageUrl = canonicalUrl(path);
        return new Response(
          buildHtml({
            title,
            description,
            image,
            url: pageUrl,
            bodyContent: `<h1>${escapeHtml(p.title)}</h1><p>${escapeHtml(description)}</p>`,
            jsonLd: {
              '@context': 'https://schema.org',
              '@type': 'CreativeWork',
              name: p.title,
              description,
              image,
              url: pageUrl,
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
        const pageUrl = canonicalUrl(path);
        return new Response(
          buildHtml({
            title: `${profile.name} on DECENT`,
            description,
            image,
            url: pageUrl,
            bodyContent: `<h1>${escapeHtml(profile.name)}</h1><p>${escapeHtml(description)}</p>`,
            jsonLd: {
              '@context': 'https://schema.org',
              '@type': 'Person',
              name: profile.name,
              description,
              image,
              url: pageUrl,
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

  if (path === '/tools' || path.startsWith('/tools/')) {
    const slug = path === '/tools' ? '' : path.slice('/tools/'.length).replace(/\/$/, '');
    const meta = TOOLS_META[slug];
    if (meta) {
      const pageUrl = canonicalUrl(path);
      return new Response(
        buildHtml({
          title: meta.title,
          description: meta.description,
          image: meta.image || DEFAULT_META.image,
          url: pageUrl,
          bodyContent: `<h1>${escapeHtml(meta.title.split(' | ')[0])}</h1><p>${escapeHtml(meta.blurb || meta.description)}</p>`,
          jsonLd: {
            '@context': 'https://schema.org',
            '@type': 'WebApplication',
            name: meta.title.split(' | ')[0],
            description: meta.description,
            url: pageUrl,
            applicationCategory: 'UtilitiesApplication',
            operatingSystem: 'Any', // commonly required for Google's rich-result eligibility for WebApplication/SoftwareApplication markup - correct data without this can still just never trigger the rich snippet
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
          },
        }),
        { headers: { 'content-type': 'text/html; charset=utf-8', ...CACHE_HEADERS } }
      );
    }
  }

  // Unmatched, or the fetch above found nothing (deleted portfolio, bad
  // handle, missing env vars, etc.) - generic site-wide preview instead
  // of nothing at all.
  return new Response(
    buildHtml({
      ...DEFAULT_META,
      url: canonicalUrl(path),
      bodyContent: `<h1>${escapeHtml(DEFAULT_META.title)}</h1><p>${escapeHtml(DEFAULT_META.description)}</p>`,
      jsonLd: { '@context': 'https://schema.org', '@type': 'WebSite', name: 'DECENT', url: SITE_URL },
    }),
    { headers: { 'content-type': 'text/html; charset=utf-8', ...CACHE_HEADERS } }
  );
}
