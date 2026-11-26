import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/api/receiving/forms/export': ['./src/templates/receiving/*.xlsx'],
  },
  // Evidence lives on persistent private storage, not inside deployment bundles.
  outputFileTracingExcludes: {
    '/*': ['./storage/evidence/**/*', './public/uploads/**/*'],
  },
};

export default nextConfig;
