import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";

// Stable "your own profile" shortcut — the real page lives at /users/[id] so any
// user's profile (not just your own) can be linked to from one place.
export default async function ProfileRedirect() {
  const user = await requireUser();
  redirect(`/users/${user.id}`);
}
