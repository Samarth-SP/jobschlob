import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/workshop/generate": ["./bin/**/*", "./.tectonic-cache/**/*"],
  },
};

export default nextConfig;
