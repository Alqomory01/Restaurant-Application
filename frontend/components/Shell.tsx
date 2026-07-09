"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode } from "react";
import {
  LayoutDashboard,
  MonitorPlay,
  CalendarDays,
  Flame,
  BookOpen,
  Wallet,
  Package,
  Send,
  Trash2,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ThemeToggle } from "@/components/ThemeToggle";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV: { section: string; items: NavItem[] }[] = [
  { section: "Overview", items: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/kds", label: "Kitchen display", icon: MonitorPlay },
  ] },
  { section: "Production", items: [
    { href: "/planning", label: "Daily production plan", icon: CalendarDays },
    { href: "/batches", label: "Batch tracker", icon: Flame },
  ] },
  { section: "Recipes", items: [
    { href: "/recipes", label: "Recipe management", icon: BookOpen },
    { href: "/costing", label: "Recipe costing", icon: Wallet },
  ] },
  { section: "Inventory", items: [
    { href: "/stock", label: "Kitchen stock", icon: Package },
    { href: "/requests", label: "Stock requests", icon: Send },
    { href: "/wastage", label: "Wastage log", icon: Trash2 },
  ] },
];

const TITLES: Record<string, string> = {
  "/dashboard": "Kitchen dashboard",
  "/kds": "Kitchen display system",
  "/planning": "Daily production plan",
  "/batches": "Batch tracker",
  "/recipes": "Recipe management",
  "/costing": "Recipe costing",
  "/stock": "Kitchen stock",
  "/requests": "Stock requests",
  "/wastage": "Wastage log",
};

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex w-52 flex-shrink-0 flex-col overflow-y-auto border-r border-border bg-surface">
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-sm font-bold text-white">M</div>
          <div>
            <div className="text-sm font-bold text-ink">KitchenCore</div>
            <div className="text-[10px] text-ink-soft">Kitchen Module</div>
          </div>
        </div>
        {NAV.map((group) => (
          <div key={group.section} className="py-2.5">
            <div className="px-4 pb-1.5 text-[10px] font-bold uppercase tracking-wide text-ink-faint">
              {group.section}
            </div>
            {group.items.map((item) => {
              const active = pathname?.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2.5 border-l-2 px-4 py-2 text-[13px] transition ${
                    active
                      ? "border-brand bg-brand-light font-semibold text-brand"
                      : "border-transparent text-ink-soft hover:bg-surface-2 hover:text-ink"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
        <div className="mt-auto flex items-center gap-2.5 border-t border-border px-4 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-light text-xs font-bold text-brand">
            {(user?.first_name?.[0] ?? "") + (user?.last_name?.[0] ?? "")}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold text-ink">
              {user?.first_name} {user?.last_name}
            </div>
            <div className="truncate text-[10px] text-ink-soft">{user?.role.replaceAll("_", " ")}</div>
          </div>
          <button onClick={handleLogout} title="Log out" className="text-ink-faint transition hover:text-ink">
            <LogOut className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-13 flex-shrink-0 items-center justify-between border-b border-border bg-surface px-6">
          <h1 className="text-[15px] font-bold text-ink">{TITLES[pathname ?? ""] ?? ""}</h1>
          <ThemeToggle />
        </div>
        <div className="flex-1 overflow-y-auto bg-bg p-6">{children}</div>
      </div>
    </div>
  );
}
