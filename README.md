# DECENT

Portfolio-sharing app for UI/UX designers, illustrators, and graphic
designers - one clean link, real interactive Figma prototype embeds
instead of static screenshots. Live at [decent.ink](https://decent.ink).

React Native/Expo, single-file `App.js` (23,000+ lines) serving both
native (iOS/Android) and web via `Platform.OS` checks, backed by
Supabase for auth/data/storage.

## Get the app

- **Web**: [decent.ink](https://decent.ink)
- **Android (sideload)**: [latest build APK](https://expo.dev/artifacts/eas/400loQ6A2z2EbIaTmSZxnocjLxLLGSeuGCaCdUOapOo.apk)
  - Not on the Play Store yet - this is a direct sideload build. Android
    will warn about installing from an unknown source; that's expected.

## Setup

1. `npm install`
2. Copy `.env.local.example` to `.env.local` (Supabase URL/anon key)
3. `npx expo start` (native) or `npx expo start --web` (web)

## Deploying

**Native**: `eas build --platform android --profile preview` (or
`production`), then `eas update --branch preview` for JS-only changes
that don't need a full rebuild (most day-to-day fixes - a new build is
only needed for native dependency changes, like the video compression
work below).

**Web**: push to `main`, Vercel auto-deploys. Not a plain static export -
`vercel.json`'s `buildCommand` runs a copy step for the video
compression library's files before the actual `expo export -p web`
(see `package.json`'s `vercel-build` script). `middleware.js` also runs
here, separately from the app bundle itself - it serves real per-page
meta tags/JSON-LD to crawlers (Googlebot, social preview bots) since the
app itself is client-rendered and crawlers that don't execute JS would
otherwise see an empty shell.

## What's here

- `App.js` - the whole app
- `middleware.js` - Vercel Edge Middleware, SEO/link-preview meta tags
  for `/p/:id` and `/@:handle`, bot-only (real visitors pass through
  untouched)
- `api/sitemap.xml.js` - dynamic sitemap generated live from Supabase
- `public/robots.txt`, `public/.well-known/assetlinks.json` - crawler
  config and Android App Links verification (the latter currently uses
  the local upload keystore's fingerprint - will need updating with the
  Play App Signing certificate once actually submitted to Play Store)
- `supabase/functions/` - two Edge Functions: `send-push` (server-side
  push notification dispatch via a Database Webhook on `notifications`
  INSERT) and `delete-account` (real account deletion, not just
  deactivation - also reachable as a web link at `/delete-account` per
  Play Store's account-deletion policy)

## Known gaps

- No Play Store build profile in `eas.json` yet - the donations-gating
  flag (`EXPO_PUBLIC_DECENT_DISTRIBUTION`) has nowhere to actually apply
  until one exists
- `assets/og-default.png` referenced by `middleware.js` as the fallback
  preview image doesn't exist yet (only matters for deleted
  portfolios/bad handles/the bare root domain)
- Video compression on web (ffmpeg.wasm) is single-threaded - slower
  than it could be; the faster multi-threaded core needs COOP/COEP
  headers added to Vercel hosting, not yet done
- AV1-encoded source videos can't be compressed on web (no working AV1
  decoder in the WASM core) - falls back to uploading at original size
  with a toast explaining why, doesn't fail silently
