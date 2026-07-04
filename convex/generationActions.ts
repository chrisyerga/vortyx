import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// Only fetch() is used here, so these run in the default Convex runtime.

const POLL_MIN_INTERVAL_MS = 90 * 1000;
const PENDING_TIMEOUT_MS = 10 * 60 * 1000;

function getForgeConfig(): { apiKey: string; apiUrl: string; webhookSecret: string } {
  const apiKey = process.env.FORGE_API_KEY;
  const apiUrl = process.env.FORGE_API_URL ?? "https://forge.lindale.tech";
  const webhookSecret = process.env.FORGE_WEBHOOK_SECRET;

  if (!apiKey) {
    throw new Error("FORGE_API_KEY is not configured in Convex environment");
  }
  if (!webhookSecret) {
    throw new Error("FORGE_WEBHOOK_SECRET is not configured in Convex environment");
  }
  return { apiKey, apiUrl, webhookSecret };
}

type ForgeTaskResponse = {
  taskId: string;
  status:
    | "queued"
    | "running"
    | "needs_input"
    | "complete"
    | "failed"
    | "canceled";
  currentStage?: string | null;
  iteration?: number;
  pendingInput?: Array<{ key: string; question: string; why?: string }> | null;
  errorMessage?: string | null;
  deliverable?: unknown;
};

function sanitizePendingInput(
  pendingInput: ForgeTaskResponse["pendingInput"],
): Array<{ key: string; question: string }> | undefined {
  if (!pendingInput || pendingInput.length === 0) return undefined;
  return pendingInput.map((item) => ({
    key: item.key,
    question: item.question,
  }));
}

export const submitToForge = internalAction({
  args: {
    requestId: v.id("generationRequests"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const loaded = await ctx.runQuery(internal.generation.getRequestWithSite, {
      requestId: args.requestId,
    });
    if (!loaded || !loaded.site) {
      return null;
    }
    const { request, site } = loaded;

    // Local-dev escape hatch (mirrors forge's own FORGE_SEARCH_PROVIDER=fake):
    // skip the real forge call and mark the task submitted with a fake id, so
    // the admin flow can be exercised end-to-end via simulated webhooks.
    if (process.env.FORGE_FAKE_SUBMIT === "true") {
      await ctx.runMutation(internal.generation.markSubmitted, {
        requestId: args.requestId,
        forgeTaskId: `task_fake_${args.requestId}`,
      });
      return null;
    }

    try {
      const { apiKey, apiUrl, webhookSecret } = getForgeConfig();

      const projectId = site.forgeProjectId ?? process.env.FORGE_PROJECT_ID;
      if (!projectId) {
        throw new Error(
          `Site "${site.key}" has no forge project id and FORGE_PROJECT_ID is not set. ` +
            "Create a project in forge.lindale.tech and set it on the site.",
        );
      }

      const convexSiteUrl = process.env.CONVEX_SITE_URL;
      if (!convexSiteUrl) {
        throw new Error("CONVEX_SITE_URL is unavailable");
      }
      const callbackUrl =
        `${convexSiteUrl}/forge/callback` +
        `?secret=${encodeURIComponent(webhookSecret)}` +
        `&requestId=${encodeURIComponent(args.requestId)}`;

      const response = await fetch(`${apiUrl}/v1/tasks`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId,
          recipe: request.recipe,
          brief: request.brief,
          callbackUrl,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`forge POST /v1/tasks failed (${response.status}): ${errorText}`);
      }

      const body = (await response.json()) as { taskId: string };
      if (!body.taskId) {
        throw new Error("forge POST /v1/tasks returned no taskId");
      }

      await ctx.runMutation(internal.generation.markSubmitted, {
        requestId: args.requestId,
        forgeTaskId: body.taskId,
      });
    } catch (error) {
      await ctx.runMutation(internal.generation.markSubmitFailed, {
        requestId: args.requestId,
        errorMessage:
          error instanceof Error ? error.message : "Unknown submit error",
      });
    }

    return null;
  },
});

// Cron-driven polling — the source of truth for task status. The forge
// webhook (convex/http.ts) is a fire-and-forget accelerator that can be lost.
export const pollActiveTasks = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const active = await ctx.runQuery(internal.generation.listActiveForPolling, {});
    if (active.length === 0) {
      return null;
    }

    const { apiKey, apiUrl } = getForgeConfig();
    const now = Date.now();

    for (const request of active) {
      // A request stuck in "pending" never made it to forge (submit action
      // died before recording an outcome) — fail it out after a timeout.
      if (!request.forgeTaskId) {
        if (
          request.status === "pending" &&
          now - request.createdAt > PENDING_TIMEOUT_MS
        ) {
          await ctx.runMutation(internal.generation.markSubmitFailed, {
            requestId: request._id,
            errorMessage: "Submission to forge never completed (timed out)",
          });
        }
        continue;
      }

      if (request.lastPolledAt && now - request.lastPolledAt < POLL_MIN_INTERVAL_MS) {
        continue;
      }

      try {
        const response = await fetch(`${apiUrl}/v1/tasks/${request.forgeTaskId}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });

        if (!response.ok) {
          console.warn(
            `poll: GET /v1/tasks/${request.forgeTaskId} → ${response.status}`,
          );
          await ctx.runMutation(internal.generation.markPolled, {
            requestId: request._id,
          });
          continue;
        }

        const task = (await response.json()) as ForgeTaskResponse;

        await ctx.runMutation(internal.generation.applyStatus, {
          requestId: request._id,
          forgeTaskId: task.taskId,
          status: task.status,
          currentStage: task.currentStage ?? undefined,
          iteration: task.iteration,
          pendingInput: sanitizePendingInput(task.pendingInput),
          deliverable: task.deliverable,
          errorMessage: task.errorMessage ?? undefined,
          markPolled: true,
        });
      } catch (error) {
        console.warn(
          `poll: failed for ${request.forgeTaskId}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    return null;
  },
});

export const sendTaskInput = internalAction({
  args: {
    requestId: v.id("generationRequests"),
    answers: v.record(v.string(), v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const loaded = await ctx.runQuery(internal.generation.getRequestWithSite, {
      requestId: args.requestId,
    });
    if (!loaded?.request.forgeTaskId) {
      return null;
    }

    try {
      const { apiKey, apiUrl } = getForgeConfig();
      const response = await fetch(
        `${apiUrl}/v1/tasks/${loaded.request.forgeTaskId}/input`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ answers: args.answers }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `forge POST /v1/tasks/:id/input failed (${response.status}): ${errorText}`,
        );
      }

      // Task resumed on the forge side; reflect that locally right away.
      await ctx.runMutation(internal.generation.applyStatus, {
        requestId: args.requestId,
        forgeTaskId: loaded.request.forgeTaskId,
        status: "queued",
        pendingInput: undefined,
      });
    } catch (error) {
      console.warn(
        `sendTaskInput failed: ${error instanceof Error ? error.message : error}`,
      );
    }

    return null;
  },
});
