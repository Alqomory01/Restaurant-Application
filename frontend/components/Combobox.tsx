"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

export interface ComboboxOption {
  value: number;
  label: string;
  sublabel?: string;
}

/** Searchable dropdown for long id/label lists (ingredients, recipes, ...).
 * A plain <select> is fine for a handful of fixed choices, but becomes
 * painful to scan once a real kitchen has 100+ ingredients — this filters
 * as you type instead of making you scroll a native list. */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Search…",
  emptyLabel = "No matches",
  className = "",
}: {
  options: ComboboxOption[];
  value: number | "";
  onChange: (value: number) => void;
  placeholder?: string;
  emptyLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;
  const filtered = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setHighlighted(0);
  }, [query, open]);

  function openDropdown() {
    setOpen(true);
    setQuery("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function select(option: ComboboxOption) {
    onChange(option.value);
    setOpen(false);
    setQuery("");
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlighted]) select(filtered[highlighted]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {open ? (
        <div className="flex items-center gap-1.5 rounded-md border border-brand px-2 py-1.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-ink-faint" strokeWidth={2} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={selected?.label ?? placeholder}
            className="w-full min-w-0 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={openDropdown}
          className="flex w-full items-center justify-between rounded-md border border-border-2 bg-surface px-2 py-1.5 text-left text-sm transition hover:bg-surface-2"
        >
          <span className={`truncate ${selected ? "text-ink" : "text-ink-faint"}`}>{selected?.label ?? placeholder}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-faint" strokeWidth={2} />
        </button>
      )}

      {open && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-surface shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-ink-faint">{emptyLabel}</div>
          ) : (
            filtered.map((option, i) => (
              <button
                type="button"
                key={option.value}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(option)}
                onMouseEnter={() => setHighlighted(i)}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${
                  i === highlighted ? "bg-brand-light text-brand" : "text-ink hover:bg-surface-2"
                }`}
              >
                <span className="truncate">
                  {option.label}
                  {option.sublabel && <span className="ml-1.5 text-xs text-ink-faint">{option.sublabel}</span>}
                </span>
                {option.value === value && <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
