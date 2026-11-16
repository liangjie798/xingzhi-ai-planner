import type { MetadataRoute } from "next";

const site = "https://lht574.cn";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Private application areas and internal API routes should not be crawled.
        disallow: ["/admin", "/account", "/settings", "/XingZhi", "/api/", "/model-gateway"],
      },
    ],
    sitemap: `${site}/sitemap.xml`,
    host: site,
  };
}
