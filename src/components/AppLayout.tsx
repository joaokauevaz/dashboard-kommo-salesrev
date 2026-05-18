import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, Settings, Activity, Menu, X } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useState } from "react";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/integracoes", label: "Integrações", icon: Settings },
];

function SidebarContent({ onNav }: { onNav?: () => void }) {
  const location = useLocation();

  return (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground">
      {/* Logo */}
      <div className="p-5 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
            <Activity className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-white">SalesRev</h1>
            <p className="text-[10px] text-white/60">Dashboard CRM</p>
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
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-white/20 text-white"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-sidebar-border">
        <p className="text-[10px] text-white/40 text-center">SalesRev</p>
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
        <header className="lg:hidden sticky top-0 z-30 bg-sidebar px-3 py-2.5 flex items-center gap-3 shadow-md">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 h-8 w-8">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-56 border-0">
              <SidebarContent onNav={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <h1 className="text-sm font-bold text-white">SalesRev</h1>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto">
          <div className="p-4 md:p-6 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
