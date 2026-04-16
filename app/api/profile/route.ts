import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30; // Vercel: extend to 30s

const ALCHEMY_KEY = process.env.ALCHEMY_KEY;
const RPC_URL = `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`;
const NFT_API = `https://eth-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}`;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const MAX_NFTS = 100; // cap for initial load — keep response fast

export interface ProfileNft {
  contractAddress: string;
  tokenId: string;
  name: string;
  description?: string;
  imageUrl: string;
  contractName: string;
  mintedAt?: string;
}

export interface ProfileResponse {
  wallet: string;
  totalMinted: number;
  nfts: ProfileNft[];
}

// ── Step 1: get mint events (Transfer from 0x0 to wallet) ────────────────────

interface MintedToken {
  contractAddress: string;
  tokenId: string;
  tokenType: 'ERC721' | 'ERC1155';
  mintedAt?: string;
}

async function getAllMints(wallet: string): Promise<MintedToken[]> {
  const mints: MintedToken[] = [];
  let pageKey: string | undefined;

  do {
    const params: Record<string, unknown> = {
      fromBlock: '0x0',
      toBlock: 'latest',
      fromAddress: ZERO_ADDRESS,
      toAddress: wallet,
      category: ['erc721', 'erc1155'],
      withMetadata: true,
      excludeZeroValue: true,
      maxCount: '0x64',
    };
    if (pageKey) params.pageKey = pageKey;

    const res = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 1,
        jsonrpc: '2.0',
        method: 'alchemy_getAssetTransfers',
        params: [params],
      }),
    });

    if (!res.ok) throw new Error(`Alchemy RPC error: ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error.message || 'Alchemy RPC error');

    for (const t of (json.result?.transfers || [])) {
      if (!t.rawContract?.address || t.tokenId == null) continue;

      let tokenIdStr: string;
      try { tokenIdStr = BigInt(t.tokenId).toString(); }
      catch { tokenIdStr = t.tokenId; }

      mints.push({
        contractAddress: t.rawContract.address.toLowerCase(),
        tokenId: tokenIdStr,
        tokenType: t.category === 'erc1155' ? 'ERC1155' : 'ERC721',
        mintedAt: t.metadata?.blockTimestamp,
      });
    }

    pageKey = json.result?.pageKey;
  } while (pageKey);

  return mints;
}

// ── Step 2: batch metadata, with graceful fallback on errors ─────────────────

function placeholderNft(token: MintedToken): ProfileNft {
  return {
    contractAddress: token.contractAddress,
    tokenId: token.tokenId,
    name: `#${token.tokenId}`,
    imageUrl: '',
    contractName: '',
    mintedAt: token.mintedAt,
  };
}

async function fetchBatch(batch: MintedToken[]): Promise<ProfileNft[]> {
  try {
    const res = await fetch(`${NFT_API}/getNFTMetadataBatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tokens: batch.map((t) => ({
          contractAddress: t.contractAddress,
          tokenId: t.tokenId,
          tokenType: t.tokenType,
        })),
      }),
    });

    // On error, split batch in half and retry each half — isolates bad tokens
    if (!res.ok) {
      if (batch.length === 1) return [placeholderNft(batch[0])];
      const mid = Math.floor(batch.length / 2);
      const [a, b] = await Promise.all([
        fetchBatch(batch.slice(0, mid)),
        fetchBatch(batch.slice(mid)),
      ]);
      return [...a, ...b];
    }

    const nfts = await res.json();

    return batch.map((token, j) => {
      const nft = nfts[j];
      const imageUrl =
        nft?.image?.cachedUrl ||
        nft?.image?.originalUrl ||
        nft?.raw?.metadata?.image ||
        '';
      const contractName = nft?.contract?.name || '';
      const name =
        nft?.name ||
        (contractName ? `${contractName} #${token.tokenId}` : `#${token.tokenId}`);

      return {
        contractAddress: token.contractAddress,
        tokenId: token.tokenId,
        name,
        description: nft?.description,
        imageUrl,
        contractName,
        mintedAt: token.mintedAt,
      };
    });
  } catch {
    // Network-level failure — return placeholders for this batch
    return batch.map(placeholderNft);
  }
}

async function enrichWithMetadata(tokens: MintedToken[]): Promise<ProfileNft[]> {
  const BATCH_SIZE = 50; // smaller batches = fewer 500s
  const results: ProfileNft[] = [];

  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batch = tokens.slice(i, i + BATCH_SIZE);
    const enriched = await fetchBatch(batch);
    results.push(...enriched);
    if (i + BATCH_SIZE < tokens.length) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  return results;
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { wallet } = await req.json();

    if (!wallet || !/^0x[0-9a-fA-F]{40}$/i.test(wallet)) {
      return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
    }
    if (!ALCHEMY_KEY) {
      return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
    }

    const walletLower = wallet.toLowerCase();

    // 1. All mints to this wallet
    const mints = await getAllMints(walletLower);

    // 2. Deduplicate
    const seen = new Set<string>();
    const unique = mints.filter((m) => {
      const key = `${m.contractAddress}:${m.tokenId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const totalMinted = unique.length;

    // 3. Cap at most recent MAX_NFTS for this response
    const toEnrich = unique.slice(0, MAX_NFTS);

    // 4. Enrich
    const nfts = await enrichWithMetadata(toEnrich);

    return NextResponse.json({
      wallet: walletLower,
      totalMinted,
      nfts,
    } satisfies ProfileResponse);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
