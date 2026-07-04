import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

// Local-dev seed: `npm run seed` (convex run init:seed).
// Idempotent — skips if any site already exists.
export const seed = internalMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const existing = await ctx.db.query("sites").first();
    if (existing) {
      return "Seed skipped: sites already exist";
    }

    const now = Date.now();

    const petsId = await ctx.db.insert("sites", {
      key: "pets",
      name: "Vortyx Pets",
      topic: "pets",
      description:
        "Practical guides and answers for pet owners — dogs, cats, and everything in between.",
      status: "enabled",
      theme: { accentColor: "#0d9488", heroEmoji: "🐾" },
      seo: {
        metaDescription:
          "Practical guides and answers for pet owners — dogs, cats, and everything in between.",
      },
      createdAt: now,
      updatedAt: now,
    });

    const techId = await ctx.db.insert("sites", {
      key: "tech",
      name: "Vortyx Tech",
      topic: "technology",
      description:
        "Clear explanations of what's new in technology, without the hype.",
      status: "enabled",
      theme: { accentColor: "#2563eb", heroEmoji: "💻" },
      seo: {
        metaDescription:
          "Clear explanations of what's new in technology, without the hype.",
      },
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("posts", {
      siteId: petsId,
      slug: "welcome-to-vortyx-pets",
      title: "Welcome to Vortyx Pets",
      body: [
        "## Hello, pet people",
        "",
        "This is the first post on **Vortyx Pets**. Expect practical, research-backed",
        "guides on caring for your dogs, cats, and other companions.",
        "",
        "- Feeding and nutrition",
        "- Behavior and training",
        "- Health basics (when to see a vet)",
      ].join("\n"),
      excerpt: "The first post on Vortyx Pets and what to expect here.",
      tags: ["announcements"],
      status: "published",
      source: "manual",
      seo: {
        metaDescription: "The first post on Vortyx Pets and what to expect here.",
      },
      publishedAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("posts", {
      siteId: petsId,
      slug: "draft-example",
      title: "Draft example (not published)",
      body: "This draft should never appear on the public site.",
      excerpt: "A draft post for testing the admin panel.",
      status: "draft",
      source: "manual",
      seo: { metaDescription: "Draft post." },
      publishedAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("posts", {
      siteId: techId,
      slug: "welcome-to-vortyx-tech",
      title: "Welcome to Vortyx Tech",
      body: [
        "## What this site is",
        "",
        "**Vortyx Tech** covers technology news and concepts in plain language.",
        "",
        "First up: how static site generation and edge routing let one small VPS",
        "serve a whole network of sites.",
      ].join("\n"),
      excerpt: "Introducing Vortyx Tech: technology explained in plain language.",
      tags: ["announcements"],
      status: "published",
      source: "manual",
      seo: {
        metaDescription:
          "Introducing Vortyx Tech: technology explained in plain language.",
      },
      publishedAt: now,
      updatedAt: now,
    });

    return "Seeded 2 sites and 3 posts";
  },
});
