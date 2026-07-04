import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

function getGithubConfig(): { token: string; repo: string } {
  const token = process.env.GITHUB_DEPLOY_TOKEN;
  const repo = process.env.GITHUB_REPO;

  if (!token) {
    throw new Error("GITHUB_DEPLOY_TOKEN is not configured in Convex environment");
  }
  if (!repo) {
    throw new Error("GITHUB_REPO is not configured in Convex environment");
  }

  return { token, repo };
}

export const triggerSiteDeploy = internalAction({
  args: {
    postId: v.optional(v.id("posts")),
    siteId: v.optional(v.id("sites")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      const { token, repo } = getGithubConfig();
      const response = await fetch(
        `https://api.github.com/repos/${repo}/dispatches`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            event_type: "content-publish",
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `GitHub repository_dispatch failed (${response.status}): ${errorText}`,
        );
      }

      await ctx.runMutation(internal.deployStatus.markDeployResult, {
        postId: args.postId,
        siteId: args.siteId,
        deployStatus: "triggered",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown deploy trigger error";

      await ctx.runMutation(internal.deployStatus.markDeployResult, {
        postId: args.postId,
        siteId: args.siteId,
        deployStatus: "failed",
        deployError: message,
      });
    }

    return null;
  },
});
