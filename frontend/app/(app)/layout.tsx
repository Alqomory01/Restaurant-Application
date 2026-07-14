"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useKitchenAlerts } from "@/hooks/useKitchenAlerts";
import { Shell } from "@/components/Shell";
import { RestrictedAccess, Spinner } from "@/components/ui";

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  useKitchenAlerts(!loading && !!user);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  // Symmetric to StoreAccessGate: Store Keeper has no reason to see
  // production data, so a direct/bookmarked kitchen URL still hits a real
  // gate here, not just a missing nav link.
  const isStoreKeeperOutsideStore = user.role === "STORE_KEEPER" && !pathname?.startsWith("/store");

  return (
    <Shell>
      {isStoreKeeperOutsideStore ? (
        <RestrictedAccess
          title="Kitchen module is restricted"
          message="Production and recipe data is visible to Kitchen and Manager roles only. Ask your General Manager if you need access."
        />
      ) : (
        children
      )}
    </Shell>
  );
}
