import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/session";

// Next 16 renamed `middleware` -> `proxy`. This refreshes the Supabase session
// cookie on every non-static request.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // everything except Next internals, static assets, and the webhook sink
    // (webhooks authenticate via signature, not a user session)
    "/((?!_next/static|_next/image|favicon.ico|api/webhooks|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
