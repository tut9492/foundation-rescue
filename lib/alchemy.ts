/**
 * Shared Alchemy NFT API helpers.
 * Used by both the rescue and profile API routes.
 */

const ALCHEMY_KEY = process.env.ALCHEMY_KEY;

export function getNftApiBase(): string {
  return `https://eth-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}`;
}

export function getRpcUrl(): string {
  return `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchWithRetry(
  url: string,
  retries = 3,
): Promise<any> {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url);
    if (res.ok) return res.json();
    const body = await res.text();
    console.error(`[Alchemy] ${res.status} attempt ${i + 1}:`, body);
    if (res.status === 400)
      throw new Error("Invalid wallet address or request");
    if (i < retries - 1) await sleep(1000 * (i + 1));
    else
      throw new Error(
        `Alchemy returned ${res.status} after ${retries} attempts. Try again in a moment.`,
      );
  }
}

/**
 * Get all unique contract addresses owned by a wallet.
 * (withMetadata=false avoids an Alchemy pageKey bug)
 */
export async function getWalletContractAddresses(
  wallet: string,
): Promise<string[]> {
  const base = getNftApiBase();
  const addresses: string[] = [];
  let pageKey: string | undefined;
  do {
    const url = new URL(`${base}/getContractsForOwner`);
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

/**
 * Get the deployer address for each contract (used to determine created vs collected).
 */
export async function getContractDeployers(
  addresses: string[],
): Promise<Record<string, string>> {
  const base = getNftApiBase();
  const deployers: Record<string, string> = {};
  const BATCH = 5;
  for (let i = 0; i < addresses.length; i += BATCH) {
    const chunk = addresses.slice(i, i + BATCH);
    await Promise.all(
      chunk.map(async (addr) => {
        const url = new URL(`${base}/getContractMetadata`);
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

/**
 * Fetch NFTs owned by a wallet, filtered to specific contracts.
 */
export async function fetchNFTsForContracts(
  wallet: string,
  contractAddresses: string[],
): Promise<any[]> {
  if (contractAddresses.length === 0) return [];
  const base = getNftApiBase();
  const nfts: any[] = [];
  const CHUNK = 45;
  for (let i = 0; i < contractAddresses.length; i += CHUNK) {
    const chunk = contractAddresses.slice(i, i + CHUNK);
    let pageKey: string | undefined;
    do {
      const url = new URL(`${base}/getNFTsForOwner`);
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

/**
 * Fetch all NFTs in a single contract (no wallet needed).
 */
export async function fetchNFTsForContract(
  contractAddress: string,
): Promise<any[]> {
  const base = getNftApiBase();
  const nfts: any[] = [];
  let startToken: string | undefined;
  do {
    const url = new URL(`${base}/getNFTsForContract`);
    url.searchParams.set("contractAddress", contractAddress);
    url.searchParams.set("withMetadata", "true");
    url.searchParams.set("limit", "100");
    if (startToken) url.searchParams.set("startToken", startToken);
    const json = await fetchWithRetry(url.toString());
    nfts.push(...(json.nfts || []));
    startToken = json.nextToken;
  } while (startToken);
  return nfts;
}
