/**
 * 95,297 Foundation collection contracts, loaded once at cold start.
 * Enumerated from Factory V1 + V2 creation events on-chain via Etherscan.
 */
import { readFileSync } from "fs";
import path from "path";
import { FOUNDATION_NFT } from "./addresses";

let cached: Set<string> | null = null;

export function getFoundationSet(): Set<string> {
  if (cached) return cached;
  const filePath = path.join(process.cwd(), "foundation-contracts-list.json");
  const list: string[] = JSON.parse(readFileSync(filePath, "utf8"));
  const set = new Set(list.map((a) => a.toLowerCase()));
  set.add(FOUNDATION_NFT.toLowerCase());
  cached = set;
  return set;
}

export function filterFoundationAddresses(addresses: string[]): string[] {
  const set = getFoundationSet();
  return addresses.filter((a) => set.has(a.toLowerCase()));
}
