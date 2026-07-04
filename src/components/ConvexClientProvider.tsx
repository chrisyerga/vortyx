import type { ReactNode } from "react";
import { ConvexProvider } from "convex/react";
import { convexClient } from "../lib/convexClient";

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return <ConvexProvider client={convexClient}>{children}</ConvexProvider>;
}

export { convexClient as convex };
