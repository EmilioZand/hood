"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

/**
 * Free-text input with a filtered, styled suggestion dropdown — a custom replacement
 * for `<input list>` + `<datalist>`. Native datalist popups can't be styled or reliably
 * positioned (Chromium renders its own dropdown-arrow indicator inside the input that
 * doesn't align with the rest of the field), so this renders the suggestion list itself.
 * Still freeform: typing a value with no match is allowed, it's a suggestion list, not a
 * hard constraint.
 */
export function Combobox({
  name,
  options,
  value,
  defaultValue = "",
  onValueChange,
  placeholder,
  required = false,
  className = "rounded border px-3 py-2",
}: {
  name: string;
  options: string[];
  /** Controlled value — pass alongside onValueChange when a parent needs to react to typing (e.g. City, which drives Neighborhood's suggestion list). Omit for an uncontrolled field. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  const isControlled = value !== undefined;
  const [innerValue, setInnerValue] = useState(defaultValue);
  const currentValue = isControlled ? value : innerValue;

  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const filtered = useMemo(() => {
    const q = currentValue.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [currentValue, options]);

  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  function setValue(next: string) {
    if (!isControlled) setInnerValue(next);
    onValueChange?.(next);
  }

  function selectOption(opt: string) {
    setValue(opt);
    setOpen(false);
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
      if (highlightIndex >= 0 && filtered[highlightIndex]) {
        e.preventDefault();
        selectOption(filtered[highlightIndex]);
      } else {
        setOpen(false);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setHighlightIndex(-1);
    }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        type="text"
        name={name}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={placeholder}
        required={required}
        value={currentValue}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
          setHighlightIndex(-1);
        }}
        onFocus={() => setOpen(true)}
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
                // of the dropdown closing (from blur) right out from under it.
                e.preventDefault();
                selectOption(opt);
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
