"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Banknote,
  CreditCard,
  Landmark,
  Mail,
  MessageSquareText,
  Minus,
  Percent,
  Plus,
  Receipt as ReceiptIcon,
  Smartphone,
  Split,
  Ticket,
  Trash2,
  X,
} from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { usePos } from "@/lib/pos/PosContext";
import {
  computeOrderTotals,
  counterAvailability,
  type MenuItem,
  type Order,
  type PaymentMethod,
  type SelectedModifier,
} from "@/lib/pos/types";
import { Badge, Button, Card, EmptyState } from "@/components/ui";

interface CartLine {
  clientId: number;
  menuItemId: number;
  qty: number;
  unitPrice: number;
  priceTag: string | null;
  selectedModifiers: SelectedModifier[];
  note: string;
  isComplimentary: boolean;
  complimentaryReason: string;
  useStaffMeal: boolean;
}

let nextClientId = 1;

function resolveBasePrice(item: MenuItem): { price: number; tag: string | null } {
  if (item.happyHour) {
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    const [sh, sm] = item.happyHour.startTime.split(":").map(Number);
    const [eh, em] = item.happyHour.endTime.split(":").map(Number);
    if (mins >= sh * 60 + sm && mins < eh * 60 + em) {
      return { price: item.happyHour.price, tag: "Happy hour" };
    }
  }
  return { price: item.sellingPrice, tag: null };
}

function effectiveUnitPrice(line: CartLine, item: MenuItem | undefined): number {
  if (!item) return line.unitPrice;
  if (line.useStaffMeal && item.staffMealPrice != null) return item.staffMealPrice;
  if (item.bulkDiscount && line.qty >= item.bulkDiscount.minQty) {
    return Math.round(line.unitPrice * (1 - item.bulkDiscount.pct / 100) * 100) / 100;
  }
  return line.unitPrice;
}

const statusStyles: Record<string, string> = {
  AVAILABLE: "border-border hover:border-brand",
  LOW: "border-warning/60 hover:border-warning",
  SOLD_OUT: "border-border opacity-45 cursor-not-allowed",
};

const methodIcon: Record<PaymentMethod, typeof Banknote> = {
  CASH: Banknote,
  CARD: CreditCard,
  MOBILE_TRANSFER: Smartphone,
  VOUCHER: Ticket,
};

const methodLabel: Record<PaymentMethod, string> = {
  CASH: "Cash",
  CARD: "Card",
  MOBILE_TRANSFER: "Mobile Transfer",
  VOUCHER: "Voucher",
};

const CASH_QUICK_AMOUNTS = [1000, 2000, 5000, 10000, 20000];

