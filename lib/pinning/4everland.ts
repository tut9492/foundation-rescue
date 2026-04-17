import type { PinningProvider, PinResult } from "./types";

// 4EVERLAND uses the standard IPFS Pinning Services API
const API_BASE = "https://api.4everland.dev";

export function create4EverLandProvider(apiKey: string): PinningProvider {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  return {
    id: "4everland",
    name: "4EVERLAND",
    description: "Free tier, pin-by-CID supported.",

    async pinByCid(cid: string, name: string): Promise<PinResult> {
      try {
        const res = await fetch(`${API_BASE}/pins`, {
          method: "POST",
          headers,
          body: JSON.stringify({ cid, name }),
        });

        if (res.ok || res.status === 202) {
          return { cid, name, type: "metadata", status: "queued" };
        }

        // 409 = already pinned
        if (res.status === 409) {
          return { cid, name, type: "metadata", status: "pinned" };
        }

        const json = await res.json().catch(() => ({}));
        const errMsg =
          typeof json.error === "string"
            ? json.error
            : json.reason ?? json.message ?? `HTTP ${res.status}`;
        return {
          cid,
          name,
          type: "metadata",
          status: "failed",
          error: String(errMsg),
        };
      } catch (e: any) {
        return {
          cid,
          name,
          type: "metadata",
          status: "failed",
          error: String(e.message),
        };
      }
    },

    async validateKey(): Promise<boolean> {
      try {
        const res = await fetch(`${API_BASE}/pins?limit=1`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}
