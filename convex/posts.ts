import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAdminSession } from "./lib/auth";
import { normalizeSlug } from "./lib/slug";
import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

const postStatusValidator = v.union(v.literal("draft"), v.literal("published"));
const postSourceValidator = v.union(v.literal("ai"), v.literal("manual"));

const seoValidator = v.object({
  metaDescription: v.string(),
  ogTitle: v.optional(v.string()),
  ogDescription: v.optional(v.string()),
  ogImageUrl: v.optional(v.string()),
});

const MAX_SITES = 200;
const MAX_POSTS_PER_SITE = 2000;

async function requireSite(ctx: MutationCtx, siteId: Id<"sites">) {
  const site = await ctx.db.get("sites", siteId);
  if (!site) {
    throw new Error("Site not found");
  }
  return site;
}

async function findSlugOwner(
  ctx: MutationCtx,
  siteId: Id<"sites">,
  slug: string,
) {
  return await ctx.db
    .query("posts")
    .withIndex("by_site_and_slug", (q) => q.eq("siteId", siteId).eq("slug", slug))
    .unique();
}

async function scheduleDeploy(ctx: MutationCtx, postId: Id<"posts">) {
  await ctx.scheduler.runAfter(0, internal.deploy.triggerSiteDeploy, { postId });
}

// Admin list — deliberately excludes `body` to keep reactive reads small.
function toListItem(post: Doc<"posts">) {
  return {
    _id: post._id,
    siteId: post.siteId,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    tags: post.tags ?? null,
    status: post.status,
    source: post.source,
    publishedAt: post.publishedAt,
    updatedAt: post.updatedAt ?? null,
    deployStatus: post.deployStatus ?? null,
    deployError: post.deployError ?? null,
  };
}

// Build-time query: all published posts across enabled sites, tagged with site key.
export const listPublishedForBuild = query({
  args: {},
  handler: async (ctx) => {
    const sites = await ctx.db
      .query("sites")
      .withIndex("by_status", (q) => q.eq("status", "enabled"))
      .take(MAX_SITES);

    const result = [];
    for (const site of sites) {
      const posts = await ctx.db
        .query("posts")
        .withIndex("by_site_and_status", (q) =>
          q.eq("siteId", site._id).eq("status", "published"),
        )
        .order("desc")
        .take(MAX_POSTS_PER_SITE);

      for (const post of posts) {
        result.push({
          siteKey: site.key,
          slug: post.slug,
          title: post.title,
          body: post.body,
          excerpt: post.excerpt,
          tags: post.tags ?? null,
          source: post.source,
          seo: post.seo,
          publishedAt: post.publishedAt,
          updatedAt: post.updatedAt ?? null,
        });
      }
    }

    return result;
  },
});

export const listBySite = query({
  args: {
    token: v.string(),
    siteId: v.id("sites"),
  },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.token);

    const posts = await ctx.db
      .query("posts")
      .withIndex("by_site_and_slug", (q) => q.eq("siteId", args.siteId))
      .take(MAX_POSTS_PER_SITE);

    return posts.sort((a, b) => b.publishedAt - a.publishedAt).map(toListItem);
  },
});

export const get = query({
  args: {
    token: v.string(),
    id: v.id("posts"),
  },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.token);
    const post = await ctx.db.get("posts", args.id);
    if (!post) {
      throw new Error("Post not found");
    }
    return post;
  },
});

