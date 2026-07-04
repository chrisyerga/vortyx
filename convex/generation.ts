import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { v } from "convex/values";
import { requireAdminSession } from "./lib/auth";
import { normalizeSlug } from "./lib/slug";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";

const briefValidator = v.object({
  keywords: v.array(v.string()),
  objective: v.optional(v.string()),
  audience: v.optional(v.string()),
  voice: v.optional(v.string()),
  notes: v.optional(v.string()),
});

const requestStatusValidator = v.union(
  v.literal("pending"),
  v.literal("queued"),
  v.literal("running"),
  v.literal("needs_input"),
  v.literal("complete"),
  v.literal("failed"),
  v.literal("canceled"),
);

const TERMINAL_STATUSES = new Set(["complete", "failed", "canceled"]);

function isActiveStatus(status: string): boolean {
  return !TERMINAL_STATUSES.has(status);
}

// Reactive admin list — no bodyMarkdown, to keep Convex reads small.
function toListItem(request: Doc<"generationRequests">) {
  return {
    _id: request._id,
    siteId: request.siteId,
    recipe: request.recipe,
    keywords: request.brief.keywords,
    status: request.status,
    currentStage: request.currentStage ?? null,
    iteration: request.iteration ?? null,
    pendingInput: request.pendingInput ?? null,
    errorMessage: request.errorMessage ?? null,
    hasDeliverable: request.deliverable !== undefined,
    deliverableTitle: request.deliverable?.title ?? null,
    postId: request.postId ?? null,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  };
}

export const createRequest = mutation({
  args: {
    token: v.string(),
    siteId: v.id("sites"),
    brief: briefValidator,
  },
  returns: v.id("generationRequests"),
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.token);

    const site = await ctx.db.get("sites", args.siteId);
    if (!site) {
      throw new Error("Site not found");
    }

    const keywords = args.brief.keywords.map((k) => k.trim()).filter(Boolean);
    if (keywords.length === 0) {
      throw new Error("At least one keyword is required");
    }

    const now = Date.now();
    const requestId = await ctx.db.insert("generationRequests", {
      siteId: args.siteId,
      recipe: "seo_article",
      brief: { ...args.brief, keywords },
      status: "pending",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.generationActions.submitToForge, {
      requestId,
    });

    return requestId;
  },
});

export const listRequests = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.token);

    const requests = await ctx.db
      .query("generationRequests")
      .order("desc")
      .take(100);

    return requests.map(toListItem);
  },
});

// One-shot fetch for the review modal — includes the full deliverable.
export const getRequest = query({
  args: {
    token: v.string(),
    id: v.id("generationRequests"),
  },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.token);
    const request = await ctx.db.get("generationRequests", args.id);
    if (!request) {
      throw new Error("Generation request not found");
    }
    return request;
  },
});

export const provideInput = mutation({
  args: {
    token: v.string(),
    id: v.id("generationRequests"),
    answers: v.record(v.string(), v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.token);

    const request = await ctx.db.get("generationRequests", args.id);
    if (!request) {
      throw new Error("Generation request not found");
    }
    if (request.status !== "needs_input") {
      throw new Error("Request is not waiting for input");
    }

    await ctx.scheduler.runAfter(0, internal.generationActions.sendTaskInput, {
      requestId: args.id,
      answers: args.answers,
    });

    return null;
  },
});

export const acceptDeliverable = mutation({
  args: {
    token: v.string(),
    id: v.id("generationRequests"),
  },
  returns: v.id("posts"),
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.token);

    const request = await ctx.db.get("generationRequests", args.id);
    if (!request) {
      throw new Error("Generation request not found");
    }
    if (request.status !== "complete" || !request.deliverable) {
      throw new Error("Request has no completed deliverable to accept");
    }
    if (request.postId) {
      throw new Error("Deliverable was already accepted as a draft");
    }

    const deliverable = request.deliverable;

    // Per-site slug uniqueness with auto-suffix on collision.
    let slug = normalizeSlug(deliverable.slug || deliverable.title);
    for (let attempt = 2; attempt <= 20; attempt++) {
      const owner = await ctx.db
        .query("posts")
        .withIndex("by_site_and_slug", (q) =>
          q.eq("siteId", request.siteId).eq("slug", slug),
        )
        .unique();
      if (!owner) break;
      slug = `${normalizeSlug(deliverable.slug || deliverable.title)}-${attempt}`;
    }

    const og =
      deliverable.openGraph && typeof deliverable.openGraph === "object"
        ? (deliverable.openGraph as Record<string, unknown>)
        : {};

    const now = Date.now();
    const postId = await ctx.db.insert("posts", {
      siteId: request.siteId,
      slug,
      title: deliverable.title,
      body: deliverable.bodyMarkdown,
      excerpt: deliverable.excerpt,
      tags: deliverable.tags.length > 0 ? deliverable.tags : undefined,
      status: "draft",
      source: "ai",
      seo: {
        metaDescription: deliverable.metaDescription,
        ogTitle: typeof og.title === "string" ? og.title : undefined,
        ogDescription:
          typeof og.description === "string" ? og.description : undefined,
      },
      generationRequestId: args.id,
      publishedAt: now,
      updatedAt: now,
    });

    await ctx.db.patch("generationRequests", args.id, {
      postId,
      updatedAt: now,
    });

    return postId;
  },
});

