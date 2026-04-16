import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, parseAbi } from "viem";
import { mainnet } from "viem/chains";
import { readFileSync } from "fs";
import path from "path";

// Vercel serverless function config
export const runtime = "nodejs";
export const maxDuration = 60;

const ALCHEMY_KEY = process.env.ALCHEMY_KEY;
const RPC_URL = `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`;
const NFT_API_BASE = `https://eth-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}`;
const PINATA_PIN_URL = "https://api.pinata.cloud/v3/files/public/pin_by_cid";

const FOUNDATION_MARKET = "0xcDA72070E455bb31C7690a170224Ce43623d0B6f";
const FOUNDATION_NFT721 = "0x3B3ee1931Dc30C1957379FAc9aba94D1C48a5405";

// Load the complete set of Foundation collection contracts (95k addresses,
// enumerated from Factory V1 + V2 creation events via Etherscan).
// Loaded once at cold start, cached for the lifetime of the function instance.
let FOUNDATION_SET: Set<string> | null = null;

function getFoundationSet(): Set<string> {
  if (FOUNDATION_SET) return FOUNDATION_SET;
  const filePath = path.join(
    process.cwd(),
    "foundation-contracts-list.json",
  );
  const list: string[] = JSON.parse(readFileSync(filePath, "utf8"));
  const set = new Set(list.map((a) => a.toLowerCase()));
  set.add(FOUNDATION_NFT721.toLowerCase()); // shared early-mint contract
  FOUNDATION_SET = set;
  return set;
}

const marketAbi = parseAbi([
  "function getBuyPrice(address nftContract, uint256 tokenId) view returns (address seller, uint256 price)",
  "function getReserveAuctionIdFor(address nftContract, uint256 tokenId) view returns (uint256 auctionId)",
]);

function extractCID(uri: string | null | undefined): string | null {
  if (!uri) return null;
  const ipfs = uri.match(/ipfs:\/\/([a-zA-Z0-9]+)/);
  if (ipfs) return ipfs[1];
  const gateway = uri.match(/\/ipfs\/([a-zA-Z0-9]+)/);
  if (gateway) return gateway[1];
  return null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url: string, retries = 3): Promise<any> {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url);
    if (res.ok) return res.json();
    const body = await res.text();
    console.error(`[Alchemy] ${res.status} attempt ${i + 1}:`, body);
    if (res.status === 400) throw new Error("Invalid wallet address or request");
    if (i < retries - 1) await sleep(1000 * (i + 1));
    else
      throw new Error(
        `Alchemy returned ${res.status} after ${retries} attempts. Try again in a moment.`,
      );
  }
}

// Step 1: get all unique contract addresses in wallet
// (withMetadata=false avoids an Alchemy pageKey bug)
async function getWalletContractAddresses(wallet: string): Promise<string[]> {
  const addresses: string[] = [];
  let pageKey: string | undefined;
  do {
    const url = new URL(`${NFT_API_BASE}/getContractsForOwner`);
    url.searchParams.set("owner", wallet);
    url.searchParams.set("withMetadata", "false");
    url.searchParams.set("pageSize", "100");
    if (pageKey) url.searchParams.set("pageKey", pageKey);
    const json = await fetchWithRetry(url.toString());
    addresses.push(...(json.contracts || []).map((c: any) => c.address));
    pageKey = json.pageKey;
  } while (pageKey);
  return addresses;
}

function filterFoundationAddresses(addresses: string[]): string[] {
  const set = getFoundationSet();
  return addresses.filter((a) => set.has(a.toLowerCase()));
}

