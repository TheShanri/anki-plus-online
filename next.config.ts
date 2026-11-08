import type { NextConfig } from "next";

// Atlas assets (meshes, MRI volumes, indexes) change only on deploy: let browsers reuse them for an hour and
// revalidate in the background after that. `:path+` (not `*`) so the /atlas page itself is not matched.
const ATLAS_CACHE = [{ key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=604800" }];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/atlas/:path+", headers: ATLAS_CACHE },
      { source: "/atlas2/:path+", headers: ATLAS_CACHE },
    ];
  },
  async rewrites() {
    return [
      { source: "/classic", destination: "/classic/index.html" },
      { source: "/classic/:page(home|study|atlas|phrenology|links|guestbook|download|uc)", destination: "/classic/:page.html" },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
