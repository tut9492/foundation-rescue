import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, type Address } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";
import { readFileSync } from "fs";
import path from "path";
import { extractCid, ipfsToHttp } from "@/lib/ipfs";

export const maxDuration = 60;

const ALCHEMY_KEY = process.env.ALCHEMY_KEY;
const NFT_API_BASE = `https://eth-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}`;
const RPC_URL = `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`;

// Load Foundation contract set (same as rescue route)
let FOUNDATION_SET: Set<string> | null = null;
function getFoundationSet(): Set<string> {
  if (FOUNDATION_SET) return FOUNDATION_SET;
  const filePath = path.join(process.cwd(), "foundation-contracts-list.json");
  const list: string[] = JSON.parse(readFileSync(filePath, "utf8"));
  const set = new Set(list.map((a) => a.toLowerCase()));
  set.add("0x3b3ee1931dc30c1957379fac9aba94d1c48a5405"); // shared contract
  FOUNDATION_SET = set;
  return set;
}

export interface ProfileNft {
  contractAddress: string;
  tokenId: string;
  name: string;
  description?: string;
  imageUrl: string;
  contractName: string;
}

export interface ProfileIdentity {
  address: string;
  ensName: string | null;
  displayName: string;
  avatarUrl: string | null;
}

export interface ProfileResponse {
  wallet: string;
  identity: ProfileIdentity;
  totalMinted: number;
  nfts: ProfileNft[];
}

function getClient() {
  return createPublicClient({
    chain: mainnet,
    transport: http(RPC_URL),
  });
}

async function resolveIdentity(address: string): Promise<ProfileIdentity> {
  const client = getClient();
  const addr = address as Address;
  let ensName: string | null = null;
  let avatarUrl: string | null = null;

  try {
    ensName = await client.getEnsName({ address: addr });
    if (ensName) {
      avatarUrl = await client.getEnsAvatar({ name: normalize(ensName) });
    }
  } catch {
    // ENS resolution failed — use address as fallback
  }

  const displayName =
    ensName ?? `${address.slice(0, 6)}...${address.slice(-4)}`;

  return { address: addr, ensName, displayName, avatarUrl };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url: string, retries = 3): Promise<any> {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url);
    if (res.ok) return res.json();
    if (res.status === 400) throw new Error("Invalid request");
    if (i < retries - 1) await sleep(1000 * (i + 1));
    else throw new Error(`Alchemy returned ${res.status} after ${retries} attempts`);
  }
}

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

function nftToProfileNft(nft: any, isCreated: boolean): ProfileNft {
  const imageUrl =
    nft.image?.cachedUrl ||
    nft.image?.originalUrl ||
    nft.raw?.metadata?.image
      ? ipfsToHttp(nft.raw?.metadata?.image || "")
      : "";

  return {
    contractAddress: nft.contract.address,
    tokenId: nft.tokenId,
    name: nft.name || nft.contract.name || `#${nft.tokenId}`,
    description: nft.raw?.metadata?.description,
    imageUrl:
      nft.image?.cachedUrl ||
      nft.image?.originalUrl ||
      (nft.raw?.metadata?.image ? ipfsToHttp(nft.raw.metadata.image) : ""),
    contractName: nft.contract.name || "",
  };
}

export async function POST(req: NextRequest) {
  try {
    const { wallet } = await req.json();

    if (!wallet || !/^0x[0-9a-fA-F]{40}$/i.test(wallet)) {
      return NextResponse.json(
        { error: "Invalid wallet address" },
        { status: 400 },
      );
    }
    if (!ALCHEMY_KEY) {
      return NextResponse.json(
        { error: "Server not configured" },
        { status: 500 },
      );
    }

    const walletLower = wallet.toLowerCase();

    // Run identity resolution and contract scan in parallel
    const [identity, allAddresses] = await Promise.all([
      resolveIdentity(walletLower),
      getWalletContractAddresses(walletLower),
    ]);

    // Filter to Foundation contracts only
    const foundationSet = getFoundationSet();
    const foundationAddresses = allAddresses.filter((a) =>
      foundationSet.has(a.toLowerCase()),
    );

    // Get deployers to determine created vs collected
    const deployers = await getContractDeployers(foundationAddresses);

    // Fetch NFT data for all Foundation contracts
    const nfts = await fetchNFTsForContracts(walletLower, foundationAddresses);

    const profileNfts = nfts.map((nft) => {
      const isCreated =
        deployers[nft.contract.address.toLowerCase()] === walletLower;
      return nftToProfileNft(nft, isCreated);
    });

    return NextResponse.json({
      wallet: walletLower,
      identity,
      totalMinted: profileNfts.length,
      nfts: profileNfts,
    } satisfies ProfileResponse);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[profile]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
