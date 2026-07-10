"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CircleCheck, Info, X, type LucideIcon } from "lucide-react";

type ToastTone = "info" | "warning" | "danger" | "success";

interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  message?: string;
  href?: string;
}

interface ToastContextValue {
  pushToast: (toast: Omit<Toast, "id">) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_DURATION_MS = 8000;

const toneStyles: Record<ToastTone, { border: string; icon: LucideIcon; iconText: string }> = {
  info: { border: "border-info", icon: Info, iconText: "text-info" },
  warning: { border: "border-warning", icon: AlertTriangle, iconText: "text-warning" },
  danger: { border: "border-danger", icon: AlertTriangle, iconText: "text-danger" },
  success: { border: "border-brand", icon: CircleCheck, iconText: "text-brand" },
};

let nextToastId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const pushToast = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = nextToastId++;
      setToasts((prev) => [...prev, { ...toast, id }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), TOAST_DURATION_MS)
      );
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ pushToast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2.5">
        {toasts.map((t) => {
          const { border, icon: Icon, iconText } = toneStyles[t.tone];
          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-start gap-2.5 rounded-xl border-l-4 ${border} bg-surface p-3.5 text-ink shadow-lg motion-safe:animate-[toast-in_0.2s_ease-out]`}
            >
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconText}`} strokeWidth={2.25} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{t.title}</div>
                {t.message && <div className="mt-0.5 text-xs text-ink-soft">{t.message}</div>}
                {t.href && (
                  <Link
                    href={t.href}
                    onClick={() => dismiss(t.id)}
                    className="mt-1.5 inline-block text-xs font-semibold text-brand hover:underline"
                  >
                    View →
                  </Link>
                )}
              </div>
              <button onClick={() => dismiss(t.id)} title="Dismiss" className="text-ink-faint transition hover:text-ink">
                <X className="h-3.5 w-3.5" strokeWidth={2.25} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
