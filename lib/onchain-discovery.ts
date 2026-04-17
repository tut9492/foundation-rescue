/**
 * On-demand artist token discovery via direct RPC calls.
 * Adapted from ripe0x/pin (MIT) — https://github.com/ripe0x/pin
 *
 * Finds all tokens an artist minted on Foundation — both the shared NFT
 * contract and per-artist collection contracts deployed via the
 * NFTCollectionFactory.
 *
 * No indexer dependency — works with just an RPC endpoint + IPFS gateways.
 */
import {
  createPublicClient,
  http,
  parseAbiItem,
  type Address,
} from "viem";
import { mainnet } from "viem/chains";
import { foundationNftAbi, erc721Abi } from "./abi";
import {
  FOUNDATION_NFT,
  COLLECTION_FACTORY_V1,
  COLLECTION_FACTORY_V2,
} from "./addresses";
import { extractCid, ipfsToHttp } from "./ipfs";

// Block when the FoundationNFT contract was deployed
const SHARED_DEPLOY_BLOCK = 11_907_800n;
const FACTORY_V1_DEPLOY_BLOCK = 14_000_000n;
const FACTORY_V2_DEPLOY_BLOCK = 15_000_000n;
const BLOCK_RANGE = 2_000_000n;

export type DiscoveredToken = {
  tokenId: string;
  contract: Address;
  creator: Address;
  tokenUri: string | null;
  metadataCid: string | null;
  mediaCid: string | null;
  metadata: {
    name?: string;
    description?: string;
    image?: string;
  } | null;
  mediaHttpUrl: string | null;
  collectionName: string | null;
};

function getClient() {
  const rpcUrl = process.env.ALCHEMY_KEY
    ? `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`
    : "https://eth.llamarpc.com";
  return createPublicClient({
    chain: mainnet,
    transport: http(rpcUrl),
  });
}

const mintedEvent = parseAbiItem(
  "event Minted(address indexed creator, uint256 indexed tokenId, string indexed indexedTokenIPFSPath, string tokenIPFSPath)",
);

const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
);

/**
 * Discover all tokens minted by an artist on Foundation.
 */
export async function discoverArtistTokens(
  artistAddress: string,
): Promise<DiscoveredToken[]> {
  const client = getClient();
  const artist = artistAddress.toLowerCase() as Address;
  const latestBlock = await client.getBlockNumber();

  const [sharedTokens, collectionTokens] = await Promise.all([
    discoverSharedContractTokens(client, artist, latestBlock),
    discoverCollectionTokens(client, artist, latestBlock),
  ]);

  return [...sharedTokens, ...collectionTokens];
}

// ── Shared contract discovery ────────────────────────────────────────────────

async function discoverSharedContractTokens(
  client: ReturnType<typeof createPublicClient>,
  artist: Address,
  latestBlock: bigint,
): Promise<DiscoveredToken[]> {
  const mintLogs = await getLogs(
    client,
    FOUNDATION_NFT,
    mintedEvent,
    { creator: artist },
    SHARED_DEPLOY_BLOCK,
    latestBlock,
  );

  if (mintLogs.length === 0) return [];

  const tokenIds = mintLogs.map(
    (log) => (log as { args: { tokenId: bigint } }).args.tokenId,
  );

  return resolveTokenMetadata(client, FOUNDATION_NFT, tokenIds, artist, null);
}

// ── Collection contract discovery ────────────────────────────────────────────

type CollectionInfo = {
  address: Address;
  name: string;
};

async function discoverCollectionTokens(
  client: ReturnType<typeof createPublicClient>,
  artist: Address,
  latestBlock: bigint,
): Promise<DiscoveredToken[]> {
  const collections = await findArtistCollections(client, artist, latestBlock);
  if (collections.length === 0) return [];

  const allTokens: DiscoveredToken[] = [];

  for (const collection of collections) {
    const mintLogs = await getLogs(
      client,
      collection.address,
      transferEvent,
      { from: "0x0000000000000000000000000000000000000000" as Address },
      FACTORY_V1_DEPLOY_BLOCK,
      latestBlock,
    );

    if (mintLogs.length === 0) continue;

    const tokenIds = mintLogs.map(
      (log) => (log as { args: { tokenId: bigint } }).args.tokenId,
    );

    const tokens = await resolveTokenMetadata(
      client,
      collection.address,
      tokenIds,
      artist,
      collection.name,
    );
    allTokens.push(...tokens);
  }

  return allTokens;
}

