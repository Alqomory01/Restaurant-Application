"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
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
  BarChart3,
  LogOut,
  Menu,
  X,
  Truck,
  ClipboardList,
  FileText,
  PackageSearch,
  Warehouse,
  PackageCheck,
  ShoppingCart,
  Clock,
  History,
  Receipt,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { Role } from "@/lib/types";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Department-level access (which nav sections a role even sees) is an
   * allow-list here — omit to show to every role. Within a department,
   * finer-grained gates (e.g. Costing/Reports showing all Kitchen roles but
   * locking their own money figures per role) are handled by the page
   * itself, not here. Kitchen and Store are separate departments — Store
   * Keeper has no business reason to see production data, and Kitchen
   * roles have none to see supplier pricing, so those sections are hidden
   * outright for the other side rather than shown-then-locked. */
  roles?: Role[];
}

// Kitchen roles: everyone who isn't Store-only. Store Keeper has no more
// business reason to see kitchen production data than Kitchen Staff has to
// see supplier pricing — same "hide outright" reasoning as the Store section.
const KITCHEN_ROLES: Role[] = ["HEAD_CHEF", "KITCHEN_STAFF", "MANAGER"];
const STORE_ROLES: Role[] = ["MANAGER", "STORE_KEEPER"];
// POS's real spec roles (Cashier, FOH Supervisor) don't exist as Django
// roles yet — Manager stands in, same as it did for Store before
// STORE_KEEPER existed. See components/PosAccessGate.tsx.
const POS_ROLES: Role[] = ["MANAGER"];

const NAV: { section: string; items: NavItem[] }[] = [
  { section: "Overview", items: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: KITCHEN_ROLES },
    { href: "/kds", label: "Kitchen display", icon: MonitorPlay, roles: KITCHEN_ROLES },
  ] },
  { section: "Production", items: [
    { href: "/planning", label: "Daily production plan", icon: CalendarDays, roles: KITCHEN_ROLES },
    { href: "/batches", label: "Batch tracker", icon: Flame, roles: KITCHEN_ROLES },
  ] },
  { section: "Recipes", items: [
    { href: "/recipes", label: "Recipe management", icon: BookOpen, roles: KITCHEN_ROLES },
    { href: "/costing", label: "Recipe costing", icon: Wallet, roles: KITCHEN_ROLES },
  ] },
  { section: "Inventory", items: [
    { href: "/stock", label: "Kitchen stock", icon: Package, roles: KITCHEN_ROLES },
    { href: "/requests", label: "Stock requests", icon: Send, roles: KITCHEN_ROLES },
    { href: "/wastage", label: "Wastage log", icon: Trash2, roles: KITCHEN_ROLES },
  ] },
  { section: "Insights", items: [
    { href: "/reports", label: "Reports", icon: BarChart3, roles: KITCHEN_ROLES },
  ] },
  { section: "Store", items: [
    { href: "/store/dashboard", label: "Store dashboard", icon: LayoutDashboard, roles: STORE_ROLES },
    { href: "/store/suppliers", label: "Suppliers", icon: Truck, roles: STORE_ROLES },
    { href: "/store/items", label: "Item master", icon: PackageSearch, roles: STORE_ROLES },
    { href: "/store/purchase-orders", label: "Purchase orders", icon: FileText, roles: STORE_ROLES },
  ] },
  { section: "Store inventory", items: [
    { href: "/store/receiving", label: "Receiving (GRN)", icon: ClipboardList, roles: STORE_ROLES },
    { href: "/store/stock", label: "Stock levels", icon: Warehouse, roles: STORE_ROLES },
    { href: "/store/dispatch", label: "Dispatch", icon: PackageCheck, roles: STORE_ROLES },
    { href: "/store/wastage", label: "Wastage log", icon: Trash2, roles: STORE_ROLES },
  ] },
  { section: "Store insights", items: [
    { href: "/store/reports", label: "Reports", icon: BarChart3, roles: STORE_ROLES },
  ] },
  { section: "Point of Sale", items: [
    { href: "/pos/dashboard", label: "POS dashboard", icon: LayoutDashboard, roles: POS_ROLES },
    { href: "/pos/terminal", label: "Terminal", icon: ShoppingCart, roles: POS_ROLES },
    { href: "/pos/shift", label: "Shift", icon: Clock, roles: POS_ROLES },
    { href: "/pos/shifts", label: "Shift history", icon: History, roles: POS_ROLES },
  ] },
  { section: "POS management", items: [
    { href: "/pos/orders", label: "Orders", icon: Receipt, roles: POS_ROLES },
    { href: "/pos/menu", label: "Menu", icon: UtensilsCrossed, roles: POS_ROLES },
    { href: "/pos/reports", label: "Reports", icon: BarChart3, roles: POS_ROLES },
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
  "/reports": "Reports",
  "/store/dashboard": "Store dashboard",
  "/store/suppliers": "Suppliers",
  "/store/items": "Item master",
  "/store/purchase-orders": "Purchase orders",
  "/store/receiving": "Goods receiving (GRN)",
  "/store/stock": "Stock levels",
  "/store/dispatch": "Dispatch",
  "/store/wastage": "Wastage log",
  "/store/reports": "Reports",
  "/pos/dashboard": "POS dashboard",
  "/pos/terminal": "Terminal",
  "/pos/shift": "Shift",
  "/pos/shifts": "Shift history",
  "/pos/orders": "Orders",
  "/pos/menu": "Menu management",
  "/pos/reports": "Reports",
};

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const router = useRouter();
  const [navOpen, setNavOpen] = useState(false);

  // Below the lg breakpoint the sidebar is an off-canvas drawer — close it
  // automatically on every navigation so it doesn't stay open over the page.
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {navOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setNavOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-shrink-0 flex-col overflow-y-auto border-r border-border bg-surface transition-transform duration-200 lg:static lg:z-auto lg:w-52 lg:translate-x-0 ${
          navOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-sm font-bold text-white">M</div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-ink">KitchenCore</div>
            <div className="text-[10px] text-ink-soft">Kitchen Module</div>
          </div>
          <button
            onClick={() => setNavOpen(false)}
            title="Close menu"
            className="text-ink-faint transition hover:text-ink lg:hidden"
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>
        {NAV.map((group) => {
          const visibleItems = group.items.filter((item) => !item.roles || (user && item.roles.includes(user.role)));
          if (visibleItems.length === 0) return null;
          return (
            <div key={group.section} className="py-2.5">
              <div className="px-4 pb-1.5 text-[10px] font-bold uppercase tracking-wide text-ink-faint">
                {group.section}
              </div>
              {visibleItems.map((item) => {
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
          );
        })}
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
        <div className="flex h-13 flex-shrink-0 items-center justify-between border-b border-border bg-surface px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setNavOpen(true)}
              title="Open menu"
              className="text-ink-soft transition hover:text-ink lg:hidden"
            >
              <Menu className="h-5 w-5" strokeWidth={2} />
            </button>
            <h1 className="text-[15px] font-bold text-ink">{TITLES[pathname ?? ""] ?? ""}</h1>
          </div>
          <ThemeToggle />
        </div>
        <div className="flex-1 overflow-y-auto bg-bg p-4 lg:p-6">{children}</div>
      </div>
    </div>
  );
}
