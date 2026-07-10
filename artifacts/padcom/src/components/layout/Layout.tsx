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
  ChevronLeft,
  ChevronRight,
  TestTube,
  Calculator,
  CalendarCog,
  CalendarDays,
  MessageSquareText,
  ClipboardList as ClipboardListIcon,
  Sparkles,
  BellRing,
  Settings,
  Scale,
  Target,
  ShieldCheck,
  PenTool,
  Stamp,
  Mail,
  MessagesSquare,
  Smartphone,
  Cloud,
  Network,
  Landmark,
  ArrowLeftRight,
  Zap,
  Receipt,
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
  {
    name: "Agenda & Recepção",
    icon: Calendar,
    children: [
      { name: "Agenda Diária", href: "/agenda", icon: Calendar },
      { name: "Motor de Agenda", href: "/agenda/motor", icon: CalendarCog },
      { name: "Clientes", href: "/clients", icon: Users },
    ],
  },
  {
    name: "O Ato Médico",
    icon: Stethoscope,
    children: [
      { name: "Cockpit da Consulta", href: "/cockpit", icon: Stethoscope },
      { name: "Cartório", href: "/cartorio", icon: Stamp },
      { name: "Craniotomia", href: "/craniotomia", icon: BrainCircuit },
      { name: "Mega Anamnese", href: "/mega-anamnese", icon: Brain },
      { name: "Revisão de Anamneses", href: "/anamnese/revisao", icon: ClipboardListIcon },
      { name: "Exames do Cliente", href: "/exames-cliente", icon: FlaskConical },
    ],
  },
  {
    name: "Órgãos de Prescrição",
    icon: ClipboardList,
    children: [
      { name: "Prescritor de Exames", href: "/exames", icon: ClipboardListIcon },
      { name: "Prescrição", href: "/prescricao", icon: ClipboardList },
      { name: "Fórmulas & Substâncias", href: "/substances", icon: Beaker },
      { name: "Dieta", href: "/dieta", icon: Salad },
      { name: "Treino", href: "/treino", icon: Dumbbell },
      { name: "Orçamentos", href: "/orcamentos", icon: Calculator },
      { name: "Farmácias", href: "/pharmacies", icon: Building2 },
      { name: "SNCR", href: "/sncr", icon: Hash },
    ],
  },
  {
    name: "Cadastros Clínicos",
    icon: FolderTree,
    children: [
      { name: "Protocolos", href: "/protocols", icon: FlaskConical },
      { name: "RAS", href: "/ras", icon: FileText },
      { name: "Catálogos", href: "/catalogos", icon: Library },
      { name: "Estoque", href: "/stock", icon: Box },
    ],
  },
  {
    name: "Financeiro",
    icon: CreditCard,
    children: [
      { name: "Lançador de Cobrança", href: "/financeiro/cobranca", icon: Zap },
      { name: "Lançador de NFS-e", href: "/financeiro/nfse", icon: Receipt },
      { name: "Cadastro de Bancos", href: "/financeiro/bancos", icon: Landmark },
      { name: "Transferências", href: "/financeiro/transferencias", icon: ArrowLeftRight },
      { name: "Pagamentos", href: "/payments", icon: CreditCard },
      { name: "Conciliação", href: "/financeiro/conciliacao", icon: Scale },
      { name: "Metas & Crescimento", href: "/financeiro/metas", icon: Target },
    ],
  },
  {
    name: "Comunicação",
    icon: MessagesSquare,
    children: [
      { name: "Plataforma Gateway de Comunicação", href: "/comunicacao/gateways", icon: Network },
      { name: "Mensageria", href: "/comunicacao/mensageria", icon: MessageSquareText },
      { name: "Carta de Encantamento", href: "/comunicacao/carta-encantamento", icon: Sparkles },
      { name: "Central de Lembretes", href: "/comunicacao/central-lembretes", icon: BellRing },
      { name: "Comunicação Digital", href: "/comunicacao/digital", icon: Smartphone },
      { name: "E-mails", href: "/comunicacao/emails", icon: Mail },
      { name: "Plataformas Digitais", href: "/comunicacao/plataformas", icon: Cloud },
    ],
  },
  {
    name: "Configurações & Administração",
    icon: Settings,
    children: [
      { name: "Empresa & Clínicas", href: "/configuracoes/empresa", icon: Building2 },
      { name: "Equipe (Profissionais)", href: "/cadastros/equipe", icon: Stethoscope },
      { name: "Agendas Google", href: "/cadastros/agendas-google", icon: CalendarDays },
      { name: "Exames & Blocos", href: "/cadastros/exames", icon: TestTube },
      { name: "Listas (Categorias/Tipos)", href: "/cadastros/listas", icon: Library },
      { name: "Textos & Vídeos", href: "/cadastros/textos", icon: MessageSquareText },
      { name: "Auditoria", href: "/cadastros/auditoria", icon: ClipboardListIcon },
      { name: "Certificados Digitais", href: "/configuracoes/certificados", icon: ShieldCheck },
      { name: "Assinatura Eletrônica (ZapSign)", href: "/configuracoes/assinatura", icon: PenTool },
      { name: "Portas de Pagamento", href: "/configuracoes/pagamentos", icon: CreditCard },
      { name: "Vitrine (Pública)", href: "/vitrine", icon: Sparkles },
    ],
  },
  {
    name: "Estrutura & Governança",
    icon: Network,
    children: [
      { name: "Hierarquia", href: "/hierarquia", icon: Network },
      { name: "Governança", href: "/governanca", icon: Landmark },
    ],
  },
];

