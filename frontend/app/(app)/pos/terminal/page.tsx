"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Ban,
  Banknote,
  CreditCard,
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
  Wifi,
  X,
} from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { usePos, type NewLineInput } from "@/lib/pos/PosContext";
import {
  computeOrderTotals,
  counterAvailability,
  type MenuItem,
  type Order,
  type PaymentMethod,
  type SelectedModifier,
} from "@/lib/pos/types";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { NumPad } from "@/components/pos/NumPad";
import { SupervisorPinModal } from "@/components/pos/SupervisorPinModal";

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
const QUICK_COUNTERS = ["Table 1", "Table 2", "Table 3", "Table 4", "Counter", "Takeaway"];
const DISCOUNT_CODES: Record<string, number> = { STAFF10: 10, PROMO20: 20, VIP50: 50 };
const VOID_CART_REASONS = ["Wrong item added", "Customer changed mind", "Duplicate order", "System error", "Price dispute"];

export default function TerminalPage() {
  const { menuItems, activeShift, orders, payments, createOrder, addLine, setDiscount, chargeOrder, voidOrder, voidNewOrder } = usePos();

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

  const [discountModalOpen, setDiscountModalOpen] = useState(false);
  const [discountCode, setDiscountCode] = useState("");
  const [discountCodeError, setDiscountCodeError] = useState(false);
  const [staffPinOpen, setStaffPinOpen] = useState(false);

  const [voidCartModalOpen, setVoidCartModalOpen] = useState(false);
  const [voidCartReason, setVoidCartReason] = useState("");
  const [voidingCart, setVoidingCart] = useState(false);

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

  const cashierName = activeShift.cashierName;
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

  function handleQuickAdd(e: React.MouseEvent, item: MenuItem) {
    e.stopPropagation();
    if (counterAvailability(item) === "SOLD_OUT") return;
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

  async function backToOrder() {
    if (pendingOrderId) {
      await voidOrder(pendingOrderId, "Cancelled before payment", cashierName);
    }
    setPendingOrderId(null);
    setStep("order");
  }

  // The cart is cleared the moment payment succeeds (not when the receipt
  // modal is later dismissed) — matches a real terminal, and means the
  // menu/cart underneath the receipt modal is already reset for the next
  // customer, not showing stale sold items.
  function finishPayment() {
    setCart([]);
    setTableNumber("");
    setDiscountPct(0);
    setDiscountReason("");
    setStep("receipt");
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
      finishPayment();
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
      finishPayment();
    } finally {
      setSubmitting(false);
    }
  }

  function resetTerminal() {
    setPendingOrderId(null);
    setStep("order");
  }

  function applyDiscount(pct: number, reason: string) {
    setDiscountPct(pct);
    setDiscountReason(reason);
    setDiscountModalOpen(false);
    setDiscountCode("");
    setDiscountCodeError(false);
  }

  function applyDiscountCode() {
    const pct = DISCOUNT_CODES[discountCode.trim().toUpperCase()];
    if (!pct) {
      setDiscountCodeError(true);
      return;
    }
    applyDiscount(pct, discountCode.trim().toUpperCase());
  }

  function clearDiscount() {
    setDiscountPct(0);
    setDiscountReason("");
  }

  async function confirmVoidCart() {
    if (!voidCartReason || cart.length === 0) return;
    setVoidingCart(true);
    try {
      const lines: NewLineInput[] = cart.map((line) => {
        const item = menuItems.find((m) => m.id === line.menuItemId);
        return {
          menuItemId: line.menuItemId,
          qty: line.qty,
          unitPrice: effectiveUnitPrice(line, item),
          selectedModifiers: line.selectedModifiers,
          note: line.note,
          isComplimentary: line.isComplimentary,
          complimentaryReason: line.isComplimentary ? line.complimentaryReason : null,
        };
      });
      await voidNewOrder(tableNumber.trim() || "Unassigned", lines, voidCartReason);
      setCart([]);
      setTableNumber("");
      setDiscountPct(0);
      setDiscountReason("");
      setVoidCartModalOpen(false);
      setVoidCartReason("");
    } finally {
      setVoidingCart(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-3 lg:col-span-2">
        <input
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-ink-faint"
          placeholder="Search menu or scan item barcode…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
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

        <div className="flex items-center gap-2 rounded-md border border-info/25 bg-info-bg px-3 py-2 text-xs text-info">
          <Wifi className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          <strong>Live counter availability active</strong> — items update in real time from Kitchen production.
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {visibleItems.map((item) => {
            const status = counterAvailability(item);
            const { price, tag } = resolveBasePrice(item);
            return (
              <div
                key={item.id}
                role="button"
                tabIndex={status === "SOLD_OUT" ? -1 : 0}
                onClick={() => handleTapItem(item)}
                onKeyDown={(e) => e.key === "Enter" && handleTapItem(item)}
                className={`relative flex flex-col items-start gap-1 rounded-xl border-2 bg-surface p-3.5 text-left transition ${statusStyles[status]}`}
              >
                <div className="flex w-full items-start justify-between">
                  <span className="text-3xl">{item.emoji}</span>
                  {status === "LOW" && <Badge tone="warning">Low</Badge>}
                  {status === "SOLD_OUT" && <Badge tone="danger">Sold out</Badge>}
                </div>
                <div className="text-sm font-bold text-ink">{item.name}</div>
                {item.description && <div className="text-[11px] leading-tight text-ink-faint">{item.description}</div>}
                {item.combo && <div className="text-[10px] text-ink-faint">Combo · {item.combo.itemIds.length} items</div>}
                {item.allergens.length > 0 && (
                  <span className="rounded bg-warning-bg px-1.5 py-0.5 text-[10px] font-medium text-warning">{item.allergens[0]}</span>
                )}
                <div className="mt-auto flex w-full items-center justify-between pt-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-brand">{formatCurrency(price)}</span>
                    {tag && <Badge tone="info">{tag}</Badge>}
                  </div>
                  {status !== "SOLD_OUT" && (
                    <button
                      onClick={(e) => handleQuickAdd(e, item)}
                      title="Quick add (no customization)"
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand text-white transition hover:bg-brand-dark"
                    >
                      <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                    </button>
                  )}
                </div>
              </div>
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
          <div className="mb-2 space-y-1.5">
            <label className="text-xs font-semibold text-ink-soft">Table / Counter number *</label>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_COUNTERS.map((c) => (
                <button
                  key={c}
                  onClick={() => setTableNumber(c)}
                  className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition ${
                    tableNumber === c ? "border-brand bg-brand-light text-brand" : "border-border-2 text-ink-soft hover:bg-surface-2"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <input
              className="w-full rounded-md border border-border-2 px-2 py-1.5 text-sm"
              placeholder="Or type a custom table / counter"
              value={tableNumber}
              onChange={(e) => setTableNumber(e.target.value)}
            />
          </div>

          {cart.length === 0 ? (
            <EmptyState>Cart is empty — tap a menu item to add it.</EmptyState>
          ) : (
            <div className="max-h-[40vh] space-y-2.5 overflow-y-auto py-1">
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
              <div className="mt-2 border-t border-border pt-2.5 text-xs">
                {discountPct > 0 ? (
                  <div className="flex items-center justify-between rounded-md bg-success-bg px-2.5 py-1.5 text-success">
                    <span className="font-semibold">{discountPct}% off — {discountReason}</span>
                    <button onClick={clearDiscount} className="text-success hover:text-danger">
                      <X className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDiscountModalOpen(true)}
                    className="flex items-center gap-1.5 font-semibold text-ink-soft hover:text-brand"
                  >
                    <Percent className="h-3.5 w-3.5" strokeWidth={2} /> Apply discount
                  </button>
                )}
              </div>

              <div className="mt-2.5 space-y-1 border-t border-border pt-2.5 text-xs">
                <div className="flex justify-between text-ink-soft"><span>Subtotal</span><span>{formatCurrency(cartTotals.subtotal)}</span></div>
                {cartTotals.discountTotal > 0 && <div className="flex justify-between text-success"><span>Discount</span><span>-{formatCurrency(cartTotals.discountTotal)}</span></div>}
                <div className="flex justify-between text-ink-soft"><span>VAT</span><span>{formatCurrency(cartTotals.taxTotal)}</span></div>
                <div className="flex justify-between text-base font-bold text-ink"><span>Total</span><span>{formatCurrency(cartTotals.total)}</span></div>
              </div>

              <div className="mt-3 flex gap-2">
                <Button variant="danger" onClick={() => setVoidCartModalOpen(true)} title="Void this order">
                  <Ban className="h-3.5 w-3.5" strokeWidth={2} /> Void
                </Button>
                <Button
                  variant="primary"
                  size="lg"
                  className="flex-1 justify-center"
                  onClick={handleCharge}
                  disabled={submitting || !tableNumber.trim() || (discountPct > 0 && !discountReason.trim())}
                >
                  Charge {formatCurrency(cartTotals.total)}
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>

      {/* ---- MODIFIER MODAL ---- */}
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

      {/* ---- DISCOUNT MODAL ---- */}
      {discountModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => setDiscountModalOpen(false)}>
          <Card className="w-full max-w-xs">
            <div onClick={(e) => e.stopPropagation()}>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-sm font-bold text-ink">
                  <Percent className="h-4 w-4 text-brand" strokeWidth={2} /> Apply discount
                </div>
                <button onClick={() => setDiscountModalOpen(false)} className="text-ink-faint hover:text-ink">
                  <X className="h-4 w-4" strokeWidth={2} />
                </button>
              </div>
              <div className="space-y-2.5 text-xs">
                <div className="flex gap-1.5">
                  <input
                    className="flex-1 rounded-md border border-border-2 px-2 py-1.5"
                    placeholder="Discount code, e.g. PROMO20"
                    value={discountCode}
                    onChange={(e) => { setDiscountCode(e.target.value); setDiscountCodeError(false); }}
                  />
                  <Button onClick={applyDiscountCode}>Apply</Button>
                </div>
                {discountCodeError && <p className="text-danger">Invalid discount code.</p>}
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  <button onClick={() => applyDiscount(10, "10% off")} className="rounded-md border border-border-2 bg-surface-2 py-2 font-semibold text-ink-soft hover:bg-surface">10% off</button>
                  <button onClick={() => applyDiscount(20, "20% off")} className="rounded-md border border-border-2 bg-surface-2 py-2 font-semibold text-ink-soft hover:bg-surface">20% off</button>
                  <button onClick={() => applyDiscount(50, "50% off")} className="rounded-md border border-border-2 bg-surface-2 py-2 font-semibold text-ink-soft hover:bg-surface">50% off</button>
                  <button onClick={() => setStaffPinOpen(true)} className="rounded-md border border-border-2 bg-surface-2 py-2 font-semibold text-brand hover:bg-surface">Staff (100%)</button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
      {staffPinOpen && (
        <SupervisorPinModal
          reason="Staff (100%) discount requires supervisor authorization."
          onSuccess={(supervisorName) => { setStaffPinOpen(false); applyDiscount(100, `Staff discount — authorized by ${supervisorName}`); }}
          onCancel={() => setStaffPinOpen(false)}
        />
      )}

      {/* ---- VOID CART MODAL ---- */}
      {voidCartModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => setVoidCartModalOpen(false)}>
          <Card className="w-full max-w-sm">
            <div onClick={(e) => e.stopPropagation()}>
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-bold text-ink">Void order</div>
                <button onClick={() => setVoidCartModalOpen(false)} className="text-ink-faint hover:text-ink">
                  <X className="h-4 w-4" strokeWidth={2} />
                </button>
              </div>
              <div className="mb-3 flex items-start gap-2 rounded-md bg-danger-bg p-2.5 text-xs text-danger">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                <span>Voided orders are permanently logged and cannot be deleted. This will be recorded against your session.</span>
              </div>
              <div className="mb-3 space-y-1.5">
                {VOID_CART_REASONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => setVoidCartReason(r)}
                    className={`w-full rounded-md border px-3 py-2 text-left text-xs font-medium transition ${
                      voidCartReason === r ? "border-danger bg-danger-bg text-danger" : "border-border text-ink-soft hover:bg-surface-2"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button className="flex-1 justify-center" onClick={() => setVoidCartModalOpen(false)}>Cancel</Button>
                <Button variant="danger" className="flex-1 justify-center" onClick={confirmVoidCart} disabled={!voidCartReason || voidingCart}>
                  {voidingCart ? "Voiding…" : "Void order"}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ---- PAYMENT MODAL ---- */}
      {step === "pay" && pendingOrder && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            {(() => {
              const totals = computeOrderTotals(pendingOrder);
              const splitAssigned = legs.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
              const splitRemaining = Math.round((totals.total - splitAssigned) * 100) / 100;
              return (
                <>
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <div className="text-xs text-ink-faint">{pendingOrder.code} · Table/Counter {pendingOrder.tableOrCounterNumber}</div>
                      <div className="text-2xl font-bold text-ink">{formatCurrency(totals.total)}</div>
                    </div>
                    <Button onClick={backToOrder} disabled={submitting}>
                      <X className="h-3.5 w-3.5" strokeWidth={2} /> Back to order
                    </Button>
                  </div>

                  <div className="mb-4 grid grid-cols-5 gap-1.5">
                    {(["CASH", "CARD", "MOBILE_TRANSFER", "VOUCHER"] as PaymentMethod[]).map((m) => {
                      const Icon = methodIcon[m];
                      return (
                        <button
                          key={m}
                          onClick={() => setPayMethod(m)}
                          className={`flex flex-col items-center gap-1 rounded-xl border-2 py-3 text-[11px] font-semibold transition ${
                            payMethod === m ? "border-brand bg-brand-light text-brand" : "border-border text-ink-soft hover:bg-surface-2"
                          }`}
                        >
                          <Icon className="h-4 w-4" strokeWidth={2} />
                          {methodLabel[m]}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => setPayMethod("SPLIT")}
                      className={`flex flex-col items-center gap-1 rounded-xl border-2 py-3 text-[11px] font-semibold transition ${
                        payMethod === "SPLIT" ? "border-brand bg-brand-light text-brand" : "border-border text-ink-soft hover:bg-surface-2"
                      }`}
                    >
                      <Split className="h-4 w-4" strokeWidth={2} />
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
                      <div className="rounded-md border-2 border-brand bg-surface-2 px-3 py-2.5 text-right text-lg font-bold text-ink">
                        {cashTendered ? formatCurrency(Number(cashTendered)) : "Enter amount tendered"}
                      </div>
                      {Number(cashTendered) > totals.total && (
                        <div className="rounded-md bg-success-bg p-3 text-sm font-semibold text-success">
                          Change due: {formatCurrency(Number(cashTendered) - totals.total)}
                        </div>
                      )}
                      <NumPad value={cashTendered} onChange={setCashTendered} maxLength={9} />
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
                </>
              );
            })()}
          </Card>
        </div>
      )}

      {/* ---- RECEIPT MODAL ---- */}
      {step === "receipt" && pendingOrder && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            {(() => {
              const totals = computeOrderTotals(pendingOrder);
              return (
                <>
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
                </>
              );
            })()}
          </Card>
        </div>
      )}
    </div>
  );
}
