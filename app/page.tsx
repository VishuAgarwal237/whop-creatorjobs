import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-3xl font-semibold">CreatorJobs</h1>
        <p className="text-gray-500">
          A two-sided marketplace on Whop. Buyers pay for work; sellers complete it and get paid.
        </p>
      </div>
      <nav className="flex flex-col gap-2 text-sm">
        <Link className="text-blue-600 underline" href="/login">
          Seller sign in / sign up →
        </Link>
        <Link className="text-blue-600 underline" href="/seller">
          Seller dashboard →
        </Link>
        <Link className="text-blue-600 underline" href="/api/health">
          API health / Whop connectivity →
        </Link>
      </nav>
      <p className="text-xs text-gray-400">
        Chunks 0–2 complete: scaffold + Whop client, Supabase schema + RLS, seller
        onboarding with real connected accounts.
      </p>
    </main>
  );
}
