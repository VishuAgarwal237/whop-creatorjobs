import { Container, Card } from "@/components/ui";
import { AuthForm } from "./AuthForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; mode?: string }>;
}) {
  const { error, next, mode } = await searchParams;
  const initialMode = mode === "signup" ? "signup" : "signin";

  return (
    <Container size="sm" className="py-16">
      <Card>
        <h1 className="text-xl font-bold tracking-tight">Welcome to CreatorJobs</h1>
        <p className="mt-1 text-sm text-muted">Buy work, or onboard as a seller and get paid.</p>

        <div className="mt-5">
          <AuthForm error={error} next={next} initialMode={initialMode} />
        </div>

        <p className="mt-4 text-xs leading-relaxed text-muted">
          Use a real-MX email (e.g. gmail) — Whop rejects domains that can&apos;t receive mail
          when creating a connected account.
        </p>
      </Card>
    </Container>
  );
}
