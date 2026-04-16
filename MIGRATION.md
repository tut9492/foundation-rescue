# Migration to Next.js

This branch migrates the repo from a vanilla HTML + Vercel serverless function to a full Next.js 15 App Router app. Nothing functional was removed; everything was ported.

## What changed

| Before | After |
| --- | --- |
| `index.html` | `app/page.tsx` |
| `underpin.html` | `app/underpin/page.tsx` |
| (none) | `app/profile/page.tsx` — new artist mint page |
| `api/rescue.js` | `app/api/rescue/route.ts` |
| Inline `<style>` | `app/globals.css` (scoped by `.rescue-page`, `.underpin-page`, `.profile-page`) |
| Inline `<script>` | React components in `app/page.tsx` |
| `vercel.json` (routing + 60s timeout) | Deleted. Routing is Next conventions. Timeout is `export const maxDuration = 60` in the route. |

## What's identical

- `/api/rescue` request + response shape — unchanged. Any client calling it (including third parties) keeps working.
- `foundation-contracts-list.json` — same file, same location at repo root.
- `rescue.mjs` CLI — untouched.
- The three Foundation contract addresses. The Alchemy call sequence. The Pinata pin flow. The marketplace lock detection. All logic preserved line-for-line.

## What's new

- `/profile` route. Connect wallet via RainbowKit → fetches art via existing `/api/rescue` endpoint → displays a grid of the artist's created + collected work. Phase 1 of Underpin. No signing, no DB, no pricing yet — just the canonical "your art, your page" surface that future phases (pricing, listings, on-chain profiles) will build on.
- RainbowKit + wagmi stack wired up, configured for mainnet, Base, Optimism, Arbitrum. Ready for any future contract interaction.
- TypeScript throughout. Shared types in `lib/types.ts` for the rescue API response, so every consumer (rescue tool, profile page, future pages) stays in sync.

## Environment

One new required env var: `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` (free from <https://cloud.reown.com>). Needed for the profile page's wallet connect. The rescue tool still runs without it.

## Deleting the old files

When merging, delete:

- `index.html`
- `underpin.html`
- `profile.html` (if present — the placeholder file in the old repo listing)
- `api/rescue.js`
- `vercel.json`

Keep:

- `foundation-contracts-list.json`
- `foundation-contracts.json`
- `rescue.mjs`
- `tut-logo.png`, `tut.png` (move into `public/` so Next serves them at `/tut-logo.png` etc.)
- `CONTRIBUTING.md`, `LICENSE`

## Local sanity check

```bash
npm install
cp .env.example .env
# fill in ALCHEMY_KEY and NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID
npm run dev
```

- Visit `/` — rescue tool should work identically to before.
- Visit `/underpin` — vision page, should look unchanged.
- Visit `/profile` — click "Connect wallet", approve in MetaMask, your art should load.
