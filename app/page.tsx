"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import type { RescueResponse, NftCard } from "@/lib/types";
import { TutLogo } from "@/components/TutLogo";
import {
  PROVIDERS,
  createProvider,
  getSavedProvider,
  saveProvider,
  type PinResult as ClientPinResult,
} from "@/lib/pinning";
import { extractCid } from "@/lib/ipfs";

type StatusKind = "" | "error" | "done";

export default function RescuePage() {
  const [wallet, setWallet] = useState("");
  const [contractInput, setContractInput] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("4everland");
  const [customContract, setCustomContract] = useState("");
  const [lastWallet, setLastWallet] = useState<string | null>(null);
  const [lastContract, setLastContract] = useState<string | null>(null);

  const [scanning, setScanning] = useState(false);
  const [pinning, setPinning] = useState(false);
  const [pinProgress, setPinProgress] = useState({ done: 0, total: 0 });
  const [pinResults, setPinResults] = useState<ClientPinResult[]>([]);

  const [statusMsg, setStatusMsg] = useState("");
  const [statusKind, setStatusKind] = useState<StatusKind>("");
  const [statusVisible, setStatusVisible] = useState(false);

  const [data, setData] = useState<RescueResponse | null>(null);
  const [cidMap, setCidMap] = useState<Record<string, any>>({});
  const [showPinCard, setShowPinCard] = useState(false);
  const [showMissingCard, setShowMissingCard] = useState(false);
  const [showUnderpinCta, setShowUnderpinCta] = useState(false);

  // Restore saved provider on mount
  useEffect(() => {
    const saved = getSavedProvider();
    if (saved) {
      setSelectedProvider(saved.id);
      setApiKey(saved.key);
    }
  }, []);

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

  async function fetchCids(nftCards: NftCard[]) {
    try {
      const tokens = nftCards.map((n) => ({
        collection: n.contractAddress,
        tokenId: n.tokenId,
      }));
      const res = await fetch("/api/cids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokens }),
      });
      if (res.ok) {
        const json = await res.json();
        setCidMap(json.cids || {});
      }
    } catch {
      // CID lookup is best-effort — pinning still works without it
    }
  }

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
      setShowPinCard(json.nftCards?.length > 0);
      await fetchCids(json.nftCards);
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
      setShowPinCard(json.nftCards?.length > 0);
      await fetchCids(json.nftCards);
    } catch (e: any) {
      showStatus("Network error - " + e.message, "error");
    } finally {
      setScanning(false);
    }
  }

  async function runPin() {
    const key = apiKey.trim();
    if (!key) return showStatus("Enter your API key first", "error");
    if (!data) return showStatus("Run a scan first", "error");

    const provider = createProvider(selectedProvider, key);

    // Validate key before starting
    showStatus("Validating API key...");
    const valid = await provider.validateKey();
    if (!valid) {
      return showStatus("Invalid API key. Check your key and try again.", "error");
    }

    // Save provider for next time
    saveProvider(selectedProvider, key);

    // Collect all CIDs to pin — from API response, enhanced by dataset
    const toPinList: { cid: string; name: string; type: "metadata" | "image" }[] = [];
    const seen = new Set<string>();

    for (const nft of data.nftCards) {
      const key = `${nft.contractAddress.toLowerCase()}:${nft.tokenId}`;
      const resolved = cidMap[key];

      // 1. Metadata CID — from API or dataset
      const metaCid = nft.metadataCid || resolved?.metadataCid;
      if (metaCid && !seen.has(metaCid)) {
        seen.add(metaCid);
        toPinList.push({ cid: metaCid, name: `${nft.name} - metadata`, type: "metadata" });
      }

      // 2. Image CID — from API or dataset
      const imgCid = nft.imageCid || resolved?.imageCid;
      if (imgCid && !seen.has(imgCid)) {
        seen.add(imgCid);
        toPinList.push({ cid: imgCid, name: `${nft.name} - image`, type: "image" });
      }

      // 3. Animation CID — only from dataset
      const animCid = resolved?.animationCid;
      if (animCid && !seen.has(animCid)) {
        seen.add(animCid);
        toPinList.push({ cid: animCid, name: `${nft.name} - animation`, type: "image" });
      }
    }

    if (toPinList.length === 0) {
      return showStatus("No IPFS CIDs found to pin", "error");
    }

    setPinning(true);
    setPinResults([]);
    setPinProgress({ done: 0, total: toPinList.length });
    showStatus(`Pinning ${toPinList.length} CIDs to ${provider.name}...`);

    const results: ClientPinResult[] = [];
    for (let i = 0; i < toPinList.length; i++) {
      const item = toPinList[i];
      const result = await provider.pinByCid(item.cid, item.name);
      result.type = item.type;
      results.push(result);
      setPinProgress({ done: i + 1, total: toPinList.length });
      setPinResults([...results]);
      // Rate limit: 350ms between requests
      if (i < toPinList.length - 1) {
        await new Promise((r) => setTimeout(r, 350));
      }
    }

    const pinned = results.filter((r) => r.status === "pinned" || r.status === "queued");
    const failed = results.filter((r) => r.status === "failed");

    if (failed.length === 0) {
      showStatus(`All ${pinned.length} CIDs pinned to ${provider.name}`, "done");
    } else if (pinned.length > 0) {
      showStatus(`${pinned.length} pinned, ${failed.length} failed`, "error");
    } else {
      showStatus(`All ${failed.length} pins failed — check your API key and plan`, "error");
    }

    setShowPinCard(false);
    setPinning(false);
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
            own IPFS provider and shows you how to retrieve any NFTs locked in
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
            <h2>Step 2 - Preserve on IPFS</h2>
            <p className="pin-desc">
              Your IPFS content will disappear when Foundation stops pinning.
              Choose a provider and pin it to your own account. Your API key
              stays in your browser — it never touches our server.
            </p>

            <div className="provider-select">
              {PROVIDERS.filter((p) => p.enabled).map((p) => (
                <label
                  key={p.id}
                  className={`provider-option ${selectedProvider === p.id ? "selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="provider"
                    value={p.id}
                    checked={selectedProvider === p.id}
                    onChange={() => setSelectedProvider(p.id)}
                  />
                  <div>
                    <strong>{p.name}</strong>
                    <span>{p.description}</span>
                  </div>
                </label>
              ))}
            </div>

            <label htmlFor="apiKey">
              {PROVIDERS.find((p) => p.id === selectedProvider)?.name} Access Token
            </label>
            <input
              type="password"
              id="apiKey"
              placeholder={
                PROVIDERS.find((p) => p.id === selectedProvider)?.placeholder
              }
              spellCheck={false}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, runPin)}
            />
            <p className="hint">
              {PROVIDERS.find((p) => p.id === selectedProvider)?.helpText}{" — "}
              <a
                href={
                  PROVIDERS.find((p) => p.id === selectedProvider)?.helpUrl
                }
                target="_blank"
                rel="noopener"
              >
                Open dashboard
              </a>
            </p>

            {pinning && pinProgress.total > 0 && (
              <div className="pin-progress">
                <div
                  className="pin-progress-bar"
                  style={{
                    width: `${(pinProgress.done / pinProgress.total) * 100}%`,
                  }}
                />
                <span className="pin-progress-text">
                  {pinProgress.done} / {pinProgress.total}
                </span>
              </div>
            )}

            <button
              className="primary"
              onClick={runPin}
              disabled={pinning}
            >
              {pinning ? (
                <>
                  <span className="loader" />
                  Pinning {pinProgress.done}/{pinProgress.total}...
                </>
              ) : (
                "Pin My IPFS Content"
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

        {data && <Results data={data} onCopy={copyCalldata} pinResults={pinResults} />}

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
  pinResults,
}: {
  data: RescueResponse;
  onCopy: (text: string) => void;
  pinResults: ClientPinResult[];
}) {
  const created = data.nftCards.filter((n) => n.isCreated);
  const collected = data.nftCards.filter((n) => !n.isCreated);
  const clientPinned = pinResults.filter(
    (r) => r.status === "pinned" || r.status === "queued",
  );
  const clientFailed = pinResults.filter((r) => r.status === "failed");

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
        {clientPinned.length > 0 && (
          <div className="stat good">
            <div className="num">{clientPinned.length}</div>
            <div className="label">CIDs Pinned</div>
          </div>
        )}
        {clientFailed.length > 0 && (
          <div className="stat alert">
            <div className="num">{clientFailed.length}</div>
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

      {/* Client-side pin results */}
      {clientPinned.length > 0 && (
        <div className="card">
          <h2>Pinned Successfully</h2>
          {clientPinned.map((p, i) => (
            <div className="pin-item" key={`${p.cid}-${i}`}>
              <span className="pin-name">{p.name}</span>
              <span className="pin-type">{p.type}</span>
              <span className="badge ok">{p.status}</span>
            </div>
          ))}
        </div>
      )}
      {clientFailed.length > 0 && (
        <div className="card">
          <h2>Pin Failures</h2>
          {clientFailed.map((p, i) => (
            <div className="pin-item" key={`${p.cid}-${i}`}>
              <span className="pin-name">{p.name}</span>
              <span className="pin-type">{p.type}</span>
              <span className="badge fail">
                Failed - {p.error ?? "Unknown error"}
              </span>
            </div>
          ))}
        </div>
      )}
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
