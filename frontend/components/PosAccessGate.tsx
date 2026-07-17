"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { RestrictedAccess, Spinner } from "@/components/ui";

const ALLOWED_ROLES = ["MANAGER"];

/** Belt-and-braces alongside the hidden sidebar section, same pattern as
 * StoreAccessGate. The spec's real POS roles are Cashier and FOH Supervisor
 * — neither exists as a real Django role yet, so Manager (standing in for
 * GM/Owner) is the only real login that reaches this module today. Once a
 * terminal is reached, `/pos/shift`'s PIN pad identifies which mock cashier
 * is actually running it for shift-tracking and approval purposes. */
export function PosAccessGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <Spinner />;

  if (!user || !ALLOWED_ROLES.includes(user.role)) {
    return (
      <RestrictedAccess
        title="POS module is restricted"
        message="Point of sale is visible to Manager for now — Cashier/FOH Supervisor PIN login happens inside the module once a Manager opens a terminal shift. Ask your General Manager if you need access."
      />
    );
  }

  return <>{children}</>;
}
