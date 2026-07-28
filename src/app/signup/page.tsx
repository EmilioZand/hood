import Link from "next/link";
import { db } from "@/db";
import { validateInvite } from "@/lib/data/invites";
import { signInWithGoogle, signUpWithPassword } from "../login/actions";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; invite?: string }>;
}) {
  const params = await searchParams;
  const inviteToken = params.invite ?? "";
  // Email isn't known yet at this point — an email-scoped invite is re-checked against
  // the submitted address for real when the form actually posts.
  const inviteCheck = await validateInvite(db, inviteToken);
  const signInWithGoogleBound = signInWithGoogle.bind(null, "/", inviteToken);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Create an account</h1>

      {params.error && <p className="text-sm text-red-600">{params.error}</p>}

      {!inviteCheck.valid ? (
        <p className="text-sm text-gray-700">
          This app is invite-only.{" "}
          {inviteToken
            ? "That invite link isn't valid — ask an admin for a new one."
            : "Ask an admin for an invite link to create an account."}
        </p>
      ) : (
        <>
          <form action={signUpWithPassword} className="flex flex-col gap-3">
            <input type="hidden" name="invite" value={inviteToken} />
            <input
              name="email"
              type="email"
              placeholder="Email"
              required
              defaultValue={inviteCheck.invite.email ?? ""}
              className="rounded border px-3 py-2"
            />
            <input
              name="password"
              type="password"
              placeholder="Password (min 8 characters)"
              required
              minLength={8}
              className="rounded border px-3 py-2"
            />
            <button type="submit" className="rounded bg-brand-green px-3 py-2 text-brand-cream hover:bg-brand-green-dark">
              Sign up
            </button>
          </form>

          <form action={signInWithGoogleBound}>
            <button type="submit" className="w-full rounded border px-3 py-2">
              Continue with Google
            </button>
          </form>
        </>
      )}

      <p className="text-sm text-gray-600">
        Already have an account?{" "}
        <Link href="/login" className="underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
