"use client";

import { useState, type ReactNode } from "react";

/** Collapses the filter controls behind a toggle on mobile, where they'd otherwise
 * push the results below the fold — always expanded at sm+ where there's room.
 * Starts open if a filter is already active, so it's obvious what's narrowing the
 * list; otherwise starts closed to save space. */
export function FilterAccordion({
  children,
  activeCount,
}: {
  children: ReactNode;
  activeCount: number;
}) {
  const [open, setOpen] = useState(activeCount > 0);

  return (
    <div className="sm:contents">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mb-3 flex w-full items-center justify-between rounded border px-3 py-2 text-sm font-medium sm:hidden"
      >
        <span>Filters{activeCount > 0 ? ` · ${activeCount} active` : ""}</span>
        <span aria-hidden="true" className={`text-xs transition-transform ${open ? "rotate-180" : ""}`}>
          ▼
        </span>
      </button>
      <div className={`${open ? "flex" : "hidden"} flex-col gap-3 sm:flex`}>{children}</div>
    </div>
  );
}
