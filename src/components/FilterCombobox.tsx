"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

export type FilterOption = { value: string; label: string };

/**
 * Type-ahead replacement for a native <select> filter control — search-filters the
 * options as you type, but (like a real <select>, and unlike the freeform Combobox used
 * on the create/edit forms) the committed value only changes when you actually pick an
 * option. This form auto-submits on change, so committing on every keystroke would
 * navigate on every character typed.
 */
export function FilterCombobox({
  name,
  options,
  value,
  className = "min-w-[10rem] rounded border px-2 py-1.5 text-sm font-normal text-black",
}: {
  name: string;
  options: FilterOption[];
  value: string;
  className?: string;
}) {
  const selected = options.find((o) => o.value === value) ?? options[0];
  const [search, setSearch] = useState(selected.label);
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || q === selected.label.toLowerCase()) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [search, options, selected.label]);

  function commit(opt: FilterOption) {
    setSearch(opt.label);
    setOpen(false);
    setHighlightIndex(-1);
    if (hiddenRef.current) {
      const changed = hiddenRef.current.value !== opt.value;
      hiddenRef.current.value = opt.value;
      if (changed) hiddenRef.current.form?.requestSubmit();
    }
  }

  function revert() {
    setOpen(false);
    setSearch(selected.label);
    setHighlightIndex(-1);
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
      e.preventDefault();
      if (highlightIndex >= 0 && filtered[highlightIndex]) {
        commit(filtered[highlightIndex]);
      } else if (filtered.length === 1) {
        commit(filtered[0]);
      }
    } else if (e.key === "Escape") {
      revert();
    }
  }

  return (
    <div className="relative w-full">
      <input type="hidden" name={name} ref={hiddenRef} defaultValue={value} />
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        autoComplete="off"
        value={search}
        onFocus={(e) => {
          setOpen(true);
          e.target.select();
        }}
        onChange={(e) => {
          // This form auto-submits on any control's change event — but a keystroke here
          // is just local search text, not a committed filter value, so it must not
          // bubble up and trigger a submit on every character typed. Only commit() does.
          e.stopPropagation();
          setSearch(e.target.value);
          setOpen(true);
          setHighlightIndex(-1);
        }}
        onBlur={revert}
        onKeyDown={handleKeyDown}
        className={`w-full ${className}`}
      />
      {open && filtered.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded border bg-white text-sm text-black shadow-lg"
        >
          {filtered.map((opt, i) => (
            <li
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              onMouseDown={(e) => {
                // Fires before the input's blur, so the click still registers instead
                // of blur reverting the field right out from under it.
                e.preventDefault();
                commit(opt);
              }}
              onMouseEnter={() => setHighlightIndex(i)}
              className={`cursor-pointer px-3 py-1.5 ${
                i === highlightIndex
                  ? "bg-brand-green/10"
                  : opt.value === value
                    ? "bg-gray-50 font-medium"
                    : "hover:bg-gray-100"
              }`}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
