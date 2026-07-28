"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * A submit button that shows a confirmation modal before actually submitting its
 * enclosing form — for destructive actions (e.g. delete) where a stray click
 * shouldn't be irreversible. Renders as `type="button"` itself so the initial click
 * never submits; only the modal's own confirm button (type="submit", same form) does.
 */
export function ConfirmSubmitButton({
  children,
  title,
  body,
  confirmLabel = "Delete",
  className = "rounded border px-2 py-1 text-red-700",
  confirmClassName = "rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700",
}: {
  children: ReactNode;
  title: string;
  body?: string;
  confirmLabel?: string;
  className?: string;
  confirmClassName?: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
      {open && (
        <div
          role="presentation"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-submit-title"
            className="w-full max-w-sm rounded-lg bg-white p-4 text-black shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="confirm-submit-title" className="mb-2 font-semibold">
              {title}
            </h2>
            {body && <p className="mb-4 text-sm text-gray-700">{body}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded border px-3 py-1.5 text-sm"
              >
                Cancel
              </button>
              <button type="submit" className={confirmClassName}>
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