async function getContractDeployers(
  addresses: string[],
): Promise<Record<string, string>> {
  const deployers: Record<string, string> = {};
  const BATCH = 5;
  for (let i = 0; i < addresses.length; i += BATCH) {
    const chunk = addresses.slice(i, i + BATCH);
    await Promise.all(
      chunk.map(async (addr) => {
        const url = new URL(`${NFT_API_BASE}/getContractMetadata`);
        url.searchParams.set("contractAddress", addr);
        try {
          const json = await fetchWithRetry(url.toString());
          deployers[addr.toLowerCase()] =
            (json.contractDeployer || "").toLowerCase();
        } catch {
          deployers[addr.toLowerCase()] = "";
        }
      }),
    );
    if (i + BATCH < addresses.length) await sleep(200);
  }
  return deployers;
}

async function fetchNFTsForContracts(
  wallet: string,
  contractAddresses: string[],
): Promise<any[]> {
  if (contractAddresses.length === 0) return [];
  const nfts: any[] = [];
  // Alchemy accepts up to 45 contractAddresses[] per call
  const CHUNK = 45;
  for (let i = 0; i < contractAddresses.length; i += CHUNK) {
    const chunk = contractAddresses.slice(i, i + CHUNK);
    let pageKey: string | undefined;
    do {
      const url = new URL(`${NFT_API_BASE}/getNFTsForOwner`);
      url.searchParams.set("owner", wallet);
      url.searchParams.set("withMetadata", "true");
      url.searchParams.set("pageSize", "100");
      chunk.forEach((c) => url.searchParams.append("contractAddresses[]", c));
      if (pageKey) url.searchParams.set("pageKey", pageKey);
      const json = await fetchWithRetry(url.toString());
      nfts.push(...(json.ownedNfts || []));
      pageKey = json.pageKey;
    } while (pageKey);
    if (i + CHUNK < contractAddresses.length) await sleep(100);
  }
  return nfts;
}

