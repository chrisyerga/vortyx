import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { postsConvexLoader } from "./loaders/postsConvexLoader";

// Hand-written markdown posts live at src/content/sites/<siteKey>/<slug>.md;
// the siteKey is derived from the first path segment of the entry id.
const sitesMarkdown = defineCollection({
  loader: glob({ base: "./src/content/sites", pattern: "**/*.{md,mdx}" }),
  schema: z.object({
    title: z.string(),
    excerpt: z.string(),
    metaDescription: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z.array(z.string()).optional(),
    ogTitle: z.string().optional(),
    ogDescription: z.string().optional(),
    ogImageUrl: z.string().optional(),
    draft: z.boolean().optional(),
  }),
});

// Published posts stored in Convex (AI-generated or written in the admin panel).
const sitesConvex = defineCollection({
  loader: postsConvexLoader(),
});

export const collections = {
  sitesMarkdown,
  sitesConvex,
};
