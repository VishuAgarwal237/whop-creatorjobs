import "server-only";
import Whop from "@whop/sdk";

/**
 * Server-only Whop SDK client (Chunk 0 of the CreatorJobs build).
 *
 * Design notes (see the architecture doc):
 * - The Whop secret key must NEVER reach the browser. `import "server-only"`
 *   makes the build fail if this module is ever pulled into a client bundle.
 * - We pin the Beta API via the `Api-Version-Date` header so response shapes
 *   are stable ("later changes won't break a pinned caller").
 * - `baseURL` defaults to the sandbox. Point it at production by setting
 *   WHOP_BASE_URL. The SDK also reads WHOP_API_KEY / WHOP_WEBHOOK_SECRET from
 *   the environment by default; we pass them explicitly for clarity.
 */

export const WHOP_API_BASE =
  process.env.WHOP_BASE_URL ?? "https://sandbox-api.whop.com/api/v1";

/** Pin the API version. Override with WHOP_API_VERSION_DATE if needed. */
export const WHOP_API_VERSION_DATE =
  process.env.WHOP_API_VERSION_DATE ?? "2026-07-01";

/** Which Whop environment this process is talking to. */
export const WHOP_ENV: "sandbox" | "production" =
  WHOP_API_BASE.includes("sandbox") ? "sandbox" : "production";

/** CreatorJobs' own (parent) company. Connected sellers are created under it. */
export const WHOP_PLATFORM_COMPANY_ID = process.env.WHOP_PLATFORM_COMPANY_ID ?? "";

/** Public base URL, for building Whop return/refresh redirect links. */
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const whop = new Whop({
  apiKey: process.env.WHOP_API_KEY,
  // The Standard Webhooks verifier expects the base64 secret; the SDK reads
  // WHOP_WEBHOOK_SECRET by default and passes it straight through.
  webhookKey: process.env.WHOP_WEBHOOK_SECRET ?? null,
  baseURL: WHOP_API_BASE,
  defaultHeaders: { "Api-Version-Date": WHOP_API_VERSION_DATE },
});

export { Whop };
