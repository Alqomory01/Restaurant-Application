"use client";

import { useState } from "react";
import { ArrowLeft, Plus, Search, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useFoodOps } from "@/lib/foodops/FoodOpsContext";
import { PO_APPROVAL_THRESHOLD } from "@/lib/foodops/mockData";
import type { POStatus, PurchaseOrder, StoreItem, Supplier } from "@/lib/foodops/types";
import { formatCurrency } from "@/lib/format";
import { Card, CardHeader, Badge, Button, Chip, EmptyState } from "@/components/ui";
import { Combobox } from "@/components/Combobox";

const statusTone: Record<POStatus, "success" | "warning" | "danger" | "info" | "neutral"> = {
  DRAFT: "neutral",
  AWAITING_APPROVAL: "warning",
  APPROVED: "success",
  SENT: "info",
  PARTIAL: "warning",
  COMPLETE: "success",
  REJECTED: "danger",
};

const STATUS_LABEL: Record<POStatus, string> = {
  DRAFT: "Draft",
  AWAITING_APPROVAL: "Awaiting approval",
  APPROVED: "Approved",
  SENT: "Sent to supplier",
  PARTIAL: "Partially received",
  COMPLETE: "Complete",
  REJECTED: "Rejected",
};

const inputCls = "w-full rounded-md border border-border-2 px-2 py-1.5";

interface DraftLine {
  itemId: number;
  qtyOrdered: string;
  unit: string;
  unitPrice: string;
}

type Mode = { kind: "list" } | { kind: "new" } | { kind: "view"; po: PurchaseOrder };

function poTotal(po: PurchaseOrder) {
  return po.lineItems.reduce((sum, li) => sum + li.qtyOrdered * li.unitPrice, 0);
}

