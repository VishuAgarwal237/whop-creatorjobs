import Link from "next/link";

function WhopMark() {
  // Approximation of the Whop swirl mark
  return (
    <span
      aria-hidden
      className="flex h-7 w-7 items-center justify-center rounded-lg"
      style={{
        background:
          "linear-gradient(135deg, var(--whop-orange) 0%, var(--whop-orange-strong) 100%)",
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path
          d="M3 7.5c2.4 0 3.4 1.2 4.6 3.6C8.9 13.8 9.9 15 12.3 15M9 7.5c2.4 0 3.4 1.2 4.6 3.6C15 13.8 16 15 18.4 15c2.4 0 3.6-1.4 3.6-3.6"
          stroke="white"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

const links = [
  {
    href: "/marketplace",
    label: "Browse the marketplace",
    primary: true,
  },
  { href: "/login", label: "Seller sign in / sign up" },
  { href: "/seller", label: "Seller dashboard" },
  { href: "/api/health", label: "API health / Whop connectivity" },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Sandbox banner */}
      <div
        className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6"
        style={{ background: "var(--whop-orange)" }}
      >
        <p className="text-sm font-medium text-white sm:text-[15px]">
          <span className="font-bold">Sandbox</span>{" "}
          <span className="text-white/85">— Test payments without real charges</span>
        </p>
        <a
          href="https://dev.whop.com"
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-lg border border-white/40 bg-white/10 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-white/20"
        >
          View docs →
        </a>
      </div>

      {/* Header */}
      <header className="flex items-center justify-between border-b border-border px-4 py-3.5 sm:px-6">
        <div className="flex items-center gap-2">
          <WhopMark />
          <span className="text-lg font-bold tracking-tight">CreatorJobs</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-surface px-3 py-1.5 text-sm font-semibold text-foreground">
            $0.00
          </span>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-sm font-semibold text-muted">
            V
          </span>
        </div>
      </header>

      {/* Hero */}
      <main className="flex flex-1 items-center justify-center px-4 py-12 sm:py-20">
        <div className="w-full max-w-md">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-xs font-semibold text-muted">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: "#22c55e" }}
            />
            Two-sided marketplace on Whop
          </span>
          <h1 className="mt-5 text-4xl font-bold tracking-tight">CreatorJobs</h1>
          <p className="mt-3 text-base leading-relaxed text-muted">
            Buyers pay for work; sellers complete it and get paid — all settled
            through Whop.
          </p>

          <nav className="mt-8 flex flex-col gap-3">
            {links.map((link) =>
              link.primary ? (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold text-white transition"
                  style={{ background: "var(--whop-blue)" }}
                >
                  {link.label}
                  <span aria-hidden>→</span>
                </Link>
              ) : (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex items-center justify-between rounded-xl border border-border bg-white px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-surface"
                >
                  {link.label}
                  <span aria-hidden className="text-muted">
                    →
                  </span>
                </Link>
              )
            )}
          </nav>

          <p className="mt-8 text-xs leading-relaxed text-muted/80">
            Chunks 0–2 complete: scaffold + Whop client, Supabase schema + RLS,
            seller onboarding with real connected accounts.
          </p>
        </div>
      </main>
    </div>
  );
}
