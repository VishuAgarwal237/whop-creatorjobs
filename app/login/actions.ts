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

type SupabaseAuthError = { message: string; code?: string; status?: number };

/** Turn Supabase's raw auth errors into plain, human messages for the login form. */
function friendlyAuthError(error: SupabaseAuthError): string {
  const code = error.code ?? "";
  const msg = (error.message ?? "").toLowerCase();

  if (code === "invalid_credentials" || msg.includes("invalid login credentials")) {
    return "Wrong email or password. Please check your details and try again.";
  }
  if (code === "email_not_confirmed" || msg.includes("email not confirmed")) {
    return "Please confirm your email address before signing in.";
  }
  if (code === "weak_password" || msg.includes("password should be at least") || msg.includes("weak password")) {
    return "Password must be at least 6 characters.";
  }
  if (code === "over_email_send_rate_limit" || msg.includes("rate limit") || msg.includes("too many")) {
    return "Too many attempts. Please wait a minute and try again.";
  }
  if (code === "validation_failed" || msg.includes("unable to validate email") || msg.includes("invalid format")) {
    return "That doesn't look like a valid email address.";
  }
  // Fallback: never leak a raw error code to the user.
  return error.message?.trim() || "Something went wrong. Please try again.";
}

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next")?.toString());
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) loginError("signin", next, friendlyAuthError(error));
  redirect(next);
}

export async function signUp(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next")?.toString());
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) {
    // Account already exists → send them to the Sign in tab with a clear nudge,
    // rather than surfacing Supabase's raw "User already registered".
    const alreadyExists =
      error.code === "user_already_exists" || /already (registered|been registered|exists)/i.test(error.message ?? "");
    if (alreadyExists) loginError("signin", next, "That email already has an account — sign in below.");
    loginError("signup", next, friendlyAuthError(error));
  }
  // Email confirmations are auto-confirmed (local + cloud), so a session exists now.
  redirect(next);
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
