import { ReactNode } from "react";
import { ArrowDown, ArrowUp, Lock, Minus, type LucideIcon } from "lucide-react";

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

const chipToneActive: Record<string, string> = {
  neutral: "border-brand bg-brand-light text-brand",
  danger: "border-danger bg-danger-bg text-danger",
  warning: "border-warning bg-warning-bg text-warning",
};

export function Chip({
  active,
  tone = "neutral",
  onClick,
  children,
}: {
  active?: boolean;
  tone?: "neutral" | "danger" | "warning";
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
        active ? chipToneActive[tone] : "border-border-2 text-ink-soft hover:bg-surface-2"
      }`}
    >
      {children}
    </button>
  );
}

export function Button({
  children,
  variant = "default",
  size = "sm",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "danger";
  /** "lg" is for touch-first contexts (KDS) — bigger hit target, bigger type. */
  size?: "sm" | "lg";
}) {
  const variants: Record<string, string> = {
    default: "border border-border-2 bg-surface text-ink hover:bg-surface-2",
    primary: "border border-brand bg-brand text-white hover:bg-brand-dark",
    danger: "border border-danger/25 bg-danger-bg text-danger hover:bg-danger/15",
  };
  const sizes: Record<string, string> = {
    sm: "gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold",
    lg: "gap-2 rounded-xl px-5 py-3.5 text-base font-bold",
  };
  return (
    <button
      className={`inline-flex items-center justify-center transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
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

/** A real day-over-day delta, not a decorative sparkline — `delta` should
 * come from an actual prior-period figure the caller fetched, never be
 * invented client-side. `goodDirection` says which way is an improvement so
 * the arrow can be colored honestly (e.g. rising wastage is bad, rising
 * efficiency is good). */
export function TrendIndicator({
  delta,
  goodDirection = "up",
  suffix = "",
}: {
  delta: number;
  goodDirection?: "up" | "down";
  suffix?: string;
}) {
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-ink-faint">
        <Minus className="h-3 w-3" strokeWidth={2.5} />
        Flat vs yesterday
      </span>
    );
  }
  const isUp = delta > 0;
  const isGood = goodDirection === "up" ? isUp : !isUp;
  const Icon = isUp ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-0.5 font-semibold ${isGood ? "text-success" : "text-danger"}`}>
      <Icon className="h-3 w-3" strokeWidth={2.5} />
      {isUp ? "+" : ""}
      {delta}
      {suffix} vs yesterday
    </span>
  );
}

export function KpiTile({
  label,
  value,
  sub,
  trend,
  tone = "neutral",
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  trend?: ReactNode;
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
      {trend && <div className="mt-1 text-xs">{trend}</div>}
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

/** Full-page "you can't be here" state — for a whole restricted screen, not
 * just a hidden figure (that's LockedTile). */
export function RestrictedAccess({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-border bg-surface-2">
        <Lock className="h-6 w-6 text-ink-faint" strokeWidth={1.75} />
      </div>
      <div>
        <div className="text-base font-bold text-ink">{title}</div>
        <div className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">{message}</div>
      </div>
    </div>
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
