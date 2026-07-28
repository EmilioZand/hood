import { redirect } from "next/navigation";

// The list and map views were merged into one page at "/" (list + map side by side on
// desktop, a toggle on mobile) — this route just forwards old links/bookmarks there.
export default async function ListPageRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value);
  }
  query.set("view", "list");
  redirect(`/?${query.toString()}`);
}
