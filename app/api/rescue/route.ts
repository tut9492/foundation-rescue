import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, parseAbi } from "viem";
import { mainnet } from "viem/chains";
import { extractCid } from "@/lib/ipfs";
import { FOUNDATION_NFT, NFT_MARKET } from "@/lib/addresses";
import { filterFoundationAddresses } from "@/lib/foundation-set";
import {
  getRpcUrl,
  getWalletContractAddresses,
  getContractDeployers,
  fetchNFTsForContracts,
  fetchNFTsForContract,
  sleep,
} from "@/lib/alchemy";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALCHEMY_KEY = process.env.ALCHEMY_KEY;
const PINATA_PIN_URL = "https://api.pinata.cloud/v3/files/public/pin_by_cid";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const marketAbi = parseAbi([
  "function getBuyPrice(address nftContract, uint256 tokenId) view returns (address seller, uint256 price)",
  "function getReserveAuctionIdFor(address nftContract, uint256 tokenId) view returns (uint256 auctionId)",
]);

async function pinCID(cid: string, name: string, pinataJwt: string) {
  try {
    const res = await fetch(PINATA_PIN_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${pinataJwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ cid, name }),
    });
    const json = await res.json();
    if (res.ok) {
      return { ok: true, cid, status: json.data?.status ?? "queued" };
    }
    const errMsg =
      typeof json.error === "string"
        ? json.error
        : json.error?.message ?? json.message ?? `HTTP ${res.status}`;
    return { ok: false, cid, error: String(errMsg) };
  } catch (e: any) {
    return { ok: false, cid, error: String(e.message) };
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function POST(req: NextRequest) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  const body = await req.json().catch(() => ({}));
  const { wallet, pinataJwt, createdOnly, contractOverride, contractAddress } =
    body ?? {};

  const isContractMode = !wallet && contractAddress;

  if (!isContractMode && (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet))) {
    return NextResponse.json(
      { error: "Invalid or missing wallet address" },
      { status: 400, headers: corsHeaders },
    );
  }
  if (isContractMode && !/^0x[a-fA-F0-9]{40}$/.test(contractAddress)) {
    return NextResponse.json(
      { error: "Invalid contract address" },
      { status: 400, headers: corsHeaders },
    );
  }
  if (!ALCHEMY_KEY) {
    return NextResponse.json(
      { error: "Server misconfigured - missing ALCHEMY_KEY" },
      { status: 500, headers: corsHeaders },
    );
  }

  const pinMode = !!pinataJwt;
  const publicClient = createPublicClient({
    chain: mainnet,
    transport: http(getRpcUrl()),
  });

  try {
    let foundationContracts: { address: string; created: boolean }[];
    let nfts: any[];
    let createdCount: number;
    let collectedCount: number;

    if (isContractMode) {
      foundationContracts = [{ address: contractAddress, created: false }];
      createdCount = 0;
      collectedCount = 0;
      nfts = await fetchNFTsForContract(contractAddress);
    } else {
      let foundationAddresses: string[];
      if (contractOverride && /^0x[a-fA-F0-9]{40}$/.test(contractOverride)) {
        foundationAddresses = [contractOverride];
      } else {
        const allAddresses = await getWalletContractAddresses(
          wallet.toLowerCase(),
        );
        foundationAddresses = filterFoundationAddresses(allAddresses);
      }

      const deployers = await getContractDeployers(foundationAddresses);
      foundationContracts = foundationAddresses.map((addr) => ({
        address: addr,
        created: deployers[addr.toLowerCase()] === wallet.toLowerCase(),
      }));

      const targetContracts = createdOnly
        ? foundationContracts.filter((c) => c.created)
        : foundationContracts;

      createdCount = foundationContracts.filter((c) => c.created).length;
      collectedCount = foundationContracts.filter((c) => !c.created).length;

      nfts = await fetchNFTsForContracts(
        wallet,
        targetContracts.map((c) => c.address),
      );
    }

    const pinned: any[] = [];
    const failed: any[] = [];
    const listings: any[] = [];
    const nftCards: any[] = [];

    // Process NFTs in chunks to avoid rate limits
    const NFT_CHUNK = 20;
    for (let i = 0; i < nfts.length; i += NFT_CHUNK) {
      const chunk = nfts.slice(i, i + NFT_CHUNK);

      await Promise.all(
        chunk.map(async (nft) => {
          const nftContract = nft.contract.address;
          const tokenId = nft.tokenId;
          const name = nft.name || nft.contract.name || `Token #${tokenId}`;
          const imageUrl =
            nft.image?.cachedUrl ||
            nft.image?.originalUrl ||
            nft.raw?.metadata?.image ||
            null;

          const metadataCID = extractCid(nft.tokenUri ?? "");
          let pinnedMeta = false;
          if (metadataCID && pinMode) {
            const r = await pinCID(
              metadataCID,
              `${name} - metadata`,
              pinataJwt,
            );
            (r.ok ? pinned : failed).push({ ...r, name, type: "metadata" });
            if (r.ok) pinnedMeta = true;
          }

          const imageUri = nft.raw?.metadata?.image || nft.image?.originalUrl;
          const imageCID = extractCid(imageUri ?? "");
          let pinnedImage = false;
          if (imageCID && imageCID !== metadataCID && pinMode) {
            const r = await pinCID(imageCID, `${name} - image`, pinataJwt);
            (r.ok ? pinned : failed).push({ ...r, name, type: "image" });
            if (r.ok) pinnedImage = true;
          }

          const hasIpfs = !!(metadataCID || imageCID);

          let isLocked = false;
          let auctionId: number | null = null;
          try {
            const [seller] = (await publicClient.readContract({
              address: NFT_MARKET as `0x${string}`,
              abi: marketAbi,
              functionName: "getBuyPrice",
              args: [nftContract as `0x${string}`, BigInt(tokenId)],
            })) as [string, bigint];
            if (seller !== ZERO_ADDRESS) {
              isLocked = true;
              try {
                const id = (await publicClient.readContract({
                  address: NFT_MARKET as `0x${string}`,
                  abi: marketAbi,
                  functionName: "getReserveAuctionIdFor",
                  args: [nftContract as `0x${string}`, BigInt(tokenId)],
                })) as bigint;
                if (Number(id) > 0) auctionId = Number(id);
              } catch {}

              listings.push({
                name,
                contractAddress: nftContract,
                tokenId,
                auctionId,
                unlockMethod: auctionId
                  ? "cancelReserveAuction"
                  : "cancelBuyPrice",
                calldata: auctionId
                  ? `cancelReserveAuction(${auctionId})`
                  : `cancelBuyPrice(${nftContract}, ${tokenId})`,
                marketContract: NFT_MARKET,
              });
            }
          } catch {}

          const isCreated =
            foundationContracts.find(
              (c) => c.address.toLowerCase() === nftContract.toLowerCase(),
            )?.created ?? false;

          nftCards.push({
            name,
            imageUrl,
            hasIpfs,
            pinnedMeta,
            pinnedImage,
            isLocked,
            isCreated,
            contractAddress: nftContract,
            tokenId,
          });
        }),
      );

      if (i + NFT_CHUNK < nfts.length) await sleep(500);
    }

    return NextResponse.json(
      {
        wallet: wallet || "",
        contractAddress: isContractMode ? contractAddress : undefined,
        nftsFound: nfts.length,
        foundationContracts: foundationContracts.length,
        createdContracts: createdCount,
        collectedContracts: collectedCount,
        pinned,
        failed,
        listings,
        nftCards,
        pinataUrl: "https://app.pinata.cloud/files",
        message:
          listings.length > 0
            ? `${listings.length} NFT(s) are locked in the Foundation marketplace contract. See 'listings' for unlist details.`
            : pinned.length > 0
              ? `All ${pinned.length} CIDs pinned successfully. Your assets are safe.`
              : nfts.length > 0
                ? `${nfts.length} Foundation NFT(s) found but no IPFS CIDs could be extracted - media may be HTTP-hosted or metadata unavailable.`
                : "No Foundation NFTs found in this wallet.",
      },
      { headers: corsHeaders },
    );
  } catch (e: any) {
    console.error("[rescue]", e);
    return NextResponse.json(
      { error: e.message },
      { status: 500, headers: corsHeaders },
    );
  }
}
