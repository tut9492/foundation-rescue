# Foundation Rescue + Underpin

**Marketplaces shutting down is not the end. It's the beginning of a renaissance.**

With access to AI coding tools, digital artists can now control the full creation and curation experience end to end - without relying on an intermediary. Foundation closed its doors. Your token contracts are on-chain and permanent - but the art and metadata behind them lives on IPFS or Foundation's own servers, and that can disappear. What's missing is the infrastructure to preserve it and surface it on your own terms.

This repo is two things:

1. **Foundation Rescue** - a free tool that helps artists affected by the Foundation shutdown scan their wallet, pin their IPFS media before it disappears, and retrieve any NFTs locked in Foundation's marketplace contract.

2. **Underpin** - a vision and scaffold for a decentralized, community-owned digital art marketplace. No company behind it. No gatekeepers. Fork it, run it, make it yours.

---

## Foundation Rescue

### What it does

- Scans a wallet for Foundation NFTs via Alchemy
- Displays thumbnails with IPFS/lock status
- Pins IPFS metadata + media to the artist's own Pinata account
- Detects NFTs locked in the Foundation marketplace contract and provides exact calldata to retrieve them

### Live tool

[foundation-rescue.vercel.app](https://foundation-rescue.vercel.app)

---

## Underpin

Underpin is not a product. It's a starting point.

The idea: artists and creatives should control their own curation, end to end. The tools exist now - AI, open-source smart contracts, IPFS, forkable frontends. There is no good reason for a third party to sit between an artist and their audience.

Underpin is here for all artists and creatives to take that curation into their own hands.

[See the vision →](https://foundation-rescue.vercel.app/underpin.html)

---

## Setup

### Prerequisites

- Node.js 18+
- [Alchemy account](https://alchemy.com) - free tier works
- [Pinata account](https://pinata.cloud) - free tier works (for pinning)
- [Vercel account](https://vercel.com) - for deployment

### Local development

```bash
git clone https://github.com/tut9492/foundation-rescue
cd foundation-rescue
npm install
cp .env.example .env
# Add your ALCHEMY_KEY to .env
npx vercel dev
```

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `ALCHEMY_KEY` | Yes | Alchemy API key for NFT data + Ethereum RPC |

Artists provide their own Pinata JWT in the UI - it's never stored server-side.

### Deploy your own

```bash
npx vercel --prod
npx vercel env add ALCHEMY_KEY
npx vercel --prod  # redeploy with env var
```

---

## Architecture

```
foundation-rescue/
  index.html          # Rescue tool frontend (static)
  underpin.html       # Underpin manifesto page (static)
  api/
    rescue.js         # Vercel serverless function
  rescue.mjs          # CLI version of the rescue tool
  vercel.json         # Vercel config (60s timeout)
```

**API: `POST /api/rescue`**

```json
// Request
{ "wallet": "0x...", "pinataJwt": "optional" }

// Response
{
  "nftsFound": 3,
  "nftCards": [...],
  "pinned": [...],
  "failed": [...],
  "listings": [...]
}
```

**Foundation contracts used:**
- Marketplace: `0xcDA72070E455bb31C7690a170224Ce43623d0B6f`
- NFT721: `0x3B3ee1931Dc30C1957379FAc9aba94D1C48a5405`
- Factory V1: `0x3B612a5B49e025a6e4bA4eE4FB1EF46D13588059`
- Factory V2: `0x612E2DadDc89d91409e40f946f9f7CfE422e777E`

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

This is a community project. There is no core team, no roadmap, no token. If something is broken, open an issue. If you want to build something, open a PR. If you want to run your own instance, fork it.

---

## License

MIT - do whatever you want with it. See [LICENSE](LICENSE).

---

## Vision

The next chapter for digital art isn't another platform. It's artists building their own platforms, together, on open infrastructure that nobody can shut down.

That's what this is for.
