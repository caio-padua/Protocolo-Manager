import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, Redirect } from "wouter";
import { usePermissoes } from "@/lib/permissoes";
import { useClerkActions } from "@/lib/clerk-app";
import { clearCollabSession, getCollabToken } from "@/lib/collab-auth";
import {
  formatProfessionalCpf,
  formatProfessionalInitials,
  formatProfessionalName,
  formatProfessionalRole,
} from "@/lib/format-professional-identity";
import {
  LayoutDashboard,
  LayoutTemplate,
  Users,
  FlaskConical,
  ExternalLink,
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
  Search,
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
  ShieldOff,
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
  DownloadCloud,
  FileSignature,
  Send,
  Files,
  Compass,
  Crown,
  Globe,
  Bot,
  Radar,
  MapPin,
  Activity,
  Microscope,
  TrendingUp,
  BookOpen,
  UserRound,
  LogIn,
  Link2,
  Eye,
  EyeOff,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaxterLogo } from "./PaxterLogo";

interface LayoutProps {
  children: React.ReactNode;
}

type NavLeaf = { name: string; href: string; icon: typeof LayoutDashboard; external?: boolean };
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
      { name: "Marcação de Consulta", href: "/agendar", icon: CalendarDays },
      { name: "Marcação (Modelo Antigo)", href: "/agendar-antigo", icon: CalendarDays },
      { name: "Agenda Diária", href: "/agenda", icon: Calendar },
      { name: "Motor de Agenda", href: "/agenda/motor", icon: CalendarCog },
      { name: "Clientes", href: "/clients", icon: Users },
    ],
  },
  {
    name: "O Ato Médico",
    icon: Stethoscope,
    children: [
      { name: "Radar Clínico",       href: "/radar-clinico",   icon: Radar       },
      { name: "Cockpit da Consulta", href: "/cockpit", icon: Stethoscope },
      { name: "Cockpit da Anamnese", href: "/cockpit-anamnese", icon: Brain },
      { name: "Cartório", href: "/cartorio", icon: Stamp },
      { name: "Craniotomia", href: "/craniotomia", icon: BrainCircuit },
      { name: "Mega Anamnese", href: "/mega-anamnese", icon: Brain },
      { name: "Revisão de Anamneses", href: "/anamnese/revisao", icon: ClipboardListIcon },
    ],
  },
  {
    name: "Exames",
    icon: Microscope,
    children: [
      { name: "Hub de Exames", href: "/exames-hub", icon: Microscope },
      { name: "Exames do Cliente", href: "/exames-cliente", icon: TestTube },
      { name: "Procedência de Exames", href: "/procedencia-exames", icon: MapPin },
      { name: "Prescritor de Exames", href: "/exames", icon: ClipboardListIcon },
      { name: "Monitor do Motor", href: "/exames/monitor", icon: Activity },
      { name: "Exames & Blocos", href: "/cadastros/exames", icon: TestTube },
      { name: "Console de Exames", href: "/cadastros/console-exames", icon: Compass },
      { name: "Configuração de Exames", href: "/cadastros/config-exames", icon: FlaskConical },
      { name: "Importar Exames do Drive", href: "/importar-drive", icon: DownloadCloud },
    ],
  },
  {
    name: "Área do Cliente",
    icon: Smartphone,
    children: [
      { name: "Experiência do Cliente (Admin Preview)", href: "/experiencia-cliente", icon: Sparkles },
      { name: "Área do Paciente (Direto)", href: "/area", icon: Users },
    ],
  },
  {
    name: "Órgãos de Prescrição",
    icon: ClipboardList,
    children: [
      { name: "Prescrição", href: "/prescricao", icon: ClipboardList },
      { name: "Fórmulas & Substâncias", href: "/substances", icon: Beaker },
      { name: "Dieta", href: "/dieta", icon: Salad },
      { name: "Central de Pesquisa", href: "/central-pesquisa", icon: Search },
      { name: "Treino", href: "/treino", icon: Dumbbell },
      { name: "Orçamentos", href: "/orcamentos", icon: Calculator },
      { name: "Farmácias", href: "/pharmacies", icon: Building2 },
      { name: "SNCR", href: "/sncr", icon: Hash },
    ],
  },
  {
    name: "Arsenal Clínico",
    icon: Stamp,
    children: [
      { name: "Atestados", href: "/arsenal/atestados", icon: FileSignature },
      { name: "Encaminhamentos", href: "/arsenal/encaminhamentos", icon: Send },
      { name: "Modelos de Documento", href: "/arsenal/modelos", icon: Files },
      { name: "Receituário Automático", href: "/receituario-automatico", icon: Calendar },
      { name: "Validação de Receituário", href: "/arsenal/preview-validacao", icon: ShieldCheck },
      { name: "Drive Watcher — Vigilância de Exames", href: "/arsenal/drive-watcher", icon: DownloadCloud },
    ],
  },
  {
    name: "Cadastros Clínicos",
    icon: FolderTree,
    children: [
      { name: "Portfólio Clínico", href: "/portfolio-clinico", icon: FlaskConical },
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
      { name: "Status WhatsApp", href: "/comunicacao/whatsapp-status", icon: MessageSquareText },
      { name: "Central de Auditoria", href: "/comunicacao/central-auditoria", icon: ShieldCheck },
      { name: "Guia Digital — Enviar ao Paciente", href: "/comunicacao/guia-paciente", icon: BookOpen },
      { name: "Painel de Domínios & Aliases", href: "/comunicacao/dominios", icon: Globe },
      { name: "Avatares — Motor de Voz", href: "/comunicacao/avatares", icon: Bot },
    ],
  },
  {
    name: "Configurações & Administração",
    icon: Settings,
    children: [
      { name: "Empresas Licenciadas", href: "/cadastros/empresas-licenciadas", icon: Building2 },
      { name: "Cadastro de Empresas", href: "/cadastros/empresas", icon: Building2 },
      { name: "Empresa & Clínicas", href: "/configuracoes/empresa", icon: Building2 },
      { name: "Clínicas & Locais", href: "/cadastros/clinicas", icon: Building2 },
      { name: "Corpo Clínico", href: "/professionals", icon: Stethoscope },
      { name: "Equipe (Cadastro Interno)", href: "/cadastros/equipe", icon: Users },
      { name: "Agendas Google", href: "/cadastros/agendas-google", icon: CalendarDays },
      { name: "Listas (Categorias/Tipos)", href: "/cadastros/listas", icon: Library },
      { name: "Textos & Vídeos", href: "/cadastros/textos", icon: MessageSquareText },
      { name: "Auditoria", href: "/cadastros/auditoria", icon: ClipboardListIcon },
      { name: "Cadernos Jurídicos", href: "/juridico/contratos", icon: Scale },
      { name: "Certificados Digitais", href: "/configuracoes/certificados", icon: ShieldCheck },
      { name: "Assinatura Eletrônica (ZapSign)", href: "/configuracoes/assinatura", icon: PenTool },
      { name: "Portas de Pagamento", href: "/configuracoes/pagamentos", icon: CreditCard },
      { name: "Médico Responsável", href: "/configuracoes/medico", icon: Stethoscope },
      { name: "Meu Perfil", href: "/professionals?selfAccess=1", icon: UserRound },
      { name: "Faixas do Receituário", href: "/configuracoes/receituario", icon: LayoutTemplate },
      { name: "Modelo de Receituários", href: "/modelo-receituario", icon: LayoutTemplate },
      { name: "Vitrine (Pública)", href: "/vitrine", icon: Sparkles },
    ],
  },
  {
    name: "Estrutura & Governança",
    icon: Network,
    children: [
      { name: "CEO Command Center", href: "/ceo/command-center", icon: Crown },
      { name: "Penalidades Concierge", href: "/ceo/concierge-penalidades", icon: ShieldOff },
      { name: "Prova de Valor", href: "/prova-de-valor", icon: TrendingUp },
      { name: "Leads da Vitrine", href: "/vitrine-leads", icon: Sparkles },
      { name: "PADTEAM — Equipe & Demandas", href: "/padteam", icon: Users },
      { name: "Agentes Virtuais", href: "/agentes", icon: Bot },
      { name: "Hierarquia", href: "/hierarquia", icon: Network },
      { name: "Governança", href: "/cadastros/governanca", icon: Landmark },
    ],
  },
];

