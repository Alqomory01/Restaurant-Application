"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { RestrictedAccess, Spinner } from "@/components/ui";

const ALLOWED_ROLES = ["MANAGER", "STORE_KEEPER"];

/** Belt-and-braces alongside the hidden sidebar section: someone typing
 * /store/... directly (or a stale bookmark) still hits a real gate here,
 * not just a missing nav link. Manager and Store Keeper both get in here —
 * finer-grained actions within the module (approving a PO, say) are gated
 * separately, Manager-only, at the point of that action. */
export function StoreAccessGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <Spinner />;

  if (!user || !ALLOWED_ROLES.includes(user.role)) {
    return (
      <RestrictedAccess
        title="Store module is restricted"
        message="Procurement and inventory data is visible to Manager and Store Keeper roles only. Ask your General Manager if you need access."
      />
    );
  }

  return <>{children}</>;
}