export default function PurchaseOrdersPage() {
  const { user } = useAuth();
  const { purchaseOrders, suppliers, items, createPurchaseOrder, approvePurchaseOrder, rejectPurchaseOrder } = useFoodOps();
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<POStatus | null>(null);

  const isManager = user?.role === "MANAGER";
  const supplierName = (id: number) => suppliers.find((s) => s.id === id)?.name ?? "—";

  const filtered = purchaseOrders.filter((po) => {
    if (statusFilter && po.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!po.code.toLowerCase().includes(q) && !supplierName(po.supplierId).toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const statusCounts = purchaseOrders.reduce<Record<string, number>>((acc, po) => {
    acc[po.status] = (acc[po.status] ?? 0) + 1;
    return acc;
  }, {});

  if (mode.kind === "new") {
    return (
      <NewPOForm
        suppliers={suppliers}
        items={items}
        raisedBy={`${user?.first_name ?? ""} ${user?.last_name ?? ""}`.trim() || "Unknown"}
        onCancel={() => setMode({ kind: "list" })}
        onCreate={(input) => {
          createPurchaseOrder(input);
          setMode({ kind: "list" });
        }}
      />
    );
  }

  if (mode.kind === "view") {
    const po = purchaseOrders.find((p) => p.id === mode.po.id) ?? mode.po;
    return (
      <PODetail
        po={po}
        suppliers={suppliers}
        items={items}
        isManager={isManager}
        onBack={() => setMode({ kind: "list" })}
        onApprove={() => approvePurchaseOrder(po.id)}
        onReject={(reason) => rejectPurchaseOrder(po.id, reason)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2">
        <Search className="h-4 w-4 shrink-0 text-ink-faint" strokeWidth={2} />
        <input
          className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
          placeholder="Search by PO number or supplier…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          <Chip active={statusFilter === null} onClick={() => setStatusFilter(null)}>
            All ({purchaseOrders.length})
          </Chip>
          {(Object.keys(STATUS_LABEL) as POStatus[])
            .filter((s) => statusCounts[s])
            .map((s) => (
              <Chip
                key={s}
                tone={s === "AWAITING_APPROVAL" ? "warning" : s === "REJECTED" ? "danger" : "neutral"}
                active={statusFilter === s}
                onClick={() => setStatusFilter(s)}
              >
                {STATUS_LABEL[s]} ({statusCounts[s]})
              </Chip>
            ))}
        </div>
        <Button variant="primary" onClick={() => setMode({ kind: "new" })}>
          <Plus className="h-3.5 w-3.5" strokeWidth={2} /> New purchase order
        </Button>
      </div>

      <Card className="p-0">
        {filtered.length === 0 ? (
          <div className="p-4">
            <EmptyState>No purchase orders match this filter.</EmptyState>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-ink-soft">
                  <th className="p-3">PO number</th>
                  <th className="p-3">Supplier</th>
                  <th className="p-3">Items</th>
                  <th className="p-3">Total value</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Raised by</th>
                  <th className="p-3">Expected</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((po) => (
                  <tr key={po.id} className="border-t border-border">
                    <td className="p-3 font-mono text-ink-soft">
                      <button onClick={() => setMode({ kind: "view", po })} className="hover:underline">
                        {po.code}
                      </button>
                    </td>
                    <td className="p-3 font-medium text-ink">{supplierName(po.supplierId)}</td>
                    <td className="p-3 text-ink-soft">{po.lineItems.length} items</td>
                    <td className="p-3 text-ink-soft">{formatCurrency(poTotal(po))}</td>
                    <td className="p-3">
                      <Badge tone={statusTone[po.status]}>{STATUS_LABEL[po.status]}</Badge>
                    </td>
                    <td className="p-3 text-ink-soft">{po.raisedBy}</td>
                    <td className="p-3 text-ink-soft">{po.expectedDate}</td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1.5">
                        {po.status === "AWAITING_APPROVAL" && isManager && (
                          <Button variant="primary" onClick={() => approvePurchaseOrder(po.id)}>
                            Approve
                          </Button>
                        )}
                        <Button onClick={() => setMode({ kind: "view", po })}>View</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function PODetail({
  po,
  suppliers,
  items,
  isManager,
  onBack,
  onApprove,
  onReject,
}: {
  po: PurchaseOrder;
  suppliers: Supplier[];
  items: StoreItem[];
  isManager: boolean;
  onBack: () => void;
  onApprove: () => void;
  onReject: (reason: string) => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const supplier = suppliers.find((s) => s.id === po.supplierId);
  const itemName = (id: number) => items.find((i) => i.id === id)?.name ?? "—";
  const total = poTotal(po);

  function confirmReject() {
    if (!reason.trim()) return;
    onReject(reason.trim());
    setRejecting(false);
  }

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-xs font-semibold text-ink-soft hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} /> Back to purchase orders
      </button>

      <Card>
        <CardHeader
          title={po.code}
          action={
            <div className="flex items-center gap-2">
              <Badge tone={statusTone[po.status]}>{STATUS_LABEL[po.status]}</Badge>
              {po.priority !== "NORMAL" && (
                <Badge tone={po.priority === "URGENT" ? "danger" : "warning"}>{po.priority}</Badge>
              )}
              {po.status === "AWAITING_APPROVAL" && isManager && !rejecting && (
                <>
                  <Button onClick={() => setRejecting(true)}>Reject</Button>
                  <Button variant="primary" onClick={onApprove}>
                    Approve
                  </Button>
                </>
              )}
            </div>
          }
        />

        {rejecting && (
          <div className="mb-5 rounded-md border border-danger/25 bg-danger-bg p-3 text-xs">
            <label className="font-semibold text-danger">Reason for rejection *</label>
            <textarea
              autoFocus
              className="mt-1.5 w-full rounded-md border border-danger/40 bg-surface px-2 py-1.5 text-ink"
              placeholder="Tell the store keeper what needs to change before resubmitting…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="mt-2 flex justify-end gap-2">
              <Button onClick={() => { setRejecting(false); setReason(""); }}>Cancel</Button>
              <Button variant="danger" onClick={confirmReject} disabled={!reason.trim()}>
                Confirm rejection
              </Button>
            </div>
          </div>
        )}

        {po.status === "REJECTED" && po.rejectionReason && (
          <div className="mb-5 rounded-md border border-danger/25 bg-danger-bg p-3 text-xs text-danger">
            <strong>Rejected:</strong> {po.rejectionReason}
          </div>
        )}

        <div className="mb-5 grid grid-cols-1 gap-4 border-b border-border pb-5 text-xs sm:grid-cols-3">
          <div>
            <div className="text-ink-faint">Supplier</div>
            <div className="mt-0.5 font-medium text-ink">{supplier?.name ?? "—"}</div>
            <div className="text-ink-faint">{supplier?.contactName} · {supplier?.contactPhone}</div>
          </div>
          <div>
            <div className="text-ink-faint">Delivery address</div>
            <div className="mt-0.5 text-ink">{po.deliveryAddress || "—"}</div>
          </div>
          <div>
            <div className="text-ink-faint">Expected delivery</div>
            <div className="mt-0.5 text-ink">{po.expectedDate || "—"}</div>
          </div>
          <div>
            <div className="text-ink-faint">Raised by</div>
            <div className="mt-0.5 text-ink">{po.raisedBy}</div>
          </div>
          <div>
            <div className="text-ink-faint">Raised at</div>
            <div className="mt-0.5 text-ink">{new Date(po.raisedAt).toLocaleString("en-GB")}</div>
          </div>
          {po.notes && (
            <div className="col-span-3">
              <div className="text-ink-faint">Notes / instructions</div>
              <div className="mt-0.5 text-ink">{po.notes}</div>
            </div>
          )}
        </div>

        <div className="mb-3 text-xs font-bold text-ink">Line items</div>
        <div className="mb-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-ink-soft">
                <th className="pb-2">Item</th>
                <th className="pb-2">Qty ordered</th>
                <th className="pb-2">Unit price</th>
                <th className="pb-2">Line total</th>
              </tr>
            </thead>
            <tbody>
              {po.lineItems.map((li) => (
                <tr key={li.id} className="border-t border-border">
                  <td className="py-2 font-medium text-ink">{itemName(li.itemId)}</td>
                  <td className="py-2 text-ink-soft">
                    {li.qtyOrdered} {li.unit}
                  </td>
                  <td className="py-2 text-ink-soft">{formatCurrency(li.unitPrice)}</td>
                  <td className="py-2 font-semibold text-ink">{formatCurrency(li.qtyOrdered * li.unitPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between rounded-md bg-surface-2 p-3">
          <div className="text-xs text-ink-soft">Total order value</div>
          <span className="text-lg font-bold text-brand">{formatCurrency(total)}</span>
        </div>
      </Card>
    </div>
  );
}

function NewPOForm({
  suppliers,
  items,
  raisedBy,
  onCancel,
  onCreate,
}: {
  suppliers: Supplier[];
  items: { id: number; name: string; useUnit: string }[];
  raisedBy: string;
  onCancel: () => void;
  onCreate: (input: {
    supplierId: number;
    priority: PurchaseOrder["priority"];
    expectedDate: string;
    deliveryAddress: string;
    notes: string;
    lineItems: { itemId: number; qtyOrdered: number; unit: string; unitPrice: number }[];
    raisedBy: string;
  }) => void;
}) {
  const [supplierId, setSupplierId] = useState<number | "">("");
  const [expectedDate, setExpectedDate] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("Victoria Island Branch — 12 Kofo Abayomi St, Lagos");
  const [priority, setPriority] = useState<PurchaseOrder["priority"]>("NORMAL");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);

  function addLine() {
    if (items.length === 0) return;
    const first = items[0];
    setLines((prev) => [...prev, { itemId: first.id, qtyOrdered: "10", unit: first.useUnit, unitPrice: "0" }]);
  }

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  const total = lines.reduce((sum, l) => sum + (Number(l.qtyOrdered) || 0) * (Number(l.unitPrice) || 0), 0);
  const needsApproval = total > PO_APPROVAL_THRESHOLD;
  const canSubmit = supplierId && expectedDate && lines.length > 0;

  function handleSubmit() {
    if (!supplierId) return;
    onCreate({
      supplierId,
      priority,
      expectedDate,
      deliveryAddress,
      notes,
      raisedBy,
      lineItems: lines.map((l) => ({
        itemId: l.itemId,
        qtyOrdered: Number(l.qtyOrdered) || 0,
        unit: l.unit,
        unitPrice: Number(l.unitPrice) || 0,
      })),
    });
  }

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm font-bold text-ink">New purchase order</div>
        <Badge tone="neutral">Draft</Badge>
      </div>

      <div className="mb-5 border-b border-border pb-5">
        <div className="mb-3 text-xs font-bold text-ink">Supplier & delivery information</div>
        <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
          <Field label="Supplier *">
            <Combobox
              placeholder="Select supplier…"
              value={supplierId}
              onChange={setSupplierId}
              options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
            />
          </Field>
          <Field label="Expected delivery date *">
            <input type="date" className={inputCls} value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
          </Field>
          <Field label="Delivery address">
            <input className={inputCls} value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} />
          </Field>
          <Field label="Priority level">
            <select className={inputCls} value={priority} onChange={(e) => setPriority(e.target.value as PurchaseOrder["priority"])}>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent — same day</option>
            </select>
          </Field>
          <div className="col-span-2 space-y-1">
            <label className="font-semibold text-ink-soft">Notes / instructions for supplier</label>
            <textarea
              className={inputCls}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any special delivery instructions, quality requirements or substitution notes…"
            />
          </div>
        </div>
      </div>

      <div className="mb-4">
        <div className="mb-3 text-xs font-bold text-ink">Order line items</div>
        {lines.length > 0 && (
          <div className="mb-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-xs">
              <thead>
                <tr className="text-left text-ink-soft">
                  <th className="pb-2">Item</th>
                  <th className="pb-2">Qty ordered</th>
                  <th className="pb-2">Unit</th>
                  <th className="pb-2">Unit price (₦)</th>
                  <th className="pb-2">Line total</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="py-2 pr-2">
                      <Combobox
                        value={line.itemId}
                        onChange={(itemId) => {
                          const found = items.find((it) => it.id === itemId);
                          updateLine(i, { itemId, unit: found?.useUnit ?? line.unit });
                        }}
                        options={items.map((it) => ({ value: it.id, label: it.name }))}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input type="number" className={inputCls} value={line.qtyOrdered} onChange={(e) => updateLine(i, { qtyOrdered: e.target.value })} />
                    </td>
                    <td className="py-2 pr-2">
                      <input className={inputCls} value={line.unit} onChange={(e) => updateLine(i, { unit: e.target.value })} />
                    </td>
                    <td className="py-2 pr-2">
                      <input type="number" className={inputCls} value={line.unitPrice} onChange={(e) => updateLine(i, { unitPrice: e.target.value })} />
                    </td>
                    <td className="py-2 pr-2 font-semibold text-ink">
                      {formatCurrency((Number(line.qtyOrdered) || 0) * (Number(line.unitPrice) || 0))}
                    </td>
                    <td className="py-2">
                      <Button variant="danger" onClick={() => removeLine(i)}>
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Button onClick={addLine} disabled={items.length === 0}>
          <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Add another item
        </Button>
      </div>

      <div className="mb-4 flex items-center justify-between rounded-md bg-surface-2 p-3">
        <div>
          <div className="text-xs text-ink-soft">Total order value</div>
          <div className="text-[10px] text-ink-faint">{lines.length} line item{lines.length === 1 ? "" : "s"} · VAT not included</div>
        </div>
        <span className="text-xl font-bold text-brand">{formatCurrency(total)}</span>
      </div>

      {needsApproval && (
        <div className="mb-4 rounded-md border border-info/25 bg-info-bg p-3 text-xs text-info">
          <strong>Approval required — Manager.</strong> This PO exceeds {formatCurrency(PO_APPROVAL_THRESHOLD)}. It will wait for
          Manager approval before it's sent to the supplier.
        </div>
      )}

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={handleSubmit} disabled={!canSubmit}>
          {needsApproval ? "Submit for approval" : "Create purchase order"}
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
