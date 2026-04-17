import type { PinningProvider, PinResult } from "./types";

const API_BASE = "https://api.pinata.cloud";

export function createPinataProvider(jwt: string): PinningProvider {
  const headers = {
    Authorization: `Bearer ${jwt}`,
    "Content-Type": "application/json",
  };

  return {
    id: "pinata",
    name: "Pinata",
    description: "Requires Picnic plan for pin-by-CID.",

    async pinByCid(cid: string, name: string): Promise<PinResult> {
      try {
        const res = await fetch(`${API_BASE}/pinning/pinByHash`, {
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

        const json = await res.json().catch(() => ({}));

        // Pinata returns 400 DUPLICATE_OBJECT if already pinned
        if (
          res.status === 400 &&
          JSON.stringify(json).includes("DUPLICATE_OBJECT")
        ) {
          return { cid, name, type: "metadata", status: "pinned" };
        }

        const errMsg =
          typeof json.error === "string"
            ? json.error
            : json.error?.details ?? json.message ?? `HTTP ${res.status}`;
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
        const res = await fetch(`${API_BASE}/data/testAuthentication`, {
          headers: { Authorization: `Bearer ${jwt}` },
        });
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}