const COLLAPSE_KEY = "paxter.sidebar.collapsed";

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
                const SectionIcon = item.icon;

                // Recolhida: separador fino + so os icones dos itens (todos a mostra).
                if (collapsed) {
                  return (
                    <div key={item.name} className="pt-1">
                      <div
                        className="my-1 mx-2 border-t border-sidebar-border/60"
                        title={item.name}
                      />
                      <div className="space-y-0.5">
                        {item.children.map((child) => {
                          const ChildIcon = child.icon;
                          const isActive =
                            location === child.href || location.startsWith(child.href);
                          return (
                            <Link
                              key={child.name}
                              href={child.href}
                              onClick={() => setSidebarOpen(false)}
                            >
                              <div
                                title={child.name}
                                className={`flex items-center justify-center px-3 py-2 rounded-[5px] border transition-all cursor-pointer ${
                                  isActive
                                    ? "bg-sidebar-accent text-sidebar-primary border-sidebar-primary/40"
                                    : "text-sidebar-foreground/55 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground border-transparent"
                                }`}
                              >
                                <ChildIcon className="w-[19px] h-[19px] shrink-0" />
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  );
                }

                // Expandida: rotulo da secao + TODOS os itens SEMPRE visiveis (sem recolher).
                return (
                  <div key={item.name} className="pt-2 first:pt-0">
                    <div className="flex items-center gap-2 px-3 pt-1 pb-1">
                      <SectionIcon className="w-3.5 h-3.5 shrink-0 text-sidebar-primary/70" />
                      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/45">
                        {item.name}
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      {item.children.map((child) => {
                        const ChildIcon = child.icon;
                        const isActive =
                          location === child.href || location.startsWith(child.href);
                        return (
                          <Link
                            key={child.name}
                            href={child.href}
                            onClick={() => setSidebarOpen(false)}
                          >
                            <div
                              className={`relative flex items-center gap-3 px-3 py-2 rounded-[5px] border transition-all cursor-pointer ${
                                isActive
                                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium border-sidebar-primary/40 shadow-sm"
                                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground border-transparent"
                              }`}
                            >
                              {isActive && (
                                <span className="absolute -left-2.5 top-2 bottom-2 w-[3px] rounded-r-full bg-sidebar-primary" />
                              )}
                              <ChildIcon
                                className={`w-[18px] h-[18px] shrink-0 ${
                                  isActive ? "text-sidebar-primary" : "text-sidebar-foreground/45"
                                }`}
                              />
                              <span className="text-[13px] tracking-wide">{child.name}</span>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
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
