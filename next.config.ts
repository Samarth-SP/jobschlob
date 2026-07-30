import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/spike-latex": ["./bin/**/*", "./.tectonic-cache/**/*"],
  },
};

export default nextConfig;
