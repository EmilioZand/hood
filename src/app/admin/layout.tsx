import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";

const NAV_ITEMS = [
  { href: "/admin/matches", label: "Match review" },
  { href: "/admin/awards", label: "Award review" },
  { href: "/admin/invites", label: "Invites" },
  { href: "/admin/users", label: "Users" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/");

  return (
    <main className="mx-auto flex max-w-5xl gap-8 p-6">
      <nav className="flex w-40 shrink-0 flex-col gap-1 text-sm">
        <Link href="/admin" className="mb-2 text-xs font-semibold uppercase text-gray-600">
          Admin
        </Link>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded px-2 py-1.5 hover:bg-brand-green/10"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="min-w-0 flex-1">{children}</div>
    </main>
  );
}
