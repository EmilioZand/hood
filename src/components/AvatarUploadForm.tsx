"use client";

import { useState } from "react";
import { uploadAvatar } from "@/app/users/actions";

/** Upload button only appears once a file is actually chosen — otherwise it's just
 * dead weight sitting next to an empty file picker. */
export function AvatarUploadForm() {
  const [hasFile, setHasFile] = useState(false);

  return (
    <form action={uploadAvatar} className="flex flex-col items-center gap-1">
      <span className="text-xs font-medium text-gray-600">Edit avatar</span>
      <input
        type="file"
        name="avatar"
        accept="image/*"
        required
        onChange={(e) => setHasFile((e.target.files?.length ?? 0) > 0)}
        className="w-40 text-xs file:mr-2 file:rounded file:border file:px-2 file:py-1 file:text-xs"
      />
      {hasFile && (
        <button type="submit" className="rounded border px-2 py-1 text-xs">
          Upload photo
        </button>
      )}
    </form>
  );
}