export default function TerminalPage() {
  const { menuItems, activeShift, orders, payments, createOrder, addLine, setDiscount, chargeOrder, voidOrder } = usePos();

  const [cart, setCart] = useState<CartLine[]>([]);
  const [tableNumber, setTableNumber] = useState("");
  const [discountPct, setDiscountPct] = useState(0);
  const [discountReason, setDiscountReason] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [modifierTarget, setModifierTarget] = useState<MenuItem | null>(null);
  const [pendingModifiers, setPendingModifiers] = useState<Record<number, string>>({});
  const [step, setStep] = useState<"order" | "pay" | "receipt">("order");
  const [pendingOrderId, setPendingOrderId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [payMethod, setPayMethod] = useState<PaymentMethod | "SPLIT">("CASH");
  const [cashTendered, setCashTendered] = useState("");
  const [legs, setLegs] = useState<{ method: PaymentMethod; amount: string }[]>([]);

  if (!activeShift) {
    return (
      <EmptyState icon={AlertTriangle}>
        <div className="space-y-2">
          <p>No shift is open on this terminal.</p>
          <Link href="/pos/shift" className="font-semibold text-brand hover:underline">
            Open a shift to start selling →
          </Link>
        </div>
      </EmptyState>
    );
  }

  const pendingOrder: Order | null = orders.find((o) => o.id === pendingOrderId) ?? null;
  const pendingPayments = payments.filter((p) => p.orderId === pendingOrderId);

  const categories = ["All", ...Array.from(new Set(menuItems.filter((i) => i.active).map((i) => i.category)))];
  const visibleItems = menuItems.filter((i) => {
    if (!i.active) return false;
    if (category && category !== "All" && i.category !== category) return false;
    if (search && !i.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const cartOrderLines = cart.map((l) => {
    const item = menuItems.find((m) => m.id === l.menuItemId);
    return {
      id: l.clientId,
      menuItemId: l.menuItemId,
      qty: l.qty,
      unitPrice: effectiveUnitPrice(l, item),
      selectedModifiers: l.selectedModifiers,
      note: l.note,
      isComplimentary: l.isComplimentary,
      complimentaryReason: l.complimentaryReason || null,
    };
  });
  const cartTotals = computeOrderTotals({ lines: cartOrderLines, discountPct });

  function addToCart(item: MenuItem, selectedModifiers: SelectedModifier[]) {
    const { price, tag } = resolveBasePrice(item);
    setCart((prev) => {
      const existingIdx = prev.findIndex(
        (l) =>
          l.menuItemId === item.id &&
          !l.isComplimentary &&
          JSON.stringify(l.selectedModifiers) === JSON.stringify(selectedModifiers)
      );
      if (existingIdx >= 0) {
        const copy = [...prev];
        copy[existingIdx] = { ...copy[existingIdx], qty: copy[existingIdx].qty + 1 };
        return copy;
      }
      return [
        ...prev,
        {
          clientId: nextClientId++,
          menuItemId: item.id,
          qty: 1,
          unitPrice: price,
          priceTag: tag,
          selectedModifiers,
          note: "",
          isComplimentary: false,
          complimentaryReason: "",
          useStaffMeal: false,
        },
      ];
    });
  }

  function handleTapItem(item: MenuItem) {
    if (counterAvailability(item) === "SOLD_OUT") return;
    if (item.modifierGroups.length > 0) {
      setModifierTarget(item);
      setPendingModifiers({});
      return;
    }
    addToCart(item, []);
  }

  function confirmModifiers() {
    if (!modifierTarget) return;
    const selected: SelectedModifier[] = modifierTarget.modifierGroups
      .filter((g) => pendingModifiers[g.id])
      .map((g) => {
        const option = g.options.find((o) => o.label === pendingModifiers[g.id])!;
        return { groupName: g.name, optionLabel: option.label, priceDelta: option.priceDelta };
      });
    addToCart(modifierTarget, selected);
    setModifierTarget(null);
  }

  function patchLine(clientId: number, patch: Partial<CartLine>) {
    setCart((prev) => prev.map((l) => (l.clientId === clientId ? { ...l, ...patch } : l)));
  }

  function removeLine(clientId: number) {
    setCart((prev) => prev.filter((l) => l.clientId !== clientId));
  }

  async function handleCharge() {
    if (!tableNumber.trim() || cart.length === 0) return;
    setSubmitting(true);
    try {
      const order = await createOrder(tableNumber.trim());
      if (discountPct > 0) await setDiscount(order.id, discountPct, discountReason);
      for (const line of cart) {
        const item = menuItems.find((m) => m.id === line.menuItemId);
        await addLine(order.id, {
          menuItemId: line.menuItemId,
          qty: line.qty,
          unitPrice: effectiveUnitPrice(line, item),
          selectedModifiers: line.selectedModifiers,
          note: line.note,
          isComplimentary: line.isComplimentary,
          complimentaryReason: line.isComplimentary ? line.complimentaryReason : null,
        });
      }
      setPendingOrderId(order.id);
      setLegs([]);
      setCashTendered("");
      setPayMethod("CASH");
      setStep("pay");
    } finally {
      setSubmitting(false);
    }
  }

  const cashierName = activeShift.cashierName;

  async function backToOrder() {
    if (pendingOrderId) {
      await voidOrder(pendingOrderId, "Cancelled before payment", cashierName);
    }
    setPendingOrderId(null);
    setStep("order");
  }

  async function confirmSinglePayment() {
    if (!pendingOrder) return;
    const totals = computeOrderTotals(pendingOrder);
    setSubmitting(true);
    try {
      if (payMethod === "CASH") {
        const tendered = Number(cashTendered) || totals.total;
        await chargeOrder(pendingOrder.id, [
          { method: "CASH", amount: totals.total, changeGiven: Math.max(0, tendered - totals.total), reference: "" },
        ]);
      } else {
        await chargeOrder(pendingOrder.id, [
          { method: payMethod as PaymentMethod, amount: totals.total, changeGiven: 0, reference: `${payMethod}-${Date.now()}` },
        ]);
      }
      setStep("receipt");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmSplitPayment() {
    if (!pendingOrder) return;
    setSubmitting(true);
    try {
      await chargeOrder(
        pendingOrder.id,
        legs
          .filter((l) => Number(l.amount) > 0)
          .map((l) => ({ method: l.method, amount: Number(l.amount), changeGiven: 0, reference: `${l.method}-${Date.now()}` }))
      );
      setStep("receipt");
    } finally {
      setSubmitting(false);
    }
  }

  function resetTerminal() {
    setCart([]);
    setTableNumber("");
    setDiscountPct(0);
    setDiscountReason("");
    setPendingOrderId(null);
    setStep("order");
  }

  // ---- PAY STEP ----
  if (step === "pay" && pendingOrder) {
    const totals = computeOrderTotals(pendingOrder);
    const splitAssigned = legs.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
    const splitRemaining = Math.round((totals.total - splitAssigned) * 100) / 100;

    return (
      <div className="mx-auto grid max-w-3xl grid-cols-1 gap-4">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-ink-faint">{pendingOrder.code} · Table/Counter {pendingOrder.tableOrCounterNumber}</div>
              <div className="text-2xl font-bold text-ink">{formatCurrency(totals.total)}</div>
            </div>
            <Button onClick={backToOrder} disabled={submitting}>
              <X className="h-3.5 w-3.5" strokeWidth={2} /> Back to order
            </Button>
          </div>

          <div className="mb-4 grid grid-cols-5 gap-2">
            {(["CASH", "CARD", "MOBILE_TRANSFER", "VOUCHER"] as PaymentMethod[]).map((m) => {
              const Icon = methodIcon[m];
              return (
                <button
                  key={m}
                  onClick={() => setPayMethod(m)}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border-2 py-4 text-xs font-semibold transition ${
                    payMethod === m ? "border-brand bg-brand-light text-brand" : "border-border text-ink-soft hover:bg-surface-2"
                  }`}
                >
                  <Icon className="h-5 w-5" strokeWidth={2} />
                  {methodLabel[m]}
                </button>
              );
            })}
            <button
              onClick={() => setPayMethod("SPLIT")}
              className={`flex flex-col items-center gap-1.5 rounded-xl border-2 py-4 text-xs font-semibold transition ${
                payMethod === "SPLIT" ? "border-brand bg-brand-light text-brand" : "border-border text-ink-soft hover:bg-surface-2"
              }`}
            >
              <Split className="h-5 w-5" strokeWidth={2} />
              Split
            </button>
          </div>

          {payMethod === "CASH" && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {CASH_QUICK_AMOUNTS.filter((a) => a >= totals.total).map((a) => (
                  <Button key={a} onClick={() => setCashTendered(String(a))}>{formatCurrency(a)}</Button>
                ))}
                <Button onClick={() => setCashTendered(String(totals.total))}>Exact</Button>
              </div>
              <input
                type="number"
                className="w-full rounded-md border border-border-2 px-3 py-2 text-lg font-semibold"
                placeholder="Cash tendered"
                value={cashTendered}
                onChange={(e) => setCashTendered(e.target.value)}
              />
              {Number(cashTendered) > totals.total && (
                <div className="rounded-md bg-success-bg p-3 text-sm font-semibold text-success">
                  Change due: {formatCurrency(Number(cashTendered) - totals.total)}
                </div>
              )}
              <Button
                variant="primary"
                size="lg"
                className="w-full justify-center"
                onClick={confirmSinglePayment}
                disabled={submitting || (cashTendered !== "" && Number(cashTendered) < totals.total)}
              >
                Confirm cash payment
              </Button>
            </div>
          )}

          {(payMethod === "CARD" || payMethod === "MOBILE_TRANSFER" || payMethod === "VOUCHER") && (
            <div className="space-y-3">
              <div className="rounded-md bg-surface-2 p-4 text-center text-sm text-ink-soft">
                Present terminal / voucher for {formatCurrency(totals.total)}
              </div>
              <Button variant="primary" size="lg" className="w-full justify-center" onClick={confirmSinglePayment} disabled={submitting}>
                Confirm {methodLabel[payMethod]} payment
              </Button>
            </div>
          )}

          {payMethod === "SPLIT" && (
            <div className="space-y-3">
              {legs.map((leg, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    className="rounded-md border border-border-2 px-2 py-1.5 text-sm"
                    value={leg.method}
                    onChange={(e) => setLegs((prev) => prev.map((l, idx) => (idx === i ? { ...l, method: e.target.value as PaymentMethod } : l)))}
                  >
                    {(["CASH", "CARD", "MOBILE_TRANSFER", "VOUCHER"] as PaymentMethod[]).map((m) => (
                      <option key={m} value={m}>{methodLabel[m]}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    className="flex-1 rounded-md border border-border-2 px-2 py-1.5 text-sm"
                    placeholder="Amount"
                    value={leg.amount}
                    onChange={(e) => setLegs((prev) => prev.map((l, idx) => (idx === i ? { ...l, amount: e.target.value } : l)))}
                  />
                  <button onClick={() => setLegs((prev) => prev.filter((_, idx) => idx !== i))} className="text-ink-faint hover:text-danger">
                    <Trash2 className="h-4 w-4" strokeWidth={2} />
                  </button>
                </div>
              ))}
              <Button onClick={() => setLegs((prev) => [...prev, { method: "CASH", amount: splitRemaining > 0 ? String(splitRemaining) : "" }])}>
                <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Add payment method
              </Button>
              <div className={`rounded-md p-3 text-sm font-semibold ${splitRemaining === 0 ? "bg-success-bg text-success" : "bg-warning-bg text-warning"}`}>
                {splitRemaining === 0 ? "Fully covered" : `${formatCurrency(Math.abs(splitRemaining))} ${splitRemaining > 0 ? "remaining" : "over"}`}
              </div>
              <Button
                variant="primary"
                size="lg"
                className="w-full justify-center"
                onClick={confirmSplitPayment}
                disabled={submitting || splitRemaining !== 0 || legs.length === 0}
              >
                Confirm split payment
              </Button>
            </div>
          )}
        </Card>
      </div>
    );
  }

  // ---- RECEIPT STEP ----
  if (step === "receipt" && pendingOrder) {
    const totals = computeOrderTotals(pendingOrder);
    return (
      <div className="mx-auto max-w-md">
        <Card>
          <div className="mb-4 text-center">
            <ReceiptIcon className="mx-auto mb-2 h-8 w-8 text-brand" strokeWidth={1.75} />
            <div className="text-lg font-bold text-ink">Payment confirmed</div>
            <div className="text-xs text-ink-faint">{pendingOrder.code} · Table/Counter {pendingOrder.tableOrCounterNumber}</div>
          </div>
          <div className="space-y-1.5 border-y border-dashed border-border py-3 text-sm">
            {pendingOrder.lines.map((l) => {
              const item = menuItems.find((m) => m.id === l.menuItemId);
              return (
                <div key={l.id} className="flex justify-between">
                  <span className="text-ink-soft">{l.qty}× {item?.name ?? "Item"}{l.isComplimentary ? " (Comp)" : ""}</span>
                  <span className="text-ink">{formatCurrency(l.isComplimentary ? 0 : (l.unitPrice + l.selectedModifiers.reduce((s, m) => s + m.priceDelta, 0)) * l.qty)}</span>
                </div>
              );
            })}
          </div>
          <div className="space-y-1 py-3 text-sm">
            <div className="flex justify-between text-ink-soft"><span>Subtotal</span><span>{formatCurrency(totals.subtotal)}</span></div>
            {totals.discountTotal > 0 && <div className="flex justify-between text-success"><span>Discount</span><span>-{formatCurrency(totals.discountTotal)}</span></div>}
            <div className="flex justify-between text-ink-soft"><span>VAT</span><span>{formatCurrency(totals.taxTotal)}</span></div>
            <div className="flex justify-between border-t border-border pt-1.5 text-base font-bold text-ink"><span>Total</span><span>{formatCurrency(totals.total)}</span></div>
          </div>
          <div className="space-y-1 border-t border-border pt-3 text-xs text-ink-faint">
            {pendingPayments.map((p) => (
              <div key={p.id} className="flex justify-between">
                <span>{methodLabel[p.method]}</span>
                <span>{formatCurrency(p.amount)}{p.changeGiven > 0 ? ` (change ${formatCurrency(p.changeGiven)})` : ""}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button onClick={() => alert("Mock: receipt emailed to customer.")}>
              <Mail className="h-3.5 w-3.5" strokeWidth={2} /> Email
            </Button>
            <Button onClick={() => alert("Mock: receipt sent via SMS.")}>
              <MessageSquareText className="h-3.5 w-3.5" strokeWidth={2} /> SMS
            </Button>
          </div>
          <Button variant="primary" size="lg" className="mt-2 w-full justify-center" onClick={resetTerminal}>
            New order
          </Button>
        </Card>
      </div>
    );
  }

  // ---- ORDER STEP ----
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-3 lg:col-span-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-ink-faint"
            placeholder="Search menu…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c === "All" ? null : c)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                (category === null && c === "All") || category === c
                  ? "border-brand bg-brand-light text-brand"
                  : "border-border-2 text-ink-soft hover:bg-surface-2"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {visibleItems.map((item) => {
            const status = counterAvailability(item);
            const { price, tag } = resolveBasePrice(item);
            return (
              <button
                key={item.id}
                onClick={() => handleTapItem(item)}
                disabled={status === "SOLD_OUT"}
                className={`flex flex-col items-start gap-1.5 rounded-xl border-2 bg-surface p-3.5 text-left transition ${statusStyles[status]}`}
              >
                <div className="flex w-full items-start justify-between">
                  <span className="text-3xl">{item.emoji}</span>
                  {status === "LOW" && <Badge tone="warning">Low</Badge>}
                  {status === "SOLD_OUT" && <Badge tone="danger">Sold out</Badge>}
                </div>
                <div className="text-sm font-bold text-ink">{item.name}</div>
                {item.combo && <div className="text-[10px] text-ink-faint">Combo · {item.combo.itemIds.length} items</div>}
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-brand">{formatCurrency(price)}</span>
                  {tag && <Badge tone="info">{tag}</Badge>}
                </div>
              </button>
            );
          })}
          {visibleItems.length === 0 && (
            <div className="col-span-full">
              <EmptyState>No menu items match.</EmptyState>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <Card className="flex flex-col">
          <div className="mb-2 space-y-1">
            <label className="text-xs font-semibold text-ink-soft">Table / Counter number *</label>
            <input
              className="w-full rounded-md border border-border-2 px-2 py-1.5 text-sm"
              placeholder="e.g. Table 4 / Counter 2"
              value={tableNumber}
              onChange={(e) => setTableNumber(e.target.value)}
            />
          </div>

          {cart.length === 0 ? (
            <EmptyState>Cart is empty — tap a menu item to add it.</EmptyState>
          ) : (
            <div className="max-h-[46vh] space-y-2.5 overflow-y-auto py-1">
              {cart.map((line) => {
                const item = menuItems.find((m) => m.id === line.menuItemId);
                const unitPrice = effectiveUnitPrice(line, item);
                return (
                  <div key={line.clientId} className="rounded-lg border border-border p-2.5 text-xs">
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-ink">{item?.name}</div>
                        {line.selectedModifiers.length > 0 && (
                          <div className="text-ink-faint">{line.selectedModifiers.map((m) => m.optionLabel).join(", ")}</div>
                        )}
                        {line.useStaffMeal && <Badge tone="info">Staff meal</Badge>}
                        {item?.bulkDiscount && line.qty >= item.bulkDiscount.minQty && <Badge tone="success">Bulk -{item.bulkDiscount.pct}%</Badge>}
                      </div>
                      <button onClick={() => removeLine(line.clientId)} className="shrink-0 text-ink-faint hover:text-danger">
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                    </div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => patchLine(line.clientId, { qty: Math.max(1, line.qty - 1) })}
                          className="flex h-6 w-6 items-center justify-center rounded-md border border-border-2 text-ink-soft hover:bg-surface-2"
                        >
                          <Minus className="h-3 w-3" strokeWidth={2.5} />
                        </button>
                        <span className="w-5 text-center font-semibold text-ink">{line.qty}</span>
                        <button
                          onClick={() => patchLine(line.clientId, { qty: line.qty + 1 })}
                          className="flex h-6 w-6 items-center justify-center rounded-md border border-border-2 text-ink-soft hover:bg-surface-2"
                        >
                          <Plus className="h-3 w-3" strokeWidth={2.5} />
                        </button>
                      </div>
                      <span className="font-bold text-ink">
                        {line.isComplimentary ? "Comp" : formatCurrency((unitPrice + line.selectedModifiers.reduce((s, m) => s + m.priceDelta, 0)) * line.qty)}
                      </span>
                    </div>
                    <input
                      className="w-full rounded border border-border-2 px-1.5 py-1 text-[11px]"
                      placeholder="Note (e.g. no pepper)"
                      value={line.note}
                      onChange={(e) => patchLine(line.clientId, { note: e.target.value })}
                    />
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      {item?.staffMealPrice != null && (
                        <label className="flex items-center gap-1 text-ink-faint">
                          <input type="checkbox" checked={line.useStaffMeal} onChange={(e) => patchLine(line.clientId, { useStaffMeal: e.target.checked })} />
                          Staff meal price
                        </label>
                      )}
                      <label className="flex items-center gap-1 text-ink-faint">
                        <input
                          type="checkbox"
                          checked={line.isComplimentary}
                          onChange={(e) => patchLine(line.clientId, { isComplimentary: e.target.checked })}
                        />
                        Complimentary
                      </label>
                    </div>
                    {line.isComplimentary && (
                      <input
                        className="mt-1.5 w-full rounded border border-border-2 px-1.5 py-1 text-[11px]"
                        placeholder="Reason (required, manager-approved)"
                        value={line.complimentaryReason}
                        onChange={(e) => patchLine(line.clientId, { complimentaryReason: e.target.value })}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {cart.length > 0 && (
            <>
              <div className="mt-2 flex items-center gap-2 border-t border-border pt-2.5 text-xs">
                <Percent className="h-3.5 w-3.5 text-ink-faint" strokeWidth={2} />
                <input
                  type="number"
                  className="w-16 rounded border border-border-2 px-1.5 py-1"
                  placeholder="0"
                  value={discountPct || ""}
                  onChange={(e) => setDiscountPct(Number(e.target.value) || 0)}
                />
                <span className="text-ink-faint">% discount</span>
                {discountPct > 0 && (
                  <input
                    className="flex-1 rounded border border-border-2 px-1.5 py-1"
                    placeholder="Reason / approval"
                    value={discountReason}
                    onChange={(e) => setDiscountReason(e.target.value)}
                  />
                )}
              </div>

              <div className="mt-2.5 space-y-1 border-t border-border pt-2.5 text-xs">
                <div className="flex justify-between text-ink-soft"><span>Subtotal</span><span>{formatCurrency(cartTotals.subtotal)}</span></div>
                {cartTotals.discountTotal > 0 && <div className="flex justify-between text-success"><span>Discount</span><span>-{formatCurrency(cartTotals.discountTotal)}</span></div>}
                <div className="flex justify-between text-ink-soft"><span>VAT</span><span>{formatCurrency(cartTotals.taxTotal)}</span></div>
                <div className="flex justify-between text-base font-bold text-ink"><span>Total</span><span>{formatCurrency(cartTotals.total)}</span></div>
              </div>

              <Button
                variant="primary"
                size="lg"
                className="mt-3 w-full justify-center"
                onClick={handleCharge}
                disabled={submitting || !tableNumber.trim() || (discountPct > 0 && !discountReason.trim())}
              >
                Charge {formatCurrency(cartTotals.total)}
              </Button>
            </>
          )}
        </Card>
      </div>

      {modifierTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => setModifierTarget(null)}>
          <div className="w-full max-w-sm rounded-xl bg-surface p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-bold text-ink">{modifierTarget.name}</div>
              <button onClick={() => setModifierTarget(null)} className="text-ink-faint hover:text-ink">
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
            {modifierTarget.modifierGroups.map((g) => (
              <div key={g.id} className="mb-3">
                <div className="mb-1.5 text-xs font-semibold text-ink-soft">{g.name}</div>
                <div className="flex flex-wrap gap-1.5">
                  {g.options.map((o) => (
                    <button
                      key={o.label}
                      onClick={() => setPendingModifiers((prev) => ({ ...prev, [g.id]: o.label }))}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                        pendingModifiers[g.id] === o.label ? "border-brand bg-brand-light text-brand" : "border-border-2 text-ink-soft hover:bg-surface-2"
                      }`}
                    >
                      {o.label}{o.priceDelta > 0 ? ` (+${formatCurrency(o.priceDelta)})` : ""}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <Button variant="primary" className="mt-2 w-full justify-center" onClick={confirmModifiers}>
              Add to cart
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
