import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, type Address } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";
import { ipfsToHttp } from "@/lib/ipfs";
import { getFoundationSet } from "@/lib/foundation-set";
import {
  getRpcUrl,
  getWalletContractAddresses,
  getContractDeployers,
  fetchNFTsForContracts,
} from "@/lib/alchemy";

export const maxDuration = 60;

export interface ProfileNft {
  contractAddress: string;
  tokenId: string;
  name: string;
  description?: string;
  imageUrl: string;
  contractName: string;
}

export interface ProfileIdentity {
  address: string;
  ensName: string | null;
  displayName: string;
  avatarUrl: string | null;
}

export interface ProfileResponse {
  wallet: string;
  identity: ProfileIdentity;
  totalMinted: number;
  nfts: ProfileNft[];
}

async function resolveIdentity(address: string): Promise<ProfileIdentity> {
  const client = createPublicClient({
    chain: mainnet,
    transport: http(getRpcUrl()),
  });
  const addr = address as Address;
  let ensName: string | null = null;
  let avatarUrl: string | null = null;

  try {
    ensName = await client.getEnsName({ address: addr });
    if (ensName) {
      avatarUrl = await client.getEnsAvatar({ name: normalize(ensName) });
    }
  } catch {
    // ENS resolution failed — use address as fallback
  }

  const displayName =
    ensName ?? `${address.slice(0, 6)}...${address.slice(-4)}`;

  return { address: addr, ensName, displayName, avatarUrl };
}

function nftToProfileNft(nft: any): ProfileNft {
  return {
    contractAddress: nft.contract.address,
    tokenId: nft.tokenId,
    name: nft.name || nft.contract.name || `#${nft.tokenId}`,
    description: nft.raw?.metadata?.description,
    imageUrl:
      nft.image?.cachedUrl ||
      nft.image?.originalUrl ||
      (nft.raw?.metadata?.image ? ipfsToHttp(nft.raw.metadata.image) : ""),
    contractName: nft.contract.name || "",
  };
}

export async function POST(req: NextRequest) {
  try {
    const { wallet } = await req.json();

    if (!wallet || !/^0x[0-9a-fA-F]{40}$/i.test(wallet)) {
      return NextResponse.json(
        { error: "Invalid wallet address" },
        { status: 400 },
      );
    }
    if (!process.env.ALCHEMY_KEY) {
      return NextResponse.json(
        { error: "Server not configured" },
        { status: 500 },
      );
    }

    const walletLower = wallet.toLowerCase();

    const [identity, allAddresses] = await Promise.all([
      resolveIdentity(walletLower),
      getWalletContractAddresses(walletLower),
    ]);

    const foundationSet = getFoundationSet();
    const foundationAddresses = allAddresses.filter((a) =>
      foundationSet.has(a.toLowerCase()),
    );

    const nfts = await fetchNFTsForContracts(walletLower, foundationAddresses);
    const profileNfts = nfts.map(nftToProfileNft);

    return NextResponse.json({
      wallet: walletLower,
      identity,
      totalMinted: profileNfts.length,
      nfts: profileNfts,
    } satisfies ProfileResponse);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[profile]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
