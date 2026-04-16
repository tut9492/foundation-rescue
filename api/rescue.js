import { createPublicClient, http, parseAbi } from 'viem';
import { mainnet } from 'viem/chains';

const ALCHEMY_KEY      = process.env.ALCHEMY_KEY;
const RPC_URL          = `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`;
const NFT_API_BASE     = `https://eth-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}`;
const PINATA_PIN_URL   = 'https://api.pinata.cloud/v3/files/public/pin_by_cid';

const FOUNDATION_MARKET     = '0xcDA72070E455bb31C7690a170224Ce43623d0B6f';
const FOUNDATION_NFT721     = '0x3B3ee1931Dc30C1957379FAc9aba94D1C48a5405';
const FOUNDATION_FACTORY_V1 = '0x3B612a5B49e025a6e4bA4eE4FB1EF46D13588059';
const FOUNDATION_FACTORY_V2 = '0x612E2DadDc89d91409e40f946f9f7CfE422e777E';
const KNOWN_FOUNDATION      = new Set([
  FOUNDATION_NFT721.toLowerCase(),
  FOUNDATION_FACTORY_V1.toLowerCase(),
  FOUNDATION_FACTORY_V2.toLowerCase(),
]);

const marketAbi = parseAbi([
  'function getBuyPrice(address nftContract, uint256 tokenId) view returns (address seller, uint256 price)',
  'function getReserveAuctionIdFor(address nftContract, uint256 tokenId) view returns (uint256 auctionId)',
]);

const nftAbi = parseAbi([
  'function tokenURI(uint256 tokenId) view returns (string)',
]);

function extractCID(uri) {
  if (!uri) return null;
  const ipfs = uri.match(/ipfs:\/\/([a-zA-Z0-9]+)/);
  if (ipfs) return ipfs[1];
  const gateway = uri.match(/\/ipfs\/([a-zA-Z0-9]+)/);
  if (gateway) return gateway[1];
  return null;
}

function isFoundation(nft) {
  const addr = nft.contract?.address?.toLowerCase();
  if (KNOWN_FOUNDATION.has(addr)) return true;
  if (nft.raw?.metadata?.external_url?.includes('foundation.app')) return true;
  if (nft.tokenUri?.includes('foundation')) return true;
  // Individual collection contracts deployed via Foundation factory:
  // metadata external_url points to foundation.app, or contract name references Foundation
  if (nft.contract?.name?.toLowerCase().includes('foundation')) return true;
  // Foundation-hosted metadata API (pre-IPFS era)
  if (nft.raw?.metadata?.external_url?.includes('api.foundation.app')) return true;
  return false;
}

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url);
    if (res.ok) return res.json();
    const body = await res.text();
    console.error(`[Alchemy] ${res.status} attempt ${i + 1}:`, body);
    if (res.status === 400) throw new Error(`Invalid wallet address or request`);
    if (i < retries - 1) await new Promise(r => setTimeout(r, 500 * (i + 1)));
    else throw new Error(`Alchemy returned ${res.status} after ${retries} attempts. Try again in a moment.`);
  }
}

// Foundation creates a unique contract per artist collection via their factories.
// The factory addresses are deploy origins, not NFT homes. We must scan all NFTs
// and filter by Foundation signals in metadata.
const MAX_NFTS_TO_SCAN = 1000; // Vercel 60s limit guard

async function fetchFoundationNFTs(wallet) {
  const nfts = [];
  let pageKey = null;
  let totalScanned = 0;

  do {
    const url = new URL(`${NFT_API_BASE}/getNFTsForOwner`);
    url.searchParams.set('owner', wallet);
    url.searchParams.set('withMetadata', 'true');
    url.searchParams.set('pageSize', '100');
    if (pageKey) url.searchParams.set('pageKey', pageKey);

    const json = await fetchWithRetry(url.toString());
    const batch = json.ownedNfts || [];
    totalScanned += batch.length;

    for (const nft of batch) {
      if (isFoundation(nft)) nfts.push(nft);
    }

    pageKey = totalScanned < MAX_NFTS_TO_SCAN ? json.pageKey : null;
  } while (pageKey);

  return { nfts, totalScanned };
}

