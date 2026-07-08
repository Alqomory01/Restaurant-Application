"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import type { DashboardData, ProductionPlan, StockRequest } from "@/lib/types";
import { Card, CardHeader, KpiTile, LockedTile, Badge, Spinner, EmptyState } from "@/components/ui";

const statusTone: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  COMPLETE: "success",
  IN_PROGRESS: "warning",
  BLOCKED: "danger",
  PENDING: "neutral",
};

export default function DashboardPage() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [plan, setPlan] = useState<ProductionPlan | null>(null);
  const [requests, setRequests] = useState<StockRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [dashboardData, plans, stockRequests] = await Promise.all([
          api.get<DashboardData>("/kitchen/dashboard/"),
          api.get<{ results?: ProductionPlan[] } | ProductionPlan[]>("/kitchen/plans/"),
          api.get<{ results?: StockRequest[] } | StockRequest[]>("/kitchen/stock-requests/?status=PENDING"),
        ]);
        setDashboard(dashboardData);
        const planList = Array.isArray(plans) ? plans : plans.results ?? [];
        setPlan(planList[0] ?? null);
        const reqList = Array.isArray(stockRequests) ? stockRequests : stockRequests.results ?? [];
        setRequests(reqList.filter((r) => r.status === "PENDING"));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load dashboard.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <Spinner />;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!dashboard) return null;

  const isManager = user?.role === "MANAGER";
  const blockedItems = plan?.items.filter((i) => i.status === "BLOCKED") ?? [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-3">
        <KpiTile
          label="Batches today"
          value={`${dashboard.batches_today_complete} / ${dashboard.batches_today_total}`}
          sub={`${dashboard.batches_today_total - dashboard.batches_today_complete} batches remaining`}
        />
        <KpiTile
          label="Production efficiency"
          value={dashboard.production_efficiency_pct != null ? `${dashboard.production_efficiency_pct}%` : "—"}
          tone="success"
          sub="Planned vs actual yield"
        />
        <KpiTile
          label="Ingredient shortfalls"
          value={dashboard.ingredient_shortfall_count}
          tone="danger"
          sub="Awaiting store dispatch"
        />
        {isManager ? (
          <KpiTile
            label="Actual food cost"
            value={dashboard.actual_food_cost_pct != null ? `${dashboard.actual_food_cost_pct}%` : "—"}
            tone="warning"
            sub="Today"
          />
        ) : (
          <LockedTile label="Actual food cost" hint="Manager access only" />
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="col-span-2">
          <CardHeader
            title="Today's production plan progress"
            action={
              <Link href="/planning" className="text-xs font-semibold text-emerald-700 hover:underline">
                View full plan
              </Link>
            }
          />
          {!plan || plan.items.length === 0 ? (
            <EmptyState>No production plan for today yet.</EmptyState>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="pb-2">Recipe</th>
                  <th className="pb-2">Planned</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {plan.items.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="py-2 font-medium text-slate-800">{item.recipe_name}</td>
                    <td className="py-2 text-slate-500">
                      {item.planned_qty} {item.unit}
                    </td>
                    <td className="py-2">
                      <Badge tone={statusTone[item.status]}>{item.status.replaceAll("_", " ")}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card>
          <CardHeader title="Blocked batches" />
          {blockedItems.length === 0 ? (
            <EmptyState>Nothing blocked right now.</EmptyState>
          ) : (
            <div className="space-y-2">
              {blockedItems.map((item) => (
                <div key={item.id} className="rounded-md border-l-4 border-red-500 bg-red-50 p-2.5 text-xs">
                  <div className="font-semibold text-red-800">{item.recipe_name} — blocked</div>
                  <div className="text-red-600">Awaiting ingredient dispatch from store.</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Pending stock requests"
          action={
            <Link href="/requests" className="text-xs font-semibold text-emerald-700 hover:underline">
              View all
            </Link>
          }
        />
        {requests.length === 0 ? (
          <EmptyState>No pending stock requests.</EmptyState>
        ) : (
          <div className="space-y-2">
            {requests.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-md border border-slate-200 p-2.5 text-xs">
                <div>
                  <span className="font-semibold text-slate-800">{r.request_code}</span>{" "}
                  <span className="text-slate-500">
                    {r.ingredient_name} · {r.qty_requested}
                  </span>
                </div>
                <Badge tone={r.urgency === "URGENT" ? "danger" : r.urgency === "HIGH" ? "warning" : "neutral"}>
                  {r.urgency}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
