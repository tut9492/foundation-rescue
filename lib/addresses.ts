/**
 * Foundation contract addresses on Ethereum mainnet.
 * Adapted from ripe0x/pin (MIT).
 */
import type { Address } from "viem";

// Foundation shared 1/1 NFT contract
export const FOUNDATION_NFT: Address =
  "0x3B3ee1931Dc30C1957379FAc9aba94D1C48a5405";

// Collection factory V1 (creator-deployed collections)
export const COLLECTION_FACTORY_V1: Address =
  "0x3B612a5B49e025a6e4bA4eE4FB1EF46D13588059";

// Collection factory V2 (creator-deployed collections, drops, editions)
export const COLLECTION_FACTORY_V2: Address =
  "0x612E2DadDc89d91409e40f946f9f7CfE422e777E";

// NFTMarket proxy (all marketplace actions)
export const NFT_MARKET: Address =
  "0xcDA72070E455bb31C7690a170224Ce43623d0B6f";
