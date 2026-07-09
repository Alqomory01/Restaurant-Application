import { ReactNode } from "react";
import { Lock, type LucideIcon } from "lucide-react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-border bg-surface p-4 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-sm font-bold text-ink">{title}</h2>
      {action}
    </div>
  );
}

const badgeStyles: Record<string, string> = {
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  danger: "bg-danger-bg text-danger",
  info: "bg-info-bg text-info",
  neutral: "bg-surface-2 text-ink-soft",
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
    default: "border border-border-2 bg-surface text-ink hover:bg-surface-2",
    primary: "border border-brand bg-brand text-white hover:bg-brand-dark",
    danger: "border border-danger/25 bg-danger-bg text-danger hover:bg-danger/15",
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
  success: { text: "text-success", iconBg: "bg-success-bg", iconText: "text-success" },
  warning: { text: "text-warning", iconBg: "bg-warning-bg", iconText: "text-warning" },
  danger: { text: "text-danger", iconBg: "bg-danger-bg", iconText: "text-danger" },
  neutral: { text: "text-ink", iconBg: "bg-surface-2", iconText: "text-ink-soft" },
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
        <div className="text-xs font-medium text-ink-soft">{label}</div>
        {Icon && (
          <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${t.iconBg}`}>
            <Icon className={`h-3.5 w-3.5 ${t.iconText}`} strokeWidth={2.25} />
          </div>
        )}
      </div>
      <div className={`mt-2 text-2xl font-bold ${t.text}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-ink-faint">{sub}</div>}
    </Card>
  );
}

export function LockedTile({ label, hint }: { label: string; hint: string }) {
  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none select-none blur-sm">
        <div className="text-xs font-medium text-ink-soft">{label}</div>
        <div className="mt-2 text-2xl font-bold text-ink">••.•%</div>
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-surface/70">
        <Lock className="h-4 w-4 text-ink-faint" strokeWidth={2} />
        <span className="text-center text-[11px] text-ink-soft">{hint}</span>
      </div>
    </Card>
  );
}

export function EmptyState({ children, icon: Icon }: { children: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-ink-faint">
      {Icon && <Icon className="h-6 w-6 text-ink-faint" strokeWidth={1.75} />}
      {children}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center py-10">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-brand" />
    </div>
  );
}
