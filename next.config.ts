import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root — a stray parent lockfile otherwise makes Next infer
  // the wrong root directory.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
