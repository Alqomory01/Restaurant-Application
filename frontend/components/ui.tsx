import { ReactNode } from "react";
import { Lock, type LucideIcon } from "lucide-react";

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

const kpiToneStyles: Record<string, { text: string; iconBg: string; iconText: string }> = {
  success: { text: "text-emerald-700", iconBg: "bg-emerald-50", iconText: "text-emerald-600" },
  warning: { text: "text-amber-700", iconBg: "bg-amber-50", iconText: "text-amber-600" },
  danger: { text: "text-red-700", iconBg: "bg-red-50", iconText: "text-red-600" },
  neutral: { text: "text-slate-900", iconBg: "bg-slate-100", iconText: "text-slate-500" },
};

export function KpiTile({
  label,
  value,
  sub,
  tone = "neutral",
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  tone?: "success" | "warning" | "danger" | "neutral";
  icon?: LucideIcon;
}) {
  const t = kpiToneStyles[tone];
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div className="text-xs font-medium text-slate-500">{label}</div>
        {Icon && (
          <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${t.iconBg}`}>
            <Icon className={`h-3.5 w-3.5 ${t.iconText}`} strokeWidth={2.25} />
          </div>
        )}
      </div>
      <div className={`mt-2 text-2xl font-bold ${t.text}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-400">{sub}</div>}
    </Card>
  );
}

export function LockedTile({ label, hint }: { label: string; hint: string }) {
  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none select-none blur-sm">
        <div className="text-xs font-medium text-slate-500">{label}</div>
        <div className="mt-2 text-2xl font-bold text-slate-900">••.•%</div>
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-white/70">
        <Lock className="h-4 w-4 text-slate-400" strokeWidth={2} />
        <span className="text-center text-[11px] text-slate-500">{hint}</span>
      </div>
    </Card>
  );
}

export function EmptyState({ children, icon: Icon }: { children: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-slate-400">
      {Icon && <Icon className="h-6 w-6 text-slate-300" strokeWidth={1.75} />}
      {children}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center py-10">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-emerald-700" />
    </div>
  );
}
