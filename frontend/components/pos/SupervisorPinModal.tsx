"use client";

import { useState } from "react";
import { ShieldAlert, X } from "lucide-react";
import { usePos } from "@/lib/pos/PosContext";
import { Card } from "@/components/ui";
import { NumPad } from "./NumPad";

/** Reusable supervisor-authorization gate — checks a 4-digit PIN against
 * any CashierProfile with role FOH_SUPERVISOR (real Django Cashier/FOH
 * Supervisor roles don't exist yet; see lib/pos/API_CONTRACT.md). Used
 * anywhere the spec requires supervisor sign-off: voiding an already-PAID
 * order, a refund above threshold, the largest discount preset. */
export function SupervisorPinModal({
  reason,
  onSuccess,
  onCancel,
}: {
  reason: string;
  onSuccess: (supervisorName: string) => void;
  onCancel: () => void;
}) {
  const { cashiers } = usePos();
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  function handleChange(next: string) {
    if (next.length > 4) return;
    setPin(next);
    setError(false);
    if (next.length === 4) {
      const supervisor = cashiers.find((c) => c.role === "FOH_SUPERVISOR" && c.pin === next);
      if (supervisor) {
        onSuccess(supervisor.name);
      } else {
        setError(true);
        setTimeout(() => setPin(""), 500);
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <Card className="w-full max-w-xs" >
        <div onClick={(e) => e.stopPropagation()}>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-sm font-bold text-warning">
              <ShieldAlert className="h-4 w-4" strokeWidth={2} /> Supervisor PIN required
            </div>
            <button onClick={onCancel} className="text-ink-faint hover:text-ink">
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
          <p className="mb-4 text-center text-xs text-ink-soft">{reason}</p>
          <div className="mb-4 flex justify-center gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`h-3.5 w-3.5 rounded-full border-2 ${i < pin.length ? "border-brand bg-brand" : "border-border-2"}`} />
            ))}
          </div>
          {error && <p className="mb-3 text-center text-xs font-semibold text-danger">PIN not recognized</p>}
          <NumPad value={pin} onChange={handleChange} maxLength={4} showBulkKey={false} />
        </div>
      </Card>
    </div>
  );
}