const COLLAPSE_KEY = "paxter.sidebar.collapsed";

// Href do Cockpit da Consulta — item que recebe o badge Telegram
const COCKPIT_HREF = "/cockpit";

// Intervalo de polling do badge Telegram (em milissegundos)
const BADGE_POLL_MS = 30_000;

// ─── Filtro de menu por módulos ativos ────────────────────────────────────────
// Mapeia cada grupo do menu para o módulo que o habilita (null = universal).
const GRUPO_MODULO: Record<string, string | null> = {
  "Agenda & Recepção":             "agenda",
  "O Ato Médico":                  null,     // cockpit e anamnese têm acesso universal
  "Exames":                        "exames_lab",
  "Área do Cliente":               null,
  "Órgãos de Prescrição":         "protocolos",
  "Arsenal Clínico":               "protocolos",
  "Cadastros Clínicos":            null,
  "Financeiro":                    "financeiro",
  "Comunicação":                   "comunicacao",
  "Configurações & Administração": null,
  "Estrutura & Governança":        null,
};

function filtrarNavegacao(
  nav: NavEntry[],
  modulosAtivos: Set<string> | null
): NavEntry[] {
  // Null = módulos não carregados ainda → mostrar tudo (fail-open)
  if (modulosAtivos === null) return nav;

  return nav.reduce<NavEntry[]>((acc, item) => {
    if (isGroup(item)) {
      const modulo = GRUPO_MODULO[item.name] ?? null;
      // Grupo sem módulo = universal; com módulo = mostrar só se ativo
      if (modulo !== null && !modulosAtivos.has(modulo)) return acc;
      acc.push(item);
    } else {
      acc.push(item); // Folhas (Dashboard, etc.) sempre visíveis
    }
    return acc;
  }, []);
}

