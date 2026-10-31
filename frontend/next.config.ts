import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingIncludes: { "/*": ["./node_modules/playwright-core/**/*"] },
  cacheComponents: true,
  partialPrefetching: true,
  async redirects() {
    // Preserve existing bookmarks (including ?view=map/plan) at the new entry.
    return [{ source: "/dashboard", destination: "/XingZhi", permanent: true }];
  },
  async rewrites() {
    return process.env.NODE_ENV === "development"
      ? [{ source: "/api/:path*", destination: "http://localhost:8080/api/:path*" }]
      : [];
  },
  turbopack: {
    rules: {
      "*.css": {
        condition: { not: { path: "*.module.css" } },
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
