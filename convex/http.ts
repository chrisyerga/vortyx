import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

// Forge terminal-status webhook (configured as callbackUrl on POST /v1/tasks).
// Forge sends no auth header, so authentication is a shared secret embedded in
// the callback URL, plus a requestId/forgeTaskId cross-check in applyStatus.
// Delivery is fire-and-forget on forge's side — the polling cron remains the
// source of truth; this just makes completion show up faster.
http.route({
  path: "/forge/callback",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const url = new URL(req.url);

    const secret = process.env.FORGE_WEBHOOK_SECRET;
    if (!secret || url.searchParams.get("secret") !== secret) {
      return new Response("forbidden", { status: 403 });
    }

    let body: {
      taskId?: string;
      status?: string;
      errorMessage?: string | null;
      deliverable?: unknown;
    };
    try {
      body = await req.json();
    } catch {
      return new Response("bad request", { status: 400 });
    }

    const validStatuses = new Set([
      "queued",
      "running",
      "needs_input",
      "complete",
      "failed",
      "canceled",
    ]);
    if (!body.taskId || !body.status || !validStatuses.has(body.status)) {
      return new Response("bad request", { status: 400 });
    }

    await ctx.runMutation(internal.generation.applyStatus, {
      requestId: url.searchParams.get("requestId") ?? undefined,
      forgeTaskId: body.taskId,
      status: body.status as
        | "queued"
        | "running"
        | "needs_input"
        | "complete"
        | "failed"
        | "canceled",
      errorMessage: body.errorMessage ?? undefined,
      deliverable: body.deliverable,
    });

    return new Response("ok", { status: 200 });
  }),
});

export default http;