export const removeRequest = mutation({
  args: {
    token: v.string(),
    id: v.id("generationRequests"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.token);

    const request = await ctx.db.get("generationRequests", args.id);
    if (!request) {
      return null;
    }
    if (request.isActive) {
      throw new Error("Cannot delete a request that is still running");
    }

    await ctx.db.delete("generationRequests", args.id);
    return null;
  },
});

// ---- Internal plumbing used by actions and the webhook ----

export const getRequestWithSite = internalQuery({
  args: { requestId: v.id("generationRequests") },
  handler: async (ctx, args) => {
    const request = await ctx.db.get("generationRequests", args.requestId);
    if (!request) return null;
    const site = await ctx.db.get("sites", request.siteId);
    return { request, site };
  },
});

export const listActiveForPolling = internalQuery({
  args: {},
  handler: async (ctx) => {
    const active = await ctx.db
      .query("generationRequests")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .take(50);

    return active.map((request) => ({
      _id: request._id,
      status: request.status,
      forgeTaskId: request.forgeTaskId ?? null,
      createdAt: request.createdAt,
      lastPolledAt: request.lastPolledAt ?? null,
    }));
  },
});

export const markSubmitted = internalMutation({
  args: {
    requestId: v.id("generationRequests"),
    forgeTaskId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const request = await ctx.db.get("generationRequests", args.requestId);
    if (!request || TERMINAL_STATUSES.has(request.status)) return null;

    await ctx.db.patch("generationRequests", args.requestId, {
      forgeTaskId: args.forgeTaskId,
      status: "queued",
      isActive: true,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const markSubmitFailed = internalMutation({
  args: {
    requestId: v.id("generationRequests"),
    errorMessage: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const request = await ctx.db.get("generationRequests", args.requestId);
    if (!request || TERMINAL_STATUSES.has(request.status)) return null;

    await ctx.db.patch("generationRequests", args.requestId, {
      status: "failed",
      isActive: false,
      errorMessage: args.errorMessage,
      updatedAt: Date.now(),
    });
    return null;
  },
});

// Applies a status snapshot from forge (webhook or poll). The webhook is only
// an accelerator — polling is the source of truth — so this must tolerate
// duplicate, out-of-order, and cross-channel updates: terminal statuses never
// regress, and rows are located by requestId + forgeTaskId cross-check.
export const applyStatus = internalMutation({
  args: {
    requestId: v.optional(v.string()), // may come from a URL — normalized here
    forgeTaskId: v.optional(v.string()),
    status: requestStatusValidator,
    currentStage: v.optional(v.string()),
    iteration: v.optional(v.number()),
    pendingInput: v.optional(
      v.array(v.object({ key: v.string(), question: v.string() })),
    ),
    deliverable: v.optional(v.any()),
    errorMessage: v.optional(v.string()),
    markPolled: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    let request: Doc<"generationRequests"> | null = null;

    if (args.requestId) {
      const id = ctx.db.normalizeId("generationRequests", args.requestId);
      if (id) {
        request = await ctx.db.get("generationRequests", id);
      }
    }
    if (!request && args.forgeTaskId) {
      request = await ctx.db
        .query("generationRequests")
        .withIndex("by_forge_task", (q) => q.eq("forgeTaskId", args.forgeTaskId))
        .unique();
    }
    if (!request) {
      console.warn("applyStatus: no matching generation request", args);
      return null;
    }

    // Cross-check when both identifiers are present (webhook path).
    if (
      args.forgeTaskId &&
      request.forgeTaskId &&
      request.forgeTaskId !== args.forgeTaskId
    ) {
      console.warn("applyStatus: forgeTaskId mismatch — ignoring update");
      return null;
    }

    if (TERMINAL_STATUSES.has(request.status)) {
      return null;
    }

    // Sanitize the deliverable coming off the wire into our stored shape.
    let deliverable: Doc<"generationRequests">["deliverable"];
    const raw = args.deliverable;
    if (raw && typeof raw === "object") {
      deliverable = {
        title: String(raw.title ?? ""),
        slug: String(raw.slug ?? ""),
        metaDescription: String(raw.metaDescription ?? ""),
        openGraph: raw.openGraph,
        bodyMarkdown: String(raw.bodyMarkdown ?? ""),
        tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
        excerpt: String(raw.excerpt ?? ""),
      };
      if (!deliverable.title || !deliverable.bodyMarkdown) {
        deliverable = undefined; // malformed — keep whatever we had
      }
    }

    await ctx.db.patch("generationRequests", request._id, {
      status: args.status,
      isActive: isActiveStatus(args.status),
      currentStage: args.currentStage,
      iteration: args.iteration,
      pendingInput: args.pendingInput,
      errorMessage: args.errorMessage,
      ...(deliverable ? { deliverable } : {}),
      ...(args.markPolled ? { lastPolledAt: Date.now() } : {}),
      updatedAt: Date.now(),
    });

    return null;
  },
});

export const markPolled = internalMutation({
  args: { requestId: v.id("generationRequests") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const request = await ctx.db.get("generationRequests", args.requestId);
    if (request) {
      await ctx.db.patch("generationRequests", args.requestId, {
        lastPolledAt: Date.now(),
      });
    }
    return null;
  },
});
