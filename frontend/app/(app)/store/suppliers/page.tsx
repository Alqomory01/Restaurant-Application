"use client";

import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { useFoodOps } from "@/lib/foodops/FoodOpsContext";
import type { Supplier, SupplierStatus } from "@/lib/foodops/types";
import { Card, Badge, Button, Chip, EmptyState } from "@/components/ui";

const statusTone: Record<SupplierStatus, "success" | "warning" | "danger"> = {
  ACTIVE: "success",
  FLAGGED: "warning",
  INACTIVE: "danger",
};

const inputCls = "w-full rounded-md border border-border-2 px-2 py-1.5";

type Mode = { kind: "list" } | { kind: "new" };

export default function SuppliersPage() {
  const { suppliers, addSupplier } = useFoodOps();
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  const categories = Array.from(new Set(suppliers.map((s) => s.category)));

  const filtered = suppliers.filter((s) => {
    if (category && s.category !== category) return false;
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (mode.kind === "new") {
    return (
      <SupplierForm
        onCancel={() => setMode({ kind: "list" })}
        onSave={(input) => {
          addSupplier(input);
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
          placeholder="Search suppliers by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          <Chip active={category === null} onClick={() => setCategory(null)}>
            All ({suppliers.length})
          </Chip>
          {categories.map((c) => (
            <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
              {c} ({suppliers.filter((s) => s.category === c).length})
            </Chip>
          ))}
        </div>
        <Button variant="primary" onClick={() => setMode({ kind: "new" })}>
          <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Add supplier
        </Button>
      </div>

      <Card className="p-0">
        {filtered.length === 0 ? (
          <div className="p-4">
            <EmptyState>No suppliers match this filter.</EmptyState>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-ink-soft">
                <th className="p-3">Supplier</th>
                <th className="p-3">Category</th>
                <th className="p-3">Payment terms</th>
                <th className="p-3">Lead time</th>
                <th className="p-3">Delivery accuracy</th>
                <th className="p-3">Quality avg</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="p-3">
                    <div className="font-medium text-ink">{s.name}</div>
                    <div className="text-ink-faint">
                      {s.contactName} · {s.contactPhone}
                    </div>
                  </td>
                  <td className="p-3">
                    <span className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-ink-soft">{s.category}</span>
                  </td>
                  <td className="p-3 text-ink-soft">{s.paymentTerms}</td>
                  <td className="p-3 text-ink-soft">{s.leadTimeDays} day{s.leadTimeDays === 1 ? "" : "s"}</td>
                  <td className={`p-3 font-medium ${s.deliveryAccuracyPct >= 90 ? "text-success" : s.deliveryAccuracyPct >= 75 ? "text-warning" : "text-danger"}`}>
                    {s.deliveryAccuracyPct}%
                  </td>
                  <td className="p-3 font-medium text-ink-soft">{s.qualityAvg.toFixed(1)} / 5</td>
                  <td className="p-3">
                    <Badge tone={statusTone[s.status]}>{s.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <p className="text-xs text-ink-faint">
        Showing {filtered.length} of {suppliers.length} suppliers
        {suppliers.some((s) => s.status === "FLAGGED") && (
          <span className="text-danger"> · {suppliers.filter((s) => s.status === "FLAGGED").length} flagged for low performance</span>
        )}
      </p>
    </div>
  );
}

function SupplierForm({ onCancel, onSave }: { onCancel: () => void; onSave: (input: Omit<Supplier, "id">) => void }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("Net 30");
  const [leadTimeDays, setLeadTimeDays] = useState("2");

  const canSave = name.trim() && category.trim();

  function handleSave() {
    onSave({
      name,
      category,
      contactName,
      contactPhone,
      paymentTerms,
      leadTimeDays: Number(leadTimeDays) || 0,
      deliveryAccuracyPct: 0,
      qualityAvg: 0,
      status: "ACTIVE",
    });
  }

  return (
    <Card>
      <div className="mb-4 text-sm font-bold text-ink">New supplier</div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <Field label="Supplier name *"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Category *"><input className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Produce" /></Field>
        <Field label="Contact name"><input className={inputCls} value={contactName} onChange={(e) => setContactName(e.target.value)} /></Field>
        <Field label="Contact phone"><input className={inputCls} value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} /></Field>
        <Field label="Payment terms">
          <select className={inputCls} value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)}>
            <option>Net 7</option>
            <option>Net 14</option>
            <option>Net 30</option>
            <option>Cash on delivery</option>
            <option>50% upfront</option>
          </select>
        </Field>
        <Field label="Lead time (days)"><input type="number" className={inputCls} value={leadTimeDays} onChange={(e) => setLeadTimeDays(e.target.value)} /></Field>
      </div>
      <p className="mt-3 text-xs text-ink-faint">
        Delivery accuracy and quality score start blank — they build up from real GRN history once deliveries start coming in.
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={handleSave} disabled={!canSave}>
          Save supplier
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
