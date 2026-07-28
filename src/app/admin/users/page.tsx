import { desc } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { setAdminStatus } from "./actions";

export default async function UsersPage() {
  const currentUser = await requireAdmin();

  const users = await db.query.profiles.findMany({
    orderBy: [desc(profiles.createdAt)],
  });

  async function makeAdmin(userId: string) {
    "use server";
    await setAdminStatus(userId, true);
  }

  async function removeAdmin(userId: string) {
    "use server";
    await setAdminStatus(userId, false);
  }

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">
        Users ({users.length})
      </h1>
      <p className="mb-4 text-sm text-gray-700">
        Admins can edit/delete spots, manage the match review and award review queues, and
        create invite links.
      </p>

      <ul className="flex flex-col gap-2">
        {users.map((u) => {
          const isSelf = u.id === currentUser.id;
          return (
            <li key={u.id} className="rounded border px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{u.displayName ?? "Unnamed user"}</span>
                    {u.isAdmin && (
                      <span className="rounded bg-brand-gold/20 px-1.5 py-0.5 text-xs text-brand-gold-dark">
                        Admin
                      </span>
                    )}
                    {isSelf && <span className="text-xs text-gray-500">(you)</span>}
                  </div>
                  <p className="mt-1 text-xs text-gray-600">
                    Joined {u.createdAt.toLocaleDateString()}
                  </p>
                </div>
                <div className="shrink-0">
                  {isSelf ? (
                    <span className="text-xs text-gray-500">—</span>
                  ) : u.isAdmin ? (
                    <form action={removeAdmin.bind(null, u.id)}>
                      <button type="submit" className="rounded border px-2 py-1 text-xs text-red-700">
                        Remove admin
                      </button>
                    </form>
                  ) : (
                    <form action={makeAdmin.bind(null, u.id)}>
                      <button type="submit" className="rounded border px-2 py-1 text-xs text-green-700">
                        Make admin
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </li>
          );
        })}
        {users.length === 0 && <li className="text-sm text-gray-700">No users yet.</li>}
      </ul>
    </div>
  );
}
