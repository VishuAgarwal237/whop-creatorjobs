import Link from "next/link";
import { Container, btn } from "@/components/ui";

const steps = [
  { n: "1", t: "Sellers onboard", d: "Each seller gets a Whop connected account + hosted KYC." },
  { n: "2", t: "List work", d: "Listings become Whop products & plans, live on the marketplace." },
  { n: "3", t: "Buy & get paid", d: "Buyers checkout via Whop; sellers are paid out from the platform ledger." },
];

export default function Home() {
  return (
    <Container size="lg" className="py-14 sm:py-20">
      <div className="mx-auto max-w-2xl text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1 text-xs font-semibold text-muted">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--success)" }} />
          Two-sided marketplace, powered by Whop
        </span>
        <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl">CreatorJobs</h1>
        <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-muted sm:text-lg">
          Businesses post and pay for work. Creators complete it and get paid — payments,
          onboarding, and payouts all settled through Whop.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/marketplace" className={btn("primary", "px-5 py-2.5")}>
            Browse the marketplace →
          </Link>
          <Link href="/login" className={btn("outline", "px-5 py-2.5")}>
            Start selling
          </Link>
        </div>
      </div>

      <div className="mx-auto mt-16 grid max-w-3xl gap-4 sm:grid-cols-3">
        {steps.map((s) => (
          <div key={s.n} className="rounded-2xl border border-border bg-white p-5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white"
              style={{ background: "linear-gradient(135deg,var(--whop-orange),var(--whop-orange-strong))" }}
            >
              {s.n}
            </div>
            <h3 className="mt-3 text-sm font-semibold">{s.t}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted">{s.d}</p>
          </div>
        ))}
      </div>

      <p className="mx-auto mt-12 max-w-2xl text-center text-xs leading-relaxed text-muted/80">
        Built on Whop&apos;s sandbox — connected accounts, checkout, webhooks, and payouts.
        Every money flow runs through Whop APIs.
      </p>
    </Container>
  );
}
