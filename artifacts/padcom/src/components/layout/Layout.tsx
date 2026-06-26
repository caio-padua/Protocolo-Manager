import { useState, useEffect } from "react";
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
  Brain,
  BrainCircuit,
  Library,
  Salad,
  Dumbbell,
  FolderTree,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  TestTube,
  Calculator,
  CalendarCog,
  CalendarDays,
  MessageSquareText,
  ClipboardList as ClipboardListIcon,
  Sparkles,
  Settings,
  Scale,
  Target,
  ShieldCheck,
  PenTool,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaxterLogo } from "./PaxterLogo";

interface LayoutProps {
  children: React.ReactNode;
}

type NavLeaf = { name: string; href: string; icon: typeof LayoutDashboard };
type NavGroup = { name: string; icon: typeof LayoutDashboard; children: NavLeaf[] };
type NavEntry = NavLeaf | NavGroup;

function isGroup(e: NavEntry): e is NavGroup {
  return (e as NavGroup).children !== undefined;
}

const navigation: NavEntry[] = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Clientes", href: "/clients", icon: Users },
  { name: "Protocolos", href: "/protocols", icon: FlaskConical },
  { name: "Orçamentos", href: "/orcamentos", icon: Calculator },
  { name: "Agenda", href: "/agenda", icon: Calendar },
  { name: "Motor de Agenda", href: "/agenda/motor", icon: CalendarCog },
  { name: "RAS", href: "/ras", icon: FileText },
  { name: "Estoque", href: "/stock", icon: Box },
  {
    name: "Financeiro",
    icon: CreditCard,
    children: [
      { name: "Pagamentos", href: "/payments", icon: CreditCard },
      { name: "Conciliação", href: "/financeiro/conciliacao", icon: Scale },
      { name: "Metas & Crescimento", href: "/financeiro/metas", icon: Target },
    ],
  },
  { name: "Substâncias", href: "/substances", icon: Beaker },
  { name: "Dieta", href: "/dieta", icon: Salad },
  { name: "Treino", href: "/treino", icon: Dumbbell },
  { name: "Craniotomia", href: "/craniotomia", icon: BrainCircuit },
  { name: "Cockpit da Consulta", href: "/cockpit", icon: Stethoscope },
  { name: "Catálogos", href: "/catalogos", icon: Library },
  {
    name: "Cadastros",
    icon: FolderTree,
    children: [
      { name: "Equipe", href: "/cadastros/equipe", icon: Stethoscope },
      { name: "Clínicas", href: "/cadastros/clinicas", icon: Building2 },
      { name: "Agendas Google", href: "/cadastros/agendas-google", icon: CalendarDays },
      { name: "Exames & Blocos", href: "/cadastros/exames", icon: TestTube },
      { name: "Listas (Categorias/Tipos)", href: "/cadastros/listas", icon: Library },
      { name: "Textos & Vídeos", href: "/cadastros/textos", icon: MessageSquareText },
    ],
  },
  { name: "Prescritor de Exames", href: "/exames", icon: ClipboardListIcon },
  { name: "Mega Anamnese", href: "/mega-anamnese", icon: Brain },
  { name: "Revisão de Anamneses", href: "/anamnese/revisao", icon: ClipboardListIcon },
  { name: "Prescrição", href: "/prescricao", icon: ClipboardList },
  { name: "Farmácias", href: "/pharmacies", icon: Building2 },
  { name: "SNCR", href: "/sncr", icon: Hash },
  { name: "Vitrine (Pública)", href: "/vitrine", icon: Sparkles },
  {
    name: "Configurações",
    icon: Settings,
    children: [
      { name: "Empresa & Clínicas", href: "/configuracoes/empresa", icon: Building2 },
      { name: "Certificados Digitais", href: "/configuracoes/certificados", icon: ShieldCheck },
      { name: "Assinatura Eletrônica", href: "/configuracoes/assinatura", icon: PenTool },
      { name: "Portas de Pagamento", href: "/configuracoes/pagamentos", icon: CreditCard },
    ],
  },
];