// Mapa href de menu -> ferramentaId da matriz de Governanca. So os itens aqui
// sao gateados por papel; os demais aparecem sempre (fluxo aberto). Um href sem
// entrada aqui nunca some por permissao.
// Governanca NAO entra aqui de proposito: a spec (Parte 4) manda o nao-CEO ver a
// tela em modo leitura, entao o item de menu nunca some por papel (a edicao e que
// e bloqueada, dentro da tela). Exames_config entra: e reservada ao CEO e some
// para os demais.
const HREF_FERRAMENTA: Record<string, string> = {
  // Exames
  "/importar-drive": "exames_importar",
  "/exames-cliente": "exames_mesa",
  "/cadastros/console-exames": "exames_faixas",
  "/cadastros/config-exames": "exames_config",
  // Documentos (Arsenal Clinico)
  "/arsenal/atestados": "atestado",
  "/arsenal/encaminhamentos": "encaminhamento",
  // Clinico
  "/protocols": "protocolo",
  "/ras": "ras",
  "/anamnese/revisao": "anamnese",
  "/mega-anamnese": "anamnese",
  "/cockpit-anamnese": "anamnese",
  "/agenda": "agenda",
  "/agenda/motor": "agenda",
  // Gestao
  "/stock": "estoque",
  "/cadastros/equipe": "corpo_clinico",
  // Financeiro: todas as telas do grupo respondem a ferramenta "financeiro"
  "/financeiro/cobranca": "financeiro",
  "/financeiro/nfse": "financeiro",
  "/financeiro/bancos": "financeiro",
  "/financeiro/transferencias": "financeiro",
  "/payments": "financeiro",
  "/financeiro/conciliacao": "financeiro",
  "/financeiro/metas": "financeiro",
};

