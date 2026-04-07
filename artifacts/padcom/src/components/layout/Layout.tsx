import { useState } from "react";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Users, 
  Activity, 
  Calendar, 
  FileText, 
  Box, 
  CreditCard, 
  Stethoscope,
  Menu,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface LayoutProps {
  children: React.ReactNode;
}

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Clientes", href: "/clients", icon: Users },
  { name: "Protocolos", href: "/protocols", icon: Activity },
  { name: "Agenda", href: "/agenda", icon: Calendar },
  { name: "RAS", href: "/ras", icon: FileText },
  { name: "Estoque", href: "/stock", icon: Box },
  { name: "Financeiro", href: "/payments", icon: CreditCard },
  { name: "Profissionais", href: "/professionals", icon: Stethoscope },
  { name: "Substâncias", href: "/substances", icon: Activity }, // Activity for now
];

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Mobile sidebar toggle */}
      <div className="md:hidden flex items-center justify-between p-4 border-b bg-sidebar text-sidebar-foreground">
        <span className="font-semibold text-lg tracking-tight flex items-center gap-2">
          <Activity className="w-5 h-5 text-sidebar-primary" />
          PADCOM
        </span>
        <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)} className="text-sidebar-foreground">
          {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>
      </div>

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-sidebar text-sidebar-foreground transition-transform duration-300 ease-in-out md:relative md:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="h-full flex flex-col">
          <div className="p-6 hidden md:flex items-center gap-3">
            <div className="bg-sidebar-primary p-2 rounded-lg">
              <Activity className="w-5 h-5 text-sidebar-primary-foreground" />
            </div>
            <span className="font-bold text-xl tracking-tight">PADCOM</span>
          </div>

          <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
            {navigation.map((item) => {
              const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
              const Icon = item.icon;
              return (
                <Link key={item.name} href={item.href} onClick={() => setSidebarOpen(false)}>
                  <div className={`
                    flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors cursor-pointer
                    ${isActive 
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium' 
                      : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'}
                  `}>
                    <Icon className={`w-5 h-5 ${isActive ? 'text-sidebar-primary' : 'text-sidebar-foreground/60'}`} />
                    {item.name}
                  </div>
                </Link>
              );
            })}
          </nav>
          
          <div className="p-4 border-t border-sidebar-border">
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center text-sm font-medium">
                AD
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium">Admin User</span>
                <span className="text-xs text-sidebar-foreground/60">Clínica Principal</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          {children}
        </div>
      </main>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}