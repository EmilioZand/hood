"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const DEBOUNCE_MS = 300;
// The only page that reads the `q` param (map+list are combined there) — searching from
// anywhere else (a restaurant detail page, admin, etc.) has nowhere to show results in
// place, so it lands there instead.
const SEARCHABLE_PATHS = ["/"];

/**
 * Free-text search bound to a `q` URL param, debounced so it doesn't navigate on every
 * keystroke. Lives in the header, visible from any page. Updates the URL directly via
 * the router rather than a form submission, since a plain `<form>` submit would drop
 * every other filter that isn't one of its own fields.
 */
export function SearchBox({ placeholder = "Search name, city, neighborhood, cuisine..." }: { placeholder?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const onSearchablePage = SEARCHABLE_PATHS.includes(pathname);

  // Seeded from the URL on mount only — local typing takes over from there. Re-syncing
  // on every searchParams change would fight the debounced update this component itself
  // just made (and calling setState from an effect is exactly the anti-pattern React's
  // linter flags here). Elsewhere (a page with no `q` of its own), start blank.
  const [value, setValue] = useState(onSearchablePage ? searchParams.get("q") ?? "" : "");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(next: string) {
    setValue(next);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      // Searching from a page with no results view of its own (detail, admin, ...)
      // sends you to the combined map/list page rather than tacking `q` onto a page
      // that ignores it.
      const destination = onSearchablePage ? pathname : "/";
      const params = new URLSearchParams(onSearchablePage ? searchParams.toString() : "");
      if (next) params.set("q", next);
      else params.delete("q");
      router.replace(`${destination}?${params.toString()}`);
    }, DEBOUNCE_MS);
  }

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  return (
    <input
      type="search"
      value={value}
      onChange={(e) => handleChange(e.target.value)}
      placeholder={placeholder}
      className="w-full min-w-[14rem] rounded border bg-white px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-500"
    />
  );
}
