import Link from "next/link";
import { getCurrentUser, isAdminEmail } from "@/lib/auth";
import { signOut } from "@/app/login/actions";
import { WhopMark } from "@/components/ui";

/** Sitewide header: brand, contextual nav, and account area (reads session). */
export async function AppHeader() {
  const user = await getCurrentUser();
  const admin = isAdminEmail(user?.email);

  const nav: { href: string; label: string }[] = [{ href: "/marketplace", label: "Marketplace" }];
  if (user) {
    nav.push({ href: "/seller", label: "Sell" }, { href: "/orders", label: "Orders" });
    if (admin) nav.push({ href: "/admin", label: "Ops" });
  }

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-[color-mix(in_srgb,var(--background)_88%,transparent)] backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <WhopMark size={26} />
            <span className="text-[15px] font-bold tracking-tight">CreatorJobs</span>
          </Link>
          <nav className="hidden items-center gap-1 sm:flex">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted transition hover:bg-surface hover:text-foreground"
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <span className="hidden text-sm text-muted sm:inline">{user.email}</span>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface text-xs font-semibold uppercase text-foreground">
                {(user.email ?? "?").slice(0, 1)}
              </span>
              <form action={signOut}>
                <button className="text-sm font-medium text-muted transition hover:text-foreground">Sign out</button>
              </form>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-lg bg-foreground px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-black"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
