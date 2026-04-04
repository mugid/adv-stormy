import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/**
 * yjs `exports["."].import` points at `./src/index.js`. Turbopack compiling that graph
 * triggers TDZ errors (e.g. Cannot access 'fX' before initialization). Use the rollup bundle.
 */
const yjsBundled = path.join(projectRoot, "node_modules/yjs/dist/yjs.mjs");

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      yjs: "./node_modules/yjs/dist/yjs.mjs",
    },
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      yjs: yjsBundled,
    };
    return config;
  },
};

export default nextConfig;
