import { NextResponse } from "next/server";
import { whop, Whop, WHOP_API_BASE, WHOP_ENV, WHOP_API_VERSION_DATE } from "@/lib/whop";

// Always run on the server, never cached — this hits the live Whop API.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health — Chunk 0 sandbox smoke test.
 *
 * Calls `accounts.me()` to prove the API key + base URL + version pin are wired
 * correctly. It also doubles as the Scenario 3 ("401 on connected account")
 * debugging tool: the SDK throws typed errors, so we translate 401 vs 403 into
 * an actionable hint instead of a generic failure.
 */
export async function GET() {
  const startedAt = Date.now();

  if (!process.env.WHOP_API_KEY) {
    return NextResponse.json(
      {
        ok: false,
        environment: WHOP_ENV,
        error: { message: "WHOP_API_KEY is not set. Add it to .env.local." },
      },
      { status: 500 },
    );
  }

  try {
    const account = await whop.accounts.me();
    return NextResponse.json({
      ok: true,
      environment: WHOP_ENV,
      baseURL: WHOP_API_BASE,
      apiVersionDate: WHOP_API_VERSION_DATE,
      account: {
        id: account.id,
        title: account.title,
        // Non-null on a connected sub-business; null on the platform's own account.
        parent_account_id: account.parent_account_id,
      },
      latencyMs: Date.now() - startedAt,
    });
  } catch (err) {
    if (err instanceof Whop.APIError) {
      const hint =
        err.status === 401
          ? "401 = authentication problem. The key is missing/invalid OR you have an environment mismatch: a sandbox key must hit sandbox-api.whop.com and a production key must hit api.whop.com. Check WHOP_API_KEY and WHOP_BASE_URL."
          : err.status === 403
            ? "403 = authenticated but not authorized. The key is valid but lacks the scope/permission for this operation (e.g. Platforms access for connected accounts)."
            : undefined;
      return NextResponse.json(
        {
          ok: false,
          environment: WHOP_ENV,
          baseURL: WHOP_API_BASE,
          error: { status: err.status, name: err.name, message: err.message, hint },
        },
        { status: err.status ?? 502 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        environment: WHOP_ENV,
        baseURL: WHOP_API_BASE,
        error: { message: err instanceof Error ? err.message : "Unknown error" },
      },
      { status: 502 },
    );
  }
}
