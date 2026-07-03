import { NextResponse, type NextRequest } from "next/server";
import { runSweep } from "@/lib/ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Reconciliation sweep on a schedule (Vercel Cron, see vercel.json). Drains the
 * webhook outbox, self-heals stuck orders from Whop, and releases due payouts.
 * Protected by CRON_SECRET when set (Vercel sends it as a Bearer token).
 */
function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // local/dev
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({ ok: true, ...(await runSweep()) });
}
