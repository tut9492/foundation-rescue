import type { PinningProvider, PinResult } from "./types";

const API_BASE = "https://api.4everland.dev/pinning";

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
        const res = await fetch(`${API_BASE}/pinByHash`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            hashToPin: cid,
            pinataMetadata: { name },
          }),
        });

        if (res.ok) {
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
            : json.message ?? `HTTP ${res.status}`;
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
        const res = await fetch(`${API_BASE}/pinList?pageLimit=1`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}
