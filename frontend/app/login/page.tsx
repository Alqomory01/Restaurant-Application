"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { ApiError } from "@/lib/api";

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, user, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed. Check your credentials.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-brand text-lg font-bold text-white">
            M
          </div>
          <h1 className="text-lg font-bold text-ink">Mise ERP</h1>
          <p className="text-sm text-ink-soft">KitchenCore module</p>
        </div>
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-border bg-surface p-6 shadow-sm"
        >
          <div className="space-y-1">
            <label className="text-xs font-semibold text-ink-soft">Username</label>
            <input
              className="w-full rounded-md border border-border-2 px-3 py-2 text-sm outline-none focus:border-brand"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-ink-soft">Password</label>
            <input
              type="password"
              className="w-full rounded-md border border-border-2 px-3 py-2 text-sm outline-none focus:border-brand"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-ink-faint">
          Demo users: head_chef · kitchen_staff · manager — password MiseDemo123!
        </p>
      </div>
    </div>
  );
}
