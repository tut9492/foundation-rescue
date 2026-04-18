/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // NFT images come from countless hosts — disable optimization and allow all.
    // Safe because these are <img> tags on a read-only gallery.
    unoptimized: true,
  },
  // Ensure data files created by prebuild are included in serverless output
  outputFileTracingIncludes: {
    "/api/**": ["./token-cids.csv", "./foundation-contracts-list.json"],
    "/artist/**": ["./token-cids.csv", "./foundation-contracts-list.json"],
  },
  webpack: (config) => {
    // wagmi + walletconnect expect some Node shims in the browser bundle.
    config.resolve.fallback = {
      fs: false,
      net: false,
      tls: false,
      "@react-native-async-storage/async-storage": false,
    };
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};

export default nextConfig;
