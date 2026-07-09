"use client";

import { useEffect, type ReactNode } from "react";
import { Provider } from "react-redux";
import { store } from "@/lib/store";
import { useAppDispatch } from "@/lib/hooks";
import { restoreSession } from "@/lib/features/authSlice";

function AuthInitializer() {
  const dispatch = useAppDispatch();
  useEffect(() => {
    dispatch(restoreSession());
  }, [dispatch]);
  return null;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  return (
    <Provider store={store}>
      <AuthInitializer />
      {children}
    </Provider>
  );
}