export function Layout({ children }: LayoutProps) {
  const [location, navigate] = useLocation();
  const { available: clerkAvailable, signOut: signOutGoogle } = useClerkActions();
  const { pode, me } = usePermissoes();
  const [profileOpen, setProfileOpen] = useState(false);
  const [cpfVisible, setCpfVisible] = useState(false);
  const [profileActionBusy, setProfileActionBusy] = useState(false);
  const [profileActionError, setProfileActionError] = useState<string | null>(null);
  const hasCollaboratorSession = Boolean(getCollabToken());

  // Governanca por camada de tela: sessao de LICENCIADO nunca opera as telas
  // administrativas — toda rota sob o Layout redireciona para /licenciado.
  if (me?.category === "licenciado") {
    return <Redirect to="/licenciado" replace />;
  }

  // Esconde do menu o que o papel nao pode usar (menu obedece a matriz).
  const podeVer = (href: string): boolean => {
    const ferramentaId = HREF_FERRAMENTA[href];
    return ferramentaId ? pode(ferramentaId) : true;
  };

  // ─── Menu dinâmico: busca /api/menu para filtrar por módulos ativos ────────
  // null = carregando (fail-open: mostra tudo); Set = módulos confirmados pelo servidor.
  const [modulosAtivos, setModulosAtivos] = useState<Set<string> | null>(null);
  const menuFetched = useRef(false);

  useEffect(() => {
    if (menuFetched.current) return;
    menuFetched.current = true;

    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("padcom_collab_token")
        : null;

    fetch("/api/menu", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { items?: { moduloRequerido?: string | null }[] } | null) => {
        if (!data?.items) return;
        // Extrai os módulos com acesso permitido
        const ativos = new Set<string>();
        for (const item of data.items) {
          if (item.moduloRequerido) ativos.add(item.moduloRequerido);
        }
        setModulosAtivos(ativos);
      })
      .catch(() => {
        // Fail-open: se a API falhar, não filtrar nada
        setModulosAtivos(new Set());
      });
  }, []);

  // ─── Badge Telegram: conta mensagens não lidas de todos os pacientes ─────────
  // Usa a mesma queryKey do cockpit (["telegram-inbox-badge"]) para que quando
  // o CEO marcar as mensagens como lidas o badge suma imediatamente no menu,
  // sem esperar o próximo ciclo de 30 s.
  const { data: _badgeData } = useQuery<{ naoLidas: number }>({
    queryKey: ["telegram-inbox-badge"],
    queryFn: async () => {
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("padcom_collab_token")
          : null;
      const res = await fetch("/api/telegram-inbox/badge", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return { naoLidas: 0 };
      return res.json() as Promise<{ naoLidas: number }>;
    },
    refetchInterval: BADGE_POLL_MS,
    initialData: { naoLidas: 0 },
  });
  const telegramBadge = _badgeData?.naoLidas ?? 0;

  // Navegação filtrada pelos módulos que o servidor autorizou
  const navFiltrada = filtrarNavegacao(navigation, modulosAtivos);
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

  async function beginGoogleLink() {
    if (!clerkAvailable) {
      setProfileActionError("O acesso Google ainda não está configurado neste ambiente.");
      return;
    }
    if (!getCollabToken()) {
      navigate("/login?google=link-session-expired");
      return;
    }
    setProfileActionBusy(true);
    setProfileActionError(null);
    try {
      await signOutGoogle();
      const returnTo = `${location}${window.location.search}`;
      setSidebarOpen(false);
      setProfileOpen(false);
      navigate(`/sign-in?intent=link&returnTo=${encodeURIComponent(returnTo)}`);
    } catch {
      setProfileActionError(
        "Não foi possível encerrar a conta Google atual. Tente novamente antes de vincular.",
      );
    } finally {
      setProfileActionBusy(false);
    }
  }

  async function switchCollaboratorUser() {
    setProfileActionBusy(true);
    setProfileActionError(null);
    clearCollabSession();
    try {
      if (clerkAvailable) await signOutGoogle();
      const returnTo = `?returnTo=${encodeURIComponent(`${location}${window.location.search}`)}`;
      setSidebarOpen(false);
      setProfileOpen(false);
      navigate(`/login${returnTo}`, { replace: true });
    } catch {
      setProfileActionError(
        "A conta Google não foi encerrada. A sessão do profissional foi removida; recarregue e tente novamente.",
      );
    } finally {
      setProfileActionBusy(false);
    }
  }

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
            {navFiltrada.map((item) => {
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
                        {item.children.filter((c) => podeVer(c.href)).map((child) => {
                          const ChildIcon = child.icon;
                          const isActive =
                            location === child.href || location.startsWith(`${child.href}/`);
                          const showBadgeCollapsed =
                            child.href === COCKPIT_HREF && telegramBadge > 0;
                          const innerCollapsed = (
                            <div
                              title={
                                showBadgeCollapsed
                                  ? `${child.name} (${telegramBadge} não lida${telegramBadge > 1 ? "s" : ""})`
                                  : child.name
                              }
                              className={`relative flex items-center justify-center px-3 py-2 rounded-[5px] border transition-all cursor-pointer ${
                                isActive
                                  ? "bg-sidebar-accent text-sidebar-primary border-sidebar-primary/40"
                                  : "text-sidebar-foreground/55 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground border-transparent"
                              }`}
                            >
                              <ChildIcon className="w-[19px] h-[19px] shrink-0" />
                              {showBadgeCollapsed && (
                                <span className="absolute top-1 right-1 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold leading-none px-[3px]">
                                  {telegramBadge > 99 ? "99+" : telegramBadge}
                                </span>
                              )}
                            </div>
                          );
                          if (child.external) {
                            return (
                              <a
                                key={child.name}
                                href={child.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => setSidebarOpen(false)}
                              >
                                {innerCollapsed}
                              </a>
                            );
                          }
                          return (
                            <Link
                              key={child.name}
                              href={child.href}
                              onClick={() => setSidebarOpen(false)}
                            >
                              {innerCollapsed}
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
                      {item.children.filter((c) => podeVer(c.href)).map((child) => {
                        const ChildIcon = child.icon;
                        const isActive =
                          location === child.href || location.startsWith(`${child.href}/`);
                        const showBadgeExpanded =
                          child.href === COCKPIT_HREF && telegramBadge > 0;
                        const innerExpanded = (
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
                            <span className="text-[13px] tracking-wide flex-1">{child.name}</span>
                            {showBadgeExpanded && (
                              <span className="ml-auto min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none px-[5px]">
                                {telegramBadge > 99 ? "99+" : telegramBadge}
                              </span>
                            )}
                          </div>
                        );
                        if (child.external) {
                          return (
                            <a
                              key={child.name}
                              href={child.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => setSidebarOpen(false)}
                            >
                              {innerExpanded}
                            </a>
                          );
                        }
                        return (
                          <Link
                            key={child.name}
                            href={child.href}
                            onClick={() => setSidebarOpen(false)}
                          >
                            {innerExpanded}
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

          {/* Rodape — identidade profissional, acesso e troca de usuario */}
          <div className="relative border-t border-sidebar-border p-2">
            {profileOpen && hasCollaboratorSession ? (
              <section
                id="collaborator-profile-actions"
                aria-label="Identidade e ações do colaborador"
                className={`panel-3d-sub absolute bottom-full z-[70] mb-2 w-[calc(100%-1rem)] p-3 ${
                  collapsed ? "md:left-full md:right-auto md:ml-2 md:bottom-2 md:w-64" : "left-2 right-2 md:left-2 md:right-2 md:w-auto"
                }`}
              >
                <div className="border-b border-sidebar-border/70 pb-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-primary">
                    Identidade profissional
                  </p>
                  <p className="mt-1 truncate text-xs font-medium text-sidebar-foreground">
                    {me ? formatProfessionalName(me.name) : "Verificando cadastro…"}
                  </p>
                </div>

                <div className="mt-2 grid grid-cols-[48px_minmax(0,1fr)] items-center gap-x-2 gap-y-1 text-[11px]">
                  <span className="text-sidebar-foreground/45">Cargo</span>
                  <span className="truncate text-sidebar-foreground/80">
                    {me ? formatProfessionalRole(me.role, me.category) : "—"}
                  </span>
                  <span
                    className="text-sidebar-foreground/45"
                    title="Cadastro de Pessoas Físicas"
                  >
                    CPF
                  </span>
                  <span className="flex min-w-0 items-center justify-between gap-2 text-sidebar-foreground/80">
                    <span className="truncate font-mono">
                      {formatProfessionalCpf(me?.cpf, cpfVisible)}
                    </span>
                    {me?.cpf ? (
                      <button
                        type="button"
                        onClick={() => setCpfVisible((visible) => !visible)}
                        aria-label={cpfVisible ? "Ocultar CPF" : "Mostrar CPF"}
                        title={cpfVisible ? "Ocultar CPF" : "Mostrar CPF"}
                        className="bevel-3d flex h-7 w-7 shrink-0 items-center justify-center text-sidebar-primary"
                      >
                        {cpfVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    ) : null}
                  </span>
                  <span className="text-sidebar-foreground/45">Validação</span>
                  <span className="truncate text-sidebar-foreground/80">
                    {me?.googleLinked ? "Google validado" : "Vínculo Google pendente"}
                  </span>
                </div>

                {profileActionError ? (
                  <p role="alert" className="mt-2 rounded-md bg-red-950/40 px-2 py-1.5 text-[11px] text-red-200">
                    {profileActionError}
                  </p>
                ) : null}

                <div className="mt-3 grid gap-2">
                  {me && !me.googleLinked ? (
                    <button
                      type="button"
                      disabled={profileActionBusy}
                      onClick={() => void beginGoogleLink()}
                      className="btn-3d flex min-h-9 w-full items-center justify-center gap-2 px-3 text-[11px] font-semibold disabled:opacity-60"
                    >
                      <Link2 className="h-3.5 w-3.5" />
                      Vincular conta Google
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={profileActionBusy || !me}
                    onClick={() => {
                      setProfileOpen(false);
                      navigate("/professionals?selfAccess=1");
                    }}
                    className="btn-3d-soft flex min-h-9 w-full items-center justify-center gap-2 px-3 text-[11px] disabled:opacity-60"
                  >
                    <UserRound className="h-3.5 w-3.5" />
                    Abrir meu cadastro
                  </button>
                  <button
                    type="button"
                    disabled={profileActionBusy}
                    onClick={() => void switchCollaboratorUser()}
                    className="btn-3d-soft flex min-h-9 w-full items-center justify-center gap-2 px-3 text-[11px] disabled:opacity-60"
                  >
                    <UserRound className="h-3.5 w-3.5" />
                    Trocar usuário
                  </button>
                </div>
              </section>
            ) : null}

            <button
              type="button"
              aria-expanded={profileOpen}
              aria-controls={
                profileOpen && hasCollaboratorSession
                  ? "collaborator-profile-actions"
                  : undefined
              }
              aria-label={
                hasCollaboratorSession
                  ? profileOpen
                    ? "Fechar menu do colaborador"
                    : "Abrir menu do colaborador"
                  : "Entrar no sistema"
              }
              title={collapsed
                ? me
                  ? formatProfessionalName(me.name)
                  : "Entrar no sistema"
                : undefined}
              onClick={() => {
                setProfileActionError(null);
                if (!hasCollaboratorSession) {
                  navigate("/login");
                  return;
                }
                setProfileOpen((open) => !open);
              }}
              className={`bevel-3d flex min-h-[54px] w-full items-center ${
                collapsed ? "justify-center px-2" : "gap-3 px-2.5"
              } py-2 text-left`}
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center border border-sidebar-primary/40 bg-sidebar-primary/15 text-xs font-bold text-sidebar-primary"
                style={{ borderRadius: "4px" }}
              >
                {me ? (
                  formatProfessionalInitials(me.name)
                ) : hasCollaboratorSession ? (
                  <UserRound className="h-4 w-4" />
                ) : (
                  <LogIn className="h-4 w-4" />
                )}
              </span>
              {!collapsed ? (
                <>
                  <span className="grid min-w-0 flex-1 grid-rows-3 leading-tight">
                    <span className="truncate text-xs font-semibold text-sidebar-foreground">
                      {me
                        ? formatProfessionalName(me.name)
                        : hasCollaboratorSession
                          ? "Verificando cadastro…"
                          : "Entrar no sistema"}
                    </span>
                    <span className="truncate text-[10px] text-sidebar-foreground/55">
                      {me ? formatProfessionalRole(me.role, me.category) : "Acesso profissional"}
                    </span>
                    <span className="truncate font-mono text-[10px] text-sidebar-foreground/45">
                      {formatProfessionalCpf(me?.cpf)}
                    </span>
                  </span>
                  {hasCollaboratorSession ? (
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-sidebar-foreground/50 transition-transform ${
                        profileOpen ? "rotate-180" : ""
                      }`}
                    />
                  ) : null}
                </>
              ) : null}
            </button>
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