async function pinCID(cid: string, name: string, pinataJwt: string) {
  try {
    const res = await fetch(PINATA_PIN_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${pinataJwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ cid, name }),
    });
    const json = await res.json();
    return res.ok
      ? { ok: true, cid, status: json.data?.status ?? "queued" }
      : { ok: false, cid, error: json.error ?? res.status };
  } catch (e: any) {
    return { ok: false, cid, error: e.message };
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function POST(req: NextRequest) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  const body = await req.json().catch(() => ({}));
  const { wallet, pinataJwt, createdOnly, contractOverride } = body ?? {};

  if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    return NextResponse.json(
      { error: "Invalid or missing wallet address" },
      { status: 400, headers: corsHeaders },
    );
  }
  if (!ALCHEMY_KEY) {
    return NextResponse.json(
      { error: "Server misconfigured - missing ALCHEMY_KEY" },
      { status: 500, headers: corsHeaders },
    );
  }

  const pinMode = !!pinataJwt;
  const publicClient = createPublicClient({
    chain: mainnet,
    transport: http(RPC_URL),
  });

  try {
    // 1. Get contract list - either from wallet scan or manual override
    let foundationAddresses: string[];
    if (contractOverride && /^0x[a-fA-F0-9]{40}$/.test(contractOverride)) {
      foundationAddresses = [contractOverride];
    } else {
      const allAddresses = await getWalletContractAddresses(
        wallet.toLowerCase(),
      );
      foundationAddresses = filterFoundationAddresses(allAddresses);
    }

    // 2. Get deployer for each contract (created vs collected)
    const deployers = await getContractDeployers(foundationAddresses);
    const foundationContracts = foundationAddresses.map((addr) => ({
      address: addr,
      created: deployers[addr.toLowerCase()] === wallet.toLowerCase(),
    }));

    const targetContracts = createdOnly
      ? foundationContracts.filter((c) => c.created)
      : foundationContracts;

    const createdCount = foundationContracts.filter((c) => c.created).length;
    const collectedCount = foundationContracts.filter((c) => !c.created).length;

    // 3. Fetch full NFT data only for Foundation contracts
    const nfts = await fetchNFTsForContracts(
      wallet,
      targetContracts.map((c) => c.address),
    );

    const pinned: any[] = [];
    const failed: any[] = [];
    const listings: any[] = [];
    const nftCards: any[] = [];

    // 4. Process each NFT
    await Promise.all(
      nfts.map(async (nft) => {
        const contractAddress = nft.contract.address;
        const tokenId = nft.tokenId;
        const name = nft.name || nft.contract.name || `Token #${tokenId}`;
        const imageUrl =
          nft.image?.cachedUrl ||
          nft.image?.originalUrl ||
          nft.raw?.metadata?.image ||
          null;

        // Pin metadata CID
        const metadataCID = extractCID(nft.tokenUri);
        let pinnedMeta = false;
        if (metadataCID && pinMode) {
          const r = await pinCID(metadataCID, `${name} - metadata`, pinataJwt);
          (r.ok ? pinned : failed).push({ ...r, name, type: "metadata" });
          if (r.ok) pinnedMeta = true;
        }

        // Pin image CID
        const imageUri = nft.raw?.metadata?.image || nft.image?.originalUrl;
        const imageCID = extractCID(imageUri);
        let pinnedImage = false;
        if (imageCID && imageCID !== metadataCID && pinMode) {
          const r = await pinCID(imageCID, `${name} - image`, pinataJwt);
          (r.ok ? pinned : failed).push({ ...r, name, type: "image" });
          if (r.ok) pinnedImage = true;
        }

        const hasIpfs = !!(metadataCID || imageCID);

        // Check marketplace
        let isLocked = false;
        let auctionId: number | null = null;
        try {
          const [seller] = (await publicClient.readContract({
            address: FOUNDATION_MARKET as `0x${string}`,
            abi: marketAbi,
            functionName: "getBuyPrice",
            args: [contractAddress as `0x${string}`, BigInt(tokenId)],
          })) as [string, bigint];
          if (seller !== "0x0000000000000000000000000000000000000000") {
            isLocked = true;
            try {
              const id = (await publicClient.readContract({
                address: FOUNDATION_MARKET as `0x${string}`,
                abi: marketAbi,
                functionName: "getReserveAuctionIdFor",
                args: [contractAddress as `0x${string}`, BigInt(tokenId)],
              })) as bigint;
              if (Number(id) > 0) auctionId = Number(id);
            } catch {}

            listings.push({
              name,
              contractAddress,
              tokenId,
              auctionId,
              unlockMethod: auctionId
                ? "cancelReserveAuction"
                : "cancelBuyPrice",
              calldata: auctionId
                ? `cancelReserveAuction(${auctionId})`
                : `cancelBuyPrice(${contractAddress}, ${tokenId})`,
              marketContract: FOUNDATION_MARKET,
            });
          }
        } catch {}

        const isCreated =
          foundationContracts.find(
            (c) => c.address.toLowerCase() === contractAddress.toLowerCase(),
          )?.created ?? false;

        nftCards.push({
          name,
          imageUrl,
          hasIpfs,
          pinnedMeta,
          pinnedImage,
          isLocked,
          isCreated,
          contractAddress,
          tokenId,
        });
      }),
    );

    return NextResponse.json(
      {
        wallet,
        nftsFound: nfts.length,
        foundationContracts: foundationContracts.length,
        createdContracts: createdCount,
        collectedContracts: collectedCount,
        pinned,
        failed,
        listings,
        nftCards,
        pinataUrl: "https://app.pinata.cloud/files",
        message:
          listings.length > 0
            ? `${listings.length} NFT(s) are locked in the Foundation marketplace contract. See 'listings' for unlist details.`
            : pinned.length > 0
              ? `All ${pinned.length} CIDs pinned successfully. Your assets are safe.`
              : nfts.length > 0
                ? `${nfts.length} Foundation NFT(s) found but no IPFS CIDs could be extracted - media may be HTTP-hosted or metadata unavailable.`
                : "No Foundation NFTs found in this wallet.",
      },
      { headers: corsHeaders },
    );
  } catch (e: any) {
    console.error("[rescue]", e);
    return NextResponse.json(
      { error: e.message },
      { status: 500, headers: corsHeaders },
    );
  }
}
