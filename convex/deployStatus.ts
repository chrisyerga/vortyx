import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

const deployStatusValidator = v.union(
  v.literal("pending"),
  v.literal("triggered"),
  v.literal("failed"),
);

export const markDeployResult = internalMutation({
  args: {
    postId: v.optional(v.id("posts")),
    siteId: v.optional(v.id("sites")),
    deployStatus: deployStatusValidator,
    deployError: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.postId) {
      const post = await ctx.db.get("posts", args.postId);
      if (post) {
        await ctx.db.patch("posts", args.postId, {
          deployStatus: args.deployStatus,
          deployError: args.deployError,
        });
      }
    }

    if (args.siteId) {
      const site = await ctx.db.get("sites", args.siteId);
      if (site) {
        await ctx.db.patch("sites", args.siteId, {
          deployStatus: args.deployStatus,
          deployError: args.deployError,
        });
      }
    }

    return null;
  },
});
