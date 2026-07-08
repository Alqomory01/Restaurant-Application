import { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-sm font-bold text-slate-900">{title}</h2>
      {action}
    </div>
  );
}

const badgeStyles: Record<string, string> = {
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-red-700",
  info: "bg-blue-50 text-blue-700",
  neutral: "bg-slate-100 text-slate-600",
};

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: keyof typeof badgeStyles;
  children: ReactNode;
}) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeStyles[tone]}`}>
      {children}
    </span>
  );
}

export function Button({
  children,
  variant = "default",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "primary" | "danger" }) {
  const variants: Record<string, string> = {
    default: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
    primary: "border border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800",
    danger: "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
  };
  return (
    <button
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function KpiTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  tone?: "success" | "warning" | "danger";
}) {
  const toneColor = tone === "success" ? "text-emerald-700" : tone === "warning" ? "text-amber-700" : tone === "danger" ? "text-red-700" : "text-slate-900";
  return (
    <Card>
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${toneColor}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-400">{sub}</div>}
    </Card>
  );
}

export function LockedTile({ label, hint }: { label: string; hint: string }) {
  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none select-none blur-sm">
        <div className="text-xs font-medium text-slate-500">{label}</div>
        <div className="mt-1 text-2xl font-bold text-slate-900">••.•%</div>
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-white/60">
        <span className="text-lg">🔒</span>
        <span className="text-center text-[11px] text-slate-500">{hint}</span>
      </div>
    </Card>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="py-10 text-center text-sm text-slate-400">{children}</div>;
}

export function Spinner() {
  return (
    <div className="flex justify-center py-10">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-emerald-700" />
    </div>
  );
}
