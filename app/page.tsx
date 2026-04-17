"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import type { RescueResponse, NftCard } from "@/lib/types";
import { TutLogo } from "@/components/TutLogo";

type StatusKind = "" | "error" | "done";

export default function RescuePage() {
  const [wallet, setWallet] = useState("");
  const [contractInput, setContractInput] = useState("");
  const [pinata, setPinata] = useState("");
  const [customContract, setCustomContract] = useState("");
  const [lastWallet, setLastWallet] = useState<string | null>(null);
  const [lastContract, setLastContract] = useState<string | null>(null);

  const [scanning, setScanning] = useState(false);
  const [pinning, setPinning] = useState(false);

  const [statusMsg, setStatusMsg] = useState("");
  const [statusKind, setStatusKind] = useState<StatusKind>("");
  const [statusVisible, setStatusVisible] = useState(false);

  const [data, setData] = useState<RescueResponse | null>(null);
  const [showPinCard, setShowPinCard] = useState(false);
  const [showMissingCard, setShowMissingCard] = useState(false);
  const [showUnderpinCta, setShowUnderpinCta] = useState(false);

  const showStatus = (msg: string, kind: StatusKind = "") => {
    setStatusMsg(msg);
    setStatusKind(kind);
    setStatusVisible(true);
  };

  const callRescue = useCallback(
    async (body: Record<string, unknown>): Promise<RescueResponse | null> => {
      const res = await fetch("/api/rescue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        showStatus(json.error || "Something went wrong", "error");
        return null;
      }
      return json as RescueResponse;
    },
    [],
  );

  async function runScan() {
    const w = wallet.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(w)) {
      showStatus("Invalid wallet address", "error");
      return;
    }
    setScanning(true);
    showStatus("Scanning wallet for Foundation NFTs...");
    setData(null);
    setShowPinCard(false);
    setLastContract(null);

    try {
      const json = await callRescue({ wallet: w });
      if (!json) return;
      setLastWallet(w);
      showStatus("Scan complete", "done");
      setData(json);
      setShowUnderpinCta(true);
      setShowMissingCard(json.nftsFound === 0);
      setShowPinCard(!!json.nftCards?.some((n) => n.hasIpfs));
    } catch (e: any) {
      showStatus("Network error - " + e.message, "error");
    } finally {
      setScanning(false);
    }
  }

  async function runContractScan() {
    const c = contractInput.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(c)) {
      showStatus("Invalid contract address", "error");
      return;
    }
    setScanning(true);
    showStatus("Scanning contract for NFTs...");
    setData(null);
    setShowPinCard(false);
    setLastWallet(null);

    try {
      const json = await callRescue({ contractAddress: c });
      if (!json) return;
      setLastContract(c);
      showStatus("Scan complete", "done");
      setData(json);
      setShowUnderpinCta(true);
      setShowMissingCard(false);
      setShowPinCard(!!json.nftCards?.some((n) => n.hasIpfs));
    } catch (e: any) {
      showStatus("Network error - " + e.message, "error");
    } finally {
      setScanning(false);
    }
  }

  async function runPin() {
    const jwt = pinata.trim();
    if (!jwt) return showStatus("Enter your Pinata JWT first", "error");
    if (!lastWallet && !lastContract) return showStatus("Run a scan first", "error");

    setPinning(true);
    showStatus(
      "Pinning your IPFS content to Pinata - this may take 30-60 seconds...",
    );
    try {
      const body: Record<string, unknown> = { pinataJwt: jwt };
      if (lastWallet) body.wallet = lastWallet;
      else body.contractAddress = lastContract;
      const json = await callRescue(body);
      if (!json) return;
      showStatus("Done - content pinned to your Pinata account", "done");
      setData(json);
      setShowPinCard(false);
    } catch (e: any) {
      showStatus("Network error - " + e.message, "error");
    } finally {
      setPinning(false);
    }
  }

  async function runCustomScan() {
    const contract = customContract.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(contract)) {
      return showStatus("Invalid contract address", "error");
    }
    if (!lastWallet) return showStatus("Scan your wallet first", "error");

    showStatus("Scanning contract...");
    try {
      const json = await callRescue({
        wallet: lastWallet,
        contractOverride: contract,
      });
      if (!json) return;
      showStatus("Scan complete", "done");
      setData(json);
    } catch (e: any) {
      showStatus("Network error - " + e.message, "error");
    }
  }

  function handleKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
    action: () => void,
  ) {
    if (e.key === "Enter") action();
  }

  async function copyCalldata(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      showStatus("Copied to clipboard", "done");
    } catch {
      showStatus("Could not copy to clipboard", "error");
    }
  }

  return (
    <div className="rescue-page">
      <div className="container">
        <header>
          <div className="header-row">
            <h1>Foundation Rescue</h1>
            <Link href="/underpin" className="header-link">
              Underpin →
            </Link>
          </div>
          <p>
            Foundation has shut down. Your token contracts are on-chain and
            safe - but the art and metadata living on IPFS could disappear when
            Foundation stops pinning it. This tool pins your content to your
            own Pinata account and shows you how to retrieve any NFTs locked in
            the Foundation marketplace contract.
          </p>
        </header>

        <div className="card">
          <h2>Step 1 - Find Your NFTs</h2>
          <label htmlFor="wallet">Wallet Address</label>
          <input
            type="text"
            id="wallet"
            placeholder="0x..."
            spellCheck={false}
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, runScan)}
          />
          <button
            className="primary"
            onClick={runScan}
            disabled={scanning}
          >
            {scanning ? (
              <>
                <span className="loader" />
                Scanning...
              </>
            ) : (
              "Scan Wallet"
            )}
          </button>

          <div className="or-divider">
            <span>or</span>
          </div>

          <label htmlFor="contractInput">Contract Address</label>
          <input
            type="text"
            id="contractInput"
            placeholder="0x..."
            spellCheck={false}
            value={contractInput}
            onChange={(e) => setContractInput(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, runContractScan)}
          />
          <button
            className="primary"
            onClick={runContractScan}
            disabled={scanning}
          >
            {scanning ? (
              <>
                <span className="loader" />
                Scanning...
              </>
            ) : (
              "Scan Contract"
            )}
          </button>
        </div>

        {showPinCard && (
          <div className="card">
            <h2>Step 2 - Pin to Pinata (Optional)</h2>
            <p
              style={{
                fontSize: 13,
                marginBottom: 18,
                lineHeight: 1.5,
              }}
            >
              Your IPFS content will disappear when Foundation stops pinning in
              ~1 year. Pin it to your own Pinata account to preserve it
              permanently.
            </p>
            <label htmlFor="pinata">Pinata JWT</label>
            <input
              type="password"
              id="pinata"
              placeholder="eyJhbGci..."
              spellCheck={false}
              value={pinata}
              onChange={(e) => setPinata(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, runPin)}
            />
            <p className="hint">
              Get a free JWT at{" "}
              <a
                href="https://app.pinata.cloud/developers/api-keys"
                target="_blank"
                rel="noopener"
              >
                pinata.cloud → API Keys
              </a>
              . Pinned to your account - we never store your key.
            </p>
            <button
              className="primary"
              onClick={runPin}
              disabled={pinning}
            >
              {pinning ? (
                <>
                  <span className="loader" />
                  Pinning...
                </>
              ) : (
                "Pin My NFTs to Pinata"
              )}
            </button>
          </div>
        )}

        {statusVisible && (
          <div className={`status ${statusKind}`} role="alert">{statusMsg}</div>
        )}

        {showMissingCard && (
          <div className="card">
            <h2>Don&apos;t see your NFTs?</h2>
            <p
              style={{
                fontSize: 13,
                lineHeight: 1.6,
                marginBottom: 18,
              }}
            >
              Two reasons this happens:
              <br />
              <br />
              <strong>1. Arweave metadata</strong> - some Foundation artists
              self-deployed their contracts and hosted metadata on Arweave,
              which is permanent. Those NFTs don&apos;t need rescuing.
              <br />
              <br />
              <strong>2. Self-deployed contract</strong> - if the artist
              deployed their own contract outside Foundation&apos;s factory,
              paste it below and we&apos;ll scan it directly.
            </p>
            <label htmlFor="customContract">Contract Address</label>
            <input
              type="text"
              id="customContract"
              placeholder="0x..."
              spellCheck={false}
              value={customContract}
              onChange={(e) => setCustomContract(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, runCustomScan)}
            />
            <button className="primary" onClick={runCustomScan}>
              Scan This Contract
            </button>
          </div>
        )}

        {data && <Results data={data} onCopy={copyCalldata} />}

        {showUnderpinCta && (
          <div className="underpin-cta">
            <p className="kicker">What&apos;s next</p>
            <h2>
              Your art deserves
              <br />a permanent home.
            </h2>
            <p>
              Foundation is gone. Underpin is a community-built, open-source
              marketplace with no company behind it. Fork it, run it, own it.
            </p>
            <Link href="/underpin" className="btn">
              Explore Underpin →
            </Link>
          </div>
        )}

        <TutLogo />

        <footer>
          Foundation contracts are non-custodial - your assets remain yours.
          This tool is free and open source.
        </footer>
      </div>
    </div>
  );
}

