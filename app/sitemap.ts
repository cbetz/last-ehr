import type { MetadataRoute } from "next";

const BASE_URL = "https://www.lastehr.com";

// lastModified is hardcoded per page and should be bumped when a page's
// CONTENT meaningfully changes. Using new Date() would stamp every page with
// the build time on every deploy, which tells crawlers nothing.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: BASE_URL,
      lastModified: new Date("2026-07-08"),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${BASE_URL}/headless-ehr`,
      lastModified: new Date("2026-07-08"),
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/docs`,
      lastModified: new Date("2026-07-09"),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/roadmap`,
      lastModified: new Date("2026-07-09"),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/medplum-ai-agent`,
      lastModified: new Date("2026-07-08"),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/approval-gated-writes`,
      lastModified: new Date("2026-07-08"),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/chat-with-fhir-data`,
      lastModified: new Date("2026-07-08"),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/demo`,
      lastModified: new Date("2026-07-01"),
      changeFrequency: "monthly",
      priority: 0.7,
    },
  ];
}
