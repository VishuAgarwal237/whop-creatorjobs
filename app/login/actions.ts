"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Only allow same-site relative redirects to avoid open-redirect.
function safeNext(next: string | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/seller";
}

// Bounce back to the right tab with the error surfaced, preserving `next`.
function loginError(mode: "signin" | "signup", next: string, message: string): never {
  redirect(
    `/login?mode=${mode}&error=${encodeURIComponent(message)}&next=${encodeURIComponent(next)}`,
  );
}

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next")?.toString());
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) loginError("signin", next, error.message);
  redirect(next);
}

export async function signUp(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next")?.toString());
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) loginError("signup", next, error.message);
  // Email confirmations are auto-confirmed (local + cloud), so a session exists now.
  redirect(next);
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
