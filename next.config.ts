import type { NextConfig } from "next";
import { FILE_UPLOAD_MAX_BYTES } from "./lib/upload-limits";

const nextConfig: NextConfig = {
  devIndicators: false,
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  outputFileTracingRoot: __dirname,
  experimental: {
    middlewareClientMaxBodySize: FILE_UPLOAD_MAX_BYTES
  }
};

export default nextConfig;