/* ---------- Results subcomponents ---------- */

function Results({
  data,
  onCopy,
}: {
  data: RescueResponse;
  onCopy: (text: string) => void;
}) {
  const created = data.nftCards.filter((n) => n.isCreated);
  const collected = data.nftCards.filter((n) => !n.isCreated);

  return (
    <div>
      {/* Stats */}
      <div className="stat-row">
        <div className="stat">
          <div className="num">{data.nftsFound}</div>
          <div className="label">NFTs Found</div>
        </div>
        {data.createdContracts > 0 && (
          <div className="stat">
            <div className="num">{data.createdContracts}</div>
            <div className="label">Your Collections</div>
          </div>
        )}
        {data.collectedContracts > 0 && (
          <div className="stat">
            <div className="num">{data.collectedContracts}</div>
            <div className="label">Collected</div>
          </div>
        )}
        <div className="stat good">
          <div className="num">{data.pinned.length}</div>
          <div className="label">CIDs Pinned</div>
        </div>
        {data.failed.length > 0 && (
          <div className="stat alert">
            <div className="num">{data.failed.length}</div>
            <div className="label">Pin Failures</div>
          </div>
        )}
        {data.listings.length > 0 && (
          <div className="stat alert">
            <div className="num">{data.listings.length}</div>
            <div className="label">Locked in Market</div>
          </div>
        )}
      </div>

      <div className="message-box">{data.message}</div>

      {/* Created */}
      {created.length > 0 && (
        <div className="card">
          <h2>Your Work ({created.length})</h2>
          <Grid nfts={created} />
        </div>
      )}

      {/* Collected */}
      {collected.length > 0 && (
        <div className="card">
          <h2>Collected ({collected.length})</h2>
          <div className="collected-note">
            These are works you own from other Foundation artists. Their IPFS
            content is at the same risk. Let them know they could lose their
            art - and point them here.
          </div>
          <Grid nfts={collected} />
        </div>
      )}

      {/* Listings */}
      {data.listings.length > 0 && (
        <div className="card">
          <h2>⚠ NFTs Locked in Foundation Marketplace</h2>
          {data.listings.map((l) => (
            <div className="listing" key={`${l.contractAddress}-${l.tokenId}`}>
              <h3>{l.name}</h3>
              <div className="field">NFT Contract</div>
              <div className="value">{l.contractAddress}</div>
              <div className="field">Token ID</div>
              <div className="value">{l.tokenId}</div>
              <div className="field">Unlist Method</div>
              <div className="value">{l.unlockMethod}</div>
              <div className="field">
                Call on Foundation Market ({l.marketContract})
              </div>
              <div className="value">{l.calldata}</div>
              <button
                className="copy-btn"
                onClick={() => onCopy(l.calldata)}
              >
                Copy Calldata
              </button>
              <br />
              <a
                className="etherscan-link"
                href={`https://etherscan.io/address/${l.marketContract}#writeContract`}
                target="_blank"
                rel="noopener"
              >
                → Open on Etherscan to unlist
              </a>
            </div>
          ))}
        </div>
      )}

      {/* Pinned */}
      {data.pinned.length > 0 ? (
        <div className="card">
          <h2>Pinned to Your Pinata</h2>
          {data.pinned.map((p, i) => (
            <div className="pin-item" key={`${p.cid}-${i}`}>
              <span className="pin-name">{p.name}</span>
              <span className="pin-type">{p.type}</span>
              <span className="badge ok">{p.status}</span>
            </div>
          ))}
          <br />
          <a
            className="etherscan-link"
            href="https://app.pinata.cloud/files"
            target="_blank"
            rel="noopener"
          >
            → View all pinned files on Pinata
          </a>
        </div>
      ) : data.failed.length > 0 ? (
        <div className="card">
          <h2>Pin Failures</h2>
          {data.failed.map((p, i) => (
            <div className="pin-item" key={`${p.cid}-${i}`}>
              <span className="pin-name">{p.name}</span>
              <span className="pin-type">{p.type}</span>
              <span className="badge fail">
                Failed - {typeof p.error === "string" ? p.error : "Unknown error"}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Grid({ nfts }: { nfts: NftCard[] }) {
  return (
    <div className="nft-grid">
      {nfts.map((nft) => (
        <div
          className="nft-card"
          key={`${nft.contractAddress}-${nft.tokenId}`}
        >
          {nft.imageUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={nft.imageUrl} alt={nft.name} loading="lazy" />
          ) : (
            <div className="nft-placeholder">No Image</div>
          )}
          <div className="nft-info">
            <div className="nft-name">{nft.name}</div>
            <div className="nft-status">
              {(nft.pinnedMeta || nft.pinnedImage) && (
                <span className="tag pinned">Pinned</span>
              )}
              {nft.isLocked && (
                <span className="tag locked">Locked in Market</span>
              )}
              {!nft.hasIpfs && <span className="tag no-ipfs">No IPFS</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
