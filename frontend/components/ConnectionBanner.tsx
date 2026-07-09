"use client";

import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export function ConnectionBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div className="flex items-center justify-center gap-2 bg-danger px-4 py-1.5 text-xs font-semibold text-white">
      <WifiOff className="h-3.5 w-3.5" strokeWidth={2.25} />
      No connection to the server — changes won&apos;t save until you&apos;re back online. Retrying automatically.
    </div>
  );
}
