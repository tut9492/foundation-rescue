# Contributing to Foundation Rescue + Underpin

There is no core team. No roadmap. No process. Just open source infrastructure for the art community - built by whoever shows up.

If something is broken, fix it. If something is missing, build it. If you disagree with a direction, fork it and run it better. That's the whole point.

---

## What needs building

The rescue tool is functional. Underpin is a vision waiting for builders. Here's where to start:

**Foundation Rescue**
- Better detection of Foundation collection contracts (individual per-creator contracts deployed by the factory)
- Support for other platforms beyond Foundation (SuperRare, Nifty Gateway, etc.)
- Batch wallet scanning for collectors with many NFTs
- CLI improvements

**Underpin**
- Smart contracts - non-custodial marketplace on Ethereum, royalties at the protocol level
- Indexer - open, self-hostable indexing layer for on-chain listings
- Gallery frontend - browse listed artwork without wallet connection
- Artist submission flow - list an NFT in a few clicks
- Collector experience - buy direct, no intermediary

---

## How to contribute

1. Fork the repo
2. Create a branch (`git checkout -b feature/your-thing`)
3. Make your changes
4. Open a pull request with a clear description of what and why

No formal review process. If it's good and doesn't break anything, it gets merged.

---

## Running locally

```bash
git clone https://github.com/tut9492/foundation-rescue
cd foundation-rescue
npm install
cp .env.example .env
# Add your ALCHEMY_KEY
npx vercel dev
```

---

## Principles for contributors

- Keep it simple. No unnecessary dependencies.
- No custody. User assets stay in user wallets.
- No gatekeeping. The tool should work for any artist, any wallet.
- Open by default. If you add a feature, make sure it can be self-hosted.
- Ship small. One thing at a time.

---

## Issues

Open an issue for bugs, feature requests, or questions. No template required - just be clear about what you saw or what you want.
