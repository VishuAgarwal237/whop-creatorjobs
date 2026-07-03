"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";

/** Supabase client for Client Components. Uses the public anon key; RLS applies. */
export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
