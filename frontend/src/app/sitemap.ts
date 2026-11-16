import type { MetadataRoute } from "next";

const site = "https://lht574.cn";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date("2026-11-12T00:00:00+08:00");
  return [
    { url: `${site}/welcome`, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${site}/login`, lastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: `${site}/hourly`, lastModified, changeFrequency: "daily", priority: 0.7 },
    { url: `${site}/privacy`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: `${site}/terms`, lastModified, changeFrequency: "yearly", priority: 0.3 },
  ];
}
