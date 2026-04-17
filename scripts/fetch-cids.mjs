#!/usr/bin/env node
/**
 * Download the Foundation IPFS CIDs dataset from GitHub.
 * Run during build or manually: node scripts/fetch-cids.mjs
 *
 * Source: https://github.com/networked-art/foundation-ipfs-cids (CC0)
 */
import { writeFileSync, existsSync } from "fs";
import { join } from "path";

const URL =
  "https://raw.githubusercontent.com/networked-art/foundation-ipfs-cids/master/token_cids.csv";
const OUT = join(process.cwd(), "token-cids.csv");

if (existsSync(OUT)) {
  console.log("[fetch-cids] token-cids.csv already exists, skipping download");
  process.exit(0);
}

console.log("[fetch-cids] Downloading Foundation IPFS CIDs dataset...");

const res = await fetch(URL);
if (!res.ok) {
  console.warn(`[fetch-cids] Failed to download: ${res.status} — CID lookups will be disabled`);
  process.exit(0);
}

const text = await res.text();
writeFileSync(OUT, text);
console.log(`[fetch-cids] Saved ${(text.length / 1024 / 1024).toFixed(1)}MB to token-cids.csv`);
