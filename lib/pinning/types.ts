export type PinStatus = "pinned" | "pinning" | "failed" | "queued";

export type PinResult = {
  cid: string;
  name: string;
  type: "metadata" | "image";
  status: PinStatus;
  error?: string;
};

export interface PinningProvider {
  id: string;
  name: string;
  description: string;
  /** Pin an existing CID (no re-upload). */
  pinByCid(cid: string, name: string): Promise<PinResult>;
  /** Validate the API key before starting. */
  validateKey(): Promise<boolean>;
}

export type ProviderConfig = {
  id: string;
  name: string;
  description: string;
  placeholder: string;
  helpUrl: string;
  /** false = provider is temporarily unavailable */
  enabled: boolean;
};

export const PROVIDERS: ProviderConfig[] = [
  {
    id: "4everland",
    name: "4EVERLAND",
    description: "Free tier includes 6 GB. Pin-by-CID supported on free plan.",
    placeholder: "Your 4EVERLAND API key",
    helpUrl: "https://dashboard.4everland.org",
    enabled: true,
  },
  {
    id: "pinata",
    name: "Pinata",
    description:
      "Pin-by-CID requires the Picnic plan ($20/mo). Free tier will fail.",
    placeholder: "eyJhbGci...",
    helpUrl: "https://app.pinata.cloud/developers/api-keys",
    enabled: true,
  },
];
