import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createPublicClient, http, type Address } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";
import Link from "next/link";
import { getRpcUrl } from "@/lib/alchemy";
import { ipfsToHttp } from "@/lib/ipfs";
import { TutLogo } from "@/components/TutLogo";

type Params = Promise<{ address: string }>;

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function getClient() {
  return createPublicClient({
    chain: mainnet,
    transport: http(getRpcUrl()),
  });
}

async function resolveParam(raw: string): Promise<string | null> {
  const decoded = decodeURIComponent(raw);
  if (ADDRESS_RE.test(decoded)) return decoded;
  try {
    const client = getClient();
    const resolved = await client.getEnsAddress({
      name: normalize(decoded),
    });
    return resolved ?? null;
  } catch {
    return null;
  }
}

async function resolveIdentity(address: string) {
  const client = getClient();
  const addr = address as Address;
  let ensName: string | null = null;
  let avatarUrl: string | null = null;

  try {
    ensName = await client.getEnsName({ address: addr });
    if (ensName) {
      avatarUrl = await client.getEnsAvatar({ name: normalize(ensName) });
    }
  } catch {}

  const displayName =
    ensName ?? `${address.slice(0, 6)}...${address.slice(-4)}`;

  return { address: addr, ensName, displayName, avatarUrl };
}

async function fetchArtistNfts(wallet: string) {
  const ALCHEMY_KEY = process.env.ALCHEMY_KEY;
  if (!ALCHEMY_KEY) return [];

  // Load Foundation contract set
  const { getFoundationSet } = await import("@/lib/foundation-set");
  const {
    getWalletContractAddresses,
    fetchNFTsForContracts,
    fetchNFTMetadataBatch,
  } = await import("@/lib/alchemy");
  const { getTokensByCreator } = await import("@/lib/cid-lookup");

  // 1. Tokens the wallet currently owns on Foundation contracts
  const allAddresses = await getWalletContractAddresses(wallet);
  const foundationSet = getFoundationSet();
  const foundationAddresses = allAddresses.filter((a) =>
    foundationSet.has(a.toLowerCase()),
  );

  const ownedNfts = await fetchNFTsForContracts(wallet, foundationAddresses);

  // 2. Tokens this wallet CREATED (from the 343k CID dataset) — may no
  //    longer own them. Fetch metadata for any not already in results.
  const createdTokens = getTokensByCreator(wallet);
  if (createdTokens.length === 0) return ownedNfts;

  const ownedKeys = new Set(
    ownedNfts.map(
      (n: any) => `${n.contract.address.toLowerCase()}:${n.tokenId}`,
    ),
  );

  const missing = createdTokens.filter(
    (t) => !ownedKeys.has(`${t.collection.toLowerCase()}:${t.tokenId}`),
  );

  if (missing.length === 0) return ownedNfts;

  const fetched = await fetchNFTMetadataBatch(
    missing.map((t) => ({ contract: t.collection, tokenId: t.tokenId })),
  );

  return [...ownedNfts, ...fetched];
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { address: raw } = await params;
  const address = await resolveParam(raw);

  if (!address) {
    return { title: `Not found — Foundation Rescue` };
  }

  const identity = await resolveIdentity(address.toLowerCase());

  return {
    title: `${identity.displayName} — Foundation Artist`,
    description: `Foundation works by ${identity.displayName}`,
    openGraph: {
      title: `${identity.displayName} — Foundation Artist`,
      description: `Foundation works by ${identity.displayName}`,
      type: "profile",
    },
    twitter: {
      card: "summary_large_image",
      title: `${identity.displayName} — Foundation Artist`,
      description: `Foundation works by ${identity.displayName}`,
    },
  };
}

const VIDEO_EXTENSIONS = [".mp4", ".mov", ".webm", ".ogv"];

function isVideo(url: string): boolean {
  const lower = url.toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => lower.includes(ext));
}

export default async function ArtistPage({
  params,
}: {
  params: Params;
}) {
  const { address: raw } = await params;
  const decoded = decodeURIComponent(raw);
  const address = await resolveParam(raw);

  if (!address) {
    return (
      <div className="artist-page">
        <nav className="artist-nav">
          <Link href="/" className="nav-logo">
            Foundation Rescue
          </Link>
        </nav>
        <div className="artist-body">
          <div className="artist-empty">
            <h1>Not Found</h1>
            <p>
              Could not resolve &ldquo;{decoded}&rdquo; to an Ethereum address.
            </p>
            <Link href="/" className="artist-btn">
              Back to Rescue Tool
            </Link>
          </div>
        </div>
        <TutLogo />
      </div>
    );
  }

  // If user navigated via ENS name, redirect to canonical address URL
  if (!ADDRESS_RE.test(decoded)) {
    redirect(`/artist/${address}`);
  }

  const [identity, nfts] = await Promise.all([
    resolveIdentity(address.toLowerCase()),
    fetchArtistNfts(address.toLowerCase()),
  ]);

  const artworks = nfts.map((nft: any) => {
    const imageUrl =
      nft.image?.cachedUrl ||
      nft.image?.originalUrl ||
      (nft.raw?.metadata?.image ? ipfsToHttp(nft.raw.metadata.image) : "");

    return {
      contractAddress: nft.contract.address,
      tokenId: nft.tokenId,
      name: nft.name || nft.contract.name || `#${nft.tokenId}`,
      description: nft.raw?.metadata?.description || "",
      imageUrl,
      contractName: nft.contract.name || "",
    };
  });

  return (
    <div className="artist-page">
      <nav className="artist-nav">
        <Link href="/underpin" className="nav-logo">
          Underpin
        </Link>
        <div className="nav-links">
          <Link href="/">Rescue</Link>
        </div>
      </nav>

      <div className="artist-body">
        <header className="artist-header">
          <div className="artist-identity">
            {identity.avatarUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                className="artist-avatar"
                src={identity.avatarUrl}
                alt={identity.displayName}
              />
            )}
            <div>
              <h1>{identity.displayName}</h1>
              {identity.ensName && (
                <p className="artist-address">
                  {address.slice(0, 6)}...{address.slice(-4)}
                </p>
              )}
            </div>
          </div>
          <div className="artist-stats">
            <span>
              <strong>{artworks.length}</strong> works on Foundation
            </span>
          </div>
        </header>

        {artworks.length > 0 ? (
          <div className="artist-grid">
            {artworks.map((nft) => (
              <div
                className="artist-card"
                key={`${nft.contractAddress}-${nft.tokenId}`}
              >
                {nft.imageUrl ? (
                  isVideo(nft.imageUrl) ? (
                    <video
                      className="artist-media"
                      src={nft.imageUrl}
                      autoPlay
                      loop
                      muted
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      className="artist-media"
                      src={nft.imageUrl}
                      alt={nft.name}
                      loading="lazy"
                    />
                  )
                ) : (
                  <div className="artist-placeholder">No Image</div>
                )}
                <div className="artist-meta">
                  <div className="artist-name">{nft.name}</div>
                  {nft.contractName && (
                    <div className="artist-collection">{nft.contractName}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="artist-empty">
            <p>No Foundation NFTs found for this address.</p>
            <Link href="/" className="artist-btn">
              Try the Rescue Tool
            </Link>
          </div>
        )}
      </div>

      <TutLogo />
    </div>
  );
}
