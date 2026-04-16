// Response shape from /api/rescue — matches the contract of the original rescue.js.
// Any new consumer (profile page, future marketplace UI) should import from here.

export type NftCard = {
  name: string;
  imageUrl: string | null;
  hasIpfs: boolean;
  pinnedMeta: boolean;
  pinnedImage: boolean;
  isLocked: boolean;
  isCreated: boolean;
  contractAddress: string;
  tokenId: string;
};

export type MarketplaceListing = {
  name: string;
  contractAddress: string;
  tokenId: string;
  auctionId: number | null;
  unlockMethod: "cancelReserveAuction" | "cancelBuyPrice";
  calldata: string;
  marketContract: string;
};

export type PinResult = {
  ok: boolean;
  cid: string;
  status?: string;
  error?: string;
  name: string;
  type: "metadata" | "image";
};

export type RescueResponse = {
  wallet: string;
  nftsFound: number;
  foundationContracts: number;
  createdContracts: number;
  collectedContracts: number;
  pinned: PinResult[];
  failed: PinResult[];
  listings: MarketplaceListing[];
  nftCards: NftCard[];
  pinataUrl: string;
  message: string;
};

export type RescueRequest = {
  wallet?: string;
  pinataJwt?: string;
  createdOnly?: boolean;
  contractOverride?: string;
  contractAddress?: string;
};
