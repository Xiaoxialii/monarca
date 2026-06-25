import type { MetadataRoute } from "next";

const siteUrl = "https://www.monarcadata.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    {
      url: siteUrl,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1
    },
    {
      url: `${siteUrl}/consulting`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6
    },
    {
      url: `${siteUrl}/support`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.4
    },
    {
      url: `${siteUrl}/sign-in`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.2
    },
    {
      url: `${siteUrl}/sign-up`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.2
    }
  ];
}
