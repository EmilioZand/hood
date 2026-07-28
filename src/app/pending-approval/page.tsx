import { signOut } from "@/app/login/actions";

export default function PendingApprovalPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Invite required</h1>
      <p className="text-sm text-gray-700">
        This app is invite-only and your account hasn&apos;t been approved. Ask an admin for an
        invite link.
      </p>
      <form action={signOut}>
        <button type="submit" className="rounded border px-3 py-2 text-sm">
          Sign out
        </button>
      </form>
    </main>
  );
}
