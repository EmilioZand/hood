import Link from "next/link";
import Image from "next/image";
import { signInWithGoogle, signInWithPassword } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; error?: string; message?: string }>;
}) {
  const params = await searchParams;
  const redirectTo = params.redirectTo ?? "/";
  const signInWithGoogleBound = signInWithGoogle.bind(null, redirectTo, undefined);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <Image src="/icon.png" alt="Hood" width={100} height={100} className="mx-auto" />
      <h1 className="text-center text-2xl font-semibold">Sign in</h1>

      {params.error && <p className="text-sm text-red-600">{params.error}</p>}
      {params.message && <p className="text-sm text-green-700">{params.message}</p>}

      <form action={signInWithPassword} className="flex flex-col gap-3">
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <input
          name="email"
          type="email"
          placeholder="Email"
          required
          className="rounded border px-3 py-2"
        />
        <input
          name="password"
          type="password"
          placeholder="Password"
          required
          className="rounded border px-3 py-2"
        />
        <button type="submit" className="rounded bg-brand-green px-3 py-2 text-brand-cream hover:bg-brand-green-dark">
          Sign in
        </button>
      </form>

      <form action={signInWithGoogleBound}>
        <button type="submit" className="w-full rounded border px-3 py-2">
          Continue with Google
        </button>
      </form>

      <p className="text-sm text-gray-600">
        No account?{" "}
        <Link href="/signup" className="underline">
          Sign up
        </Link>
      </p>
    </main>
  );
}
