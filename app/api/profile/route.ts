import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

const SIMPLEHASH_KEY = process.env.SIMPLEHASH_API_KEY;
const SIMPLEHASH_BASE = 'https://api.simplehash.com/api/v0';
const MAX_NFTS = 100;

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

async function getMintedNFTs(wallet: string): Promise<{ nfts: ProfileNft[]; total: number }> {
  const nfts: ProfileNft[] = [];
  let cursor: string | null = null;
  let total = 0;

  do {
    const url = new URL(`${SIMPLEHASH_BASE}/nfts/transfers/wallet`);
    url.searchParams.set('chains', 'ethereum');
    url.searchParams.set('wallet_addresses', wallet);
    url.searchParams.set('transfer_types', 'mint');
    url.searchParams.set('limit', '50');
    url.searchParams.set('order_by', 'timestamp_desc');
    if (cursor) url.searchParams.set('cursor', cursor);

    const res = await fetch(url.toString(), {
      headers: { 'X-API-Key': SIMPLEHASH_KEY! },
    });

    if (!res.ok) throw new Error(`SimpleHash error: ${res.status}`);
    const json = await res.json();

    // SimpleHash doesn't return a total count on transfers — track what we see
    for (const t of json.transfers || []) {
      total++;
      if (nfts.length >= MAX_NFTS) continue; // count all but only keep MAX_NFTS

      const nft = t.nft;
      if (!nft) continue;

      nfts.push({
        contractAddress: (nft.contract_address || '').toLowerCase(),
        tokenId: nft.token_id || '',
        name: nft.name || `#${nft.token_id}`,
        description: nft.description,
        imageUrl:
          nft.previews?.image_medium_url ||
          nft.image_url ||
          nft.extra_metadata?.image_original_url ||
          '',
        contractName: nft.collection?.name || nft.contract?.name || '',
        mintedAt: t.timestamp,
      });
    }

    cursor = json.next || null;
  } while (cursor);

  return { nfts, total };
}

export async function POST(req: NextRequest) {
  try {
    const { wallet } = await req.json();

    if (!wallet || !/^0x[0-9a-fA-F]{40}$/i.test(wallet)) {
      return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
    }
    if (!SIMPLEHASH_KEY) {
      return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
    }

    const { nfts, total } = await getMintedNFTs(wallet.toLowerCase());

    return NextResponse.json({
      wallet: wallet.toLowerCase(),
      totalMinted: total,
      nfts,
    } satisfies ProfileResponse);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
