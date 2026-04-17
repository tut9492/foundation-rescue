"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TutLogo } from "@/components/TutLogo";

type Stats = {
  totalWorks: number;
  totalArtists: number;
  totalCollections: number;
  withImage: number;
  withAnimation: number;
  withMetadata: number;
  topArtists: { address: string; works: number }[];
};

export default function DiscoverPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const router = useRouter();

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then((data) => setStats(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function handleSearch() {
    const q = search.trim();
    if (/^0x[a-fA-F0-9]{40}$/.test(q)) {
      router.push(`/artist/${q}`);
    } else if (q.includes(".eth")) {
      router.push(`/artist/${q}`);
    }
  }

  return (
    <div className="discover-page">
      <nav className="discover-nav">
        <Link href="/underpin" className="nav-logo">
          Underpin
        </Link>
        <div className="nav-links">
          <Link href="/">Rescue</Link>
          <Link href="/discover" className="active">
            Discover
          </Link>
        </div>
      </nav>

      <div className="discover-body">
        <section className="discover-hero">
          <h1>
            Every Foundation
            <br />
            artist. Discoverable.
          </h1>
          <p>
            343,194 works across {stats?.totalArtists?.toLocaleString() ?? "..."}{" "}
            artists. Search by wallet address or ENS name.
          </p>

          <div className="discover-search">
            <input
              type="text"
              placeholder="0x... or name.eth"
              spellCheck={false}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <button onClick={handleSearch}>View Artist</button>
          </div>
        </section>

        {loading ? (
          <div className="discover-loading">Loading stats...</div>
        ) : stats ? (
          <>
            <div className="discover-stats">
              <div className="discover-stat">
                <div className="num">
                  {stats.totalWorks.toLocaleString()}
                </div>
                <div className="label">Works Minted</div>
              </div>
              <div className="discover-stat">
                <div className="num">
                  {stats.totalArtists.toLocaleString()}
                </div>
                <div className="label">Artists</div>
              </div>
              <div className="discover-stat">
                <div className="num">
                  {stats.totalCollections.toLocaleString()}
                </div>
                <div className="label">Collections</div>
              </div>
              <div className="discover-stat">
                <div className="num">
                  {stats.withAnimation.toLocaleString()}
                </div>
                <div className="label">Video Works</div>
              </div>
            </div>

            <section className="discover-section">
              <h2>Top Artists by Works</h2>
              <div className="discover-list">
                {stats.topArtists.map((artist, i) => (
                  <Link
                    href={`/artist/${artist.address}`}
                    className="discover-row"
                    key={artist.address}
                  >
                    <span className="rank">{i + 1}</span>
                    <span className="address">
                      {artist.address.slice(0, 6)}...
                      {artist.address.slice(-4)}
                    </span>
                    <span className="works">
                      {artist.works} work{artist.works !== 1 ? "s" : ""}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          </>
        ) : null}
      </div>

      <TutLogo />
    </div>
  );
}
