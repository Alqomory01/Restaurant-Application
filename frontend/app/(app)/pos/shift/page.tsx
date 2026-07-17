"use client";

import { useState } from "react";
import { Delete, KeyRound, LogOut, ShieldCheck } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { usePos } from "@/lib/pos/PosContext";
import { STANDARD_OPENING_FLOAT, type CashierProfile } from "@/lib/pos/types";
import { Badge, Button, Card, CardHeader } from "@/components/ui";

const PIN_DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"];

function PinPad({ pin, onDigit, onBack, onClear }: { pin: string; onDigit: (d: string) => void; onBack: () => void; onClear: () => void }) {
  return (
    <div className="mx-auto w-full max-w-xs space-y-4">
      <div className="flex justify-center gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-4 w-4 rounded-full border-2 ${i < pin.length ? "border-brand bg-brand" : "border-border-2"}`}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {PIN_DIGITS.map((d) => {
          if (d === "clear") {
            return (
              <button
                key={d}
                onClick={onClear}
                className="rounded-xl border border-border-2 bg-surface py-4 text-xs font-semibold text-ink-soft transition hover:bg-surface-2"
              >
                Clear
              </button>
            );
          }
          if (d === "back") {
            return (
              <button
                key={d}
                onClick={onBack}
                className="flex items-center justify-center rounded-xl border border-border-2 bg-surface py-4 text-ink-soft transition hover:bg-surface-2"
              >
                <Delete className="h-4 w-4" strokeWidth={2} />
              </button>
            );
          }
          return (
            <button
              key={d}
              onClick={() => onDigit(d)}
              className="rounded-xl border border-border-2 bg-surface py-4 text-xl font-bold text-ink transition hover:bg-surface-2 active:bg-brand-light"
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function ShiftPage() {
  const { cashiers, activeShift, openShift, closeShift, orders, payments } = usePos();
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [identified, setIdentified] = useState<CashierProfile | null>(null);
  const [openingFloat, setOpeningFloat] = useState(String(STANDARD_OPENING_FLOAT));
  const [opening, setOpening] = useState(false);
  const [closingCash, setClosingCash] = useState("");
  const [closing, setClosing] = useState(false);
  const [closedSummary, setClosedSummary] = useState<Awaited<ReturnType<typeof closeShift>> | null>(null);

  function handleDigit(d: string) {
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    setPinError(null);
    if (next.length === 4) {
      const match = cashiers.find((c) => c.pin === next);
      if (match) {
        setIdentified(match);
      } else {
        setPinError("PIN not recognized");
        setTimeout(() => setPin(""), 500);
      }
    }
  }

  async function handleOpenShift() {
    if (!identified) return;
    setOpening(true);
    try {
      await openShift(identified.id, Number(openingFloat));
    } finally {
      setOpening(false);
    }
  }

  async function handleCloseShift() {
    if (!activeShift || !closingCash) return;
    setClosing(true);
    try {
      const summary = await closeShift(activeShift.id, Number(closingCash));
      setClosedSummary(summary);
    } finally {
      setClosing(false);
    }
  }

  if (closedSummary) {
    const isVariance = closedSummary.cashVariance != null && Math.abs(closedSummary.cashVariance) > 0.01;
    return (
      <div className="mx-auto max-w-md">
        <Card>
          <CardHeader title="Shift closed" action={<Badge tone="success">Summary</Badge>} />
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-ink-soft">Cashier</span><span className="font-semibold text-ink">{closedSummary.cashierName}</span></div>
            <div className="flex justify-between"><span className="text-ink-soft">Opening float</span><span className="text-ink">{formatCurrency(closedSummary.openingFloat)}</span></div>
            <div className="flex justify-between"><span className="text-ink-soft">Expected cash at close</span><span className="text-ink">{formatCurrency(closedSummary.expectedCashAtClose)}</span></div>
            <div className="flex justify-between"><span className="text-ink-soft">Counted cash</span><span className="text-ink">{formatCurrency(closedSummary.closingCashCounted)}</span></div>
            <div className="flex justify-between border-t border-border pt-3">
              <span className="font-semibold text-ink-soft">Variance</span>
              <span className={`font-bold ${!isVariance ? "text-success" : closedSummary.cashVariance! < 0 ? "text-danger" : "text-warning"}`}>
                {closedSummary.cashVariance! > 0 ? "+" : ""}{formatCurrency(closedSummary.cashVariance)}
              </span>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button
              variant="primary"
              className="w-full justify-center"
              onClick={() => {
                setClosedSummary(null);
                setIdentified(null);
                setPin("");
                setClosingCash("");
              }}
            >
              Start next shift
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (activeShift) {
    const shiftOrders = orders.filter((o) => o.shiftId === activeShift.id);
    const paidShiftOrders = shiftOrders.filter((o) => o.status === "PAID");
    const shiftPayments = payments.filter((p) => paidShiftOrders.some((o) => o.id === p.orderId));
    const salesTotal = shiftPayments.reduce((sum, p) => sum + p.amount, 0);
    const paidCount = shiftOrders.filter((o) => o.status === "PAID").length;
    const voidCount = shiftOrders.filter((o) => o.status === "VOIDED").length;

    return (
      <div className="mx-auto max-w-md space-y-4">
        <Card>
          <CardHeader title={`Shift open — ${activeShift.cashierName}`} action={<Badge tone="success">Active</Badge>} />
          <div className="space-y-2.5 text-sm">
            <div className="flex justify-between"><span className="text-ink-soft">Opened</span><span className="text-ink">{new Date(activeShift.openedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span></div>
            <div className="flex justify-between"><span className="text-ink-soft">Opening float</span><span className="text-ink">{formatCurrency(activeShift.openingFloat)}</span></div>
            <div className="flex justify-between"><span className="text-ink-soft">Orders this shift</span><span className="text-ink">{paidCount} paid{voidCount > 0 ? `, ${voidCount} voided` : ""}</span></div>
            <div className="flex justify-between border-t border-border pt-2.5"><span className="font-semibold text-ink-soft">Sales so far</span><span className="font-bold text-brand">{formatCurrency(salesTotal)}</span></div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Close shift" />
          <div className="space-y-3 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-ink-soft">Physical cash counted in drawer *</label>
              <input
                type="number"
                className="w-full rounded-md border border-border-2 px-2 py-1.5 text-sm"
                value={closingCash}
                onChange={(e) => setClosingCash(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <Button
              variant="danger"
              className="w-full justify-center"
              onClick={handleCloseShift}
              disabled={!closingCash || closing}
            >
              <LogOut className="h-3.5 w-3.5" strokeWidth={2} />
              {closing ? "Closing…" : "Close shift & generate summary"}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (identified) {
    return (
      <div className="mx-auto max-w-md">
        <Card>
          <CardHeader title={`Welcome, ${identified.name}`} action={<Badge tone="neutral">{identified.role === "FOH_SUPERVISOR" ? "FOH Supervisor" : "Cashier"}</Badge>} />
          <div className="space-y-3 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-ink-soft">Opening float — cash counted in drawer *</label>
              <input
                type="number"
                className="w-full rounded-md border border-border-2 px-2 py-1.5 text-sm"
                value={openingFloat}
                onChange={(e) => setOpeningFloat(e.target.value)}
              />
              <p className="text-ink-faint">Standard float is {formatCurrency(STANDARD_OPENING_FLOAT)} — a different count is flagged for supervisor acknowledgement, not blocked.</p>
            </div>
            <Button variant="primary" className="w-full justify-center" onClick={handleOpenShift} disabled={opening}>
              <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2} />
              {opening ? "Opening…" : "Open shift"}
            </Button>
            <button onClick={() => { setIdentified(null); setPin(""); }} className="w-full text-center text-ink-faint hover:underline">
              Not you? Switch operator
            </button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 py-6">
      <div className="flex items-center gap-2 text-ink-soft">
        <KeyRound className="h-4 w-4" strokeWidth={2} />
        <span className="text-sm font-semibold">Enter your PIN to start a shift</span>
      </div>
      {pinError && <p className="text-xs font-semibold text-danger">{pinError}</p>}
      <PinPad
        pin={pin}
        onDigit={handleDigit}
        onBack={() => setPin((p) => p.slice(0, -1))}
        onClear={() => { setPin(""); setPinError(null); }}
      />
      <p className="text-xs text-ink-faint">Demo PINs — Ngozi Bello 1234 · Emeka Chukwu 5678 · Grace Adigwe (FOH Supervisor) 9999</p>
    </div>
  );
}
