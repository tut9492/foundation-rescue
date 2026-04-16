import { createPublicClient, http, parseAbi } from 'viem';
import { mainnet } from 'viem/chains';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ALCHEMY_KEY    = process.env.ALCHEMY_KEY;
const RPC_URL        = `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`;
const NFT_API_BASE   = `https://eth-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}`;
const PINATA_PIN_URL = 'https://api.pinata.cloud/v3/files/public/pin_by_cid';

const FOUNDATION_MARKET  = '0xcDA72070E455bb31C7690a170224Ce43623d0B6f';
const FOUNDATION_NFT721  = '0x3B3ee1931Dc30C1957379FAc9aba94D1C48a5405';

// Load the complete set of Foundation collection contracts (95k addresses,
// enumerated from Factory V1 + V2 creation events via Etherscan).
// Loaded once at cold start, cached for the lifetime of the function instance.
const __dirname = dirname(fileURLToPath(import.meta.url));
const _contractList = JSON.parse(
  readFileSync(join(__dirname, '../foundation-contracts-list.json'), 'utf8')
);
const FOUNDATION_SET = new Set(_contractList.map(a => a.toLowerCase()));
FOUNDATION_SET.add(FOUNDATION_NFT721.toLowerCase()); // shared early-mint contract

const marketAbi = parseAbi([
  'function getBuyPrice(address nftContract, uint256 tokenId) view returns (address seller, uint256 price)',
  'function getReserveAuctionIdFor(address nftContract, uint256 tokenId) view returns (uint256 auctionId)',
]);

function extractCID(uri) {
  if (!uri) return null;
  const ipfs = uri.match(/ipfs:\/\/([a-zA-Z0-9]+)/);
  if (ipfs) return ipfs[1];
  const gateway = uri.match(/\/ipfs\/([a-zA-Z0-9]+)/);
  if (gateway) return gateway[1];
  return null;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url);
    if (res.ok) return res.json();
    const body = await res.text();
    console.error(`[Alchemy] ${res.status} attempt ${i + 1}:`, body);
    if (res.status === 400) throw new Error(`Invalid wallet address or request`);
    if (i < retries - 1) await sleep(1000 * (i + 1));
    else throw new Error(`Alchemy returned ${res.status} after ${retries} attempts. Try again in a moment.`);
  }
}

// Step 1: get unique contract addresses in wallet (lightweight - no NFT metadata)
async function getWalletContracts(wallet) {
  const contracts = [];
  let pageKey = null;
  do {
    const url = new URL(`${NFT_API_BASE}/getContractsForOwner`);
    url.searchParams.set('owner', wallet);
    url.searchParams.set('withMetadata', 'false');
    url.searchParams.set('pageSize', '100');
    if (pageKey) url.searchParams.set('pageKey', pageKey);
    const json = await fetchWithRetry(url.toString());
    contracts.push(...(json.contracts || []));
    pageKey = json.pageKey;
  } while (pageKey);
  return contracts;
}

// Step 2: filter to Foundation contracts using the on-chain derived set
function filterFoundation(contracts) {
  return contracts
    .map(c => c.address)
    .filter(addr => FOUNDATION_SET.has(addr.toLowerCase()));
}

// Step 3: fetch NFTs for specific Foundation contracts only
async function fetchNFTsForContracts(wallet, contractAddresses) {
  if (contractAddresses.length === 0) return [];
  const nfts = [];
  // Alchemy accepts up to 45 contractAddresses[] per call
  const CHUNK = 45;
  for (let i = 0; i < contractAddresses.length; i += CHUNK) {
    const chunk = contractAddresses.slice(i, i + CHUNK);
    let pageKey = null;
    do {
      const url = new URL(`${NFT_API_BASE}/getNFTsForOwner`);
      url.searchParams.set('owner', wallet);
      url.searchParams.set('withMetadata', 'true');
      url.searchParams.set('pageSize', '100');
      chunk.forEach(c => url.searchParams.append('contractAddresses[]', c));
      if (pageKey) url.searchParams.set('pageKey', pageKey);
      const json = await fetchWithRetry(url.toString());
      nfts.push(...(json.ownedNfts || []));
      pageKey = json.pageKey;
    } while (pageKey);
    if (i + CHUNK < contractAddresses.length) await sleep(100);
  }
  return nfts;
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
    // 1. Get all unique contracts in wallet (fast, no metadata)
    const allContracts = await getWalletContracts(wallet.toLowerCase());

    // 2. Filter to Foundation contracts using 95k on-chain derived set
    const foundationContracts = filterFoundation(allContracts);

    // 3. Fetch full NFT data only for Foundation contracts
    const nfts = await fetchNFTsForContracts(wallet, foundationContracts);

    const pinned = [];
    const failed = [];
    const listings = [];
    const nftCards = [];

    // 4. Process each NFT
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

    return res.status(200).json({
      wallet,
      nftsFound: nfts.length,
      foundationContracts: foundationContracts.length,
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
            ? `${nfts.length} Foundation NFT(s) found but no IPFS CIDs could be extracted - media may be HTTP-hosted or metadata unavailable.`
            : 'No Foundation NFTs found in this wallet.',
    });

  } catch (e) {
    console.error('[rescue]', e);
    return res.status(500).json({ error: e.message });
  }
}