const COLLAPSE_KEY = "paxter.sidebar.collapsed";

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ Cadastros: true });
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {
      /* localStorage indisponivel — segue sem persistir */
    }
  }, [collapsed]);

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Barra superior — mobile */}
      <div className="md:hidden flex items-center justify-between p-4 border-b border-sidebar-border bg-sidebar text-sidebar-foreground">
        <PaxterLogo size="sm" />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="text-sidebar-foreground"
        >
          {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>
      </div>

      {/* Sidebar */}
      <div
        className={`
          fixed inset-y-0 left-0 z-50 w-64 bg-sidebar text-sidebar-foreground
          transition-all duration-300 ease-in-out md:relative md:translate-x-0
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          ${collapsed ? "md:w-[78px]" : "md:w-64"}
        `}
      >
        {/* Botao recolher/expandir (desktop) */}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          title={collapsed ? "Expandir menu" : "Recolher menu"}
          className="hidden md:flex absolute -right-3 top-[78px] z-50 h-7 w-7 items-center justify-center rounded-full bg-sidebar-accent border border-sidebar-primary/50 text-sidebar-primary shadow-lg hover:bg-sidebar-primary hover:text-sidebar-primary-foreground transition-colors"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>

        <div className="h-full flex flex-col">
          {/* Logo */}
          <div
            className={`hidden md:flex items-center justify-center border-b border-sidebar-border ${
              collapsed ? "py-5 px-2" : "py-6 px-4"
            }`}
          >
            <PaxterLogo collapsed={collapsed} />
          </div>

          {/* Navegacao */}
          <nav className="flex-1 px-2.5 py-4 space-y-0.5 overflow-y-auto overflow-x-hidden">
            {navigation.map((item) => {
              const Icon = item.icon;

              if (isGroup(item)) {
                const childActive = item.children.some(
                  (c) => location === c.href || location.startsWith(c.href),
                );
                const isOpen = openGroups[item.name] ?? childActive;

                // Recolhida: clicar no grupo expande a sidebar e abre o grupo.
                if (collapsed) {
                  return (
                    <button
                      key={item.name}
                      type="button"
                      title={item.name}
                      onClick={() => {
                        setCollapsed(false);
                        setOpenGroups((prev) => ({ ...prev, [item.name]: true }));
                      }}
                      className={`w-full flex items-center justify-center px-3 py-2.5 rounded-[5px] border transition-all cursor-pointer ${
                        childActive
                          ? "bg-sidebar-accent text-sidebar-primary border-sidebar-primary/40"
                          : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground border-transparent"
                      }`}
                    >
                      <Icon className="w-[19px] h-[19px] shrink-0" />
                    </button>
                  );
                }

                return (
                  <div key={item.name}>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenGroups((prev) => ({ ...prev, [item.name]: !isOpen }))
                      }
                      className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-[5px] border transition-all cursor-pointer ${
                        childActive
                          ? "text-sidebar-foreground font-medium border-sidebar-primary/40 bg-sidebar-accent/40"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground border-transparent"
                      }`}
                    >
                      <Icon
                        className={`w-[19px] h-[19px] shrink-0 ${
                          childActive ? "text-sidebar-primary" : "text-sidebar-foreground/50"
                        }`}
                      />
                      <span className="text-sm tracking-wide">{item.name}</span>
                      <ChevronDown
                        className={`ml-auto w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
                      />
                    </button>

                    {/* Submenu — SEM icones, alinhado, fio-guia dourado */}
                    {isOpen && (
                      <div className="relative mt-1 mb-1.5 ml-[30px] pl-3.5 space-y-0.5 before:absolute before:left-0 before:top-1 before:bottom-1 before:w-px before:bg-gradient-to-b before:from-sidebar-primary/50 before:via-sidebar-border before:to-transparent">
                        {item.children.map((child) => {
                          const isActive =
                            location === child.href || location.startsWith(child.href);
                          return (
                            <Link
                              key={child.name}
                              href={child.href}
                              onClick={() => setSidebarOpen(false)}
                            >
                              <div
                                className={`relative px-3 py-1.5 text-[13px] tracking-wide rounded-[4px] transition-all cursor-pointer ${
                                  isActive
                                    ? "bg-sidebar-accent text-sidebar-primary font-semibold"
                                    : "text-sidebar-foreground/55 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
                                }`}
                              >
                                {isActive && (
                                  <span className="absolute -left-3.5 top-1.5 bottom-1.5 w-[2px] rounded-full bg-sidebar-primary" />
                                )}
                                {child.name}
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              const isActive =
                location === item.href || (item.href !== "/" && location.startsWith(item.href));

              return (
                <Link key={item.name} href={item.href} onClick={() => setSidebarOpen(false)}>
                  <div
                    title={collapsed ? item.name : undefined}
                    className={`relative flex items-center ${
                      collapsed ? "justify-center" : "gap-3"
                    } px-3 py-2.5 rounded-[5px] border transition-all cursor-pointer ${
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium border-sidebar-primary/40 shadow-sm"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground border-transparent"
                    }`}
                  >
                    {isActive && !collapsed && (
                      <span className="absolute -left-2.5 top-2 bottom-2 w-[3px] rounded-r-full bg-sidebar-primary" />
                    )}
                    <Icon
                      className={`w-[19px] h-[19px] shrink-0 ${
                        isActive ? "text-sidebar-primary" : "text-sidebar-foreground/50"
                      }`}
                    />
                    {!collapsed && <span className="text-sm tracking-wide">{item.name}</span>}
                  </div>
                </Link>
              );
            })}
          </nav>

          {/* Rodape — usuario */}
          <div className="p-3 border-t border-sidebar-border">
            <div
              className={`flex items-center ${collapsed ? "justify-center" : "gap-3"} px-2 py-2`}
              title={collapsed ? "Dr. Padua — Administrador" : undefined}
            >
              <div
                className="w-8 h-8 flex items-center justify-center text-xs font-bold bg-sidebar-primary/20 text-sidebar-primary border border-sidebar-primary/30 shrink-0"
                style={{ borderRadius: "4px" }}
              >
                DP
              </div>
              {!collapsed && (
                <div className="flex flex-col">
                  <span className="text-sm font-medium tracking-wide">Dr. Padua</span>
                  <span className="text-[10px] text-sidebar-foreground/50 tracking-wide uppercase">
                    Administrador
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* A marca PAXTER vive no canto superior ESQUERDO (topo do menu lateral)
            dentro do sistema. O canto superior DIREITO e reservado so para os
            PDFs emitidos (decisao do CEO em 26/06/2026, sobre a spec do Manus). */}
        <div className="flex-1 overflow-y-auto p-4 md:px-8 md:pb-8 md:pt-6">{children}</div>
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
