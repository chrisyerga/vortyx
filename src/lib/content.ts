import { getCollection, type CollectionEntry } from "astro:content";

export type SitePostEntry =
  | CollectionEntry<"sitesMarkdown">
  | CollectionEntry<"sitesConvex">;

export type SitePost = {
  siteKey: string;
  slug: string;
  title: string;
  excerpt: string;
  metaDescription: string;
  pubDate: Date;
  updatedDate?: Date;
  tags: string[];
  source: "markdown" | "ai" | "manual";
  ogTitle?: string;
  ogDescription?: string;
  ogImageUrl?: string;
  entry: SitePostEntry;
};

function entrySiteKeyAndSlug(id: string): { siteKey: string; slug: string } {
  const [siteKey, ...rest] = id.split("/");
  if (!siteKey || rest.length === 0) {
    throw new Error(
      `Site post entry id must be "<siteKey>/<slug>", got: ${id}`,
    );
  }
  return { siteKey, slug: rest.join("/") };
}

async function getAllSitePosts(): Promise<SitePost[]> {
  const markdownEntries = await getCollection(
    "sitesMarkdown",
    ({ data }) => !data.draft,
  );
  const convexEntries = await getCollection("sitesConvex");

  const posts: SitePost[] = [];

  for (const entry of markdownEntries) {
    const { siteKey, slug } = entrySiteKeyAndSlug(entry.id);
    posts.push({
      siteKey,
      slug,
      title: entry.data.title,
      excerpt: entry.data.excerpt,
      metaDescription: entry.data.metaDescription,
      pubDate: entry.data.pubDate,
      updatedDate: entry.data.updatedDate,
      tags: entry.data.tags ?? [],
      source: "markdown",
      ogTitle: entry.data.ogTitle,
      ogDescription: entry.data.ogDescription,
      ogImageUrl: entry.data.ogImageUrl,
      entry,
    });
  }

  for (const entry of convexEntries) {
    const { siteKey, slug } = entrySiteKeyAndSlug(entry.id);
    posts.push({
      siteKey,
      slug,
      title: entry.data.title,
      excerpt: entry.data.excerpt,
      metaDescription: entry.data.metaDescription,
      pubDate: entry.data.pubDate,
      updatedDate: entry.data.updatedDate,
      tags: entry.data.tags ?? [],
      source: entry.data.source,
      ogTitle: entry.data.ogTitle,
      ogDescription: entry.data.ogDescription,
      ogImageUrl: entry.data.ogImageUrl,
      entry,
    });
  }

  // A slug collision between a markdown file and a Convex post would produce
  // two pages fighting over one URL — fail the build instead.
  const seen = new Map<string, SitePost>();
  for (const post of posts) {
    const key = `${post.siteKey}/${post.slug}`;
    const other = seen.get(key);
    if (other) {
      throw new Error(
        `Duplicate post slug "${post.slug}" on site "${post.siteKey}" ` +
          `(${other.source} vs ${post.source}). Rename one of them.`,
      );
    }
    seen.set(key, post);
  }

  return posts.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());
}

export async function getSitePosts(siteKey: string): Promise<SitePost[]> {
  const posts = await getAllSitePosts();
  return posts.filter((post) => post.siteKey === siteKey);
}

export { getAllSitePosts };
