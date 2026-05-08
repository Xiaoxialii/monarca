import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR ?? ".next"
};

export default nextConfig;
