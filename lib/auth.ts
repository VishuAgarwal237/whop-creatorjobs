import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Current signed-in Supabase user, or null. */
export async function getCurrentUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
