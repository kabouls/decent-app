# DECENT Admin

Internal moderation & analytics dashboard for [DECENT](https://decent.ink).
Separate Next.js app, own repo, own Vercel project - deliberately not
bundled into the main React Native app (admin code shouldn't ship to every
user's device).

## Setup

1. Run `migrations/001_admin_app.sql` against the main DECENT Supabase
   project (`kqjdqidwzegbtysarksa`) - **not** a new project. Note: this adds
   `profiles.is_admin`, which doesn't exist yet anywhere in the main app.
2. Manually set `is_admin = true` on your own profile row in Supabase.
3. Copy `.env.local.example` to `.env.local` and fill in the anon key and
   service role key from Supabase project settings.
4. `npm install`
5. `npm run dev`

## Deploying

Push to `main`, Vercel auto-deploys - it's a plain Next.js app so Vercel
just handles it natively, no custom build config needed (unlike the main
app's Expo web export, which needed a bunch of extra wrangling). Set the
same three env vars in the Vercel project settings (Environment
Variables) - `.env.local` is gitignored and won't carry over.

## What's here

- `/login` - Supabase Auth email/password sign-in
- `/insights` - the home page now. Used to be split across `/dashboard`
  and `/insights` separately, merged into one so you're not bouncing
  between two pages for the same kind of thing. Covers:
  - Top-line numbers: users, portfolios, active users (24h/7d), new
    signups/portfolios, activation rate, pending reports
  - **Activation funnel** - what % of everyone who's ever signed up has
    actually posted something
  - **Reports backlog** - pending count + how old the oldest one is (so
    you know if something's been sitting too long)
  - Currently banned/suspended counts (full list lives on `/moderation`)
  - **Interactive signup/posting trend chart** (Recharts, actually
    hoverable/toggleable - not just static bars)
  - Software support requests people have asked for (from the "which
    tool would you like supported" prompt in the app)
  - Portfolio type breakdown, AI disclosure rate
  - Login method split (password vs Google), push notification token
    health
  - Top categories/tags, with a specific frontend-interest count pulled
    out of those
  - Leaderboards: most-liked portfolios and most-followed designers,
    last 30 days
  - Recently joined designers
  - **Storage breakdown by folder** (avatars/covers/showcase/videos) -
    so you can actually see what's filling up storage instead of just a
    single combined number
- `/reports` - moderation queue. For `target_type: 'user'` reports: Warn /
  Suspend (with duration) / Ban / Flag-only. Every action snapshots the
  prior profile state into `moderation_log` and can be reverted from the
  UI.
- `/moderation` - new page, just a clean list of who's currently banned
  and who's currently suspended (with when their suspension lifts), each
  with the reason from their last moderation action.
- `/tags` - new page, every custom tag anyone's ever created, grouped by
  portfolio type (they're scoped per type now) and sorted by how much
  they're actually used. Good for spotting junk/duplicate tags before
  they pile up.
- `middleware.js` - gates every route except `/login` behind a real signed
  in + `profiles.is_admin` check (not just "logged in").

## Known gaps / next steps

- The main app (`App.js`) doesn't yet **enforce** `is_banned` /
  `suspended_until` anywhere - banning someone here doesn't currently
  block them from using the app. That's follow-up scope in the main
  codebase, not this repo.
- Portfolio-targeted reports (`target_type: 'portfolio'`) only get a
  "Mark resolved" button right now - no portfolio-level actions (hide,
  delete) built yet.
- No pagination on `/reports` - `limit(100)`, fine for now given report
  volume.
- Storage breakdown only walks the 4 known top-level folders
  (avatars/covers/showcase/videos), not a fully recursive scan - fine
  since that's the whole bucket structure right now, but worth
  revisiting if that structure ever changes.
- Push token "stale" count on `/insights` is a heuristic (token saved +
  60 days inactive), not a real check that the token still resolves -
  there's no way to know that without actually trying to send to it.
