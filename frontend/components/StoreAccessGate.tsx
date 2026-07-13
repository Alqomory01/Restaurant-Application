"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { RestrictedAccess, Spinner } from "@/components/ui";

/** Belt-and-braces alongside the hidden sidebar section: someone typing
 * /store/... directly (or a stale bookmark) still hits a real gate here,
 * not just a missing nav link. */
export function StoreAccessGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <Spinner />;

  if (user?.role !== "MANAGER") {
    return (
      <RestrictedAccess
        title="Store module is restricted"
        message="Procurement and inventory data is visible to Manager-level roles only. Ask your General Manager if you need access."
      />
    );
  }

  return <>{children}</>;
}
