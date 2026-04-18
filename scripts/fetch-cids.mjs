#!/usr/bin/env node
/**
 * Download the Foundation IPFS CIDs dataset from GitHub.
 * Run during build or manually: node scripts/fetch-cids.mjs
 *
 * Source: https://github.com/networked-art/foundation-ipfs-cids (CC0)
 */
import { writeFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";

const URL =
  "https://raw.githubusercontent.com/networked-art/foundation-ipfs-cids/master/token_cids.csv";
const OUT = join(process.cwd(), "token-cids.csv");
const EXPECTED_MIN_LINES = 340000; // dataset has ~343k tokens

if (existsSync(OUT)) {
  // Validate existing file isn't truncated
  const existing = readFileSync(OUT, "utf8");
  const lineCount = existing.split("\n").filter(Boolean).length;
  if (lineCount >= EXPECTED_MIN_LINES) {
    console.log(`[fetch-cids] token-cids.csv already exists with ${lineCount} lines, skipping download`);
    process.exit(0);
  }
  console.log(`[fetch-cids] token-cids.csv exists but only has ${lineCount} lines (expected ${EXPECTED_MIN_LINES}+), re-downloading`);
}

console.log("[fetch-cids] Downloading Foundation IPFS CIDs dataset...");

const res = await fetch(URL);
if (!res.ok) {
  console.warn(`[fetch-cids] Failed to download: ${res.status} — CID lookups will be disabled`);
  process.exit(0);
}

const text = await res.text();
const lineCount = text.split("\n").filter(Boolean).length;

if (lineCount < EXPECTED_MIN_LINES) {
  console.warn(`[fetch-cids] Download appears truncated: ${lineCount} lines (expected ${EXPECTED_MIN_LINES}+)`);
}

writeFileSync(OUT, text);
console.log(`[fetch-cids] Saved ${(text.length / 1024 / 1024).toFixed(1)}MB (${lineCount} lines) to token-cids.csv`);
