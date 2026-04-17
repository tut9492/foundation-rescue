import { NextRequest, NextResponse } from "next/server";
import { lookupBatch, type TokenCids } from "@/lib/cid-lookup";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function POST(req: NextRequest) {
  try {
    const { tokens } = await req.json();

    if (!Array.isArray(tokens) || tokens.length === 0) {
      return NextResponse.json(
        { error: "Provide an array of {collection, tokenId} objects" },
        { status: 400 },
      );
    }

    // Cap at 500 per request
    const capped = tokens.slice(0, 500);
    const results = lookupBatch(capped);

    const cids: Record<string, TokenCids> = {};
    for (let i = 0; i < capped.length; i++) {
      const result = results[i];
      if (result) {
        const key = `${capped[i].collection.toLowerCase()}:${capped[i].tokenId}`;
        cids[key] = result;
      }
    }

    return NextResponse.json({ cids, found: Object.keys(cids).length });
  } catch (e: any) {
    console.error("[cids]", e);
    return NextResponse.json(
      { error: e.message },
      { status: 500 },
    );
  }
}
