import type { Loader } from "astro/loaders";
import { z } from "astro/zod";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";

const convexPostSchema = z.object({
  title: z.string(),
  excerpt: z.string(),
  metaDescription: z.string(),
  pubDate: z.coerce.date(),
  updatedDate: z.coerce.date().optional(),
  tags: z.array(z.string()).optional(),
  siteKey: z.string(),
  source: z.enum(["ai", "manual"]),
  ogTitle: z.string().optional(),
  ogDescription: z.string().optional(),
  ogImageUrl: z.string().optional(),
});

type BuildPost = {
  siteKey: string;
  slug: string;
  title: string;
  body: string;
  excerpt: string;
  tags: string[] | null;
  source: "ai" | "manual";
  seo: {
    metaDescription: string;
    ogTitle?: string;
    ogDescription?: string;
    ogImageUrl?: string;
  };
  publishedAt: number;
  updatedAt: number | null;
};

export function postsConvexLoader(): Loader {
  return {
    name: "posts-convex-loader",
    load: async ({ store, parseData, renderMarkdown, logger }) => {
      store.clear();

      const convexUrl = import.meta.env.PUBLIC_CONVEX_URL;
      if (!convexUrl) {
        logger.warn(
          "PUBLIC_CONVEX_URL is not set; skipping Convex posts at build time.",
        );
        return;
      }

      try {
        const client = new ConvexHttpClient(convexUrl);
        const posts: BuildPost[] = await client.query(
          api.posts.listPublishedForBuild,
          {},
        );

        for (const post of posts) {
          const id = `${post.siteKey}/${post.slug}`;
          const data = await parseData({
            id,
            data: {
              title: post.title,
              excerpt: post.excerpt,
              metaDescription: post.seo.metaDescription,
              pubDate: new Date(post.publishedAt),
              updatedDate: post.updatedAt ? new Date(post.updatedAt) : undefined,
              tags: post.tags ?? undefined,
              siteKey: post.siteKey,
              source: post.source,
              ogTitle: post.seo.ogTitle,
              ogDescription: post.seo.ogDescription,
              ogImageUrl: post.seo.ogImageUrl,
            },
          });

          store.set({
            id,
            data,
            body: post.body,
            rendered: await renderMarkdown(post.body),
          });
        }

        logger.info(`Loaded ${posts.length} posts from Convex`);
      } catch (error) {
        logger.error(
          `Failed to load posts from Convex: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
    schema: convexPostSchema,
  } satisfies Loader;
}
