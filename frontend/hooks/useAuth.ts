"use client";

import { useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { login as loginThunk, logout as logoutThunk } from "@/lib/features/authSlice";
import { ApiError } from "@/lib/apiError";

export function useAuth() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.auth.user);
  const loading = useAppSelector((state) => state.auth.loading);

  const login = useCallback(
    async (username: string, password: string) => {
      const result = await dispatch(loginThunk({ username, password }));
      if (loginThunk.rejected.match(result)) {
        const payload = result.payload as { status: number; body: unknown } | undefined;
        if (payload) throw new ApiError(payload.status, payload.body);
        throw new Error(result.error.message ?? "Login failed");
      }
    },
    [dispatch]
  );

  const logout = useCallback(async () => {
    await dispatch(logoutThunk());
  }, [dispatch]);

  return { user, loading, login, logout };
}
