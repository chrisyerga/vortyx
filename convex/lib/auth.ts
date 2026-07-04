import type { MutationCtx, QueryCtx } from "../_generated/server";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export function getAdminPassword(): string {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    throw new Error("ADMIN_PASSWORD is not configured in Convex environment");
  }
  return password;
}

export function createSessionExpiry(): number {
  return Date.now() + SESSION_TTL_MS;
}

async function getValidSession(ctx: MutationCtx | QueryCtx, token: string) {
  const session = await ctx.db
    .query("adminSessions")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();

  if (!session) {
    return null;
  }

  if (session.expiresAt < Date.now()) {
    return null;
  }

  return session;
}

export async function requireAdminSession(
  ctx: MutationCtx | QueryCtx,
  token: string,
): Promise<void> {
  const session = await getValidSession(ctx, token);

  if (!session) {
    throw new Error("Invalid or expired admin session");
  }
}
