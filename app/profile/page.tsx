"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import type { RescueResponse, NftCard } from "@/lib/types";
import { TutLogo } from "@/components/TutLogo";

export default function ProfilePage() {
  const { address, isConnected } = useAccount();
  const [data, setData] = useState<RescueResponse | null>(null);
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
        const res = await fetch("/api/rescue", {
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
        setData(json as RescueResponse);
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address, isConnected]);

  const created = data?.nftCards.filter((n) => n.isCreated) ?? [];
  const collected = data?.nftCards.filter((n) => !n.isCreated) ?? [];

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
          <ConnectedHero address={address!}>
            <div className="loading">Loading your art…</div>
          </ConnectedHero>
        ) : error ? (
          <ConnectedHero address={address!}>
            <div className="error">Couldn&apos;t load your art: {error}</div>
          </ConnectedHero>
        ) : data ? (
          <ConnectedHero address={address!}>
            <div className="stats">
              <span>
                <strong>{data.nftsFound}</strong>
                Total
              </span>
              <span>
                <strong>{data.createdContracts}</strong>
                Collections
              </span>
              <span>
                <strong>{data.collectedContracts}</strong>
                Collected
              </span>
            </div>

            {created.length > 0 && (
              <>
                <p className="section-label">Your Work</p>
                <ArtGrid nfts={created} />
              </>
            )}

            {collected.length > 0 && (
              <>
                <p className="section-label">Collected</p>
                <ArtGrid nfts={collected} />
              </>
            )}

            {data.nftsFound === 0 && (
              <div className="empty">
                <p>No Foundation NFTs found for this wallet.</p>
                <Link href="/" className="btn-secondary">
                  Back to Rescue Tool
                </Link>
              </div>
            )}
          </ConnectedHero>
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
        Connect your wallet. See everything you&apos;ve created and collected.
        This is the start of your mint page — owned by you, hosted by no one.
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

function ConnectedHero({
  address,
  children,
}: {
  address: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <section className="profile-hero">
        <h1>
          Your art,
          <br />
          <em>your page.</em>
        </h1>
        <p>
          Connected as{" "}
          <span style={{ fontFamily: "monospace", color: "#f0f0f0" }}>
            {address.slice(0, 6)}…{address.slice(-4)}
          </span>
          . Next: set prices, turn this into your mint page.
        </p>
      </section>
      {children}
    </>
  );
}

function ArtGrid({ nfts }: { nfts: NftCard[] }) {
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
            <div
              className={`art-badge ${nft.isCreated ? "created" : ""}`}
            >
              {nft.isCreated ? "Created" : "Collected"}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
