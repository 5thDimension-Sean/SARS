import type { NextConfig } from "next";

// GitHub Pages serves project sites under /<repository>/. CI sets NEXT_PUBLIC_BASE_PATH (for example
// "/SARS"); local development and root-domain hosting leave it empty. lib/investigation.ts reads the
// same variable so published /data files resolve under the same prefix.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
  images: { unoptimized: true },
};

export default nextConfig;
