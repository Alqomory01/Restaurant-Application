"use client";

import { useEffect, useState } from "react";
import { Lock, ClipboardList, Trash2, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { api, errorMessage } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import type { ReportsData, WastageReason } from "@/lib/types";
import { Card, CardHeader, Badge, Button, Spinner, EmptyState } from "@/components/ui";

const reasonLabel: Record<WastageReason, string> = {
  OVER_PRODUCTION: "Over-production",
  PREP_WASTE: "Prep waste",
  SPOILAGE: "Spoilage",
  DROPPED: "Dropped / accident",
  OTHER: "Other",
};

type RangeKey = "today" | "week" | "month";

const RANGE_LABEL: Record<RangeKey, string> = {
  today: "Today",
  week: "Last 7 days",
  month: "This month",
};

function toLocalISODate(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function rangeFor(key: RangeKey): { from: string; to: string } {
  const today = new Date();
  const to = toLocalISODate(today);
  if (key === "today") return { from: to, to };
  if (key === "week") {
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    return { from: toLocalISODate(start), to };
  }
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  return { from: toLocalISODate(start), to };
}

export default function ReportsPage() {
  const { user } = useAuth();
  if (user?.role === "MANAGER" || user?.role === "HEAD_CHEF") return <ReportsContent isManager={user.role === "MANAGER"} />;
  return <LockedReports />;
}

function LockedReports() {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-border bg-surface-2">
        <Lock className="h-6 w-6 text-ink-faint" strokeWidth={1.75} />
      </div>
      <div>
        <div className="text-base font-bold text-ink">Reports are restricted</div>
        <div className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">
          Production and wastage reporting is visible to Head Chef and Manager roles only.
        </div>
      </div>
    </div>
  );
}

function ReportsContent({ isManager }: { isManager: boolean }) {
  const [range, setRange] = useState<RangeKey>("today");
  const [data, setData] = useState<ReportsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { from, to } = rangeFor(range);
        setData(await api.get<ReportsData>(`/kitchen/reports/?date_from=${from}&date_to=${to}`));
      } catch (err) {
        setError(errorMessage(err, "Failed to load reports."));
      } finally {
        setLoading(false);
      }
    })();
  }, [range]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        {(Object.keys(RANGE_LABEL) as RangeKey[]).map((key) => (
          <Button key={key} variant={range === key ? "primary" : "default"} onClick={() => setRange(key)}>
            {RANGE_LABEL[key]}
          </Button>
        ))}
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : !data ? null : (
        <>
          <Card>
            <CardHeader title="Production & utilization by recipe" />
            <p className="mb-3 text-xs text-ink-soft">
              Utilization is produced minus wasted as a share of produced — a proxy for what actually got used,
              until sales data exists to measure real sell-through.
            </p>
            {data.batch_efficiency.length === 0 ? (
              <EmptyState icon={ClipboardList}>No completed batches in this range.</EmptyState>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-ink-soft">
                    <th className="pb-2">Recipe</th>
                    <th className="pb-2">Batches</th>
                    <th className="pb-2">Planned</th>
                    <th className="pb-2">Actual</th>
                    <th className="pb-2">Efficiency</th>
                    <th className="pb-2">Wasted</th>
                    <th className="pb-2">Utilization</th>
                    {isManager && <th className="pb-2">Wastage cost</th>}
                  </tr>
                </thead>
                <tbody>
                  {data.batch_efficiency.map((r) => (
                    <tr key={r.recipe_id} className="border-t border-border">
                      <td className="py-2 font-medium text-ink">{r.recipe_name}</td>
                      <td className="py-2 text-ink-soft">{r.batches_count}</td>
                      <td className="py-2 text-ink-soft">{r.planned_qty}</td>
                      <td className="py-2 text-ink-soft">{r.actual_qty}</td>
                      <td className="py-2 text-ink-soft">
                        {r.production_efficiency_pct != null ? `${r.production_efficiency_pct}%` : "—"}
                      </td>
                      <td className="py-2 text-ink-soft">{r.wasted_qty}</td>
                      <td className="py-2">
                        {r.utilization_pct == null ? (
                          <span className="text-ink-faint">—</span>
                        ) : (
                          <Badge tone={r.utilization_pct >= 90 ? "success" : r.utilization_pct >= 75 ? "warning" : "danger"}>
                            {r.utilization_pct}%
                          </Badge>
                        )}
                      </td>
                      {isManager && <td className="py-2 text-ink-soft">{formatCurrency(r.wasted_value)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader title="Wastage by reason" />
              {data.wastage_summary.by_reason.length === 0 ? (
                <EmptyState icon={Trash2}>No wastage logged in this range.</EmptyState>
              ) : (
                <div className="space-y-2">
                  {data.wastage_summary.by_reason.map((r) => (
                    <div
                      key={r.reason}
                      className="flex items-center justify-between rounded-md border border-border p-2.5 text-xs"
                    >
                      <span className="font-medium text-ink">{reasonLabel[r.reason]}</span>
                      <span className="text-ink-soft">
                        {r.count} {r.count === 1 ? "entry" : "entries"}
                        {isManager && r.value != null && <> · {formatCurrency(r.value)}</>}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between border-t border-border pt-2 text-xs font-semibold">
                    <span className="text-ink">Total</span>
                    <span className="text-ink">
                      {data.wastage_summary.total_count} {data.wastage_summary.total_count === 1 ? "entry" : "entries"}
                      {isManager && data.wastage_summary.total_value != null && (
                        <> · {formatCurrency(data.wastage_summary.total_value)}</>
                      )}
                    </span>
                  </div>
                </div>
              )}
            </Card>

            <Card>
              <CardHeader title="Staff output" />
              {data.staff_output.length === 0 ? (
                <EmptyState icon={Users}>No production or wastage logged in this range.</EmptyState>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-ink-soft">
                      <th className="pb-2">Staff</th>
                      <th className="pb-2">Batches completed</th>
                      <th className="pb-2">Wastage logged</th>
                      {isManager && <th className="pb-2">Wastage cost</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {data.staff_output.map((s) => (
                      <tr key={s.user_id} className="border-t border-border">
                        <td className="py-2 font-medium text-ink">{s.name}</td>
                        <td className="py-2 text-ink-soft">{s.batches_completed}</td>
                        <td className="py-2 text-ink-soft">{s.wastage_logged}</td>
                        {isManager && <td className="py-2 text-ink-soft">{formatCurrency(s.wastage_value)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
