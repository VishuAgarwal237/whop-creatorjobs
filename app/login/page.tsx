import { Container, Card, Field, Notice, btn, inputCls } from "@/components/ui";
import { signIn, signUp } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  return (
    <Container size="sm" className="py-16">
      <Card>
        <h1 className="text-xl font-bold tracking-tight">Sign in to CreatorJobs</h1>
        <p className="mt-1 text-sm text-muted">Buy work, or onboard as a seller and get paid.</p>

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
          <Field label="Password">
            <input name="password" type="password" required minLength={6} placeholder="••••••••" className={inputCls} />
          </Field>
          <div className="flex gap-2">
            <button formAction={signIn} className={btn("dark", "flex-1")}>
              Sign in
            </button>
            <button formAction={signUp} className={btn("outline", "flex-1")}>
              Create account
            </button>
          </div>
        </form>

        <p className="mt-4 text-xs leading-relaxed text-muted">
          Use a real-MX email (e.g. gmail) — Whop rejects domains that can&apos;t receive mail
          when creating a connected account.
        </p>
      </Card>
    </Container>
  );
}
