import { useState } from "react";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Users, 
  FlaskConical,
  Calendar, 
  FileText, 
  Box, 
  CreditCard, 
  Stethoscope,
  Menu,
  X,
  Beaker,
  ClipboardList,
  Building2,
  Hash,
  Brain
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PadconLogo } from "./PadconLogo";

interface LayoutProps {
  children: React.ReactNode;
}

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Clientes", href: "/clients", icon: Users },
  { name: "Protocolos", href: "/protocols", icon: FlaskConical },
  { name: "Agenda", href: "/agenda", icon: Calendar },
  { name: "RAS", href: "/ras", icon: FileText },
  { name: "Estoque", href: "/stock", icon: Box },
  { name: "Financeiro", href: "/payments", icon: CreditCard },
  { name: "Profissionais", href: "/professionals", icon: Stethoscope },
  { name: "Substâncias", href: "/substances", icon: Beaker },
  { name: "Mega Anamnese", href: "/mega-anamnese", icon: Brain },
  { name: "Prescrição", href: "/prescricao", icon: ClipboardList },
  { name: "Farmácias", href: "/pharmacies", icon: Building2 },
  { name: "SNCR", href: "/sncr", icon: Hash },
];

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <div className="md:hidden flex items-center justify-between p-4 border-b border-sidebar-border bg-sidebar text-sidebar-foreground">
        <PadconLogo size="sm" />
        <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)} className="text-sidebar-foreground">
          {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>
      </div>

      <div className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-sidebar text-sidebar-foreground transition-transform duration-300 ease-in-out md:relative md:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="h-full flex flex-col">
          <div className="p-5 hidden md:block border-b border-sidebar-border">
            <PadconLogo size="md" />
            <div className="mt-3 pl-1">
              <span className="text-[10px] font-semibold tracking-[0.25em] uppercase text-sidebar-primary opacity-90">
                Motor Clinico
              </span>
              <span className="text-[10px] text-sidebar-foreground/50 block tracking-wide">
                Protocolos Injetaveis
              </span>
            </div>
          </div>

          <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
            {navigation.map((item) => {
              const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
              const Icon = item.icon;
              return (
                <Link key={item.name} href={item.href} onClick={() => setSidebarOpen(false)}>
                  <div className={`
                    flex items-center gap-3 px-3 py-2.5 transition-all cursor-pointer border
                    ${isActive 
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium border-sidebar-primary/40 shadow-sm' 
                      : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground border-transparent'}
                  `} style={{ borderRadius: '4px' }}>
                    <Icon className={`w-4.5 h-4.5 ${isActive ? 'text-sidebar-primary' : 'text-sidebar-foreground/50'}`} />
                    <span className="text-sm tracking-wide">{item.name}</span>
                  </div>
                </Link>
              );
            })}
          </nav>
          
          <div className="p-3 border-t border-sidebar-border">
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="w-8 h-8 flex items-center justify-center text-xs font-bold bg-sidebar-primary/20 text-sidebar-primary border border-sidebar-primary/30" style={{ borderRadius: '4px' }}>
                DP
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium tracking-wide">Dr. Padua</span>
                <span className="text-[10px] text-sidebar-foreground/50 tracking-wide uppercase">Administrador</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          {children}
        </div>
      </main>

      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}
