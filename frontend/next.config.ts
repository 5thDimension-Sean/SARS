import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  trailingSlash: true,
  // Avoid concurrent static-export directory creation failures on Windows.
  experimental: process.platform === "win32"
    ? { cpus: 1, staticGenerationMaxConcurrency: 1 }
    : {},
};

export default nextConfig;
