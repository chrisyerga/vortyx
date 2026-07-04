import { mutation } from "./_generated/server";
import { v } from "convex/values";
import {
  createSessionExpiry,
  getAdminPassword,
  requireAdminSession,
} from "./lib/auth";

export const login = mutation({
  args: {
    password: v.string(),
  },
  returns: v.object({
    token: v.string(),
    expiresAt: v.number(),
  }),
  handler: async (ctx, args) => {
    if (args.password !== getAdminPassword()) {
      throw new Error("Invalid password");
    }

    const token = crypto.randomUUID();
    const expiresAt = createSessionExpiry();

    await ctx.db.insert("adminSessions", { token, expiresAt });

    return { token, expiresAt };
  },
});

export const logout = mutation({
  args: {
    token: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("adminSessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();

    if (session) {
      await ctx.db.delete("adminSessions", session._id);
    }

    return null;
  },
});

export const validateSession = mutation({
  args: {
    token: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    try {
      await requireAdminSession(ctx, args.token);
      return true;
    } catch {
      return false;
    }
  },
});
