import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const deployStatusValidator = v.union(
  v.literal("pending"),
  v.literal("triggered"),
  v.literal("failed"),
);

export default defineSchema({
  adminSessions: defineTable({
    token: v.string(),
    expiresAt: v.number(),
  }).index("by_token", ["token"]),

  sites: defineTable({
    key: v.string(), // subdomain: ^[a-z0-9][a-z0-9-]*$; reserved keys rejected in sites.create
    name: v.string(),
    topic: v.string(),
    description: v.string(),
    status: v.union(v.literal("enabled"), v.literal("disabled")),
    theme: v.object({
      accentColor: v.string(),
      accentColorDark: v.optional(v.string()),
      heroEmoji: v.optional(v.string()),
    }),
    forgeProjectId: v.optional(v.string()), // falls back to FORGE_PROJECT_ID env
    seo: v.object({
      metaDescription: v.string(),
      ogImageUrl: v.optional(v.string()),
    }),
    createdAt: v.number(),
    updatedAt: v.number(),
    deployStatus: v.optional(deployStatusValidator),
    deployError: v.optional(v.string()),
  })
    .index("by_key", ["key"])
    .index("by_status", ["status"]),

  posts: defineTable({
    siteId: v.id("sites"),
    slug: v.string(),
    title: v.string(),
    body: v.string(), // markdown
    excerpt: v.string(),
    tags: v.optional(v.array(v.string())),
    status: v.union(v.literal("draft"), v.literal("published")),
    source: v.union(v.literal("ai"), v.literal("manual")),
    seo: v.object({
      metaDescription: v.string(),
      ogTitle: v.optional(v.string()),
      ogDescription: v.optional(v.string()),
      ogImageUrl: v.optional(v.string()),
    }),
    generationRequestId: v.optional(v.id("generationRequests")),
    publishedAt: v.number(),
    updatedAt: v.optional(v.number()),
    deployRequestedAt: v.optional(v.number()),
    deployStatus: v.optional(deployStatusValidator),
    deployError: v.optional(v.string()),
  })
    .index("by_site_and_slug", ["siteId", "slug"])
    .index("by_site_and_status", ["siteId", "status", "publishedAt"])
    .index("by_status", ["status"]),

  generationRequests: defineTable({
    siteId: v.id("sites"),
    recipe: v.literal("seo_article"),
    brief: v.object({
      keywords: v.array(v.string()),
      objective: v.optional(v.string()),
      audience: v.optional(v.string()),
      voice: v.optional(v.string()),
      notes: v.optional(v.string()),
    }),
    forgeTaskId: v.optional(v.string()),
    status: v.union(
      v.literal("pending"), // created locally, not yet submitted to forge
      v.literal("queued"),
      v.literal("running"),
      v.literal("needs_input"),
      v.literal("complete"),
      v.literal("failed"),
      v.literal("canceled"),
    ),
    isActive: v.boolean(), // true while pending/queued/running/needs_input — drives polling
    currentStage: v.optional(v.string()),
    iteration: v.optional(v.number()),
    pendingInput: v.optional(
      v.array(
        v.object({
          key: v.string(),
          question: v.string(),
        }),
      ),
    ),
    deliverable: v.optional(
      v.object({
        title: v.string(),
        slug: v.string(),
        metaDescription: v.string(),
        openGraph: v.optional(v.any()),
        bodyMarkdown: v.string(),
        tags: v.array(v.string()),
        excerpt: v.string(),
      }),
    ),
    errorMessage: v.optional(v.string()),
    postId: v.optional(v.id("posts")),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastPolledAt: v.optional(v.number()),
  })
    .index("by_forge_task", ["forgeTaskId"])
    .index("by_site", ["siteId"])
    .index("by_active", ["isActive"]),

  // ---- v2: background keyword research (schema only; crons not yet implemented) ----
  researchTopics: defineTable({
    siteId: v.id("sites"),
    topic: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("archived"),
    ),
    priority: v.number(),
    notes: v.optional(v.string()),
    lastResearchedAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_site_and_status", ["siteId", "status"]),

  keywordSuggestions: defineTable({
    siteId: v.id("sites"),
    researchTopicId: v.optional(v.id("researchTopics")),
    keyword: v.string(),
    searchIntent: v.optional(v.string()),
    score: v.optional(v.number()),
    status: v.union(
      v.literal("suggested"),
      v.literal("approved"),
      v.literal("used"),
      v.literal("rejected"),
    ),
    source: v.string(), // e.g. "cron:serp", "manual"
    generationRequestId: v.optional(v.id("generationRequests")),
    createdAt: v.number(),
  })
    .index("by_site_and_status", ["siteId", "status"])
    .index("by_research_topic", ["researchTopicId"]),
});
