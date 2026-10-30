import type { Request } from "express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { getClerkProxyHost } from "../middlewares/clerkProxyMiddleware.js";

export type ClerkEnvironment = "development" | "production";

/**
 * Replit-managed Clerk uses separate development and production instances.
 * The public-key prefix identifies which identity namespace this server serves.
 * Unknown or missing keys fail closed instead of mixing identities.
 */
export function resolveClerkEnvironment(
  publishableKey: string | undefined = process.env.CLERK_PUBLISHABLE_KEY,
): ClerkEnvironment | null {
  if (publishableKey?.startsWith("pk_test_")) return "development";
  if (publishableKey?.startsWith("pk_live_")) return "production";
  return null;
}

export function resolveClerkEnvironmentForRequest(
  request: Request,
): ClerkEnvironment | null {
  const fallbackKey = process.env.CLERK_PUBLISHABLE_KEY;
  if (!fallbackKey?.startsWith("pk_test_") && !fallbackKey?.startsWith("pk_live_")) {
    return null;
  }
  const host = getClerkProxyHost(request);
  if (!host) return null;
  try {
    return resolveClerkEnvironment(publishableKeyFromHost(host, fallbackKey));
  } catch {
    return null;
  }
}
