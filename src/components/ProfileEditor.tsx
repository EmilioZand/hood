"use client";

import { useState } from "react";
import { updateProfile } from "@/app/users/actions";
import { CityNeighborhoodFields, type NeighborhoodOption } from "@/components/CityNeighborhoodFields";

/** Shows name + location as plain text with a pencil button; clicking swaps in an
 * editable form (name, city, neighborhood) with save/cancel until the update completes,
 * then reverts to display mode. */
export function ProfileEditor({
  displayName,
  city,
  neighborhood,
  neighborhoods,
}: {
  displayName: string | null;
  city: string | null;
  neighborhood: string | null;
  neighborhoods: NeighborhoodOption[];
}) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    const location = [neighborhood, city].filter(Boolean).join(", ");
    return (
      <div className="flex w-full flex-col items-center gap-1">
        <div className="flex items-center gap-2">
          <span className="text-xl font-semibold">{displayName ?? "Unnamed user"}</span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="Edit profile"
            className="rounded px-1 py-0.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          >
            ✎
          </button>
        </div>
        {location && <span className="text-sm text-gray-600">Lives in {location}</span>}
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
        placeholder="Display name"
        defaultValue={displayName ?? ""}
        required
        autoFocus
        className="w-full min-w-0 rounded border px-2 py-1 text-sm"
      />
      <div className="flex w-full flex-col gap-2">
        <CityNeighborhoodFields
          neighborhoods={neighborhoods}
          initialCity={city ?? ""}
          initialNeighborhood={neighborhood ?? ""}
          className="w-full min-w-0 rounded border px-2 py-1 text-sm"
        />
      </div>
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