async function pinCID(cid, name, pinataJwt) {
  try {
    const res = await fetch(PINATA_PIN_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${pinataJwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cid, name }),
    });
    const json = await res.json();
    return res.ok
      ? { ok: true, cid, status: json.data?.status ?? 'queued' }
      : { ok: false, cid, error: json.error ?? res.status };
  } catch (e) {
    return { ok: false, cid, error: e.message };
  }
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { wallet, pinataJwt } = req.body ?? {};

  if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    return res.status(400).json({ error: 'Invalid or missing wallet address' });
  }
  if (!ALCHEMY_KEY) {
    return res.status(500).json({ error: 'Server misconfigured - missing ALCHEMY_KEY' });
  }

  const pinMode = !!pinataJwt;

  const publicClient = createPublicClient({ chain: mainnet, transport: http(RPC_URL) });

  try {
    // 1. Find Foundation NFTs
    const { nfts, totalScanned } = await fetchFoundationNFTs(wallet.toLowerCase());
    const truncated = totalScanned >= MAX_NFTS_TO_SCAN;

    const pinned = [];
    const failed = [];
    const listings = [];
    const nftCards = [];

    // 2. Process each NFT
    await Promise.all(nfts.map(async (nft) => {
      const contractAddress = nft.contract.address;
      const tokenId = nft.tokenId;
      const name = nft.name || nft.contract.name || `Token #${tokenId}`;
      const imageUrl = nft.image?.cachedUrl || nft.image?.originalUrl || nft.raw?.metadata?.image || null;

      // Pin metadata CID
      const metadataCID = extractCID(nft.tokenUri);
      let pinnedMeta = false;
      if (metadataCID && pinMode) {
        const r = await pinCID(metadataCID, `${name} - metadata`, pinataJwt);
        (r.ok ? pinned : failed).push({ ...r, name, type: 'metadata' });
        if (r.ok) pinnedMeta = true;
      }

      // Pin image CID
      const imageUri = nft.raw?.metadata?.image || nft.image?.originalUrl;
      const imageCID = extractCID(imageUri);
      let pinnedImage = false;
      if (imageCID && imageCID !== metadataCID && pinMode) {
        const r = await pinCID(imageCID, `${name} - image`, pinataJwt);
        (r.ok ? pinned : failed).push({ ...r, name, type: 'image' });
        if (r.ok) pinnedImage = true;
      }

      const hasIpfs = !!(metadataCID || imageCID);

      // Check marketplace
      let isLocked = false;
      let auctionId = null;
      try {
        const [seller] = await publicClient.readContract({
          address: FOUNDATION_MARKET,
          abi: marketAbi,
          functionName: 'getBuyPrice',
          args: [contractAddress, BigInt(tokenId)],
        });
        if (seller !== '0x0000000000000000000000000000000000000000') {
          isLocked = true;
          try {
            const id = await publicClient.readContract({
              address: FOUNDATION_MARKET,
              abi: marketAbi,
              functionName: 'getReserveAuctionIdFor',
              args: [contractAddress, BigInt(tokenId)],
            });
            if (Number(id) > 0) auctionId = Number(id);
          } catch {}

          listings.push({
            name,
            contractAddress,
            tokenId,
            auctionId,
            unlockMethod: auctionId ? 'cancelReserveAuction' : 'cancelBuyPrice',
            calldata: auctionId
              ? `cancelReserveAuction(${auctionId})`
              : `cancelBuyPrice(${contractAddress}, ${tokenId})`,
            marketContract: FOUNDATION_MARKET,
          });
        }
      } catch {}

      nftCards.push({ name, imageUrl, hasIpfs, pinnedMeta, pinnedImage, isLocked, contractAddress, tokenId });
    }));

    const truncatedNote = truncated
      ? ` (large wallet - scanned first ${MAX_NFTS_TO_SCAN} NFTs; if you minted many collections, some may be missed)`
      : '';

    return res.status(200).json({
      wallet,
      nftsFound: nfts.length,
      totalScanned,
      truncated,
      pinned,
      failed,
      listings,
      nftCards,
      pinataUrl: 'https://app.pinata.cloud/files',
      message: listings.length > 0
        ? `${listings.length} NFT(s) are locked in the Foundation marketplace contract. See 'listings' for unlist details.`
        : pinned.length > 0
          ? `All ${pinned.length} CIDs pinned successfully. Your assets are safe.`
          : nfts.length > 0
            ? `${nfts.length} Foundation NFT(s) found but no IPFS CIDs could be extracted - media may be HTTP-hosted or metadata unavailable.${truncatedNote}`
            : `No Foundation NFTs found in this wallet.${truncatedNote}`,
    });

  } catch (e) {
    console.error('[rescue]', e);
    return res.status(500).json({ error: e.message });
  }
}
