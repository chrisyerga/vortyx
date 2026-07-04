import { internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAdminSession } from "./lib/auth";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";

export const ROOT_DOMAIN = "vortyx.dev";

const SITE_KEY_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const RESERVED_KEYS = new Set(["www", "admin", "api", "mail", "forge", "sites"]);
const MAX_SITES = 200;

const themeValidator = v.object({
  accentColor: v.string(),
  accentColorDark: v.optional(v.string()),
  heroEmoji: v.optional(v.string()),
});

const seoValidator = v.object({
  metaDescription: v.string(),
  ogImageUrl: v.optional(v.string()),
});

const statusValidator = v.union(v.literal("enabled"), v.literal("disabled"));

const enabledSiteValidator = v.object({
  _id: v.id("sites"),
  key: v.string(),
  name: v.string(),
  topic: v.string(),
  description: v.string(),
  theme: themeValidator,
  seo: seoValidator,
});

function validateKey(key: string): string {
  const normalized = key.trim().toLowerCase();
  if (!SITE_KEY_PATTERN.test(normalized)) {
    throw new Error(
      "Site key must be lowercase letters, digits, and hyphens (not leading)",
    );
  }
  if (RESERVED_KEYS.has(normalized)) {
    throw new Error(`Site key "${normalized}" is reserved`);
  }
  return normalized;
}

function toEnabledSite(site: Doc<"sites">) {
  return {
    _id: site._id,
    key: site.key,
    name: site.name,
    topic: site.topic,
    description: site.description,
    theme: site.theme,
    seo: site.seo,
  };
}

// Used by the deploy pipeline (scripts/list-domains.mjs) — canonical domain first.
export const listDomains = query({
  args: {},
  returns: v.array(v.string()),
  handler: async (ctx) => {
    const enabled = await ctx.db
      .query("sites")
      .withIndex("by_status", (q) => q.eq("status", "enabled"))
      .take(MAX_SITES);

    return [
      ROOT_DOMAIN,
      ...enabled.map((site) => `${site.key}.${ROOT_DOMAIN}`),
    ];
  },
});

// Build-time site registry for Astro getStaticPaths and layouts.
export const listEnabled = query({
  args: {},
  returns: v.array(enabledSiteValidator),
  handler: async (ctx) => {
    const enabled = await ctx.db
      .query("sites")
      .withIndex("by_status", (q) => q.eq("status", "enabled"))
      .take(MAX_SITES);

    return enabled
      .sort((a, b) => a.key.localeCompare(b.key))
      .map(toEnabledSite);
  },
});

export const listAll = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.token);
    const sites = await ctx.db.query("sites").take(MAX_SITES);
    return sites.sort((a, b) => a.key.localeCompare(b.key));
  },
});

export const getForGeneration = internalQuery({
  args: { siteId: v.id("sites") },
  handler: async (ctx, args) => {
    return await ctx.db.get("sites", args.siteId);
  },
});

export const create = mutation({
  args: {
    token: v.string(),
    key: v.string(),
    name: v.string(),
    topic: v.string(),
    description: v.string(),
    theme: themeValidator,
    forgeProjectId: v.optional(v.string()),
    seo: seoValidator,
  },
  returns: v.id("sites"),
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.token);

    const key = validateKey(args.key);
    const existing = await ctx.db
      .query("sites")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (existing) {
      throw new Error(`Site key already in use: ${key}`);
    }

    const now = Date.now();
    const siteId = await ctx.db.insert("sites", {
      key,
      name: args.name.trim(),
      topic: args.topic.trim(),
      description: args.description.trim(),
      status: "enabled",
      theme: args.theme,
      forgeProjectId: args.forgeProjectId?.trim() || undefined,
      seo: args.seo,
      createdAt: now,
      updatedAt: now,
      deployStatus: "pending",
    });

    // A new site's subdomain must be registered with PORCH (routing + DNS + TLS).
    await ctx.scheduler.runAfter(0, internal.deploy.triggerSiteDeploy, {
      siteId,
    });

    return siteId;
  },
});

export const update = mutation({
  args: {
    token: v.string(),
    id: v.id("sites"),
    name: v.string(),
    topic: v.string(),
    description: v.string(),
    theme: themeValidator,
    forgeProjectId: v.optional(v.string()),
    seo: seoValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.token);

    const site = await ctx.db.get("sites", args.id);
    if (!site) {
      throw new Error("Site not found");
    }

    const contentChanged =
      site.name !== args.name.trim() ||
      site.topic !== args.topic.trim() ||
      site.description !== args.description.trim() ||
      JSON.stringify(site.theme) !== JSON.stringify(args.theme) ||
      JSON.stringify(site.seo) !== JSON.stringify(args.seo);

    await ctx.db.patch("sites", args.id, {
      name: args.name.trim(),
      topic: args.topic.trim(),
      description: args.description.trim(),
      theme: args.theme,
      forgeProjectId: args.forgeProjectId?.trim() || undefined,
      seo: args.seo,
      updatedAt: Date.now(),
      ...(contentChanged && site.status === "enabled"
        ? { deployStatus: "pending" as const, deployError: undefined }
        : {}),
    });

    if (contentChanged && site.status === "enabled") {
      await ctx.scheduler.runAfter(0, internal.deploy.triggerSiteDeploy, {
        siteId: args.id,
      });
    }

    return null;
  },
});

export const setStatus = mutation({
  args: {
    token: v.string(),
    id: v.id("sites"),
    status: statusValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.token);

    const site = await ctx.db.get("sites", args.id);
    if (!site) {
      throw new Error("Site not found");
    }

    if (site.status === args.status) {
      return null;
    }

    await ctx.db.patch("sites", args.id, {
      status: args.status,
      updatedAt: Date.now(),
      deployStatus: "pending",
      deployError: undefined,
    });

    // Enabling/disabling changes the routed domain list and the built pages.
    await ctx.scheduler.runAfter(0, internal.deploy.triggerSiteDeploy, {
      siteId: args.id,
    });

    return null;
  },
});

export const remove = mutation({
  args: {
    token: v.string(),
    id: v.id("sites"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.token);

    const site = await ctx.db.get("sites", args.id);
    if (!site) {
      throw new Error("Site not found");
    }

    const anyPost = await ctx.db
      .query("posts")
      .withIndex("by_site_and_slug", (q) => q.eq("siteId", args.id))
      .first();
    if (anyPost) {
      throw new Error(
        "Site still has posts. Delete or move its posts before removing the site.",
      );
    }

    await ctx.db.delete("sites", args.id);

    await ctx.scheduler.runAfter(0, internal.deploy.triggerSiteDeploy, {});

    return null;
  },
});
