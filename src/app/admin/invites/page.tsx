import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { invites } from "@/db/schema";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { createInvite, revokeInvite } from "./actions";

type InviteStatus = "pending" | "used" | "revoked" | "expired";

function inviteStatus(invite: typeof invites.$inferSelect): InviteStatus {
  if (invite.revokedAt) return "revoked";
  if (invite.usedAt) return "used";
  if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) return "expired";
  return "pending";
}

const STATUS_STYLES: Record<InviteStatus, string> = {
  pending: "bg-brand-gold/20 text-brand-gold-dark",
  used: "bg-green-100 text-green-800",
  revoked: "bg-red-100 text-red-800",
  expired: "bg-gray-100 text-gray-700",
};

export default async function InvitesPage() {
  const rows = await db.query.invites.findMany({
    orderBy: [desc(invites.createdAt)],
  });

  const usedByIds = rows.map((i) => i.usedBy).filter((id): id is string => !!id);
  const usedByProfiles =
    usedByIds.length > 0
      ? await db.query.profiles.findMany({ where: (p, { inArray }) => inArray(p.id, usedByIds) })
      : [];
  const usedByName = new Map(usedByProfiles.map((p) => [p.id, p.displayName ?? "a user"]));

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  async function revoke(inviteId: string) {
    "use server";
    await revokeInvite(inviteId);
  }

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Invites</h1>
      <p className="mb-4 text-sm text-gray-700">
        This app is invite-only — new accounts (password or Google) can only be created by
        redeeming a valid, unused invite link.
      </p>

      <form action={createInvite} className="mb-6 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          Restrict to email (optional)
          <input
            name="email"
            type="email"
            placeholder="someone@example.com"
            className="min-w-[14rem] rounded border px-2 py-1.5 text-sm font-normal text-black"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-brand-green px-3 py-2 text-sm text-brand-cream hover:bg-brand-green-dark"
        >
          Create invite link
        </button>
      </form>

      <ul className="flex flex-col gap-2">
        {rows.map((invite) => {
          const status = inviteStatus(invite);
          const link = `${siteUrl}/signup?invite=${invite.token}`;
          return (
            <li key={invite.id} className="rounded border px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_STYLES[status]}`}>
                      {status}
                    </span>
                    {invite.email && <span className="text-gray-700">{invite.email}</span>}
                  </div>
                  <p className="mt-1 truncate text-xs text-gray-600">{link}</p>
                  {status === "used" && (
                    <p className="mt-1 text-xs text-gray-600">
                      Redeemed by{" "}
                      <Link href={`/users/${invite.usedBy}`} className="hover:underline">
                        {usedByName.get(invite.usedBy!) ?? "a user"}
                      </Link>
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  {status === "pending" && (
                    <>
                      <CopyLinkButton link={link} />
                      <form action={revoke.bind(null, invite.id)}>
                        <button type="submit" className="rounded border px-2 py-1 text-xs text-red-700">
                          Revoke
                        </button>
                      </form>
                    </>
                  )}
                </div>
              </div>
            </li>
          );
        })}
        {rows.length === 0 && <li className="text-sm text-gray-700">No invites yet.</li>}
      </ul>
    </div>
  );
}
