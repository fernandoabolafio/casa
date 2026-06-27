import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow loading the dev app (and its /_next/* client bundles) from these
  // hosts. Without this, opening the app via 127.0.0.1 or a LAN IP makes
  // Next.js block the dev resources cross-origin, so the client JS never loads
  // and the page renders as dead, non-interactive markup.
  allowedDevOrigins: ["127.0.0.1", "0.0.0.0"],
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
