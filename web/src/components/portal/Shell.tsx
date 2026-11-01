import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  BarChart3,
  Bell,
  Briefcase,
  FileText,
  LayoutDashboard,
  Link2,
  LogOut,
  Menu,
  ScrollText,
  Shield,
  Tag,
  User,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Logo } from "@/components/site/Header";
import { Button } from "@/components/ui/button";
import { useAuth, roleCanAccessPortal, portalForRole } from "@/lib/auth";
import { clientName } from "@/lib/format";
import { cn } from "@/lib/utils";

const clientNav = [
  { to: "/portal", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/portal/investments", label: "Investments", icon: Briefcase },
  { to: "/portal/transactions", label: "Transactions", icon: ArrowLeftRight },
  { to: "/portal/documents", label: "Documents", icon: FileText },
  { to: "/portal/profile", label: "Profile", icon: User },
] as const;

const adminNav = [
  { to: "/admin", label: "Overview", icon: BarChart3, exact: true },
  { to: "/admin/clients", label: "Clients", icon: Users },
  { to: "/admin/admins", label: "Admins", icon: Shield, superAdminOnly: true },
  { to: "/admin/assignments", label: "Assignments", icon: Link2, superAdminOnly: true },
  { to: "/admin/prices", label: "Published prices", icon: Tag },
  { to: "/admin/audit", label: "Audit log", icon: ScrollText },
] as const;

export function PortalShell({ area }: { area: "client" | "admin" }) {
  const { status, user, portal, logout, unreadNotifications } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (x) => x.location.pathname });
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);

  const allowed = status === "authenticated" && user ? roleCanAccessPortal(user.role, area === "client" ? "client" : "admin") : false;

  useEffect(() => {
    if (status === "loading") return;
    if (!allowed) {
      void navigate({ to: "/login", search: { next: path, portal: area }, replace: true });
    }
  }, [allowed, status, navigate, path, area]);

  if (status === "loading" || !allowed || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">
          {status === "loading" ? "Restoring your session…" : "Redirecting to sign in…"}
        </p>
      </div>
    );
  }

  const nav = area === "client" ? clientNav : adminNav.filter((n) => !("superAdminOnly" in n) || user.role === "SUPER_ADMIN");
  const who = area === "client" ? clientName(user) : user.fullName;
  const roleLabel =
    area === "client"
      ? "Client"
      : user.role === "SUPER_ADMIN"
        ? "Super administrator"
        : "Administrator";
  const home = area === "client" ? "/portal" : "/admin";

  const side = (
    <div className="flex h-full flex-col bg-navy-deep text-navy-foreground">
      <Link to="/" className="flex h-20 items-center border-b border-navy-border px-6">
        <Logo />
      </Link>
      <p className="eyebrow px-6 pb-3 pt-8">{area === "client" ? "Client portal" : "Administration"}</p>
      <nav aria-label="Portal" className="flex-1 space-y-0.5 px-3">
        {nav.map((n) => {
          const active = "exact" in n && n.exact ? path === n.to || path === `${n.to}/` : path.startsWith(n.to);
          return (
            <Link
              key={n.to}
              to={n.to}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 text-sm transition-colors",
                active ? "bg-navy text-gold" : "text-navy-muted hover:bg-navy hover:text-navy-foreground",
              )}
            >
              <n.icon className="size-4" strokeWidth={1.5} />
              {n.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-navy-border p-6">
        <p className="font-display text-xl">{who}</p>
        <p className="text-xs text-navy-muted">{roleLabel}</p>
        <p className="mt-1 truncate text-xs text-navy-muted">{user.email}</p>
        <Link
          to={portal && portal !== portalForRole(user.role) ? (portalForRole(user.role) === "client" ? "/portal" : "/admin") : home}
          className="mt-3 inline-block text-[11px] uppercase tracking-[0.14em] text-gold hover:text-gold-soft"
        >
          {area === "client" ? "Administration" : "Client portal"}
        </Link>
        <Button
          variant="ghost"
          onClick={() => {
            void logout().then(() => navigate({ to: "/login", replace: true }));
          }}
          className="mt-4 flex items-center gap-2 px-0 text-xs font-semibold uppercase tracking-[0.14em] text-navy-muted hover:text-gold"
        >
          <LogOut className="size-4" />
          Sign out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="sticky top-0 hidden h-screen lg:block">{side}</aside>
      <div className="flex items-center justify-between border-b border-border bg-navy-deep px-4 py-3 text-navy-foreground lg:hidden">
        <Link to="/">
          <Logo />
        </Link>
        <Button variant="ghost" size="icon" aria-label="Open menu" onClick={() => setOpen(true)}>
          <Menu className="size-6" />
        </Button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-navy-deep/60" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 animate-in slide-in-from-left duration-300">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="absolute right-4 top-7 z-10 text-navy-foreground"
            >
              <X className="size-5" />
            </Button>
            {side}
          </div>
        </div>
      )}
      <div className="min-w-0">
        <div className="flex items-center justify-between border-b border-border bg-card px-6 py-2 text-xs text-muted-foreground md:px-10">
          <span>
            Signed in as {user.email} · {roleLabel}
          </span>
          <span className="flex items-center gap-1.5">
            <Bell className="size-3.5" />
            {unreadNotifications > 0 ? `${unreadNotifications} unread` : "No unread notifications"}
          </span>
        </div>
        <main className="px-4 py-8 md:px-10 md:py-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
