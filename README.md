# Foundation Rescue + Underpin

Fuck it. We no longer need Foundation.

This is a free tool for every artist affected by the shutdown. Paste your wallet, see exactly what you created and what you collected — no signature required.

Everything is open source. Fork it, build on it, make it yours.

---

## What's in this repo

**Foundation Rescue** (`/`) — the tool that got us here. Paste a wallet, pin your IPFS content to your own Pinata account, get the calldata to unlist anything stuck in Foundation's marketplace contract.

**Underpin** (`/underpin`) — the vision. A decentralized, open-source marketplace. No company behind it. Fork it. Run it. Own it.

**Profile** (`/profile`) — the beginning of Underpin. Connect your wallet, see your art, build your own mint page. Phase 1: wallet + display. What comes next is what the community builds.

**CLI** (`rescue.mjs`) — the command-line version of the rescue tool, unchanged.

---

## Setup

### Prerequisites

- Node.js 18+
- [Alchemy account](https://alchemy.com) — free tier works
- [WalletConnect / Reown project](https://cloud.reown.com) — free, needed for wallet connect on the profile page
- [Pinata account](https://pinata.cloud) — free tier works (for pinning)
- [Vercel account](https://vercel.com) — for deployment

### Local development

```bash
git clone https://github.com/tut9492/foundation-rescue
cd foundation-rescue
npm install
cp .env.example .env
# Add your ALCHEMY_KEY and NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID
npm run dev
```

Open <http://localhost:3000>.

### Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `ALCHEMY_KEY` | Yes | Alchemy API key for NFT data + Ethereum RPC |
| `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` | Yes | WalletConnect/Reown project ID for the profile page's wallet connect |

Artists provide their own Pinata JWT in the UI — it is never stored server-side.

### Deploy your own

```bash
npx vercel --prod
npx vercel env add ALCHEMY_KEY
npx vercel env add NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID
npx vercel --prod  # redeploy with env vars
```

---

## How it works

**95,297 Foundation collection contracts** — enumerated directly from Foundation's Factory V1 and V2 creation events on-chain via Etherscan. A complete, verifiable, permanent list.

For any wallet:

1. `getContractsForOwner` — gets every unique contract address in the wallet (lightweight, no NFT data)
2. Set lookup against 95k Foundation contracts — instant, definitive
3. `getContractMetadata` on Foundation contracts only — determines which you created vs collected via `contractDeployer`
4. `getNFTsForOwner` with only Foundation contracts — targeted fetch, full metadata

No blind scanning. Works for any wallet size.

**API: `POST /api/rescue`**

```jsonc
// Request
{ "wallet": "0x...", "pinataJwt": "optional", "createdOnly": false }

// Response
{
  "nftsFound": 12,
  "foundationContracts": 4,
  "createdContracts": 2,
  "collectedContracts": 2,
  "nftCards": [/* ... */],
  "pinned": [/* ... */],
  "failed": [/* ... */],
  "listings": [/* ... */]
}
```

**Foundation contracts used:**

- Marketplace: `0xcDA72070E455bb31C7690a170224Ce43623d0B6f`
- NFT721 (shared): `0x3B3ee1931Dc30C1957379FAc9aba94D1C48a5405`
- Factory V1: `0x3B612a5B49e025a6e4bA4eE4FB1EF46D13588059`
- Factory V2: `0x612E2DadDc89d91409e40f946f9f7CfE422e777E`

---

## Architecture

```
foundation-rescue/
  app/
    layout.tsx                  # Root layout + providers
    providers.tsx               # wagmi + RainbowKit + react-query
    globals.css                 # All three design systems
    page.tsx                    # Rescue tool
    underpin/page.tsx           # Underpin vision page
    profile/page.tsx            # Artist profile (Phase 1: connect + display)
    api/
      rescue/route.ts           # API route (migrated from api/rescue.js)
  components/
    TutLogo.tsx                 # Shared "Built by Tut" badge
  lib/
    wagmi.ts                    # wagmi + RainbowKit config
    types.ts                    # Shared API response types
  foundation-contracts-list.json  # 95k Foundation contract addresses
  rescue.mjs                    # CLI version (unchanged)
  public/
    tut-logo.png
    tut.png
```

---

## Stack

Next.js 15 (App Router) · TypeScript · wagmi v2 · RainbowKit · viem · React Query · Tailwind-free (scoped CSS)

No CSS framework. The rescue tool is brutalist (light, thick borders, color-coded). Underpin and the profile page are editorial (dark, thin lines, monochrome). Deliberate.

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

No core team, no roadmap, no token. If something is broken, open an issue. If you want to build something, open a PR. If you want to run your own instance, fork it.

---

## License

MIT. Do whatever you want with it.

---

The next chapter for digital art is artists deploying their own contracts, minting directly on-chain, owning their media and their collector relationships end to end — on open infrastructure that nobody can shut down.

Fork it, run it, make it yours.
