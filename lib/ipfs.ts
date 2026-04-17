/**
 * IPFS utilities for CID extraction and gateway resolution.
 * Adapted from ripe0x/pin (MIT).
 */

export const IPFS_GATEWAYS = [
  "https://nftstorage.link",
  "https://cloudflare-ipfs.com",
  "https://dweb.link",
  "https://ipfs.io",
] as const;

const DEFAULT_GATEWAY = IPFS_GATEWAYS[0];

/**
 * Extract a raw CID (+ optional path) from an IPFS URI or gateway URL.
 * Handles Foundation's double-prefix bug: `ipfs://ipfs/QmXXX`.
 */
export function extractCid(uri: string): string | null {
  if (uri.startsWith("ipfs://")) {
    let cid = uri.replace("ipfs://", "");
    if (cid.startsWith("ipfs/")) cid = cid.replace("ipfs/", "");
    return cid || null;
  }
  const gateway = uri.match(/\/ipfs\/([a-zA-Z0-9]+)/);
  if (gateway) return gateway[1];
  return null;
}

/**
 * Convert an IPFS URI to an HTTP gateway URL.
 * Non-IPFS URIs are returned as-is.
 */
export function ipfsToHttp(
  uri: string,
  gateway: string = DEFAULT_GATEWAY,
): string {
  const cid = extractCid(uri);
  if (!cid) return uri;
  return `${gateway}/ipfs/${cid}`;
}