export const create = mutation({
  args: {
    token: v.string(),
    siteId: v.id("sites"),
    title: v.string(),
    slug: v.string(),
    body: v.string(),
    excerpt: v.string(),
    tags: v.optional(v.array(v.string())),
    status: postStatusValidator,
    source: postSourceValidator,
    seo: seoValidator,
    generationRequestId: v.optional(v.id("generationRequests")),
  },
  returns: v.id("posts"),
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.token);
    await requireSite(ctx, args.siteId);

    const slug = normalizeSlug(args.slug);
    const existing = await findSlugOwner(ctx, args.siteId, slug);
    if (existing) {
      throw new Error(`Slug already in use on this site: ${slug}`);
    }

    const now = Date.now();
    const isPublished = args.status === "published";

    const postId = await ctx.db.insert("posts", {
      siteId: args.siteId,
      slug,
      title: args.title.trim(),
      body: args.body,
      excerpt: args.excerpt.trim(),
      tags: args.tags,
      status: args.status,
      source: args.source,
      seo: args.seo,
      generationRequestId: args.generationRequestId,
      publishedAt: now,
      updatedAt: now,
      deployStatus: isPublished ? "pending" : undefined,
      deployRequestedAt: isPublished ? now : undefined,
    });

    if (isPublished) {
      await scheduleDeploy(ctx, postId);
    }

    return postId;
  },
});

export const update = mutation({
  args: {
    token: v.string(),
    id: v.id("posts"),
    title: v.string(),
    slug: v.string(),
    body: v.string(),
    excerpt: v.string(),
    tags: v.optional(v.array(v.string())),
    seo: seoValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.token);

    const post = await ctx.db.get("posts", args.id);
    if (!post) {
      throw new Error("Post not found");
    }

    const slug = normalizeSlug(args.slug);
    const slugOwner = await findSlugOwner(ctx, post.siteId, slug);
    if (slugOwner && slugOwner._id !== args.id) {
      throw new Error(`Slug already in use on this site: ${slug}`);
    }

    const now = Date.now();
    // Published output changes whenever a published post's content is edited.
    const shouldTriggerDeploy =
      post.status === "published" &&
      (post.body !== args.body ||
        post.title !== args.title.trim() ||
        post.slug !== slug ||
        post.excerpt !== args.excerpt.trim() ||
        JSON.stringify(post.tags ?? []) !== JSON.stringify(args.tags ?? []) ||
        JSON.stringify(post.seo) !== JSON.stringify(args.seo));

    await ctx.db.patch("posts", args.id, {
      title: args.title.trim(),
      slug,
      body: args.body,
      excerpt: args.excerpt.trim(),
      tags: args.tags,
      seo: args.seo,
      updatedAt: now,
      ...(shouldTriggerDeploy
        ? {
            deployStatus: "pending" as const,
            deployRequestedAt: now,
            deployError: undefined,
          }
        : {}),
    });

    if (shouldTriggerDeploy) {
      await scheduleDeploy(ctx, args.id);
    }

    return null;
  },
});

export const publish = mutation({
  args: {
    token: v.string(),
    id: v.id("posts"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.token);

    const post = await ctx.db.get("posts", args.id);
    if (!post) {
      throw new Error("Post not found");
    }

    const now = Date.now();
    await ctx.db.patch("posts", args.id, {
      status: "published",
      publishedAt: now,
      updatedAt: now,
      deployStatus: "pending",
      deployRequestedAt: now,
      deployError: undefined,
    });

    await scheduleDeploy(ctx, args.id);

    return null;
  },
});

export const unpublish = mutation({
  args: {
    token: v.string(),
    id: v.id("posts"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.token);

    const post = await ctx.db.get("posts", args.id);
    if (!post) {
      throw new Error("Post not found");
    }

    const now = Date.now();
    await ctx.db.patch("posts", args.id, {
      status: "draft",
      updatedAt: now,
      deployStatus: "pending",
      deployRequestedAt: now,
      deployError: undefined,
    });

    await scheduleDeploy(ctx, args.id);

    return null;
  },
});

export const remove = mutation({
  args: {
    token: v.string(),
    id: v.id("posts"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.token);

    const post = await ctx.db.get("posts", args.id);
    if (!post) {
      throw new Error("Post not found");
    }

    const wasPublished = post.status === "published";
    await ctx.db.delete("posts", args.id);

    if (wasPublished) {
      // Removed page must disappear from the static build.
      await ctx.scheduler.runAfter(0, internal.deploy.triggerSiteDeploy, {});
    }

    return null;
  },
});
