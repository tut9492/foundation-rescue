#!/usr/bin/env node
/**
 * Foundation Rescue
 *
 * Helps artists affected by the Foundation.app shutdown:
 *   1. Finds all Foundation NFTs owned by a wallet
 *   2. Pins their IPFS metadata + media to Pinata (preserving them permanently)
 *   3. Shows any NFTs locked in the Foundation marketplace
 *   4. Generates unlist calldata (or executes if PRIVATE_KEY is set)
 *
 * Usage:
 *   PINATA_JWT=xxx ALCHEMY_KEY=xxx node rescue.mjs <wallet>
 *
 * To also unlist:
 *   PINATA_JWT=xxx ALCHEMY_KEY=xxx PRIVATE_KEY=xxx node rescue.mjs <wallet>
 *
 * PRIVATE_KEY is optional — without it the script runs in read+pin mode only.
 */

import { createPublicClient, createWalletClient, http, parseAbi } from 'viem';
import { mainnet } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// ── Config ────────────────────────────────────────────────────────────────────

const WALLET   = process.argv[2]?.toLowerCase();
if (!WALLET) { console.error('Usage: node rescue.mjs <wallet>'); process.exit(1); }

const PINATA_JWT    = process.env.PINATA_JWT;
const ALCHEMY_KEY   = process.env.ALCHEMY_KEY;
const PRIVATE_KEY   = process.env.PRIVATE_KEY;

if (!PINATA_JWT)  { console.error('Missing PINATA_JWT'); process.exit(1); }
if (!ALCHEMY_KEY) { console.error('Missing ALCHEMY_KEY'); process.exit(1); }

const RPC_URL = `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`;
const NFT_API = `https://eth-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}`;

// Foundation contracts
const FOUNDATION_MARKET  = '0xcDA72070E455bb31C7690a170224Ce43623d0B6f';
const FOUNDATION_NFT721  = '0x3B3ee1931Dc30C1957379FAc9aba94D1C48a5405';
const FOUNDATION_FACTORY_V1 = '0x3B612a5B49e025a6e4bA4eE4FB1EF46D13588059';
const FOUNDATION_FACTORY_V2 = '0x612E2DadDc89d91409e40f946f9f7CfE422e777E';

const PINATA_PIN_URL = 'https://api.pinata.cloud/v3/files/public/pin_by_cid';

// ── ABIs ──────────────────────────────────────────────────────────────────────

const marketAbi = parseAbi([
  'function getBuyPrice(address nftContract, uint256 tokenId) view returns (address seller, uint256 price)',
  'function getReserveAuctionIdFor(address nftContract, uint256 tokenId) view returns (uint256 auctionId)',
  'function cancelBuyPrice(address nftContract, uint256 tokenId)',
  'function cancelReserveAuction(uint256 auctionId)',
]);

const nftAbi = parseAbi([
  'function tokenURI(uint256 tokenId) view returns (string)',
]);

// ── Clients ───────────────────────────────────────────────────────────────────

const publicClient = createPublicClient({ chain: mainnet, transport: http(RPC_URL) });

