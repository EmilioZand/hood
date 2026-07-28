"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

/** Splits on "/" (matching splitCuisines' server-side parsing), trimming each part but
 * preserving a trailing empty segment — the one currently being typed. */
function splitDraft(value: string): string[] {
  return value.split("/").map((p) => p.trim());
}

/**
 * Cuisine is a single text field holding one or more "/"-separated tags (e.g. "Japanese
 * / Izakaya" — see splitCuisines). This layers type-ahead suggestions for whichever tag
 * is currently being typed (the segment after the last "/") on top of that same plain
 * text field, rather than a single-value combobox — picking a suggestion inserts it and
 * appends " / " so the next tag can be typed right away. Still freeform: an unmatched
 * typed tag is kept as-is, same as the create/edit forms' City/Neighborhood fields.
 */
export function CuisineCombobox({
  name,
  cuisines,
  defaultValue = "",
  placeholder,
  className = "rounded border px-3 py-2",
}: {
  name: string;
  cuisines: string[];
  defaultValue?: string;
  placeholder?: string;
  className?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const draftParts = useMemo(() => splitDraft(value), [value]);
  const currentSegment = draftParts[draftParts.length - 1] ?? "";
  const addedTags = useMemo(
    () => new Set(draftParts.slice(0, -1).filter(Boolean).map((p) => p.toLowerCase())),
    [draftParts],
  );

  const filtered = useMemo(() => {
    const q = currentSegment.toLowerCase();
    return cuisines.filter((c) => !addedTags.has(c.toLowerCase())).filter((c) => !q || c.toLowerCase().includes(q));
  }, [cuisines, currentSegment, addedTags]);

  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  function commitSegment(tag: string) {
    const parts = draftParts.slice(0, -1).filter((p) => p.length > 0);
    parts.push(tag);
    setValue(`${parts.join(" / ")} / `);
    setOpen(false);
    setHighlightIndex(-1);
    inputRef.current?.focus();
  }

  function handleBlur() {
    setOpen(false);
    // Drop a dangling trailing separator left over from picking a tag and not typing
    // another — "Japanese / Izakaya / " becomes "Japanese / Izakaya" once you leave.
    const cleaned = draftParts.filter((p) => p.length > 0).join(" / ");
    if (cleaned !== value) setValue(cleaned);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (highlightIndex >= 0 && filtered[highlightIndex]) {
        e.preventDefault();
        commitSegment(filtered[highlightIndex]);
      } else if (currentSegment) {
        // Freeform: not in the suggestion list, but still a valid new tag.
        e.preventDefault();
        commitSegment(currentSegment);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setHighlightIndex(-1);
    }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        ref={inputRef}
        type="text"
        name={name}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
          setHighlightIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={`w-full ${className}`}
      />
      {open && filtered.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded border bg-white text-sm text-black shadow-lg"
        >
          {filtered.map((opt, i) => (
            <li
              key={opt}
              role="option"
              aria-selected={i === highlightIndex}
              onMouseDown={(e) => {
                // Fires before the input's blur, so the click still registers instead
                // of blur cleanup running out from under it.
                e.preventDefault();
                commitSegment(opt);
              }}
              onMouseEnter={() => setHighlightIndex(i)}
              className={`cursor-pointer px-3 py-1.5 ${i === highlightIndex ? "bg-brand-green/10" : "hover:bg-gray-100"}`}
            >
              {opt}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
