"use client";

import { useEffect, useState } from "react";
import { BASE_URL } from "@/lib/config";

const HEALTH_CHECK_INTERVAL_MS = 20000;

/** Browser "online" only reflects the network interface, not whether the
 * API is actually reachable — a device can be connected to a wifi router
 * with no internet, or the backend can be down while wifi is fine. This
 * pings a cheap unauthenticated endpoint to check the thing that actually
 * matters: can we reach Mise's server right now. */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function checkServerReachable() {
      try {
        const res = await fetch(`${BASE_URL}/health/`, { method: "GET", cache: "no-store" });
        if (!cancelled) setOnline(res.ok);
      } catch {
        if (!cancelled) setOnline(false);
      }
    }

    function handleOffline() {
      setOnline(false);
    }

    window.addEventListener("online", checkServerReachable);
    window.addEventListener("offline", handleOffline);
    checkServerReachable();
    const interval = setInterval(checkServerReachable, HEALTH_CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.removeEventListener("online", checkServerReachable);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, []);

  return online;
}
