import path from "node:path";
import { fileURLToPath } from "node:url";

const configDir = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.resolve(configDir, "../.."),
  experimental: {
    externalDir: true,
    devtoolSegmentExplorer: false
  },
  async redirects() {
    return [
      {
        source: "/feasibility/preview.html",
        destination: "/base-costs",
        permanent: false
      }
    ];
  }
};

export default nextConfig;
