"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleCheck } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { ProductionPlan, ProductionPlanItem } from "@/lib/types";
import { Badge, Button, Spinner, EmptyState } from "@/components/ui";

const POLL_MS = 8000;

export default function KdsPage() {
  const [plan, setPlan] = useState<ProductionPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [clock, setClock] = useState("");

  const load = useCallback(async () => {
    try {
      const plans = await api.get<{ results?: ProductionPlan[] } | ProductionPlan[]>("/kitchen/plans/");
      const list = Array.isArray(plans) ? plans : plans.results ?? [];
      setPlan(list[0] ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load kitchen display.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  async function startBatch(item: ProductionPlanItem) {
    setBusyId(item.id);
    try {
      await api.post(`/kitchen/plan-items/${item.id}/start-batch/`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start batch.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <Spinner />;
  if (error) return <p className="text-sm text-danger">{error}</p>;

  const items = plan?.items ?? [];
  const toProduce = items.filter((i) => i.status === "PENDING" || i.status === "BLOCKED");
  const inProgress = items.filter((i) => i.status === "IN_PROGRESS");
  const completed = items.filter((i) => i.status === "COMPLETE");

  return (
    <div className="rounded-xl border border-border bg-surface p-5 text-ink shadow-sm">
      <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
        <div>
          <div className="text-lg font-bold">Kitchen display</div>
          <div className="text-xs text-ink-faint">
            {plan ? `${plan.service_period} · ${items.length} items planned · ${completed.length} complete` : "No plan for today"}
          </div>
        </div>
        <div className="font-mono text-2xl font-bold">{clock}</div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <KdsColumn title="To produce" count={toProduce.length}>
          {toProduce.map((item) => (
            <div
              key={item.id}
              className={`mb-2.5 rounded-lg border-l-4 bg-surface-2 p-3 ${
                item.status === "BLOCKED" ? "border-danger" : "border-brand"
              }`}
            >
              <div className="text-sm font-bold">
                {item.recipe_name} — {item.planned_qty} {item.unit}
              </div>
              <div className="mb-2 text-xs text-ink-faint">
                {item.status === "BLOCKED" ? "Blocked — ingredients unavailable" : "All ingredients available"}
              </div>
              <div className="mb-2 flex justify-between text-xs text-ink-faint">
                <span>Assigned: {item.assigned_to_name ?? "Unassigned"}</span>
                <span>{item.scheduled_time?.slice(0, 5)}</span>
              </div>
              <Button
                variant="primary"
                className="w-full justify-center"
                disabled={item.status === "BLOCKED" || busyId === item.id}
                onClick={() => startBatch(item)}
              >
                {item.status === "BLOCKED" ? "Blocked" : busyId === item.id ? "Starting…" : "Start production"}
              </Button>
            </div>
          ))}
          {toProduce.length === 0 && <EmptyState>Nothing queued.</EmptyState>}
        </KdsColumn>

        <KdsColumn title="In progress" count={inProgress.length}>
          {inProgress.map((item) => (
            <div key={item.id} className="mb-2.5 rounded-lg border-l-4 border-warning bg-surface-2 p-3">
              <div className="text-sm font-bold">
                {item.recipe_name} — {item.planned_qty} {item.unit}
              </div>
              <div className="mb-2 text-xs text-ink-faint">Batch {item.batch_code}</div>
              <div className="flex justify-between text-xs text-ink-faint">
                <span>Assigned: {item.assigned_to_name ?? "Unassigned"}</span>
                <Badge tone="warning">In progress</Badge>
              </div>
            </div>
          ))}
          {inProgress.length === 0 && <EmptyState>Nothing in progress.</EmptyState>}
        </KdsColumn>

        <KdsColumn title="Completed today" count={completed.length}>
          {completed.map((item) => (
            <div key={item.id} className="mb-2.5 rounded-lg border-l-4 border-brand bg-surface-2 p-3 opacity-80">
              <div className="text-sm font-bold">
                {item.recipe_name} — {item.planned_qty} {item.unit}
              </div>
              <div className="flex justify-between text-xs text-ink-faint">
                <span>{item.assigned_to_name}</span>
                <span className="inline-flex items-center gap-1 text-brand">
                  <CircleCheck className="h-3.5 w-3.5" strokeWidth={2} /> Done
                </span>
              </div>
            </div>
          ))}
          {completed.length === 0 && <EmptyState>Nothing completed yet.</EmptyState>}
        </KdsColumn>
      </div>
    </div>
  );
}

function KdsColumn({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2.5 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-ink-faint">
        {title} <Badge tone="neutral">{count}</Badge>
      </div>
      {children}
    </div>
  );
}
