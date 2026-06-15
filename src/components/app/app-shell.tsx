"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  HardHat,
  Menu,
  LogOut,
  LayoutDashboard,
  FolderKanban,
  ClipboardList,
  FileText,
  ShoppingCart,
  Building2,
  Truck,
  PackageCheck,
  Boxes,
  Split,
  Calculator,
  Receipt,
  BadgeCheck,
  ScrollText,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/lib/rbac";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { logoutAction } from "@/app/(auth)/actions";

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  FolderKanban,
  ClipboardList,
  FileText,
  ShoppingCart,
  Building2,
  Truck,
  PackageCheck,
  Boxes,
  Split,
  Calculator,
  Receipt,
  BadgeCheck,
  ScrollText,
  Settings,
};

type ShellUser = { fullName: string; email: string; roleLabel: string };

function NavLinks({
  nav,
  onNavigate,
}: {
  nav: NavItem[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {nav.map((item) => {
        const Icon = ICONS[item.icon] ?? LayoutDashboard;
        const active =
          pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.key}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2 px-2 py-1">
      <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
        <HardHat className="size-4.5" />
      </div>
      <span className="text-base font-semibold text-sidebar-foreground">
        ConstructFlow
      </span>
    </div>
  );
}

function UserMenu({ user }: { user: ShellUser }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-sidebar-accent">
        <div className="flex size-8 items-center justify-center rounded-full bg-sidebar-primary/30 text-xs font-semibold text-sidebar-foreground">
          {user.fullName.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-sidebar-foreground">
            {user.fullName}
          </p>
          <p className="truncate text-xs text-sidebar-foreground/60">
            {user.roleLabel}
          </p>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-56">
        <DropdownMenuLabel>
          <p className="text-sm font-medium">{user.fullName}</p>
          <p className="text-xs font-normal text-muted-foreground">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({
  company,
  user,
  nav,
  children,
}: {
  company: { name: string };
  user: ShellUser;
  nav: NavItem[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      {/* desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col gap-2 border-r border-sidebar-border bg-sidebar p-3 lg:flex">
        <Brand />
        <div className="px-2 pb-2">
          <p className="truncate text-xs font-medium text-sidebar-foreground/60">
            {company.name}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto">
          <NavLinks nav={nav} />
        </div>
        <div className="border-t border-sidebar-border pt-2">
          <UserMenu user={user} />
        </div>
      </aside>

      {/* mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-30 flex items-center justify-between border-b bg-sidebar px-4 py-2.5 lg:hidden">
        <Brand />
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger className="rounded-md p-2 text-sidebar-foreground hover:bg-sidebar-accent">
            <Menu className="size-5" />
          </SheetTrigger>
          <SheetContent side="left" className="w-72 bg-sidebar p-3 text-sidebar-foreground">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <Brand />
            <div className="px-2 py-2">
              <p className="truncate text-xs font-medium text-sidebar-foreground/60">
                {company.name}
              </p>
            </div>
            <NavLinks nav={nav} onNavigate={() => setOpen(false)} />
            <div className="mt-4 border-t border-sidebar-border pt-2">
              <UserMenu user={user} />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* content */}
      <main className="flex-1 lg:pl-64">
        <div className="mx-auto max-w-7xl px-4 py-6 pt-18 lg:px-8 lg:pt-8">
          {children}
        </div>
      </main>
    </div>
  );
}
