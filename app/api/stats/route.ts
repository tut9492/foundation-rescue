import { NextResponse } from "next/server";
import { loadCidMap } from "@/lib/cid-lookup";

export const runtime = "nodejs";

let cachedStats: any = null;

function computeStats() {
  if (cachedStats) return cachedStats;

  const map = loadCidMap();
  const artists = new Map<string, number>();
  const collections = new Set<string>();
  let totalWorks = 0;
  let withImage = 0;
  let withAnimation = 0;
  let withMetadata = 0;

  for (const [, token] of map) {
    totalWorks++;
    collections.add(token.collection.toLowerCase());

    const creator = token.creator.toLowerCase();
    if (creator) {
      artists.set(creator, (artists.get(creator) || 0) + 1);
    }

    if (token.imageCid) withImage++;
    if (token.animationCid) withAnimation++;
    if (token.metadataCid) withMetadata++;
  }

  // Top artists by work count
  const topArtists = [...artists.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([address, works]) => ({ address, works }));

  cachedStats = {
    totalWorks,
    totalArtists: artists.size,
    totalCollections: collections.size,
    withImage,
    withAnimation,
    withMetadata,
    topArtists,
  };

  return cachedStats;
}

export async function GET() {
  try {
    const stats = computeStats();
    return NextResponse.json(stats);
  } catch (e: any) {
    console.error("[stats]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
