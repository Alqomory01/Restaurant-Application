"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CircleCheck, Clock, Flame, ArrowRight } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { ProductionPlan, ProductionPlanItem } from "@/lib/types";
import { Badge, Button, Spinner, EmptyState } from "@/components/ui";

const POLL_MS = 8000;

function isLate(item: ProductionPlanItem, now: Date): boolean {
  if (!item.scheduled_time) return false;
  const [h, m] = item.scheduled_time.split(":").map(Number);
  const scheduled = new Date(now);
  scheduled.setHours(h, m, 0, 0);
  return now.getTime() > scheduled.getTime();
}

export default function KdsPage() {
  const [plans, setPlans] = useState<ProductionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [now, setNow] = useState(new Date());

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ results?: ProductionPlan[] } | ProductionPlan[]>("/kitchen/plans/");
      const list = Array.isArray(res) ? res : res.results ?? [];
      const today = new Date().toISOString().slice(0, 10);
      setPlans(list.filter((p) => p.service_date === today));
    } catch (err) {
      setError(errorMessage(err, "Failed to load kitchen display."));
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
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  async function startBatch(item: ProductionPlanItem) {
    setBusyId(item.id);
    try {
      await api.post(`/kitchen/plan-items/${item.id}/start-batch/`);
      await load();
    } catch (err) {
      setError(errorMessage(err, "Could not start batch."));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <Spinner />;
  if (error) return <p className="text-sm text-danger">{error}</p>;

  const items = plans.flatMap((p) => p.items);
  const toProduce = items.filter((i) => i.status === "PENDING" || i.status === "BLOCKED");
  const inProgress = items.filter((i) => i.status === "IN_PROGRESS");
  const completed = items.filter((i) => i.status === "COMPLETE");

  return (
    <div className="rounded-xl border border-border bg-surface p-6 text-ink shadow-sm">
      <div className="mb-5 flex items-center justify-between border-b border-border pb-4">
        <div>
          <div className="text-xl font-bold">Kitchen display</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-faint">
            <span className="relative flex h-2 w-2">
              <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
            Live
            <span className="text-ink-faint">·</span>
            {plans.length > 0
              ? `${plans.map((p) => p.service_period).join(" + ")} · ${items.length} items planned · ${completed.length} complete`
              : "No plan for today"}
          </div>
        </div>
        <div className="font-mono text-3xl font-bold tabular-nums">
          {now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <KdsColumn title="To produce" count={toProduce.length}>
          {toProduce.map((item) => {
            const late = item.status === "PENDING" && isLate(item, now);
            return (
              <div
                key={item.id}
                className={`mb-3 overflow-hidden rounded-xl border border-border bg-surface-2 shadow-sm ${
                  late ? "motion-safe:animate-pulse" : ""
                }`}
              >
                <div className={`h-1.5 ${item.status === "BLOCKED" ? "bg-danger" : late ? "bg-danger" : "bg-brand"}`} />
                <div className="p-4">
                  <div className="text-base font-bold">{item.recipe_name}</div>
                  <div className="mt-0.5 text-lg font-extrabold tabular-nums text-ink-soft">
                    {item.planned_qty} {item.unit}
                  </div>
                  <div className="mt-2.5">
                    {item.status === "BLOCKED" ? (
                      <Badge tone="danger">
                        <AlertTriangle className="mr-1 h-3.5 w-3.5" strokeWidth={2.25} />
                        Blocked — ingredients unavailable
                      </Badge>
                    ) : late ? (
                      <Badge tone="danger">
                        <Clock className="mr-1 h-3.5 w-3.5" strokeWidth={2.25} />
                        Running late
                      </Badge>
                    ) : (
                      <Badge tone="success">Ready</Badge>
                    )}
                  </div>
                  <div className="mt-3 flex items-center justify-between text-sm text-ink-faint">
                    <span>{item.assigned_to_name ?? "Unassigned"}</span>
                    <span className="font-semibold tabular-nums">{item.scheduled_time?.slice(0, 5)}</span>
                  </div>
                  <Button
                    variant={item.status === "BLOCKED" ? "danger" : "primary"}
                    size="lg"
                    className="mt-3.5 w-full"
                    disabled={item.status === "BLOCKED" || busyId === item.id}
                    onClick={() => startBatch(item)}
                  >
                    <Flame className="h-4 w-4" strokeWidth={2.25} />
                    {item.status === "BLOCKED" ? "Blocked" : busyId === item.id ? "Starting…" : "Start production"}
                  </Button>
                </div>
              </div>
            );
          })}
          {toProduce.length === 0 && <EmptyState>Nothing queued.</EmptyState>}
        </KdsColumn>

        <KdsColumn title="In progress" count={inProgress.length}>
          {inProgress.map((item) => (
            <div key={item.id} className="mb-3 overflow-hidden rounded-xl border border-border bg-surface-2 shadow-sm">
              <div className="h-1.5 bg-warning" />
              <div className="p-4">
                <div className="text-base font-bold">{item.recipe_name}</div>
                <div className="mt-0.5 text-lg font-extrabold tabular-nums text-ink-soft">
                  {item.planned_qty} {item.unit}
                </div>
                <div className="mt-2.5 flex items-center justify-between">
                  <span className="font-mono text-xs text-ink-faint">{item.batch_code}</span>
                  <Badge tone="warning">
                    <Flame className="mr-1 h-3.5 w-3.5" strokeWidth={2.25} />
                    Cooking
                  </Badge>
                </div>
                <div className="mt-2 text-sm text-ink-faint">{item.assigned_to_name ?? "Unassigned"}</div>
                <Link
                  href="/batches"
                  className="mt-3.5 flex items-center justify-center gap-1.5 rounded-xl border border-border-2 py-2.5 text-sm font-semibold text-ink-soft transition hover:bg-surface hover:text-ink"
                >
                  Complete this batch <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
                </Link>
              </div>
            </div>
          ))}
          {inProgress.length === 0 && <EmptyState>Nothing in progress.</EmptyState>}
        </KdsColumn>

        <KdsColumn title="Completed today" count={completed.length}>
          {completed.map((item) => (
            <div key={item.id} className="mb-3 overflow-hidden rounded-xl border border-border bg-surface-2 opacity-75 shadow-sm">
              <div className="h-1.5 bg-brand" />
              <div className="p-4">
                <div className="text-base font-bold">{item.recipe_name}</div>
                <div className="mt-0.5 text-lg font-extrabold tabular-nums text-ink-soft">
                  {item.planned_qty} {item.unit}
                </div>
                <div className="mt-2.5 flex items-center justify-between text-sm text-ink-faint">
                  <span>{item.assigned_to_name}</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-brand">
                    <CircleCheck className="h-4 w-4" strokeWidth={2.25} /> Done
                  </span>
                </div>
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
      <div className="mb-3 flex items-center justify-between text-sm font-bold uppercase tracking-wide text-ink-faint">
        {title}
        <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-surface-2 px-1.5 text-xs text-ink-soft">
          {count}
        </span>
      </div>
      {children}
    </div>
  );
}