async function findArtistCollections(
  client: ReturnType<typeof createPublicClient>,
  artist: Address,
  latestBlock: bigint,
): Promise<CollectionInfo[]> {
  const collections: CollectionInfo[] = [];

  const nftCollectionEvent = parseAbiItem(
    "event NFTCollectionCreated(address indexed collection, address indexed creator, uint256 indexed version, string name, string symbol, uint256 nonce)",
  );

  const legacyCollectionEvent = parseAbiItem(
    "event CollectionCreated(address indexed collection, address indexed creator, uint256 indexed version, string name, string symbol, uint256 nonce)",
  );

  const dropCollectionEvent = parseAbiItem(
    "event NFTDropCollectionCreated(address indexed collection, address indexed creator, address indexed approvedMinter, string name, string symbol, string baseURI, bool isRevealed, uint256 maxTokenId, address paymentAddress, uint256 version, uint256 nonce)",
  );

  const [
    v1Collections,
    v1Legacy,
    v1Drops,
    v2Collections,
    v2Legacy,
    v2Drops,
  ] = await Promise.all([
    getLogs(client, COLLECTION_FACTORY_V1, nftCollectionEvent, { creator: artist }, FACTORY_V1_DEPLOY_BLOCK, latestBlock),
    getLogs(client, COLLECTION_FACTORY_V1, legacyCollectionEvent, { creator: artist }, FACTORY_V1_DEPLOY_BLOCK, latestBlock),
    getLogs(client, COLLECTION_FACTORY_V1, dropCollectionEvent, { creator: artist }, FACTORY_V1_DEPLOY_BLOCK, latestBlock),
    getLogs(client, COLLECTION_FACTORY_V2, nftCollectionEvent, { creator: artist }, FACTORY_V2_DEPLOY_BLOCK, latestBlock),
    getLogs(client, COLLECTION_FACTORY_V2, legacyCollectionEvent, { creator: artist }, FACTORY_V2_DEPLOY_BLOCK, latestBlock),
    getLogs(client, COLLECTION_FACTORY_V2, dropCollectionEvent, { creator: artist }, FACTORY_V2_DEPLOY_BLOCK, latestBlock),
  ]);

  for (const log of [...v1Collections, ...v1Legacy, ...v2Collections, ...v2Legacy]) {
    const args = (log as { args: { collection: Address; name: string } }).args;
    collections.push({ address: args.collection, name: args.name });
  }

  for (const log of [...v1Drops, ...v2Drops]) {
    const args = (log as { args: { collection: Address; name: string } }).args;
    collections.push({ address: args.collection, name: args.name });
  }

  // Dedupe by address
  const seen = new Set<string>();
  return collections.filter((c) => {
    const key = c.address.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Shared helpers ───────────────────────────────────────────────────────────

async function getLogs(
  client: ReturnType<typeof createPublicClient>,
  address: Address,
  event: ReturnType<typeof parseAbiItem>,
  args: Record<string, unknown>,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<unknown[]> {
  const allLogs: unknown[] = [];

  for (let start = fromBlock; start <= toBlock; start += BLOCK_RANGE) {
    const end = start + BLOCK_RANGE - 1n > toBlock ? toBlock : start + BLOCK_RANGE - 1n;
    try {
      const logs = await client.getLogs({
        address,
        event: event as any,
        args,
        fromBlock: start,
        toBlock: end,
      });
      allLogs.push(...logs);
    } catch {
      // If range too large, split in half and retry
      if (end - start > 10_000n) {
        const mid = start + (end - start) / 2n;
        const firstHalf = await getLogs(client, address, event, args, start, mid);
        const secondHalf = await getLogs(client, address, event, args, mid + 1n, end);
        allLogs.push(...firstHalf, ...secondHalf);
      }
    }
  }

  return allLogs;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

async function resolveTokenMetadata(
  client: ReturnType<typeof createPublicClient>,
  contract: Address,
  tokenIds: bigint[],
  creator: Address,
  collectionName: string | null,
): Promise<DiscoveredToken[]> {
  const tokens: DiscoveredToken[] = [];

  for (let i = 0; i < tokenIds.length; i += 50) {
    const batchIds = tokenIds.slice(i, i + 50);

    const calls = batchIds.flatMap((tokenId) => [
      {
        address: contract,
        abi: erc721Abi,
        functionName: "ownerOf" as const,
        args: [tokenId] as const,
      },
      {
        address: contract,
        abi: erc721Abi,
        functionName: "tokenURI" as const,
        args: [tokenId] as const,
      },
    ]);

    const results = await client.multicall({ contracts: calls });

    const metadataPromises = batchIds.map(async (tokenId, j) => {
      const ownerResult = results[j * 2];
      const uriResult = results[j * 2 + 1];

      // Skip burned tokens
      if (ownerResult.status !== "success") return null;
      const owner = ownerResult.result as string;
      if (owner.toLowerCase() === ZERO_ADDRESS) return null;

      const tokenUri =
        uriResult.status === "success" ? (uriResult.result as string) : null;

      let metadataCid: string | null = null;
      let mediaCid: string | null = null;
      let metadata: DiscoveredToken["metadata"] = null;
      let mediaHttpUrl: string | null = null;

      if (tokenUri) {
        metadataCid = extractCid(tokenUri);

        try {
          const httpUrl = ipfsToHttp(tokenUri);
          const res = await fetch(httpUrl, {
            signal: AbortSignal.timeout(10_000),
          });
          if (res.ok) {
            metadata = await res.json();
            if (metadata?.image) {
              mediaCid = extractCid(metadata.image);
              mediaHttpUrl = ipfsToHttp(metadata.image);
            }
          }
        } catch {
          // Metadata fetch failed — token still included with null metadata
        }
      }

      return {
        tokenId: tokenId.toString(),
        contract,
        creator,
        tokenUri,
        metadataCid,
        mediaCid,
        metadata,
        mediaHttpUrl,
        collectionName,
      } satisfies DiscoveredToken;
    });

    const batchTokens = await Promise.all(metadataPromises);
    tokens.push(...batchTokens.filter((t): t is DiscoveredToken => t !== null));
  }

  return tokens;
}
