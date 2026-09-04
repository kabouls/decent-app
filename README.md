# DECENT

Hey, I'm Iqbal. I'm a UI/UX designer, not a developer — I have basically zero traditional coding background. This whole app was "vibe coded" (built almost entirely through AI-assisted development), because I mainly work in Figma and just wanted one clean, nice-looking place to actually showcase my portfolio, instead of scattered links and static PDFs.

It's a personal passion project. Expect rough edges, and feel free to poke around the source — nothing hidden.

## Features

- **Rich portfolio pages** — case studies, image galleries, Figma/prototype embeds, live links, block-based editor (drop in images, side-by-side rows, whatever)
- **Designer profiles** — bio, location, socials, followers/following, pin up to 2 portfolios to the top of your profile
- **Discover & Search** — browse designers, search by name/tag/topic, trending keywords, and it'll even guess what you meant if you fat-finger a typo
- **Social layer** — like, follow, comment-free feed (For You + Circle), unfollowing asks you to confirm first so it's not an oops-tap
- **Share anywhere** — QR codes and real shareable links (`/p/:id`, `/@handle`) with proper link previews on Discord/Twitter/etc. You can even share a link to just one type of your portfolio (like "only show my UI/UX stuff")
- **Software tags** — tag what tools you actually used (Figma, Photoshop, Procreate, Sketch, whatever) with real logos on illustration and UI/UX portfolios
- **AI disclosure, done properly** — if you used AI for illustration work, you have to say so and how. Fully AI-generated art isn't allowed here, and there's a built-in way for people to flag it if something looks off
- **Notifications** — actually real ones now. Push notifications work server-side, so you'll get pinged even if the app's fully closed, not just while it's open
- **NSFW handling that respects the rules** — Safe Search toggle on web, but the mobile app just doesn't touch NSFW content at all (Google Play doesn't allow it, so why fight it)
- **Light/dark theme**, guest browsing (no account required to explore)
- **Cross-platform** — same codebase on web and Android, with an "Open in App" nudge on mobile web if you've got the app installed

## Download

📱 **[Download the latest APK](https://expo.dev/artifacts/eas/pm0RvyhbwVp2MOVj3NWYTLg28HSpa1XCs-Licpo5KuY.apk)**

This is a direct install (not on the Play Store yet), so Android will show an "unknown sources" prompt on first install — that's expected for any app installed outside the Play Store, not a warning specific to this app.

🌐 **[Try it on the web](https://www.decent.ink)** — no install needed.

## Tech Stack

React Native (Expo) · Supabase (auth, database, storage) · Vercel (web hosting) · Sentry (crash reporting)

## Status

Actively in development — expect frequent updates.

## Support

If you find this useful, a donation helps keep it running.

### 🇮🇩 Indonesia

<p align="center">
  <img src="./assets/qris-code.png" alt="QRIS donation code" width="220">
</p>

Scan the QRIS code above with any e-wallet or mobile banking app.

### 🌍 International

<p align="center">
  <a href="https://ko-fi.com/iputra07">
    <img src="https://storage.ko-fi.com/cdn/kofi5.png?v=3" alt="Support me on Ko-fi" width="200">
  </a>
</p>

Same option also available in-app under Settings → Support & Donate.

## Verified Safe

✅ Scanned with [VirusTotal](https://www.virustotal.com/gui/file/1619a55e5888e33670ca8971424a32b930431362b3bb59b0166e0e85d04b49b5?nocache=1) — see the report for current detection results

Since this isn't distributed through the Play Store yet, Android's install prompt looks generic/unfamiliar — the scan above is independent, third-party confirmation this build is clean.

## Contact / Feedback

Found a bug, want a feature, or just have thoughts? Reach out directly:

- 📧 **Email:** [iputra07@gmail.com](mailto:iputra07@gmail.com)
- 💼 **LinkedIn:** [Iqbal Aprianda Putra](https://www.linkedin.com/in/iqbal-putra-2220a11a5)
- 💬 **Discord:** `@kabouls`
