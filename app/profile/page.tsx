"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import type { ProfileNft, ProfileResponse, ProfileIdentity } from "@/app/api/profile/route";
import { TutLogo } from "@/components/TutLogo";

export default function ProfilePage() {
  const { address, isConnected } = useAccount();
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isConnected || !address) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wallet: address }),
        });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error || `Server returned ${res.status}`);
          return;
        }
        setData(json as ProfileResponse);
      } catch (e: unknown) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address, isConnected]);

  return (
    <div className="profile-page">
      <header className="profile-header">
        <Link href="/underpin" className="brand">
          Underpin
        </Link>
        <ConnectButton
          accountStatus={{ smallScreen: "avatar", largeScreen: "address" }}
          chainStatus="none"
          showBalance={false}
        />
      </header>

      <main className="profile-body">
        {!isConnected ? (
          <ProfileLanding />
        ) : loading ? (
          <HeroShell address={address!}>
            <div className="loading">Scanning on-chain Foundation activity…</div>
          </HeroShell>
        ) : error ? (
          <HeroShell address={address!}>
            <div className="error">Could not load your art: {error}</div>
          </HeroShell>
        ) : data ? (
          <HeroShell address={address!} identity={data.identity}>
            <div className="stats">
              <span>
                <strong>{data.totalMinted}</strong>
                Minted
              </span>
            </div>

            {data.nfts.length > 0 ? (
              <ArtGrid nfts={data.nfts} />
            ) : (
              <div className="empty">
                <p>No Foundation NFTs minted from this wallet.</p>
                <Link href="/" className="btn-secondary">
                  Back to Rescue Tool
                </Link>
              </div>
            )}
          </HeroShell>
        ) : null}
      </main>

      <TutLogo />
    </div>
  );
}

function ProfileLanding() {
  return (
    <section className="profile-hero">
      <h1>
        Your art,
        <br />
        <em>your page.</em>
      </h1>
      <p>
        Connect your wallet. Every NFT you&apos;ve ever minted — any platform,
        any contract — in one place. This is the start of your mint page, owned
        by you, hosted by no one.
      </p>
      <ConnectButton.Custom>
        {({ openConnectModal, mounted }) => (
          <button
            type="button"
            className="btn-primary"
            onClick={openConnectModal}
            disabled={!mounted}
          >
            Connect wallet
          </button>
        )}
      </ConnectButton.Custom>
    </section>
  );
}

function HeroShell({
  address,
  identity,
  children,
}: {
  address: string;
  identity?: ProfileIdentity;
  children: React.ReactNode;
}) {
  const displayName = identity?.displayName ?? `${address.slice(0, 6)}…${address.slice(-4)}`;
  const shortAddr = `${address.slice(0, 6)}…${address.slice(-4)}`;

  return (
    <>
      <section className="profile-hero">
        <div className="profile-identity">
          {identity?.avatarUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              className="profile-avatar"
              src={identity.avatarUrl}
              alt={displayName}
            />
          )}
          <div>
            <h1>
              {identity?.ensName ? (
                <>{identity.ensName}</>
              ) : (
                <>
                  Your art,
                  <br />
                  <em>your page.</em>
                </>
              )}
            </h1>
            <p>
              {identity?.ensName
                ? `Foundation works by ${shortAddr}`
                : `Everything minted on Foundation. ${shortAddr}`}
            </p>
          </div>
        </div>
      </section>
      {children}
    </>
  );
}

function ArtGrid({ nfts }: { nfts: ProfileNft[] }) {
  return (
    <div className="art-grid">
      {nfts.map((nft) => (
        <div
          className="art-card"
          key={`${nft.contractAddress}-${nft.tokenId}`}
        >
          {nft.imageUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              className="art-media"
              src={nft.imageUrl}
              alt={nft.name}
              loading="lazy"
            />
          ) : (
            <div className="art-placeholder">No Image</div>
          )}
          <div className="art-meta">
            <div className="art-name">{nft.name}</div>
            {nft.contractName && (
              <div className="art-badge">{nft.contractName}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
