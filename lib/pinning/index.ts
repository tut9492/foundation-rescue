export { PROVIDERS } from "./types";
export type { PinningProvider, PinResult, PinStatus, ProviderConfig } from "./types";
export { createPinataProvider } from "./pinata";
export { create4EverLandProvider } from "./4everland";

import type { PinningProvider } from "./types";
import { createPinataProvider } from "./pinata";
import { create4EverLandProvider } from "./4everland";

export function createProvider(
  providerId: string,
  apiKey: string,
): PinningProvider {
  switch (providerId) {
    case "pinata":
      return createPinataProvider(apiKey);
    case "4everland":
      return create4EverLandProvider(apiKey);
    default:
      throw new Error(`Unknown provider: ${providerId}`);
  }
}

const STORAGE_KEY = "underpin-pin-provider";

export function getSavedProvider(): {
  id: string;
  key: string;
} | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveProvider(id: string, key: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ id, key }));
}

export function clearProvider(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
