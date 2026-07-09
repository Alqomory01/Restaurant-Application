"use client";

import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiError } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import type { CostingRow, CostingStatus, CostingSummaryRow } from "@/lib/types";
import { Card, CardHeader, Badge, Spinner, EmptyState } from "@/components/ui";

const statusTone: Record<CostingStatus, "success" | "warning" | "danger" | "neutral"> = {
  on_target: "success",
  watch: "warning",
  over_target: "danger",
  no_data: "neutral",
};

const statusLabel: Record<CostingStatus, string> = {
  on_target: "On target",
  watch: "Watch",
  over_target: "Over target",
  no_data: "No data yet",
};

export default function CostingPage() {
  const { user } = useAuth();

  if (user?.role === "MANAGER") return <ManagerCosting />;
  if (user?.role === "HEAD_CHEF") return <HeadChefCostingSummary />;
  return <LockedCosting />;
}

function LockedCosting() {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-border bg-surface-2">
        <Lock className="h-6 w-6 text-ink-faint" strokeWidth={1.75} />
      </div>
      <div>
        <div className="text-base font-bold text-ink">Recipe costing is restricted</div>
        <div className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">
          Food cost analysis is visible to Head Chef and Manager roles only. Ask your General Manager if you need
          access.
        </div>
      </div>
    </div>
  );
}

function HeadChefCostingSummary() {
  const [rows, setRows] = useState<CostingSummaryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setRows(await api.get<CostingSummaryRow[]>("/kitchen/costing/summary/"));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load costing trend.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <Spinner />;
  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!rows) return null;

  return (
    <Card>
      <CardHeader title="Food cost trend" />
      <p className="mb-4 text-xs text-ink-soft">
        A quick read on where each dish stands against its target food cost — exact figures and margins are
        manager-only, but this is enough to know what to watch on the line.
      </p>
      {rows.length === 0 ? (
        <EmptyState>No recipes yet.</EmptyState>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.recipe_id} className="flex items-center justify-between rounded-md border border-border p-2.5 text-xs">
              <span className="font-medium text-ink">{r.recipe_name}</span>
              <Badge tone={statusTone[r.status]}>{statusLabel[r.status]}</Badge>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function ManagerCosting() {
  const [rows, setRows] = useState<CostingRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setRows(await api.get<CostingRow[]>("/kitchen/costing/"));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load costing data.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <Spinner />;
  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!rows) return null;

  return (
    <Card>
      <CardHeader title="Theoretical vs actual cost per recipe" />
      {rows.length === 0 ? (
        <EmptyState>No recipes yet.</EmptyState>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-ink-soft">
              <th className="pb-2">Recipe</th>
              <th className="pb-2">Theoretical cost/unit</th>
              <th className="pb-2">Actual cost/unit</th>
              <th className="pb-2">Theoretical FC%</th>
              <th className="pb-2">Actual FC%</th>
              <th className="pb-2">Target FC%</th>
              <th className="pb-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const over = r.actual_food_cost_pct != null && r.target_food_cost_pct != null && Number(r.actual_food_cost_pct) > Number(r.target_food_cost_pct) + 2;
              const watch = r.actual_food_cost_pct != null && r.target_food_cost_pct != null && Number(r.actual_food_cost_pct) > Number(r.target_food_cost_pct);
              return (
                <tr key={r.recipe_id} className="border-t border-border">
                  <td className="py-2 font-medium text-ink">{r.recipe_name}</td>
                  <td className="py-2 text-ink-soft">{formatCurrency(r.theoretical_cost_per_unit)}</td>
                  <td className="py-2 text-ink-soft">{formatCurrency(r.actual_cost_per_unit)}</td>
                  <td className="py-2 text-ink-soft">{r.theoretical_food_cost_pct != null ? `${r.theoretical_food_cost_pct}%` : "—"}</td>
                  <td className="py-2 text-ink-soft">{r.actual_food_cost_pct != null ? `${r.actual_food_cost_pct}%` : "—"}</td>
                  <td className="py-2 text-ink-soft">{r.target_food_cost_pct != null ? `${r.target_food_cost_pct}%` : "—"}</td>
                  <td className="py-2">
                    {r.actual_cost_per_unit == null ? (
                      <Badge tone="neutral">No data yet</Badge>
                    ) : over ? (
                      <Badge tone="danger">Over target</Badge>
                    ) : watch ? (
                      <Badge tone="warning">Watch</Badge>
                    ) : (
                      <Badge tone="success">On target</Badge>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
}
