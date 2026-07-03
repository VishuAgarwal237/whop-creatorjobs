import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Service-role Supabase client. BYPASSES RLS — use only in trusted server code:
 * the webhook worker (Chunk 5) and the ops dashboard (Chunk 7). Never import this
 * from anything that can run in the browser (enforced by `server-only`).
 */
export function createSupabaseAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
