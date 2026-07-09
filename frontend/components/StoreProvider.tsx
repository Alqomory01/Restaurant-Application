"use client";

import { useEffect, type ReactNode } from "react";
import { Provider } from "react-redux";
import { store } from "@/lib/store";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { restoreSession } from "@/lib/features/authSlice";
import { setTheme, type ThemeMode } from "@/lib/features/themeSlice";

const THEME_STORAGE_KEY = "mise_theme";

function AuthInitializer() {
  const dispatch = useAppDispatch();
  useEffect(() => {
    dispatch(restoreSession());
  }, [dispatch]);
  return null;
}

function ThemeSync() {
  const dispatch = useAppDispatch();
  const mode = useAppSelector((state) => state.theme.mode);

  // Pick up whatever the pre-hydration inline script already applied to
  // <html>, so React's state matches the DOM instead of fighting it.
  useEffect(() => {
    const initial: ThemeMode = document.documentElement.classList.contains("dark") ? "dark" : "light";
    dispatch(setTheme(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", mode === "dark");
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  }, [mode]);

  return null;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  return (
    <Provider store={store}>
      <AuthInitializer />
      <ThemeSync />
      {children}
    </Provider>
  );
}