let walletClient = null;
let account = null;
if (PRIVATE_KEY) {
  account = privateKeyToAccount(PRIVATE_KEY.startsWith('0x') ? PRIVATE_KEY : `0x${PRIVATE_KEY}`);
  walletClient = createWalletClient({ account, chain: mainnet, transport: http(RPC_URL) });
  console.log(`Wallet loaded: ${account.address}`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function alchemyNFTs(wallet) {
  const url = `${NFT_API}/getNFTsForOwner?owner=${wallet}&withMetadata=true&pageSize=100`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Alchemy NFT API error: ${res.status}`);
  const json = await res.json();
  return json.ownedNfts || [];
}

function isFoundation(nft) {
  const addr = nft.contract?.address?.toLowerCase();
  return (
    addr === FOUNDATION_NFT721.toLowerCase() ||
    addr === FOUNDATION_FACTORY_V1.toLowerCase() ||
    addr === FOUNDATION_FACTORY_V2.toLowerCase() ||
    // Also catch individual collection contracts via contract deployer check
    nft.contract?.name?.toLowerCase().includes('foundation') ||
    nft.tokenUri?.includes('foundation') ||
    nft.raw?.metadata?.external_url?.includes('foundation.app')
  );
}

function extractCID(uri) {
  if (!uri) return null;
  // ipfs://Qm... or ipfs://baf...
  const ipfsMatch = uri.match(/ipfs:\/\/([a-zA-Z0-9]+)/);
  if (ipfsMatch) return ipfsMatch[1];
  // https://ipfs.io/ipfs/CID or https://gateway.pinata.cloud/ipfs/CID
  const gatewayMatch = uri.match(/\/ipfs\/([a-zA-Z0-9]+)/);
  if (gatewayMatch) return gatewayMatch[1];
  return null;
}

async function pinCID(cid, name) {
  try {
    const res = await fetch(PINATA_PIN_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PINATA_JWT}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cid, name }),
    });
    const json = await res.json();
    if (!res.ok) return { ok: false, error: json.error || res.status };
    return { ok: true, status: json.data?.status };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function getTokenURI(contractAddress, tokenId) {
  try {
    return await publicClient.readContract({
      address: contractAddress,
      abi: nftAbi,
      functionName: 'tokenURI',
      args: [BigInt(tokenId)],
    });
  } catch {
    return null;
  }
}

async function checkMarketListing(contractAddress, tokenId) {
  try {
    const [seller] = await publicClient.readContract({
      address: FOUNDATION_MARKET,
      abi: marketAbi,
      functionName: 'getBuyPrice',
      args: [contractAddress, BigInt(tokenId)],
    });
    const isListed = seller !== '0x0000000000000000000000000000000000000000';
    return { isListed, seller };
  } catch {
    return { isListed: false };
  }
}

async function getAuctionId(contractAddress, tokenId) {
  try {
    const id = await publicClient.readContract({
      address: FOUNDATION_MARKET,
      abi: marketAbi,
      functionName: 'getReserveAuctionIdFor',
      args: [contractAddress, BigInt(tokenId)],
    });
    return Number(id) > 0 ? Number(id) : null;
  } catch {
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n═══ Foundation Rescue ══════════════════════════════════════');
  console.log(`Wallet  : ${WALLET}`);
  console.log(`Mode    : ${walletClient ? '🔴 LIVE (will sign transactions)' : '🟡 READ + PIN (no signing)'}`);
  console.log('');

  // 1. Find Foundation NFTs
  console.log('Scanning wallet for Foundation NFTs via Alchemy...');
  const allNFTs = await alchemyNFTs(WALLET);
  const foundationNFTs = allNFTs.filter(isFoundation);

  console.log(`Found ${allNFTs.length} total NFTs — ${foundationNFTs.length} from Foundation\n`);

  if (foundationNFTs.length === 0) {
    console.log('No Foundation NFTs found in this wallet.');
    console.log('Note: NFTs listed in the marketplace are held by the contract, not your wallet.');
    console.log('      Run this script with the same wallet to check marketplace listings.\n');
  }

  // 2. Process each NFT — pin metadata + media
  const pinResults = [];
  const marketListings = [];

  for (const nft of foundationNFTs) {
    const contractAddress = nft.contract.address;
    const tokenId = nft.tokenId;
    const name = nft.name || nft.contract.name || `Token #${tokenId}`;

    console.log(`── ${name} (${contractAddress.slice(0,10)}... #${tokenId})`);

    // Get tokenURI (fallback to Alchemy metadata if RPC fails)
    let tokenUri = nft.tokenUri || await getTokenURI(contractAddress, tokenId);
    const metadataCID = extractCID(tokenUri);

    // Pin metadata CID
    if (metadataCID) {
      process.stdout.write(`   Pinning metadata CID ${metadataCID.slice(0,12)}...  `);
      const result = await pinCID(metadataCID, `${name} — metadata`);
      console.log(result.ok ? `✅ ${result.status}` : `❌ ${result.error}`);
      pinResults.push({ name, type: 'metadata', cid: metadataCID, ...result });
    } else {
      console.log('   ⚠️  Could not extract metadata CID from tokenURI');
    }

    // Pin image/media CID
    const imageUri = nft.raw?.metadata?.image || nft.image?.originalUrl;
    const imageCID = extractCID(imageUri);
    if (imageCID && imageCID !== metadataCID) {
      process.stdout.write(`   Pinning image CID    ${imageCID.slice(0,12)}...  `);
      const result = await pinCID(imageCID, `${name} — image`);
      console.log(result.ok ? `✅ ${result.status}` : `❌ ${result.error}`);
      pinResults.push({ name, type: 'image', cid: imageCID, ...result });
    }

    // Check if also listed in marketplace
    const listing = await checkMarketListing(contractAddress, tokenId);
    if (listing.isListed) {
      const auctionId = await getAuctionId(contractAddress, tokenId);
      console.log(`   ⚠️  LISTED IN MARKETPLACE — NFT is locked in the Foundation contract`);
      marketListings.push({ name, contractAddress, tokenId, auctionId });
    }

    console.log('');
  }

  // 3. Check marketplace for NFTs listed FROM this wallet (held in contract)
  //    These won't appear in wallet scan — they're owned by the marketplace contract
  console.log('Note: NFTs actively listed are held by the Foundation contract and won\'t');
  console.log('      appear in your wallet scan. If you know specific tokenIds that are');
  console.log('      listed, run the unlist command directly.\n');

  // 4. Unlist locked NFTs
  if (marketListings.length > 0) {
    console.log('═══ Marketplace Listings ═══════════════════════════════════');
    for (const listing of marketListings) {
      console.log(`  ${listing.name} — contract: ${listing.contractAddress} | tokenId: ${listing.tokenId}`);
      if (listing.auctionId) {
        console.log(`  Auction ID: ${listing.auctionId} → cancelReserveAuction(${listing.auctionId})`);
      } else {
        console.log(`  Fixed price → cancelBuyPrice(${listing.contractAddress}, ${listing.tokenId})`);
      }

      if (walletClient) {
        try {
          let hash;
          if (listing.auctionId) {
            hash = await walletClient.writeContract({
              address: FOUNDATION_MARKET,
              abi: marketAbi,
              functionName: 'cancelReserveAuction',
              args: [BigInt(listing.auctionId)],
            });
          } else {
            hash = await walletClient.writeContract({
              address: FOUNDATION_MARKET,
              abi: marketAbi,
              functionName: 'cancelBuyPrice',
              args: [listing.contractAddress, BigInt(listing.tokenId)],
            });
          }
          console.log(`  ✅ Unlist tx: ${hash}`);
        } catch (e) {
          console.log(`  ❌ Unlist failed: ${e.message}`);
        }
      } else {
        console.log(`  → Set PRIVATE_KEY env var to execute unlist automatically`);
      }
      console.log('');
    }
  }

  // 5. Summary
  const pinned = pinResults.filter(r => r.ok).length;
  const failed = pinResults.filter(r => !r.ok).length;

  console.log('═══ Summary ════════════════════════════════════════════════');
  console.log(`  Foundation NFTs found  : ${foundationNFTs.length}`);
  console.log(`  CIDs pinned to Pinata  : ${pinned}`);
  console.log(`  Pin failures           : ${failed}`);
  console.log(`  Marketplace listings   : ${marketListings.length}`);
  if (walletClient && marketListings.length > 0) {
    console.log(`  Unlisted               : ${marketListings.length}`);
  }
  console.log('');

  if (pinned > 0) {
    console.log('Your IPFS content is now pinned to your Pinata account.');
    console.log('View at: https://app.pinata.cloud/files\n');
  }
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
