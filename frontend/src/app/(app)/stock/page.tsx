"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import type { KitchenStock } from "@/lib/types";
import { Card, CardHeader, Badge, Spinner, EmptyState } from "@/components/ui";

export default function StockPage() {
  const [stock, setStock] = useState<KitchenStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLowOnly, setShowLowOnly] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get<{ results?: KitchenStock[] } | KitchenStock[]>("/kitchen/stock/");
        setStock(Array.isArray(data) ? data : data.results ?? []);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load kitchen stock.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <Spinner />;
  if (error) return <p className="text-sm text-red-600">{error}</p>;

  const belowCount = stock.filter((s) => s.below_threshold).length;
  const rows = showLowOnly ? stock.filter((s) => s.below_threshold) : stock;

  return (
    <Card>
      <CardHeader
        title="Kitchen stock"
        action={
          <div className="flex gap-2 text-xs">
            <button
              onClick={() => setShowLowOnly(false)}
              className={`rounded-full border px-3 py-1 ${!showLowOnly ? "border-emerald-700 bg-emerald-50 text-emerald-700" : "border-slate-300 text-slate-600"}`}
            >
              All ({stock.length})
            </button>
            <button
              onClick={() => setShowLowOnly(true)}
              className={`rounded-full border px-3 py-1 ${showLowOnly ? "border-red-500 bg-red-50 text-red-600" : "border-slate-300 text-slate-600"}`}
            >
              Below threshold ({belowCount})
            </button>
          </div>
        }
      />
      {rows.length === 0 ? (
        <EmptyState>Nothing to show.</EmptyState>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="pb-2">Ingredient</th>
              <th className="pb-2">On hand</th>
              <th className="pb-2">Reorder threshold</th>
              <th className="pb-2">Status</th>
              <th className="pb-2">Last updated</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="border-t border-slate-100">
                <td className="py-2 font-medium text-slate-800">{s.ingredient_name}</td>
                <td className={`py-2 font-semibold ${s.below_threshold ? "text-red-600" : "text-emerald-700"}`}>
                  {s.qty_on_hand} {s.unit}
                </td>
                <td className="py-2 text-slate-500">
                  {s.reorder_threshold} {s.unit}
                </td>
                <td className="py-2">
                  <Badge tone={s.below_threshold ? "danger" : "success"}>
                    {s.below_threshold ? "Below threshold" : "Sufficient"}
                  </Badge>
                </td>
                <td className="py-2 text-slate-400">{new Date(s.updated_at).toLocaleString()}</td>
                <td className="py-2">
                  {s.below_threshold && (
                    <Link href="/requests" className="text-emerald-700 hover:underline">
                      Request more
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
