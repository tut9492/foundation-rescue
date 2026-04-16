import { NextRequest, NextResponse } from 'next/server';

const ALCHEMY_KEY = process.env.ALCHEMY_KEY;
const RPC_URL = `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`;
const NFT_API = `https://eth-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}`;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

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

// ── Step 1: get all mint events (Transfer from 0x0 to wallet) ────────────────

interface MintedToken {
  contractAddress: string;
  tokenId: string;
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
      maxCount: '0x64', // 100 per page
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
    if (json.error) throw new Error(json.error.message || 'Alchemy error');

    const result = json.result;

    for (const t of result.transfers || []) {
      if (!t.rawContract?.address || t.tokenId == null) continue;

      // tokenId comes back as hex string — normalise to decimal string
      let tokenIdStr: string;
      try {
        tokenIdStr = BigInt(t.tokenId).toString();
      } catch {
        tokenIdStr = t.tokenId;
      }

      mints.push({
        contractAddress: t.rawContract.address.toLowerCase(),
        tokenId: tokenIdStr,
        mintedAt: t.metadata?.blockTimestamp,
      });
    }

    pageKey = result.pageKey;
  } while (pageKey);

  return mints;
}

// ── Step 2: batch enrich with NFT metadata ───────────────────────────────────

async function enrichWithMetadata(tokens: MintedToken[]): Promise<ProfileNft[]> {
  const BATCH_SIZE = 100;
  const results: ProfileNft[] = [];

  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batch = tokens.slice(i, i + BATCH_SIZE);

    const res = await fetch(`${NFT_API}/getNFTMetadataBatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tokens: batch.map((t) => ({
          contractAddress: t.contractAddress,
          tokenId: t.tokenId,
        })),
      }),
    });

    if (!res.ok) throw new Error(`Alchemy NFT metadata batch error: ${res.status}`);

    const nfts = await res.json();

    for (let j = 0; j < batch.length; j++) {
      const nft = nfts[j];
      const token = batch[j];

      const imageUrl =
        nft?.image?.cachedUrl ||
        nft?.image?.originalUrl ||
        nft?.raw?.metadata?.image ||
        '';

      const contractName = nft?.contract?.name || '';
      const tokenName =
        nft?.name ||
        (contractName ? `${contractName} #${token.tokenId}` : `#${token.tokenId}`);

      results.push({
        contractAddress: token.contractAddress,
        tokenId: token.tokenId,
        name: tokenName,
        description: nft?.description,
        imageUrl,
        contractName,
        mintedAt: token.mintedAt,
      });
    }

    // Small pause between batches to be kind to rate limits
    if (i + BATCH_SIZE < tokens.length) {
      await new Promise((r) => setTimeout(r, 150));
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

    // 1. Find all mint events to this wallet
    const mints = await getAllMints(walletLower);

    // 2. Deduplicate (some tokens get burned and reminted — keep first mint)
    const seen = new Set<string>();
    const unique = mints.filter((m) => {
      const key = `${m.contractAddress}:${m.tokenId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // 3. Enrich with metadata
    const nfts = await enrichWithMetadata(unique);

    return NextResponse.json({
      wallet: walletLower,
      totalMinted: nfts.length,
      nfts,
    } satisfies ProfileResponse);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
