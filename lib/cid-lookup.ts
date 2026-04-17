/**
 * CID lookup from the Foundation IPFS CIDs dataset (343k tokens).
 * Loaded once at cold start, cached for the lifetime of the function instance.
 *
 * Data source: https://github.com/networked-art/foundation-ipfs-cids (CC0)
 */
import { readFileSync, existsSync } from "fs";
import path from "path";

export type TokenCids = {
  creator: string;
  collection: string;
  tokenId: string;
  metadataCid: string;
  imageCid: string;
  animationCid: string;
};

// Key format: "collection:tokenId" (both lowercased collection)
let CID_MAP: Map<string, TokenCids> | null = null;

function makeKey(collection: string, tokenId: string): string {
  return `${collection.toLowerCase()}:${tokenId}`;
}

export function loadCidMap(): Map<string, TokenCids> {
  if (CID_MAP) return CID_MAP;

  const filePath = path.join(process.cwd(), "token-cids.csv");
  if (!existsSync(filePath)) {
    console.warn("[cid-lookup] token-cids.csv not found — CID lookups disabled");
    CID_MAP = new Map();
    return CID_MAP;
  }

  const raw = readFileSync(filePath, "utf8");
  const lines = raw.split("\n");
  const map = new Map<string, TokenCids>();

  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    const parts = line.split(",");
    if (parts.length < 6) continue;

    const [creator, collection, tokenId, metadataCid, imageCid, animationCid] =
      parts;

    map.set(makeKey(collection, tokenId), {
      creator: creator.trim(),
      collection: collection.trim(),
      tokenId: tokenId.trim(),
      metadataCid: (metadataCid || "").trim(),
      imageCid: (imageCid || "").trim(),
      animationCid: (animationCid || "").trim(),
    });
  }

  CID_MAP = map;
  return map;
}

export function lookupCids(
  collection: string,
  tokenId: string,
): TokenCids | null {
  const map = loadCidMap();
  return map.get(makeKey(collection, tokenId)) ?? null;
}

export function lookupBatch(
  tokens: { collection: string; tokenId: string }[],
): (TokenCids | null)[] {
  const map = loadCidMap();
  return tokens.map((t) => map.get(makeKey(t.collection, t.tokenId)) ?? null);
}
