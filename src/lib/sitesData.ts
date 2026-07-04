import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";

export type SiteRecord = {
  _id: string;
  key: string;
  name: string;
  topic: string;
  description: string;
  theme: {
    accentColor: string;
    accentColorDark?: string;
    heroEmoji?: string;
  };
  seo: {
    metaDescription: string;
    ogImageUrl?: string;
  };
};

let cache: Promise<SiteRecord[]> | null = null;

async function fetchSites(): Promise<SiteRecord[]> {
  const convexUrl = import.meta.env.PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    console.warn("PUBLIC_CONVEX_URL is not set; no sites will be built.");
    return [];
  }
  const client = new ConvexHttpClient(convexUrl);
  return await client.query(api.sites.listEnabled, {});
}

/** Build-time site registry, fetched from Convex once per build. */
export function getEnabledSites(): Promise<SiteRecord[]> {
  return (cache ??= fetchSites());
}

export async function getSiteByKey(key: string): Promise<SiteRecord | undefined> {
  const sites = await getEnabledSites();
  return sites.find((site) => site.key === key);
}
