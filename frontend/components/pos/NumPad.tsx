"use client";

import { Delete } from "lucide-react";

/** Generic on-screen numeric keypad for touch-first cash entry — mirrors
 * the digit-string-building pattern already used by the Shift PIN pad
 * (app/(app)/pos/shift/page.tsx), but unbounded length and with a "000"
 * quick-key for large cash amounts instead of a fixed 4-digit PIN. */
export function NumPad({
  value,
  onChange,
  maxLength = 10,
  showBulkKey = true,
}: {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  /** Set false for fixed-length entry (a PIN) where a "000" quick-add key
   * doesn't make sense — true for free-length cash amount entry. */
  showBulkKey?: boolean;
}) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", showBulkKey ? "000" : "", "0", "back"];

  function press(key: string) {
    if (key === "back") {
      onChange(value.slice(0, -1));
      return;
    }
    const next = (value + key).slice(0, maxLength);
    onChange(next);
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {keys.map((k, i) =>
        k === "" ? (
          <div key={`blank-${i}`} />
        ) : (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            className="flex items-center justify-center rounded-xl border border-border-2 bg-surface py-3.5 text-lg font-bold text-ink transition hover:bg-surface-2 active:bg-brand-light"
          >
            {k === "back" ? <Delete className="h-4 w-4" strokeWidth={2} /> : k}
          </button>
        )
      )}
    </div>
  );
}
