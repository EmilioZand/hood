"use client";

import { useState } from "react";
import { updateProfile } from "@/app/users/actions";

/** Shows a name as plain text with a pencil button; clicking swaps in an editable
 * input + save/cancel until the update completes, then reverts to display mode. */
export function DisplayNameEditor({ displayName }: { displayName: string | null }) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xl font-semibold">{displayName ?? "Unnamed user"}</span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Edit display name"
          className="rounded px-1 py-0.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
        >
          ✎
        </button>
      </div>
    );
  }

  async function save(formData: FormData) {
    await updateProfile(formData);
    setEditing(false);
  }

  return (
    <form action={save} className="flex w-full flex-col items-center gap-2">
      <input
        name="displayName"
        defaultValue={displayName ?? ""}
        required
        autoFocus
        className="w-full min-w-0 rounded border px-2 py-1 text-sm"
      />
      <div className="flex gap-2">
        <button type="submit" className="rounded bg-brand-green px-2 py-1 text-xs text-brand-cream hover:bg-brand-green-dark">
          Save
        </button>
        <button type="button" onClick={() => setEditing(false)} className="rounded border px-2 py-1 text-xs">
          Cancel
        </button>
      </div>
    </form>
  );
}
