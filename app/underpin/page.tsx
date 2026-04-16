import Link from "next/link";
import { TutLogo } from "@/components/TutLogo";

export const metadata = {
  title: "Underpin — Decentralized Digital Art Marketplace",
  description:
    "A decentralized, community-owned marketplace for digital art. No platform. No gatekeepers. No shutdown.",
};

export default function UnderpinPage() {
  return (
    <div className="underpin-page">
      <nav>
        <span className="nav-logo">Underpin</span>
        <div className="nav-links">
          <a href="#vision">Vision</a>
          <a href="#principles">Principles</a>
          <a href="#build">Build</a>
          <Link href="/profile" className="cta">
            Your Profile
          </Link>
          <a
            href="https://github.com/tut9492/foundation-rescue"
            target="_blank"
            rel="noopener"
            className="cta"
          >
            Fork on GitHub
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="hero">
        <p className="eyebrow">Decentralized Digital Art Marketplace</p>
        <h1>
          Art lives.
          <br />
          <em>Platforms</em>
          <br />
          don&apos;t.
        </h1>
        <p className="lead">
          Foundation shut down. The art didn&apos;t. Underpin is a
          decentralized, open-source marketplace built by and for the art
          community - with no company behind it that can close the door.
        </p>
        <div className="hero-actions">
          <a
            href="https://github.com/tut9492/foundation-rescue"
            target="_blank"
            rel="noopener"
            className="btn-primary"
          >
            Fork &amp; Build
          </a>
          <Link href="/" className="btn-secondary">
            Rescue Your NFTs First
          </Link>
        </div>
      </section>

      {/* Why */}
      <section className="section" id="vision">
        <p className="section-label">The Problem</p>
        <div className="why-grid">
          <div className="why-item">
            <div className="why-num">01</div>
            <h3>Platforms Die</h3>
            <p>
              Foundation, SuperRare, Nifty Gateway - any company can shut down,
              pivot, or sell. Your art and your audience shouldn&apos;t depend
              on their survival.
            </p>
          </div>
          <div className="why-item">
            <div className="why-num">02</div>
            <h3>Artists Lose Access</h3>
            <p>
              When a platform closes, artists lose their storefront, their
              history, their collector relationships. The token contract is
              on-chain. The art, the metadata, the media - that lives on IPFS
              or the platform&apos;s own servers. And it can disappear.
            </p>
          </div>
          <div className="why-item">
            <div className="why-num">03</div>
            <h3>Curation Becomes Control</h3>
            <p>
              Every curated platform eventually becomes a gatekeeper. Who gets
              featured. Who gets fees reduced. Who gets de-listed. That power
              shouldn&apos;t exist.
            </p>
          </div>
          <div className="why-item">
            <div className="why-num">04</div>
            <h3>Communities Can&apos;t Fork</h3>
            <p>
              If the community disagrees with a platform&apos;s direction, they
              have no recourse. Open source changes that. Fork it, run it, own
              it.
            </p>
          </div>
        </div>
      </section>

      {/* Manifesto */}
      <section className="manifesto">
        <p>
          Marketplaces shutting down is <strong>not the end.</strong> It&apos;s
          the beginning of a renaissance.
        </p>
        <p>
          With access to AI coding tools, artists can now build and own the
          full stack - creation, curation, distribution - without handing
          control to a platform that can disappear overnight.
        </p>
        <p>
          Underpin is the open source foundation for that future.{" "}
          <strong>
            Deploy your own contracts. Mint directly on-chain. Own your media,
            your storefront, your collector relationships end to end.
          </strong>{" "}
          No company behind it, no gatekeepers, no single point of failure.
        </p>
        <p>
          Your token is on-chain. Your art doesn&apos;t have to be at risk.
          What needs building is infrastructure that keeps it that way - built
          by the community, for the community.{" "}
          <strong>Fork it, run it, make it yours.</strong>
        </p>
      </section>

      {/* Principles */}
      <section className="principles" id="principles">
        <p className="section-label">Principles</p>
        <ul className="principle-list">
          <li>No custody. Your NFTs stay in your wallet.</li>
          <li>No gatekeepers. No application, no approval.</li>
          <li>No platform fees beyond gas.</li>
          <li>Open source, forever. Fork it. Run it. Improve it.</li>
          <li>
            No single point of failure - no company, no server, no admin key.
          </li>
          <li>Artist royalties enforced on-chain, not by policy.</li>
        </ul>
      </section>

      {/* Stack */}
      <section className="section">
        <p className="section-label">What Needs to Be Built</p>
        <div className="stack-grid">
          <div className="stack-item">
            <div className="stack-layer">Layer 1</div>
            <h4>Smart Contracts</h4>
            <p>
              Non-custodial marketplace contracts on Ethereum. Fixed price +
              auctions. Royalties enforced at the protocol level.
            </p>
          </div>
          <div className="stack-item">
            <div className="stack-layer">Layer 2</div>
            <h4>Indexer</h4>
            <p>
              Open indexing layer that reads all on-chain listings. Anyone can
              run one. No central API to shut down.
            </p>
          </div>
          <div className="stack-item">
            <div className="stack-layer">Layer 3</div>
            <h4>Frontend</h4>
            <p>
              Deployable gallery + marketplace UI. Host it yourself, fork the
              style, run your own instance. This repo is the starting point.
            </p>
          </div>
          <div className="stack-item">
            <div className="stack-layer">Layer 4</div>
            <h4>Storage</h4>
            <p>
              On-chain media storage where possible. IPFS as the floor - pinned
              by artists, not platforms that can go dark. The goal is art that
              survives everything.
            </p>
          </div>
        </div>
      </section>

      {/* Build */}
      <section className="build" id="build">
        <h2>
          This is yours
          <br />
          to build.
        </h2>
        <p>
          There is no team behind Underpin. No roadmap. No token. No company.
          Just a vision, a GitHub repo, and a community of artists who got
          burned and know how to build. Deploy your own contracts, mint
          directly on-chain, own your media end to end. If you&apos;re a
          developer, a designer, a smart contract engineer, or an artist who
          wants a permanent home - this is your project. The renaissance starts
          now.
        </p>
        <div className="build-links">
          <a
            href="https://github.com/tut9492/foundation-rescue"
            target="_blank"
            rel="noopener"
            className="btn-primary"
          >
            Fork on GitHub
          </a>
          <Link href="/" className="btn-secondary">
            ← Foundation Rescue Tool
          </Link>
        </div>
      </section>

      <footer>
        <span className="footer-left">
          Underpin - Open Source - No Rights Reserved
        </span>
        <div className="footer-right">
          <a
            href="https://github.com/tut9492/foundation-rescue"
            target="_blank"
            rel="noopener"
          >
            GitHub
          </a>
          <Link href="/">Rescue Tool</Link>
        </div>
      </footer>

      <TutLogo />
    </div>
  );
}
