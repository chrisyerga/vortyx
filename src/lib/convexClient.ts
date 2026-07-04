import { ConvexReactClient } from "convex/react";

const convexUrl = import.meta.env.PUBLIC_CONVEX_URL;

if (!convexUrl) {
  throw new Error("PUBLIC_CONVEX_URL is not set");
}

export const convexClient = new ConvexReactClient(convexUrl);
