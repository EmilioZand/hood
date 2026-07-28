"use client";

import type { FormEvent, ReactNode } from "react";

/** Auto-submits (re-navigates with updated search params) whenever any field changes —
 * so picking a city immediately re-renders the page with neighborhoods scoped to it,
 * without a separate "Apply" click. Plain GET form submission, no client state. */
export function FilterForm({ children, className }: { children: ReactNode; className?: string }) {
  function handleChange(e: FormEvent<HTMLFormElement>) {
    e.currentTarget.requestSubmit();
  }

  return (
    <form className={className} onChange={handleChange}>
      {children}
    </form>
  );
}
