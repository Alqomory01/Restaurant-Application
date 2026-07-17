"use client";

import { useState } from "react";
import Link from "next/link";
import { ClipboardList, Download, Search } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { useFoodOps } from "@/lib/foodops/FoodOpsContext";
import { stockStatus, type StockStatus, type StoreItem } from "@/lib/foodops/types";
import { Card, Button, Chip, EmptyState } from "@/components/ui";

const stockTextTone: Record<StockStatus, string> = {
  HEALTHY: "text-success",
  LOW: "text-warning",
  CRITICAL: "text-danger",
};

const barTone: Record<StockStatus, string> = {
  HEALTHY: "bg-success",
  LOW: "bg-warning",
  CRITICAL: "bg-danger",
};

function toCsv(items: StoreItem[]): string {
  const header = ["Item", "Category", "Location", "On hand", "Use unit", "Reorder level", "Max level", "Status"];
  const rows = items.map((i) => [i.name, i.category, i.location, i.onHand, i.useUnit, i.reorderLevel, i.maxLevel, stockStatus(i)]);
  return [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function StockLevelsPage() {
  const { items, stockMovements, updateItem } = useFoodOps();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StockStatus | null>(null);
  const [location, setLocation] = useState<string | null>(null);
  const [stocktaking, setStocktaking] = useState(false);
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const locations = Array.from(new Set(items.map((i) => i.location).filter(Boolean)));
  const criticalCount = items.filter((i) => stockStatus(i) === "CRITICAL").length;
  const lowCount = items.filter((i) => stockStatus(i) === "LOW").length;

  const filtered = items.filter((i) => {
    if (statusFilter && stockStatus(i) !== statusFilter) return false;
    if (location && i.location !== location) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!i.name.toLowerCase().includes(q) && !i.barcode.includes(search)) return false;
    }
    return true;
  });

  function lastMovement(itemId: number) {
    const latest = stockMovements.find((m) => m.itemId === itemId);
    if (!latest) return "—";
    return new Date(latest.occurredAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  function startStocktake() {
    setStocktaking(true);
    setError(null);
    const initial: Record<number, string> = {};
    for (const item of filtered) initial[item.id] = String(item.onHand);
    setCounts(initial);
  }

  async function saveStocktake() {
    setSaving(true);
    setError(null);
    try {
      const changed = filtered.filter((item) => {
        const counted = Number(counts[item.id]);
        return !Number.isNaN(counted) && counted !== item.onHand;
      });
      for (const item of changed) {
        await updateItem(item.id, { ...item, onHand: Number(counts[item.id]) });
      }
      setStocktaking(false);
    } catch (err) {
      setError(errorMessage(err, "Failed to save stocktake."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-2 rounded-md border border-border bg-surface px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-ink-faint" strokeWidth={2} />
          <input
            className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
            placeholder="Search items by name or barcode…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {stocktaking ? (
            <>
              <Button onClick={() => setStocktaking(false)} disabled={saving}>
                Cancel
              </Button>
              <Button variant="primary" onClick={saveStocktake} disabled={saving}>
                {saving ? "Saving…" : "Save stocktake"}
              </Button>
            </>
          ) : (
            <>
              <Button onClick={startStocktake}>
                <ClipboardList className="h-3.5 w-3.5" strokeWidth={2} /> Stocktake
              </Button>
              <Button onClick={() => downloadCsv("kitchen-stock-levels.csv", toCsv(filtered))}>
                <Download className="h-3.5 w-3.5" strokeWidth={2} /> Export CSV
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Chip active={statusFilter === null && location === null} onClick={() => { setStatusFilter(null); setLocation(null); }}>
          All ({items.length})
        </Chip>
        <Chip tone="danger" active={statusFilter === "CRITICAL"} onClick={() => setStatusFilter(statusFilter === "CRITICAL" ? null : "CRITICAL")}>
          Critical ({criticalCount})
        </Chip>
        <Chip tone="warning" active={statusFilter === "LOW"} onClick={() => setStatusFilter(statusFilter === "LOW" ? null : "LOW")}>
          Low ({lowCount})
        </Chip>
        {locations.map((loc) => (
          <Chip key={loc} active={location === loc} onClick={() => setLocation(location === loc ? null : loc)}>
            {loc}
          </Chip>
        ))}
      </div>

      {stocktaking && (
        <div className="rounded-md border border-info/25 bg-info-bg p-3 text-xs text-info">
          Enter the physically counted quantity for each item below, then <strong>Save stocktake</strong> — only rows that differ
          from the current on-hand figure will be adjusted, and each becomes a logged correction.
        </div>
      )}

      <Card className="p-0">
        {filtered.length === 0 ? (
          <div className="p-4">
            <EmptyState>No items match this filter.</EmptyState>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-ink-soft">
                  <th className="p-3">Item</th>
                  <th className="p-3">Location</th>
                  <th className="p-3">On hand</th>
                  <th className="p-3">Reorder</th>
                  <th className="p-3">Stock level</th>
                  <th className="p-3">Last movement</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const status = stockStatus(item);
                  const pct = item.maxLevel > 0 ? Math.min(100, Math.round((item.onHand / item.maxLevel) * 100)) : 0;
                  return (
                    <tr key={item.id} className="border-t border-border">
                      <td className="p-3">
                        <div className="font-medium text-ink">{item.name}</div>
                        <div className="text-ink-faint">{item.category}</div>
                      </td>
                      <td className="p-3 text-ink-soft">{item.location || "—"}</td>
                      <td className="p-3">
                        {stocktaking ? (
                          <input
                            type="number"
                            className="w-24 rounded-md border border-border-2 px-2 py-1"
                            value={counts[item.id] ?? String(item.onHand)}
                            onChange={(e) => setCounts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                          />
                        ) : (
                          <span className={`font-semibold ${stockTextTone[status]}`}>
                            {item.onHand} {item.useUnit}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-ink-soft">
                        {item.reorderLevel} {item.useUnit}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-2">
                            <div className={`h-full rounded-full ${barTone[status]}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-ink-faint">{pct}%</span>
                        </div>
                      </td>
                      <td className="p-3 text-ink-faint">{lastMovement(item.id)}</td>
                      <td className="p-3 text-right">
                        {status !== "HEALTHY" && (
                          <Link href="/store/purchase-orders" className="text-xs font-semibold text-brand hover:underline">
                            Raise PO
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="text-xs text-ink-faint">
        Showing {filtered.length} of {items.length} items · {criticalCount} critical · {lowCount} low
      </p>
    </div>
  );
}
