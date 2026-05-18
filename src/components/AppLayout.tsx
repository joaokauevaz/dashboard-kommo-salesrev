import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, Settings, Activity, Menu, TrendingUp } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useState } from "react";

const navItems = [
  { to: "/vendas", label: "Vendas", icon: TrendingUp },
  { to: "/", label: "Dash IA", icon: LayoutDashboard },
  { to: "/integracoes", label: "Integrações", icon: Settings },
];

function SidebarContent({ onNav }: { onNav?: () => void }) {
  const location = useLocation();

  return (
    <div
      className="flex flex-col h-full"
      style={{
        background: "hsl(var(--background))",
        borderRight: "1px solid rgba(248,249,250,0.08)",
      }}
    >
      {/* Logo */}
      <div
        className="p-5"
        style={{ borderBottom: "1px solid rgba(248,249,250,0.08)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 flex items-center justify-center"
            style={{
              background: "hsl(var(--primary))",
              borderRadius: "4px",
            }}
          >
            <Activity className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-foreground">
              SalesRev
            </h1>
            <p className="text-[10px]" style={{ color: "rgba(248,249,250,0.50)" }}>
              Dashboard CRM
            </p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const isActive =
            item.to === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(item.to);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onNav}
              className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-colors"
              style={{
                borderRadius: "4px",
                background: isActive ? "rgba(227,25,55,0.12)" : "transparent",
                color: isActive ? "#E31937" : "rgba(248,249,250,0.70)",
              }}
              onMouseEnter={(e) => {
                if (!isActive)
                  (e.currentTarget as HTMLElement).style.background =
                    "rgba(248,249,250,0.04)";
              }}
              onMouseLeave={(e) => {
                if (!isActive)
                  (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer wordmark */}
      <div
        className="p-4"
        style={{ borderTop: "1px solid rgba(248,249,250,0.08)" }}
      >
        <p
          className="text-center"
          style={{
            fontSize: "10px",
            fontWeight: 700,
            letterSpacing: "0.2em",
            color: "rgba(248,249,250,0.30)",
          }}
        >
          SALESREV
        </p>
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-56 flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header
          className="lg:hidden sticky top-0 z-30 px-3 py-2.5 flex items-center gap-3"
          style={{
            background: "hsl(var(--background))",
            borderBottom: "1px solid rgba(248,249,250,0.08)",
          }}
        >
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-foreground hover:bg-white/10 h-8 w-8"
              >
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-56 border-0">
              <SidebarContent onNav={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <h1 className="text-sm font-bold text-foreground">SalesRev</h1>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto">
          <div className="p-4 md:p-6 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
