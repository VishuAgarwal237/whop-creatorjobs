import { signIn, signUp } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">CreatorJobs</h1>
        <p className="text-sm text-gray-500">Sign in as a seller to onboard and get paid.</p>
      </div>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <form className="flex flex-col gap-3">
        <input type="hidden" name="next" value={next ?? ""} />
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            name="email"
            type="email"
            required
            placeholder="you+seller@gmail.com"
            className="rounded-md border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            name="password"
            type="password"
            required
            minLength={6}
            className="rounded-md border px-3 py-2"
          />
        </label>
        <div className="flex gap-2">
          <button
            formAction={signIn}
            className="flex-1 rounded-md bg-black px-3 py-2 text-sm font-medium text-white"
          >
            Sign in
          </button>
          <button
            formAction={signUp}
            className="flex-1 rounded-md border px-3 py-2 text-sm font-medium"
          >
            Sign up
          </button>
        </div>
      </form>

      <p className="text-xs text-gray-400">
        Tip: use a real-MX email (e.g. a gmail address) — Whop rejects domains that
        can&apos;t receive mail when creating a connected account.
      </p>
    </main>
  );
}
