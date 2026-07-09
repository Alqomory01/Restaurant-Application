"use client";

import { Sun, Moon } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { toggleTheme } from "@/lib/features/themeSlice";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const dispatch = useAppDispatch();
  const mode = useAppSelector((state) => state.theme.mode);
  const isDark = mode === "dark";

  return (
    <button
      onClick={() => dispatch(toggleTheme())}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label="Toggle color theme"
      className={`flex h-8 w-8 items-center justify-center rounded-md border border-border text-ink-soft transition hover:bg-surface-2 hover:text-ink ${className}`}
    >
      {isDark ? <Sun className="h-4 w-4" strokeWidth={2} /> : <Moon className="h-4 w-4" strokeWidth={2} />}
    </button>
  );
}
