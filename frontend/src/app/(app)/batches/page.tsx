"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import type { BatchProduction, InsufficientStockError, QualityCheck } from "@/lib/types";
import { Card, CardHeader, Badge, Button, Spinner, EmptyState } from "@/components/ui";

const qualityTone: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  PASSED: "success",
  CONDITIONAL: "warning",
  FAILED: "danger",
};

export default function BatchesPage() {
  const [batches, setBatches] = useState<BatchProduction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const data = await api.get<{ results?: BatchProduction[] } | BatchProduction[]>("/kitchen/batches/");
      setBatches(Array.isArray(data) ? data : data.results ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load batches.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) return <Spinner />;
  if (error) return <p className="text-sm text-red-600">{error}</p>;

  const active = batches.filter((b) => b.status === "IN_PROGRESS");
  const history = batches.filter((b) => b.status === "COMPLETE");

  return (
    <div className="space-y-4">
      {active.length === 0 && (
        <Card>
          <EmptyState>No batches currently in progress. Start one from the Kitchen Display screen.</EmptyState>
        </Card>
      )}
      {active.map((batch) => (
        <ActiveBatchCard key={batch.id} batch={batch} onComplete={load} />
      ))}

      <Card>
        <CardHeader title="Batch history" />
        {history.length === 0 ? (
          <EmptyState>No completed batches yet.</EmptyState>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="pb-2">Batch ID</th>
                <th className="pb-2">Recipe</th>
                <th className="pb-2">Planned</th>
                <th className="pb-2">Actual</th>
                <th className="pb-2">Quality</th>
                <th className="pb-2">Completed</th>
              </tr>
            </thead>
            <tbody>
              {history.map((b) => (
                <tr key={b.id} className="border-t border-slate-100">
                  <td className="py-2 font-mono text-slate-500">{b.batch_code}</td>
                  <td className="py-2 font-medium text-slate-800">{b.recipe_name}</td>
                  <td className="py-2 text-slate-600">{b.planned_qty}</td>
                  <td className="py-2 text-slate-600">{b.actual_qty}</td>
                  <td className="py-2">
                    <Badge tone={qualityTone[b.quality_check] ?? "neutral"}>{b.quality_check}</Badge>
                  </td>
                  <td className="py-2 text-slate-500">
                    {b.completed_at ? new Date(b.completed_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function ActiveBatchCard({ batch, onComplete }: { batch: BatchProduction; onComplete: () => void }) {
  const [actualQty, setActualQty] = useState(batch.planned_qty);
  const [qualityCheck, setQualityCheck] = useState<QualityCheck>("PASSED");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shortfalls, setShortfalls] = useState<string[] | null>(null);

  async function handleComplete() {
    setSubmitting(true);
    setError(null);
    setShortfalls(null);
    try {
      await api.post(`/kitchen/batches/${batch.id}/complete/`, {
        actual_qty: actualQty,
        quality_check: qualityCheck,
        quality_notes: notes,
      });
      onComplete();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const body = err.body as InsufficientStockError;
        setError(body.detail);
        setShortfalls(body.shortfalls ?? []);
      } else {
        setError(err instanceof ApiError ? err.message : "Failed to complete batch.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader title={`Active batch — ${batch.batch_code} · ${batch.recipe_name}`} action={<Badge tone="warning">In progress</Badge>} />
      <div className="grid grid-cols-3 gap-3 text-xs">
        <div className="space-y-1">
          <label className="font-semibold text-slate-600">Planned quantity</label>
          <input disabled value={batch.planned_qty} className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5" />
        </div>
        <div className="space-y-1">
          <label className="font-semibold text-slate-600">Actual quantity produced</label>
          <input
            type="number"
            value={actualQty}
            onChange={(e) => setActualQty(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5"
          />
        </div>
        <div className="space-y-1">
          <label className="font-semibold text-slate-600">Quality check</label>
          <select
            value={qualityCheck}
            onChange={(e) => setQualityCheck(e.target.value as QualityCheck)}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5"
          >
            <option value="PASSED">Passed</option>
            <option value="CONDITIONAL">Conditional</option>
            <option value="FAILED">Failed</option>
          </select>
        </div>
        <div className="col-span-3 space-y-1">
          <label className="font-semibold text-slate-600">Quality notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5"
            placeholder="Any notes about this batch…"
          />
        </div>
      </div>
      <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-800">
        On confirmation, ingredients will be deducted from kitchen stock in one atomic transaction.
      </div>
      {error && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
          <p className="font-semibold">{error}</p>
          {shortfalls && shortfalls.length > 0 && (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
              {shortfalls.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          )}
          {shortfalls && shortfalls.length > 0 && (
            <Link href="/requests" className="mt-2 inline-block font-semibold text-red-800 hover:underline">
              Raise a stock request →
            </Link>
          )}
        </div>
      )}
      <div className="mt-3 flex justify-end">
        <Button variant="primary" onClick={handleComplete} disabled={submitting}>
          {submitting ? "Confirming…" : "Confirm batch complete"}
        </Button>
      </div>
    </Card>
  );
}
