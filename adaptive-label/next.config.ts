import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@remotion/bundler",
    "@remotion/renderer",
    "esbuild",
  ],
  // This app lives in a subdirectory of a repo that also contains an Astro
  // app (with its own lockfile). Pin the workspace root to this directory so
  // Next/Turbopack does not infer the parent repo as the root.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
