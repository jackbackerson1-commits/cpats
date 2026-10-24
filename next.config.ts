import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Evidence lives on persistent private storage, not inside deployment bundles.
  outputFileTracingExcludes: {
    '/*': ['./storage/evidence/**/*', './public/uploads/**/*'],
  },
};

export default nextConfig;
