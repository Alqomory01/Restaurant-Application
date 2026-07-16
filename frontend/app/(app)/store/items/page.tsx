"use client";

import { useState } from "react";
import { Pencil, Plus, Search } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { useFoodOps } from "@/lib/foodops/FoodOpsContext";
import { stockStatus, type StoreItem, type Supplier } from "@/lib/foodops/types";
import { Card, Badge, Button, Chip, EmptyState } from "@/components/ui";
import { Combobox } from "@/components/Combobox";

const stockTone: Record<string, "success" | "warning" | "danger"> = {
  HEALTHY: "success",
  LOW: "warning",
  CRITICAL: "danger",
};

const inputCls = "w-full rounded-md border border-border-2 px-2 py-1.5";

type Mode = { kind: "list" } | { kind: "new" } | { kind: "edit"; item: StoreItem };

export default function ItemMasterPage() {
  const { items, suppliers, addItem, updateItem } = useFoodOps();
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [lowStockOnly, setLowStockOnly] = useState(false);

  const categories = Array.from(new Set(items.map((i) => i.category)));
  const lowStockCount = items.filter((i) => stockStatus(i) !== "HEALTHY").length;

  const filtered = items.filter((i) => {
    if (category && i.category !== category) return false;
    if (lowStockOnly && stockStatus(i) === "HEALTHY") return false;
    if (search) {
      const q = search.toLowerCase();
      if (!i.name.toLowerCase().includes(q) && !i.barcode.includes(search)) return false;
    }
    return true;
  });

  if (mode.kind === "new") {
    return (
      <ItemForm
        suppliers={suppliers}
        onCancel={() => setMode({ kind: "list" })}
        onSave={async (input) => {
          await addItem(input);
          setMode({ kind: "list" });
        }}
      />
    );
  }

  if (mode.kind === "edit") {
    return (
      <ItemForm
        item={mode.item}
        suppliers={suppliers}
        onCancel={() => setMode({ kind: "list" })}
        onSave={async (input) => {
          await updateItem(mode.item.id, input);
          setMode({ kind: "list" });
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2">
        <Search className="h-4 w-4 shrink-0 text-ink-faint" strokeWidth={2} />
        <input
          className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
          placeholder="Search by item name or barcode…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          <Chip active={category === null && !lowStockOnly} onClick={() => { setCategory(null); setLowStockOnly(false); }}>
            All ({items.length})
          </Chip>
          {categories.map((c) => (
            <Chip key={c} active={category === c} onClick={() => { setCategory(c); setLowStockOnly(false); }}>
              {c}
            </Chip>
          ))}
          <Chip tone="danger" active={lowStockOnly} onClick={() => { setLowStockOnly((v) => !v); setCategory(null); }}>
            Low stock ({lowStockCount})
          </Chip>
        </div>
        <Button variant="primary" onClick={() => setMode({ kind: "new" })}>
          <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Add item
        </Button>
      </div>

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
                  <th className="p-3">Item name</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Barcode</th>
                  <th className="p-3">Buy / use unit</th>
                  <th className="p-3">Reorder</th>
                  <th className="p-3">On hand</th>
                  <th className="p-3">Location</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const status = stockStatus(item);
                  const preferred = suppliers.find((s) => s.id === item.preferredSupplierId);
                  return (
                    <tr key={item.id} className="border-t border-border">
                      <td className="p-3">
                        <div className="font-medium text-ink">{item.name}</div>
                        {preferred && <div className="text-ink-faint">{preferred.name} · preferred</div>}
                      </td>
                      <td className="p-3">
                        <span className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-ink-soft">{item.category}</span>
                      </td>
                      <td className="p-3 font-mono text-ink-faint">{item.barcode}</td>
                      <td className="p-3 text-ink-soft">
                        {item.buyUnit} / {item.useUnit}
                      </td>
                      <td className="p-3 text-ink-soft">
                        {item.reorderLevel} {item.useUnit}
                      </td>
                      <td className="p-3">
                        <Badge tone={stockTone[status]}>
                          {item.onHand} {item.useUnit}
                        </Badge>
                      </td>
                      <td className="p-3 text-ink-soft">{item.location}</td>
                      <td className="p-3 text-right">
                        <Button onClick={() => setMode({ kind: "edit", item })}>
                          <Pencil className="h-3.5 w-3.5" strokeWidth={2} /> Edit
                        </Button>
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
        Showing {filtered.length} of {items.length} items
      </p>
    </div>
  );
}

function ItemForm({
  item,
  suppliers,
  onCancel,
  onSave,
}: {
  item?: StoreItem;
  suppliers: Supplier[];
  onCancel: () => void;
  onSave: (input: Omit<StoreItem, "id">) => Promise<void>;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [category, setCategory] = useState(item?.category ?? "");
  const [barcode, setBarcode] = useState(item?.barcode ?? "");
  const [preferredSupplierId, setPreferredSupplierId] = useState<number | "">(item?.preferredSupplierId ?? "");
  const [buyUnit, setBuyUnit] = useState(item?.buyUnit ?? "");
  const [useUnit, setUseUnit] = useState(item?.useUnit ?? "");
  const [reorderLevel, setReorderLevel] = useState(String(item?.reorderLevel ?? 10));
  const [maxLevel, setMaxLevel] = useState(String(item?.maxLevel ?? 50));
  const [onHand, setOnHand] = useState(String(item?.onHand ?? 0));
  const [unitCost, setUnitCost] = useState(String(item?.unitCost ?? 0));
  const [shelfLifeDays, setShelfLifeDays] = useState(item?.shelfLifeDays != null ? String(item.shelfLifeDays) : "");
  const [location, setLocation] = useState(item?.location ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = name.trim() && category.trim() && useUnit.trim();

  async function handleSave() {
    setSubmitting(true);
    setError(null);
    try {
      await onSave({
        name,
        category,
        barcode,
        preferredSupplierId: preferredSupplierId || null,
        buyUnit,
        useUnit,
        reorderLevel: Number(reorderLevel) || 0,
        maxLevel: Number(maxLevel) || 0,
        onHand: Number(onHand) || 0,
        unitCost: Number(unitCost) || 0,
        shelfLifeDays: shelfLifeDays ? Number(shelfLifeDays) : null,
        location,
      });
    } catch (err) {
      setError(errorMessage(err, "Failed to save item."));
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <div className="mb-4 text-sm font-bold text-ink">{item ? `Edit ${item.name}` : "New item"}</div>
      <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
        <Field label="Item name *"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Category *"><input className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Produce" /></Field>
        <Field label="Barcode"><input className={inputCls} value={barcode} onChange={(e) => setBarcode(e.target.value)} /></Field>
        <Field label="Preferred supplier">
          <Combobox
            placeholder="Select supplier…"
            value={preferredSupplierId}
            onChange={setPreferredSupplierId}
            options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
          />
        </Field>
        <Field label="Buy unit"><input className={inputCls} value={buyUnit} onChange={(e) => setBuyUnit(e.target.value)} placeholder="e.g. 50 kg bag" /></Field>
        <Field label="Use unit *"><input className={inputCls} value={useUnit} onChange={(e) => setUseUnit(e.target.value)} placeholder="e.g. kg" /></Field>
        <Field label="Reorder level"><input type="number" className={inputCls} value={reorderLevel} onChange={(e) => setReorderLevel(e.target.value)} /></Field>
        <Field label="Max level"><input type="number" className={inputCls} value={maxLevel} onChange={(e) => setMaxLevel(e.target.value)} /></Field>
        <Field label={item ? "On-hand qty" : "Opening on-hand qty"}>
          <input type="number" className={inputCls} value={onHand} onChange={(e) => setOnHand(e.target.value)} />
        </Field>
        <Field label="Unit cost (₦)"><input type="number" className={inputCls} value={unitCost} onChange={(e) => setUnitCost(e.target.value)} /></Field>
        <Field label="Shelf life (days)"><input type="number" className={inputCls} value={shelfLifeDays} onChange={(e) => setShelfLifeDays(e.target.value)} placeholder="leave blank if n/a" /></Field>
        <Field label="Storage location"><input className={inputCls} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Main store" /></Field>
      </div>
      {item && (
        <p className="mt-3 text-xs text-ink-faint">
          Changing on-hand qty here is a direct correction (a stocktake fix, say) — normal stock movement should still
          flow through receiving and dispatch, not this form.
        </p>
      )}
      {error && <p className="mt-3 text-xs text-danger">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={handleSave} disabled={!canSave || submitting}>
          {submitting ? "Saving…" : item ? "Save changes" : "Save item"}
        </Button>
      </div>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="font-semibold text-ink-soft">{label}</label>
      {children}
    </div>
  );
}
