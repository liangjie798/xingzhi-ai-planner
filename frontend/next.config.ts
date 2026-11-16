import type { NextConfig } from "next";

// Baseline hardening for every page/static response served by Next.js.
// /api/* is proxied by nginx straight to Spring Boot, which emits its own headers.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  outputFileTracingIncludes: { "/*": ["./node_modules/playwright-core/**/*"] },
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    // Preserve existing bookmarks (including ?view=map/plan) at the new entry.
    return [{ source: "/dashboard", destination: "/XingZhi", permanent: true }];
  },
  async rewrites() {
    return process.env.NODE_ENV === "development"
      ? [{ source: "/api/:path*", destination: `${(process.env.BACKEND_INTERNAL_URL || "http://127.0.0.1:8080").replace(/\/+$/, "")}/api/:path*` }]
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
