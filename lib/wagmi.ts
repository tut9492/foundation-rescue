import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { mainnet, base, optimism, arbitrum } from "wagmi/chains";
import { http } from "viem";

const projectId = process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID ?? "";

export const wagmiConfig = getDefaultConfig({
  appName: "Underpin",
  projectId,
  chains: [mainnet, base, optimism, arbitrum],
  // Route mainnet reads through our own Alchemy key if available.
  // (Other chains fall back to public RPC for now.)
  transports: {
    [mainnet.id]: http(
      process.env.NEXT_PUBLIC_ALCHEMY_KEY
        ? `https://eth-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_KEY}`
        : undefined,
    ),
    [base.id]: http(),
    [optimism.id]: http(),
    [arbitrum.id]: http(),
  },
  ssr: true,
});
