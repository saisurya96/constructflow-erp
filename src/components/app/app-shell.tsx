"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  HardHat,
  Menu,
  LogOut,
  KeyRound,
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
  ListTodo,
  ChevronsUpDown,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/lib/rbac";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ChangePasswordDialog } from "@/components/app/change-password-dialog";
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
  ListTodo,
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
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-2.5 rounded-md py-1.5 pl-4 pr-2.5 text-[0.8125rem] transition-colors",
              active
                ? "bg-card font-medium text-foreground shadow-[0_1px_0_var(--sidebar-border)] ring-1 ring-sidebar-border"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            {/* hi-vis active tick — the brand signal */}
            <span
              className={cn(
                "absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-sm bg-brand transition-all",
                active ? "opacity-100" : "opacity-0 group-hover:opacity-40 group-hover:bg-sidebar-foreground",
              )}
            />
            <Icon
              className={cn(
                "size-4 shrink-0 transition-colors",
                active
                  ? "text-brand"
                  : "text-sidebar-foreground/70 group-hover:text-foreground",
              )}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 px-1.5 py-1">
      <div className="flex size-7 items-center justify-center rounded-md bg-brand text-brand-foreground">
        <HardHat className="size-[1.05rem]" strokeWidth={2.25} />
      </div>
      <span className="font-display text-[0.95rem] font-semibold tracking-tight text-foreground">
        ConstructFlow
      </span>
    </Link>
  );
}

function CompanyTag({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2 px-1.5 pb-3 pt-1">
      <span className="h-px flex-1 bg-sidebar-border" />
      <span className="eyebrow truncate text-sidebar-foreground/70">{name}</span>
      <span className="h-px flex-1 bg-sidebar-border" />
    </div>
  );
}

function UserMenu({ user }: { user: ShellUser }) {
  const [pending, startTransition] = useTransition();
  const [pwOpen, setPwOpen] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-sidebar-accent">
          <div className="flex size-7 items-center justify-center rounded-md bg-foreground text-[0.6875rem] font-semibold text-background">
            {user.fullName.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.8125rem] font-medium text-foreground">
              {user.fullName}
            </p>
            <p className="truncate text-xs text-sidebar-foreground">
              {user.roleLabel}
            </p>
          </div>
          <ChevronsUpDown className="size-3.5 shrink-0 text-sidebar-foreground/60" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="w-56">
          <DropdownMenuLabel>
            <p className="text-sm font-medium">{user.fullName}</p>
            <p className="text-xs font-normal text-muted-foreground">{user.email}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setPwOpen(true)}>
            <KeyRound className="size-4" /> Change password
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            disabled={pending}
            closeOnClick={false}
            onClick={() => startTransition(() => logoutAction())}
          >
            <LogOut className="size-4" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
    </>
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
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col gap-1 border-r border-sidebar-border bg-sidebar px-3 py-4 lg:flex">
        <Brand />
        <CompanyTag name={company.name} />
        <div className="flex-1 overflow-y-auto">
          <NavLinks nav={nav} />
        </div>
        <div className="border-t border-sidebar-border pt-2">
          <UserMenu user={user} />
        </div>
      </aside>

      {/* mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-30 flex items-center justify-between border-b border-sidebar-border bg-sidebar px-4 py-2.5 lg:hidden">
        <Brand />
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger className="rounded-md p-2 text-foreground hover:bg-sidebar-accent">
            <Menu className="size-5" />
          </SheetTrigger>
          <SheetContent side="left" className="flex w-72 flex-col bg-sidebar p-3 text-sidebar-foreground">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <Brand />
            <CompanyTag name={company.name} />
            <div className="flex-1 overflow-y-auto">
              <NavLinks nav={nav} onNavigate={() => setOpen(false)} />
            </div>
            <div className="mt-2 border-t border-sidebar-border pt-2">
              <UserMenu user={user} />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* content */}
      <main className="flex-1 lg:pl-60">
        <div className="mx-auto max-w-7xl px-4 py-6 pt-18 lg:px-10 lg:py-9">
          {children}
        </div>
      </main>
    </div>
  );
}
