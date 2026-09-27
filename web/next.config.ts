import type { NextConfig } from "next";

// The brain API (bun:sqlite, River) runs in the Bun server on :4173; the web app proxies to it.
const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  agentRules: false,
  async rewrites() {
    return [
      { source: "/api/:path*", destination: "http://localhost:4173/api/:path*" },
      { source: "/data/:path*", destination: "http://localhost:4173/data/:path*" },
    ];
  },
};

export default nextConfig;
