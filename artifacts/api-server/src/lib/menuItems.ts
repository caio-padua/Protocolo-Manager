/**
 * menuItems.ts — Lista mestre de todos os itens de menu do PADAXOR.
 *
 * Cada item tem `moduloRequerido` (ou null = universal, aparece para todos).
 * O endpoint GET /api/menu filtra por módulos ativos da empresa.
 * O CEO (isPlatformOwner = empresa_id 5) sempre recebe a lista completa.
 *
 * Ordem: segue a hierarquia do Layout.tsx (preservada para compatibilidade).
 */

export type ModuloRequerido =
  | "agenda"
  | "financeiro"
  | "estoque"
  | "ras"
  | "protocolos"
  | "exames_lab"
  | "comunicacao"
  | "arsenal"
  | "anamnese"
  | "cockpit"
  | null;

export interface MenuItem {
  id: string;
  label: string;
  path: string;
  icon: string;
  grupo: string;
  moduloRequerido: ModuloRequerido;
}

export const MENU_ITEMS: MenuItem[] = [
  // ─── Início ───────────────────────────────────────────────────────────────
  { id: "dashboard", label: "Dashboard", path: "/", icon: "LayoutDashboard", grupo: "inicio", moduloRequerido: null },

  // ─── Clínica ──────────────────────────────────────────────────────────────
  { id: "clientes", label: "Clientes", path: "/clientes", icon: "Users", grupo: "clinica", moduloRequerido: null },
  { id: "cockpit", label: "Cockpit da Consulta", path: "/cockpit", icon: "Stethoscope", grupo: "clinica", moduloRequerido: "cockpit" },
  { id: "agenda", label: "Agenda", path: "/agenda", icon: "Calendar", grupo: "clinica", moduloRequerido: "agenda" },
  { id: "sessoes", label: "Sessões", path: "/sessoes", icon: "ClipboardList", grupo: "clinica", moduloRequerido: "agenda" },

  // ─── Protocolos ───────────────────────────────────────────────────────────
  { id: "protocolos", label: "Protocolos", path: "/protocolos", icon: "FileText", grupo: "protocolos", moduloRequerido: "protocolos" },
  { id: "prescricoes", label: "Prescrições", path: "/prescricoes", icon: "Pill", grupo: "protocolos", moduloRequerido: "protocolos" },
  { id: "receituario", label: "Receituário", path: "/receituario", icon: "ClipboardCheck", grupo: "protocolos", moduloRequerido: "protocolos" },
  { id: "anamnese", label: "Anamnese", path: "/anamnese", icon: "Brain", grupo: "protocolos", moduloRequerido: "anamnese" },

  // ─── Exames ───────────────────────────────────────────────────────────────
  { id: "exames-lab", label: "Exames Laboratoriais", path: "/exames-lab", icon: "TestTube", grupo: "exames", moduloRequerido: "exames_lab" },
  { id: "drive-watcher", label: "Importação de Laudos", path: "/drive-watcher", icon: "FolderSync", grupo: "exames", moduloRequerido: "exames_lab" },

  // ─── Financeiro ───────────────────────────────────────────────────────────
  { id: "financeiro", label: "Financeiro", path: "/financeiro", icon: "TrendingUp", grupo: "financeiro", moduloRequerido: "financeiro" },
  { id: "pagamentos", label: "Pagamentos", path: "/pagamentos", icon: "CreditCard", grupo: "financeiro", moduloRequerido: "financeiro" },
  { id: "conciliacao", label: "Conciliação Asaas", path: "/conciliacao", icon: "RefreshCw", grupo: "financeiro", moduloRequerido: "financeiro" },
  { id: "prova-de-valor", label: "Prova de Valor", path: "/prova-de-valor", icon: "Award", grupo: "financeiro", moduloRequerido: "financeiro" },

  // ─── Estoque ──────────────────────────────────────────────────────────────
  { id: "estoque", label: "Estoque", path: "/estoque", icon: "Package", grupo: "estoque", moduloRequerido: "estoque" },

  // ─── Comunicação ──────────────────────────────────────────────────────────
  { id: "mensageria", label: "Mensageria", path: "/mensageria", icon: "MessageSquare", grupo: "comunicacao", moduloRequerido: "comunicacao" },
  { id: "agentes-wpp", label: "Agentes WhatsApp", path: "/agentes-wpp", icon: "Bot", grupo: "comunicacao", moduloRequerido: "comunicacao" },
  { id: "avatares", label: "Avatares de Voz e Vídeo", path: "/comunicacao/avatares", icon: "PersonStanding", grupo: "comunicacao", moduloRequerido: "comunicacao" },

  // ─── RAS / FAP ────────────────────────────────────────────────────────────
  { id: "ras", label: "RAS", path: "/ras", icon: "FileBarChart", grupo: "ras", moduloRequerido: "ras" },
  { id: "fap", label: "FAP", path: "/fap", icon: "ClipboardPlus", grupo: "ras", moduloRequerido: "ras" },

  // ─── Arsenal Clínico ──────────────────────────────────────────────────────
  { id: "substancias", label: "Substâncias", path: "/substancias", icon: "Beaker", grupo: "arsenal", moduloRequerido: "arsenal" },
  { id: "farmacias", label: "Farmácias", path: "/farmacias", icon: "Building2", grupo: "arsenal", moduloRequerido: "arsenal" },
  { id: "catalogo", label: "Catálogo", path: "/catalogo", icon: "BookOpen", grupo: "arsenal", moduloRequerido: "arsenal" },

  // ─── Estrutura & Governança (universais — só isAdmin vê no front) ─────────
  { id: "profissionais", label: "Corpo Clínico", path: "/profissionais", icon: "UserCheck", grupo: "governanca", moduloRequerido: null },
  { id: "integracoes", label: "Integrações", path: "/integracoes", icon: "Plug", grupo: "governanca", moduloRequerido: null },
  { id: "configuracoes", label: "Configurações", path: "/configuracoes", icon: "Settings", grupo: "governanca", moduloRequerido: null },
  { id: "padteam", label: "PADTEAM", path: "/padteam", icon: "Network", grupo: "governanca", moduloRequerido: null },
  { id: "ceo-command-center", label: "CEO Command Center", path: "/ceo-command-center", icon: "Cpu", grupo: "governanca", moduloRequerido: null },
];
