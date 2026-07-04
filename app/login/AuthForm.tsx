"use client";

import { useState } from "react";
import { Field, Notice, btn, inputCls } from "@/components/ui";
import { signIn, signUp } from "./actions";

type Mode = "signin" | "signup";

/**
 * Tabbed auth: one email/password form that toggles between Sign in and
 * Create account. The submit button binds `formAction` to the matching server
 * action for the active tab, so there's a single obvious primary button.
 */
export function AuthForm({ error, next, initialMode }: { error?: string; next?: string; initialMode?: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode ?? "signin");
  const isSignup = mode === "signup";

  const tab = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-semibold transition ${
      active ? "bg-white text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-muted hover:text-foreground"
    }`;

  return (
    <div>
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface p-1">
        <button type="button" onClick={() => setMode("signin")} className={tab(!isSignup)}>
          Sign in
        </button>
        <button type="button" onClick={() => setMode("signup")} className={tab(isSignup)}>
          Create account
        </button>
      </div>

      {error ? (
        <div className="mt-4">
          <Notice kind="error">{error}</Notice>
        </div>
      ) : null}

      <form className="mt-5 flex flex-col gap-4">
        <input type="hidden" name="next" value={next ?? ""} />
        <Field label="Email">
          <input name="email" type="email" required placeholder="you+seller@gmail.com" className={inputCls} />
        </Field>
        <Field label="Password" hint={isSignup ? "At least 6 characters." : undefined}>
          <input name="password" type="password" required minLength={6} placeholder="••••••••" className={inputCls} />
        </Field>
        <button formAction={isSignup ? signUp : signIn} className={btn("primary")}>
          {isSignup ? "Create account" : "Sign in"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-muted">
        {isSignup ? "Already have an account? " : "New to CreatorJobs? "}
        <button
          type="button"
          onClick={() => setMode(isSignup ? "signin" : "signup")}
          className="font-semibold text-foreground underline underline-offset-2 hover:text-[var(--whop-blue)]"
        >
          {isSignup ? "Sign in" : "Create an account"}
        </button>
      </p>
    </div>
  );
}
