# Foundation Rescue + Underpin

Fuck it. We no longer need Foundation.

This is a free tool for every artist affected by the shutdown. Paste your wallet, see exactly what you created and what you collected - no signature required.

Everything is open source. Fork it, build on it, make it yours.

---

## Foundation Rescue

Two steps:

1. Paste your address. See every Foundation NFT you created or own, pulled straight from on-chain contract data.

2. Get a free Pinata account and pin your art to IPFS in one click. Your content, your storage, nobody can take it down.

The tool also shows art you collected from other artists - so you can tell them before their work disappears.

### Live tool

[foundation-rescue.vercel.app](https://foundation-rescue.vercel.app)

---

## Underpin

The real chapter starts now.

Underpin is a vision for a decentralized art marketplace with no company behind it. No gatekeepers, no single point of failure.

AI dev tools exist. Artists can run their own infrastructure. Foundation shutting down is not a loss - it's proof we need to own the stack.

Fork it, build on it, make it yours.

[See the vision](https://foundation-rescue.vercel.app/underpin.html)

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

Artists provide their own Pinata JWT in the UI - it is never stored server-side.

### Deploy your own

```bash
npx vercel --prod
npx vercel env add ALCHEMY_KEY
npx vercel --prod  # redeploy with env var
```

---

## How it works

**95,297 Foundation collection contracts** - enumerated directly from Foundation's Factory V1 and V2 creation events on-chain via Etherscan. A complete, verifiable, permanent list.

For any wallet:

1. `getContractsForOwner` - gets every unique contract address in the wallet (lightweight, no NFT data)
2. Set lookup against 95k Foundation contracts - instant, definitive
3. `getContractMetadata` on Foundation contracts only - determines which you created vs collected via `contractDeployer`
4. `getNFTsForOwner` with only Foundation contracts - targeted fetch, full metadata

No blind scanning. Works for any wallet size.

**API: `POST /api/rescue`**

```json
// Request
{ "wallet": "0x...", "pinataJwt": "optional", "createdOnly": false }

// Response
{
  "nftsFound": 12,
  "foundationContracts": 4,
  "createdContracts": 2,
  "collectedContracts": 2,
  "nftCards": [...],
  "pinned": [...],
  "failed": [...],
  "listings": [...]
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
  index.html                    # Rescue tool frontend
  underpin.html                 # Underpin vision page
  foundation-contracts-list.json # 95k Foundation contract addresses
  api/
    rescue.js                   # Vercel serverless function
  rescue.mjs                    # CLI version
  vercel.json                   # 60s timeout config
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

No core team, no roadmap, no token. If something is broken, open an issue. If you want to build something, open a PR. If you want to run your own instance, fork it.

---

## License

MIT. Do whatever you want with it.

---

The next chapter for digital art is artists deploying their own contracts, minting directly on-chain, owning their media and their collector relationships end to end - on open infrastructure that nobody can shut down.

Fork it, run it, make it yours.
