import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // auth-gated and machine-only surfaces; nothing here should rank
        disallow: [
          "/api/",
          "/app/",
          "/admin",
          "/onboarding/",
          "/auth/",
          "/ingest/",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
