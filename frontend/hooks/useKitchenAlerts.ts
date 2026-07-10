"use client";

import { useEffect, useRef } from "react";
import { useToast } from "@/components/ToastProvider";
import { api } from "@/lib/api";
import type { DashboardData } from "@/lib/types";

const POLL_MS = 15000;

/** Surfaces new ingredient shortfalls as a toast instead of leaving them to
 * be discovered only by someone happening to open the dashboard — a new
 * pending stock request covers both an auto-raised shortfall from a blocked
 * batch and a manually raised one, so this one signal catches both. */
export function useKitchenAlerts(enabled: boolean) {
  const { pushToast } = useToast();
  const lastCount = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      lastCount.current = null;
      return;
    }

    let cancelled = false;

    async function poll() {
      try {
        const data = await api.get<DashboardData>("/kitchen/dashboard/");
        if (cancelled) return;
        const count = data.ingredient_shortfall_count;
        if (lastCount.current != null && count > lastCount.current) {
          const delta = count - lastCount.current;
          pushToast({
            tone: "danger",
            title: delta === 1 ? "New stock shortfall" : `${delta} new stock shortfalls`,
            message: `${count} ingredient request${count === 1 ? "" : "s"} pending — may block production.`,
            href: "/requests",
          });
        }
        lastCount.current = count;
      } catch {
        // Alerts are a nice-to-have on top of the dashboard, not a source of
        // truth — a failed poll just tries again next tick.
      }
    }

    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [enabled, pushToast]);
}
